# apps/api/app/lib/rate_limit.py

# GCRA-based rate limiting backed by Redis.
#
# GCRA (Generic Cell Rate Algorithm) stores a single "theoretical arrival
# time" (TAT) per key rather than a log or counter of past requests — cheap
# in memory, O(1) per check, and naturally supports a burst allowance on
# top of a steady-state rate. Chosen for the same reason Redis is already
# used for TTL provisional holds elsewhere in this codebase: single key,
# single value, one round trip, no sorted sets or counters to manage.
#
# Reference: https://brandur.org/rate-limiting

import math
import time
from collections.abc import Awaitable
from typing import Any, cast

from redis.asyncio import Redis

# KEYS[1] = rate limit key
# ARGV[1] = emission_interval — seconds of steady-state capacity consumed
#           per request (60 / requests_per_minute)
# ARGV[2] = burst_allowance — seconds of extra slack on top of steady-state
#           (emission_interval * burst)
# ARGV[3] = now — current unix timestamp (float, seconds)
# ARGV[4] = ttl — seconds to keep the key alive after this write
#
# Returns {allowed (0|1), retry_after_seconds}. Runs as a single atomic
# EVAL — no separate GET-then-SET round trip, so concurrent requests for
# the same key can't race each other.
_GCRA_SCRIPT = """
local key = KEYS[1]
local emission_interval = tonumber(ARGV[1])
local burst_allowance = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local tat = tonumber(redis.call('GET', key))
if tat == nil then
  tat = now
end

local allow_at = tat - burst_allowance
if now < allow_at then
  return {0, allow_at - now}
end

local new_tat = math.max(tat, now) + emission_interval
redis.call('SET', key, tostring(new_tat), 'EX', ttl)

return {1, 0}
"""


class RateLimitExceededError(Exception):
    """
    Raised by the rate_limit dependency when a client is over capacity.
    Not routed through the usual *Error / handle_*_error pattern used by
    services, since this is a cross-cutting dependency check rather than
    a service-level error — caught instead by a FastAPI exception handler
    registered in create_app() (see app/main.py).
    """

    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded, retry after {retry_after:.1f}s")


async def check_rate_limit(
    redis: Redis,
    key: str,
    requests_per_minute: int,
    burst: int,
) -> tuple[bool, float]:
    """
    Atomically check-and-consume one unit of rate limit capacity for `key`.

    Args:
        redis: Async Redis client — reuses the app's existing connection,
            no separate client is created for rate limiting.
        key: Fully-qualified rate limit key, e.g.
            "ratelimit:update_submit:203.0.113.4".
        requests_per_minute: Steady-state rate.
        burst: Extra requests allowed in a short burst on top of the
            steady-state rate.

    Returns:
        (allowed, retry_after_seconds). If allowed is False,
        retry_after_seconds is how long the caller should wait —
        suitable for a Retry-After header.

    Note: the script is sent via EVAL rather than cached via
    SCRIPT LOAD/EVALSHA — it's small (~15 lines) and this isn't a hot
    path relative to typical API rate limits (tens of req/min, not
    thousands/sec). If this ever needs to scale further, switch to
    redis.register_script() to avoid resending script text every call.
    """
    emission_interval = 60.0 / requests_per_minute
    burst_allowance = emission_interval * burst
    now = time.time()
    ttl = math.ceil(emission_interval + burst_allowance) + 5

    result = await cast(
        Awaitable[list[Any]],
        redis.eval(
            _GCRA_SCRIPT,
            1,
            key,
            str(emission_interval),
            str(burst_allowance),
            str(now),
            str(ttl),
        ),
    )
    allowed, retry_after = result
    return bool(allowed), float(retry_after)
