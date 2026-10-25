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


def test_run_agent_tools_are_instrumented(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    result = run_agent("这张脸谱的寓意", current_face_key="guanyu")
    for call in result["toolCalls"]:
        assert call["status"] in {"ok", "empty"} or call["status"].startswith("error")
        assert isinstance(call["latencyMs"], (int, float))
        assert call["latencyMs"] >= 0


def test_offline_answer_carries_citations(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    result = run_agent("变脸的技法有哪些", current_face_key=None)
    assert isinstance(result.get("citations"), list)
    assert result["citations"], "technique query should yield cited sources"
    for citation in result["citations"]:
        assert citation["sourceUrl"].startswith("http")
        assert citation["source"]
    assert "来源：" in result["answer"], "answer text must embed the source block"


def test_history_is_sanitized(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    messy_history = [
        {"role": "user", "content": "上一句用户输入"},
        {"role": "system", "content": "should be dropped"},
        {"role": "assistant", "content": "上一句助手回答"},
        "not-a-dict",
        {"role": "user"},  # no content
    ]
    result = run_agent("继续讲讲", current_face_key=None, history=messy_history)
    assert result["provider"] == "local-rag"
    assert result["toolContext"]["historyTurns"] == 2
