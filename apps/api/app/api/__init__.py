# apps/api/app/api/__init__.py
"""
API layer package — dependencies, utilities, and shared components.

Usage:
    from app.api import (
        # Dependencies
        DBSessionDep,
        ApiVersionDep,
        AuthDep,          # new canonical alias — use in new routers
        UserContextDep,   # legacy alias — kept for backward compatibility
        # Error handling utilities
        create_error_response,
        create_success_response,
        handle_auth_error,
        handle_profile_error,
    )
"""

from app.api._utils import (
    create_error_response,
    create_success_response,
    handle_auth_error,
    handle_profile_error,
)
from app.api.dependencies import (
    ApiVersionDep,
    AuthDep,
    DBSessionDep,
    UserContextDep,
    get_current_user,
    require_auth,
)

__all__ = [
    # Dependencies — canonical
    "DBSessionDep",
    "ApiVersionDep",
    "AuthDep",
    "get_current_user",
    # Dependencies — legacy (kept for backward compatibility)
    "UserContextDep",
    "require_auth",
    # Error utilities
    "create_error_response",
    "create_success_response",
    "handle_auth_error",
    "handle_profile_error",
]
