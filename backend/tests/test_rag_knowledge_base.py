"""Tests for the RAG knowledge base: corpus integrity and retrieval scoring."""

from backend.services.rag_knowledge_base import (
    build_documents,
    corpus_stats,
    resolve_emotion_face_mapping,
    search_documents,
)


def test_corpus_is_non_empty_and_unique():
    docs = build_documents()
    assert len(docs) > 20
    ids = [doc["id"] for doc in docs]
    assert len(ids) == len(set(ids)), "document ids must be unique"
    for doc in docs:
        assert doc.get("title"), doc["id"]
        assert doc.get("text"), doc["id"]


def test_online_sources_keep_citations():
    docs = build_documents()
    online = [doc for doc in docs if doc.get("category") == "online-source"]
    assert online, "curated online corpus should exist"
    for doc in online:
        assert doc.get("source"), f"{doc['id']} missing source"
        assert str(doc.get("sourceUrl", "")).startswith("http"), f"{doc['id']} missing sourceUrl"


def test_search_ranks_face_knowledge_first_for_face_query():
    results = search_documents("关羽 忠义 红色脸谱", limit=5)
    assert results
    assert any(doc.get("faceKey") == "guanyu" for doc in results[:2]), (
        "guanyu should rank at the top for its own keywords"
    )


def test_search_current_face_context_boost():
    neutral = search_documents("介绍一下这张脸谱", limit=3, current_face_key="zhangfei")
    assert neutral, "context query should still return documents"
    assert neutral[0].get("faceKey") == "zhangfei", (
        "current face must be boosted into the top result"
    )


def test_search_returns_sources_when_hit():
    results = search_documents("变脸 抹脸 吹脸 技法", limit=5)
    assert results
    assert any(doc.get("sourceUrl") for doc in results), (
        "technique queries should surface cited online documents"
    )


def test_empty_query_returns_head_of_corpus():
    results = search_documents("   ", limit=4)
    assert len(results) == 4


def test_limit_is_respected_and_capped():
    assert len(search_documents("脸谱", limit=3)) <= 3
    # request above the internal cap of 20
    assert len(search_documents("脸谱", limit=99)) <= 20


def test_emotion_face_mapping_shape():
    mapping = resolve_emotion_face_mapping("happy")
    assert isinstance(mapping, dict)
    assert "faceKey" in mapping or "face" in mapping or mapping == {}


def test_bilingual_query_expansion_hits_chinese_docs():
    results = search_documents("face changing technique", limit=5)
    assert results, "english alias query must retrieve documents"
    assert any("变脸" in doc["title"] or "变脸" in " ".join(doc.get("tags", [])) for doc in results)


def test_source_diversity_caps_single_outlet():
    results = search_documents("变脸 历史 技法 文化 川剧 非遗 数字化", limit=12)
    assert len(results) >= 6
    per_url: dict[str, int] = {}
    for doc in results:
        url = str(doc.get("sourceUrl") or "")
        per_url[url] = per_url.get(url, 0) + 1
    assert max(per_url.values()) <= 2, "one source must not crowd out the result page"


def test_corpus_stats_shape():
    stats = corpus_stats()
    assert stats["totalDocuments"] > 40, "corpus should keep growing, not shrink"
    assert stats["sourceCount"] >= 10, "at least ten distinct cited sources"
    assert "online-source" in stats["byCategory"]
    assert stats["retrieval"].startswith("weighted-lexical")
