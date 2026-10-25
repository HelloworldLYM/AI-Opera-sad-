"""Tests for the guide agent: tool registry, RAG context and offline fallback."""

from backend.services.ai_agent_service import (
    deepseek_config,
    retrieve_rag_context,
    run_agent,
)


def test_deepseek_config_reports_unconfigured_without_key(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    config = deepseek_config()
    assert config["configured"] is False


def test_retrieve_rag_context_structure():
    rag = retrieve_rag_context("这张脸谱有什么寓意", current_face_key="guanyu")
    assert set(rag) >= {"query", "matches", "documents", "graph"}
    assert rag["documents"], "rag context should contain retrieved documents"


def test_retrieve_rag_context_includes_current_face():
    rag = retrieve_rag_context("随便聊聊", current_face_key="zhangfei")
    match_keys = {face["key"] for face in rag["matches"]}
    assert "zhangfei" in match_keys


def test_run_agent_offline_fallback(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    result = run_agent("帮我推荐下一张脸谱", current_face_key="guanyu")
    assert result["provider"] == "local-rag"
    assert result["usedDeepSeek"] is False
    assert result["agentMode"] == "local-tool-agent"
    assert result["toolCalls"], "offline agent must still record its tool calls"
    tool_names = {tool["name"] for tool in result["toolCalls"]}
    assert {"rag.search", "graphrag.subgraph", "bandit.recommend_face"} <= tool_names
    assert result["answer"], "fallback must still answer"


def test_run_agent_never_leaks_markdown_markers(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    result = run_agent("RAG 是什么", current_face_key=None)
    assert "#" not in result["answer"]
    assert "*" not in result["answer"]
