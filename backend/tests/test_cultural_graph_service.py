"""Tests for the GraphRAG knowledge graph and the contextual bandit recommender."""

from backend.services.cultural_graph_service import (
    build_cultural_graph,
    contextual_bandit_recommend,
    explain_graph_context,
    search_graph,
)


def test_graph_has_nodes_and_edges():
    graph = build_cultural_graph()
    assert graph["nodes"], "graph must contain nodes"
    assert graph["edges"], "graph must contain edges"
    node_ids = {node["id"] for node in graph["nodes"]}
    for edge in graph["edges"]:
        assert edge["source"] in node_ids, f"dangling edge source {edge['source']}"
        assert edge["target"] in node_ids, f"dangling edge target {edge['target']}"


def test_graph_node_types_cover_domain():
    graph = build_cultural_graph()
    types = {node["type"] for node in graph["nodes"]}
    assert {"face", "color"} <= types


def test_search_graph_returns_subgraph_for_color_query():
    result = search_graph("红色的脸谱代表什么", limit=5)
    assert result
    assert result.get("nodes"), "color query should match color nodes"


def test_explain_graph_context_has_summary():
    context = explain_graph_context("张飞的性格", current_face_key="zhangfei")
    assert context.get("summary") or context.get("nodes"), "graph context should be explanatory"


def test_bandit_recommend_returns_reasoned_face():
    rec = contextual_bandit_recommend(current_face_key="guanyu")
    assert rec.get("face"), "recommendation must include a face"
    assert rec.get("reason"), "recommendation must include a reason"
    assert rec["face"].get("key") != "guanyu", "should recommend something new"


def test_bandit_policy_and_features_are_exposed():
    rec = contextual_bandit_recommend(current_face_key="guanyu")
    assert rec["policy"] == "contextual-bandit-graphrag-v1"
    assert rec["candidates"], "recommendation must expose candidate list"
    for candidate in rec["candidates"]:
        assert "score" in candidate and "features" in candidate


def test_bandit_exposure_penalty_downweights_viewed_faces():
    fresh = contextual_bandit_recommend(current_face_key="guanyu", limit=5)
    viewed = contextual_bandit_recommend(
        current_face_key=None,
        viewed_face_keys=[fresh["face"]["key"], "guanyu", "zhangfei"],
        limit=5,
    )
    viewed_keys = {item["face"]["key"] for item in viewed["candidates"][:3]}
    assert fresh["face"]["key"] not in viewed_keys or viewed["face"]["key"] != fresh["face"]["key"]
