from pydantic import BaseModel, ConfigDict


class GitHubInstallationResponse(BaseModel):
    id: str
    account_login: str
    account_type: str
    status: str
    model_config = ConfigDict(from_attributes=True)


class GitHubConnectionStatusResponse(BaseModel):
    installations: list[GitHubInstallationResponse]
    connected: bool
