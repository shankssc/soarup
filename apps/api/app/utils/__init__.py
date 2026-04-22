# apps/api/app/utils/__init__.py
from app.utils.api_versioning import (
    CURRENT_API_VERSION,
    ApiVersionInfo,
    add_deprecation_headers,
    get_api_version,
    require_api_version,
)
from app.utils.circuit_breaker import CircuitBreakerError, circuit_breaker, get_circuit_breaker_states

__all__ = [
    # Circuit breaker
    "circuit_breaker",
    "CircuitBreakerError",
    "get_circuit_breaker_states",
    # API versioning
    "get_api_version",
    "require_api_version",
    "add_deprecation_headers",
    "ApiVersionInfo",
    "CURRENT_API_VERSION",
]
