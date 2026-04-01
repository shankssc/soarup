# apps/api/app/api/__init__.py
"""
API layer package — dependencies, utilities, and shared components.

Usage:
    from app.api import (
        # Dependencies
        DBSessionDep,
        ApiVersionDep,
        UserContextDep,

        # Error handling utilities
        create_error_response,
        create_success_response,
        handle_auth_error,
        handle_profile_error,
    )
"""

# Re-export dependencies
# Re-export error handling utilities
from app.api._utils import (
    create_error_response,
    create_success_response,
    handle_auth_error,
    handle_profile_error,
)
from app.api.dependencies import (
    ApiVersionDep,
    DBSessionDep,
    UserContextDep,
    get_current_user_token,
    require_auth,
)

# Explicit __all__ for clarity and IDE autocomplete
__all__ = [
    # Dependencies
    "DBSessionDep",
    "ApiVersionDep",
    "UserContextDep",
    "get_current_user_token",
    "require_auth",
    # Error utilities
    "create_error_response",
    "create_success_response",
    "handle_auth_error",
    "handle_profile_error",
]
