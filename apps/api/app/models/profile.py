# apps/api/app/models/profile.py
# SQLAlchemy model for user profile data (extends Supabase Auth)

from sqlalchemy import Boolean, Column, DateTime, String
from sqlalchemy.sql import func

from app.models.base import Base


class Profile(Base):
    """
    User profile data that extends Supabase Auth.

    Supabase Auth handles: id, email, password, email_verified
    This model handles: app-specific profile fields + avatar reference
    """

    __tablename__ = "profiles"

    # Primary key = Supabase user ID (1:1 relationship)
    id = Column(String, primary_key=True, index=True)

    # App-specific fields
    full_name = Column(String(100), nullable=True)
    avatar_url = Column(String(255), nullable=True)  # Minio URL
    avatar_key = Column(String(255), nullable=True)  # Minio object key for deletion
    timezone = Column(String(50), default="UTC")
    email_notifications = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Profile(id='{self.id}', full_name='{self.full_name}')>"
