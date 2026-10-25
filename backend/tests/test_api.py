"""HTTP-level tests against the FastAPI app (offline: no LLM key required)."""

from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/hq-mask/health")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, dict)


def test_list_culture_faces():
    response = client.get("/api/culture/faces")
    assert response.status_code == 200
    faces = response.json()
    assert isinstance(faces, (list, dict))
    if isinstance(faces, list):
        assert faces, "face catalogue should not be empty"


def test_rag_search_endpoint():
    response = client.get("/api/ai/rag/search", params={"q": "变脸 技法", "limit": 3})
    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "变脸 技法"
    assert body["count"] == len(body["documents"]) <= 3


def test_rag_search_with_current_face():
    response = client.get(
        "/api/ai/rag/search", params={"q": "这张脸谱", "currentFaceKey": "guanyu", "limit": 3}
    )
    assert response.status_code == 200
    assert response.json()["documents"]


def test_agent_endpoint_offline(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    response = client.post(
        "/api/ai/agent",
        json={"message": "介绍一下当前脸谱", "currentFaceKey": "guanyu"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "local-rag"
    assert body["toolCalls"]


def test_agent_endpoint_rejects_empty_message():
    response = client.post("/api/ai/agent", json={"message": "   "})
    assert response.status_code == 400


def test_culture_graph_endpoint():
    response = client.get("/api/culture/graph")
    assert response.status_code == 200
    graph = response.json()
    assert graph.get("nodes") and graph.get("edges")
