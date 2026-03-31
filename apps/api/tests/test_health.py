# apps/api/tests/test_health.py
# Health endpoint tests

from fastapi.testclient import TestClient
from app.main import create_app


def test_health_check_returns_200():
    """Health endpoint returns 200 OK."""
    client = TestClient(create_app())
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_check_schema():
    """Health response matches expected schema."""
    client = TestClient(create_app())
    response = client.get("/api/v1/health")
    data = response.json()

    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert data["database"] == "ok"
    assert data["redis"] == "ok"
    assert data["worker"] == "ok"
