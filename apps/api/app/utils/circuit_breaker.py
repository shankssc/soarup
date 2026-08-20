# apps/api/app/utils/circuit_breaker.py
# Circuit breaker pattern for async resilience

import asyncio
import time
from collections.abc import Awaitable, Callable
from enum import Enum
from functools import wraps
from typing import Any, ParamSpec, TypeVar, cast

import structlog

logger = structlog.get_logger(__name__)

# Type variables for generic function wrapping
P = ParamSpec("P")  # Parameter types
T = TypeVar("T")  # Return type


class CircuitState(Enum):
    """Possible states for the circuit breaker."""

    CLOSED = "closed"  # Normal: requests pass through
    OPEN = "open"  # Failure threshold exceeded: fail fast
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is OPEN and request is rejected."""

    def __init__(self, message: str, retry_after: int | None = None):
        self.retry_after = retry_after
        super().__init__(message)


class AsyncCircuitBreaker:
    """
    Async circuit breaker for external service calls.

    Usage:
        @circuit_breaker(failure_threshold=3, recovery_timeout=30)
        async def call_external_service():
            ...
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: int = 30,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: float | None = None
        self._lock = asyncio.Lock()

    async def call(
        self,
        func: Callable[P, Awaitable[T]],
        *args: P.args,
        **kwargs: P.kwargs,
    ) -> T:
        """
        Execute async function with circuit breaker protection.

        Args:
            func: Async function to execute.
            *args: Positional arguments for func.
            **kwargs: Keyword arguments for func.

        Returns:
            Result of func execution.

        Raises:
            CircuitBreakerError: If circuit is OPEN and not in recovery window.
            Exception: Any exception from func (after updating breaker state).
        """
        async with self._lock:
            # Check if we should transition from OPEN to HALF_OPEN
            if self.state == CircuitState.OPEN:
                # ✅ Fix: Safely handle None last_failure_time
                if self.last_failure_time is not None:
                    elapsed = time.time() - self.last_failure_time
                    if elapsed >= self.recovery_timeout:
                        logger.info(
                            "circuit_breaker_half_open",
                            reason="recovery_timeout_elapsed",
                            elapsed_seconds=elapsed,
                        )
                        self.state = CircuitState.HALF_OPEN
                    else:
                        retry_after = int(self.recovery_timeout - elapsed)
                        raise CircuitBreakerError(
                            f"Circuit breaker is OPEN. Retry after {retry_after}s",
                            retry_after=retry_after,
                        )
                else:
                    # Shouldn't happen, but handle defensively
                    raise CircuitBreakerError(
                        "Circuit breaker is OPEN with no failure timestamp",
                        retry_after=self.recovery_timeout,
                    )

        try:
            result = await func(*args, **kwargs)

            # On success: reset if HALF_OPEN, or stay CLOSED
            async with self._lock:
                if self.state == CircuitState.HALF_OPEN:
                    logger.info("circuit_breaker_closed", reason="successful_test_call")
                    self.state = CircuitState.CLOSED
                    self.failure_count = 0
                elif self.state == CircuitState.CLOSED:
                    self.failure_count = 0  # Reset on any success

            return result

        except Exception as e:
            # On failure: increment counter, possibly open circuit
            async with self._lock:
                self.failure_count += 1
                self.last_failure_time = time.time()

                if self.failure_count >= self.failure_threshold:
                    logger.warning(
                        "circuit_breaker_opened",
                        failure_count=self.failure_count,
                        threshold=self.failure_threshold,
                        error_type=type(e).__name__,
                        error_message=str(e),
                    )
                    self.state = CircuitState.OPEN
                elif self.state == CircuitState.HALF_OPEN:
                    # Failed during test period, go back to OPEN
                    logger.warning(
                        "circuit_breaker_reopened",
                        reason="test_call_failed",
                        error_type=type(e).__name__,
                    )
                    self.state = CircuitState.OPEN

            raise

    def get_state(self) -> CircuitState:
        """Get current circuit state (thread-safe read)."""
        return self.state

    def get_stats(self) -> dict[str, Any]:
        """Get circuit breaker statistics for monitoring."""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self.last_failure_time,
        }


# Global registry for circuit breakers (one per external service)
_circuit_breakers: dict[str, AsyncCircuitBreaker] = {}


def circuit_breaker(
    failure_threshold: int = 3,
    recovery_timeout: int = 30,
    name: str | None = None,
) -> Callable[[Callable[P, Awaitable[T]]], Callable[P, Awaitable[T]]]:
    """
    Decorator to apply async circuit breaker to functions.

    Args:
        failure_threshold: Consecutive failures before opening circuit.
        recovery_timeout: Seconds to wait before testing recovery.
        name: Unique name for this breaker (defaults to function name).

    Returns:
        Decorated async function with circuit breaker protection.
    """

    def decorator(func: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
        breaker_name = name or f"{func.__module__}.{func.__qualname__}"

        # Get or create circuit breaker for this function
        if breaker_name not in _circuit_breakers:
            _circuit_breakers[breaker_name] = AsyncCircuitBreaker(
                failure_threshold=failure_threshold,
                recovery_timeout=recovery_timeout,
            )

        breaker = _circuit_breakers[breaker_name]

        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            return await breaker.call(func, *args, **kwargs)

        # Expose breaker state for monitoring (optional)
        # Use cast to satisfy mypy for dynamic attribute assignment
        wrapper_with_breaker = cast(Callable[P, Awaitable[T]], wrapper)
        wrapper_with_breaker.circuit_breaker = breaker  # type: ignore[attr-defined]

        return wrapper_with_breaker

    return decorator


def get_circuit_breaker_states() -> dict[str, str]:
    """
    Return current state of all circuit breakers.

    Returns:
        Dict mapping breaker names to their state values.
    """
    return {name: breaker.get_state().value for name, breaker in _circuit_breakers.items()}


def reset_circuit_breaker(name: str) -> bool:
    """
    Reset a specific circuit breaker to CLOSED state.

    Args:
        name: The breaker name to reset.

    Returns:
        True if breaker was found and reset, False otherwise.
    """
    if name in _circuit_breakers:
        breaker = _circuit_breakers[name]
        breaker.state = CircuitState.CLOSED
        breaker.failure_count = 0
        breaker.last_failure_time = None
        logger.info("circuit_breaker_reset", name=name)
        return True
    return False


def reset_all_circuit_breakers() -> int:
    """
    Reset all circuit breakers to CLOSED state.

    Returns:
        Number of breakers that were reset.
    """
    count = 0
    for name in list(_circuit_breakers.keys()):
        if reset_circuit_breaker(name):
            count += 1
    logger.info("all_circuit_breakers_reset", count=count)
    return count
