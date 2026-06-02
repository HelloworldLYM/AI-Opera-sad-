from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from backend.services.culture_knowledge_service import FACES, search_faces


COLOR_MEANINGS = {
    "红": "忠义、英勇、正直，也可表现英武和血性。",
    "黑": "刚直、威猛、粗豪、公正，需结合人物区分不同类型的刚烈、威压与草莽气。",
    "白": "冷峻、奸诈、多疑、威严或超脱，常用于权谋人物或特殊身份。",
    "蓝": "刚强、骁勇、有心计，常用于绿林江湖人物。",
    "绿": "草莽、猛烈、侠气或不受拘束。",
    "黄": "骁勇、凶猛、彪悍，也可表现老将沉稳或门神威仪。",
    "金": "神性、威严、帝王或非凡气息。",
    "银": "神怪、冷峻、非凡与舞台光泽。",
}


def _node(node_id: str, node_type: str, label: str, **data: Any) -> dict[str, Any]:
    return {"id": node_id, "type": node_type, "label": label, "data": data}


def _edge(source: str, target: str, edge_type: str, label: str, weight: float = 1.0) -> dict[str, Any]:
    return {
        "source": source,
        "target": target,
        "type": edge_type,
        "label": label,
        "weight": round(float(weight), 3),
    }


def _terms(text: str) -> list[str]:
    return [
        term.strip().lower()
        for term in re.split(r"[\s,，。；;:：、/\\|？?！!]+", str(text or ""))
        if term.strip()
    ]


def _face_node_id(key: str) -> str:
    return f"face:{key}"


def _color_node_id(color: str) -> str:
    return f"color:{color}"


def _meaning_node_id(meaning: str) -> str:
    return f"meaning:{meaning}"


def _opera_node_id(opera: str) -> str:
    return f"opera:{opera}"


def build_cultural_graph() -> dict[str, Any]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    for color, meaning in COLOR_MEANINGS.items():
        nodes[_color_node_id(color)] = _node(_color_node_id(color), "color", color, meaning=meaning)

    for face in FACES:
        face_id = _face_node_id(str(face["key"]))
        nodes[face_id] = _node(
            face_id,
            "face",
            str(face["title"]),
            key=face["key"],
            role=face.get("role"),
            colors=face.get("colors", []),
            meanings=face.get("meanings", []),
            opera=face.get("opera", []),
            story=face.get("story"),
        )

        for color in face.get("colors", []):
            color_id = _color_node_id(str(color))
            nodes.setdefault(color_id, _node(color_id, "color", str(color), meaning=COLOR_MEANINGS.get(str(color), "")))
            edges.append(_edge(face_id, color_id, "HAS_COLOR", "使用颜色", 1.0))

        for meaning in face.get("meanings", []):
            meaning_id = _meaning_node_id(str(meaning))
            nodes.setdefault(meaning_id, _node(meaning_id, "meaning", str(meaning)))
            edges.append(_edge(face_id, meaning_id, "EXPRESSES", "表达寓意", 1.0))

        for opera in face.get("opera", []):
            opera_id = _opera_node_id(str(opera))
            nodes.setdefault(opera_id, _node(opera_id, "opera", str(opera)))
            edges.append(_edge(face_id, opera_id, "APPEARS_IN", "关联剧目", 1.0))

    faces = list(FACES)
    for i, a in enumerate(faces):
        a_id = _face_node_id(str(a["key"]))
        a_colors = set(a.get("colors", []))
        a_meanings = set(a.get("meanings", []))
        a_operas = set(a.get("opera", []))
        for b in faces[i + 1 :]:
            b_id = _face_node_id(str(b["key"]))
            color_overlap = a_colors.intersection(b.get("colors", []))
            meaning_overlap = a_meanings.intersection(b.get("meanings", []))
            opera_overlap = a_operas.intersection(b.get("opera", []))
            if opera_overlap:
                edges.append(_edge(a_id, b_id, "SAME_OPERA", "同剧目线索", 0.9))
            if color_overlap and not meaning_overlap:
                edges.append(_edge(a_id, b_id, "SAME_COLOR_DIFFERENT_MEANING", "同色不同义", 0.72))
            if meaning_overlap and not color_overlap:
                edges.append(_edge(a_id, b_id, "SAME_MEANING_DIFFERENT_COLOR", "同义异色", 0.68))

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "stats": {
            "faces": len(FACES),
            "nodes": len(nodes),
            "edges": len(edges),
            "colors": len({color for face in FACES for color in face.get("colors", [])}),
            "operas": len({opera for face in FACES for opera in face.get("opera", [])}),
        },
    }


def _node_text(node: dict[str, Any]) -> str:
    data = node.get("data", {})
    values = [node.get("id"), node.get("type"), node.get("label")]
    for value in data.values():
        if isinstance(value, list):
            values.extend(str(item) for item in value)
        else:
            values.append(str(value))
    return " ".join(str(value or "") for value in values).lower()


def search_graph(query: str, current_face_key: str | None = None, limit: int = 8) -> dict[str, Any]:
    graph = build_cultural_graph()
    terms = _terms(query)
    scored: list[tuple[int, dict[str, Any]]] = []
    current_id = _face_node_id(str(current_face_key or "").lower()) if current_face_key else ""

    for node in graph["nodes"]:
        text = _node_text(node)
        score = 0
        for term in terms:
            if term in text:
                score += 4 if term == str(node.get("label", "")).lower() else 1
        if current_id and node["id"] == current_id:
            score += 6
        if score:
            scored.append((score, node))

    if not scored and query:
        for face in search_faces(query, limit=limit):
            node = next((item for item in graph["nodes"] if item["id"] == _face_node_id(str(face["key"]))), None)
            if node:
                scored.append((2, node))

    if not scored:
        scored = [(1, node) for node in graph["nodes"] if node["type"] == "face"][:limit]

    scored.sort(key=lambda item: (-item[0], item[1]["label"]))
    seed_nodes = [node for _, node in scored[:limit]]
    seed_ids = {node["id"] for node in seed_nodes}
    related_edges = [
        edge
        for edge in graph["edges"]
        if edge["source"] in seed_ids or edge["target"] in seed_ids
    ][: limit * 6]
    related_ids = set(seed_ids)
    for edge in related_edges:
        related_ids.add(edge["source"])
        related_ids.add(edge["target"])
    nodes = [node for node in graph["nodes"] if node["id"] in related_ids]
    return {
        "query": query,
        "graphStats": graph["stats"],
        "seedNodes": seed_nodes,
        "nodes": nodes,
        "edges": related_edges,
    }


def explain_graph_context(query: str, current_face_key: str | None = None) -> dict[str, Any]:
    result = search_graph(query, current_face_key=current_face_key, limit=6)
    face_nodes = [node for node in result["nodes"] if node["type"] == "face"]
    relation_counts = Counter(edge["type"] for edge in result["edges"])
    summary = (
        f"GraphRAG 命中 {len(face_nodes)} 个脸谱角色、{len(result['edges'])} 条关系。"
        f"主要关系包括：{', '.join(f'{key}:{value}' for key, value in relation_counts.most_common(4)) or '暂无'}。"
    )
    return {**result, "summary": summary}


def _event_weight(event: dict[str, Any]) -> float:
    event_type = str(event.get("type") or "")
    base = {
        "view_face": 0.35,
        "mask_switch": 0.55,
        "generate_mask": 0.9,
        "narration": 0.45,
        "report": 0.4,
        "recommendation_accept": 1.0,
    }.get(event_type, 0.25)
    try:
        return base * float(event.get("weight", 1.0))
    except (TypeError, ValueError):
        return base


def _preference_profile(preference_events: list[dict[str, Any]] | None) -> dict[str, Any]:
    color_weights: Counter[str] = Counter()
    meaning_weights: Counter[str] = Counter()
    face_weights: Counter[str] = Counter()
    for event in preference_events or []:
        face_key = str(event.get("faceKey") or "").lower()
        if not face_key:
            continue
        face = next((item for item in FACES if str(item["key"]).lower() == face_key), None)
        if not face:
            continue
        weight = _event_weight(event)
        face_weights[str(face["key"])] += weight
        for color in face.get("colors", []):
            color_weights[str(color)] += weight
        for meaning in face.get("meanings", []):
            meaning_weights[str(meaning)] += weight
    return {
        "colors": dict(color_weights),
        "meanings": dict(meaning_weights),
        "faces": dict(face_weights),
    }


def contextual_bandit_recommend(
    current_face_key: str | None = None,
    viewed_face_keys: list[str] | None = None,
    preference_events: list[dict[str, Any]] | None = None,
    ui_context: dict[str, Any] | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    current = next((face for face in FACES if str(face["key"]).lower() == str(current_face_key or "").lower()), None)
    viewed = {str(item).lower() for item in viewed_face_keys or []}
    if current:
        viewed.add(str(current["key"]).lower())

    profile = _preference_profile(preference_events)
    current_colors = set(current.get("colors", [])) if current else set()
    current_meanings = set(current.get("meanings", [])) if current else set()
    current_operas = set(current.get("opera", [])) if current else set()
    scored: list[dict[str, Any]] = []

    for face in FACES:
        key = str(face["key"])
        colors = set(face.get("colors", []))
        meanings = set(face.get("meanings", []))
        operas = set(face.get("opera", []))
        is_viewed = key.lower() in viewed
        color_pref = sum(profile["colors"].get(color, 0) for color in colors)
        meaning_pref = sum(profile["meanings"].get(meaning, 0) for meaning in meanings)
        exposure_penalty = profile["faces"].get(key, 0) * 0.16
        color_contrast = 0.0 if not current_colors else 1.0 - len(current_colors & colors) / max(len(current_colors | colors), 1)
        meaning_bridge = len(current_meanings & meanings) / max(len(current_meanings | meanings), 1) if current_meanings else 0.0
        opera_bridge = 1.0 if current_operas & operas else 0.0
        novelty = 0.0 if is_viewed else 1.0
        graph_richness = math.log1p(len(colors) + len(meanings) + len(operas)) / 3.0
        score = (
            novelty * 1.25
            + color_contrast * 0.72
            + meaning_bridge * 0.55
            + opera_bridge * 0.45
            + min(color_pref * 0.14, 0.6)
            + min(meaning_pref * 0.12, 0.5)
            + graph_richness * 0.36
            - exposure_penalty
        )
        scored.append({
            "face": face,
            "score": round(score, 4),
            "features": {
                "novelty": round(novelty, 3),
                "colorContrast": round(color_contrast, 3),
                "meaningBridge": round(meaning_bridge, 3),
                "operaBridge": round(opera_bridge, 3),
                "colorPreference": round(color_pref, 3),
                "meaningPreference": round(meaning_pref, 3),
                "exposurePenalty": round(exposure_penalty, 3),
                "graphRichness": round(graph_richness, 3),
            },
        })

    scored.sort(key=lambda item: (-item["score"], str(item["face"]["title"])))
    top = scored[: max(1, limit)]
    selected = top[0]
    face = selected["face"]
    relation = "形成新的颜色/性格对照"
    if current and set(current.get("opera", [])) & set(face.get("opera", [])):
        relation = "延续同一剧目线索"
    elif current and set(current.get("colors", [])) & set(face.get("colors", [])):
        relation = "展示同色不同义"
    elif current and set(current.get("meanings", [])) & set(face.get("meanings", [])):
        relation = "延展相近人格寓意"

    reason = (
        f"推荐体验{face['title']}：{relation}。"
        f"它属于{face['role']}，颜色为{'、'.join(face.get('colors', []))}，"
        f"寓意为{'、'.join(face.get('meanings', []))}。"
    )
    return {
        "policy": "contextual-bandit-graphrag-v1",
        "face": {k: face.get(k) for k in ("key", "title", "role", "colors", "meanings", "opera", "story")},
        "reason": reason,
        "features": selected["features"],
        "score": selected["score"],
        "candidates": [
            {
                "face": {k: item["face"].get(k) for k in ("key", "title", "role", "colors", "meanings", "opera")},
                "score": item["score"],
                "features": item["features"],
            }
            for item in top
        ],
        "preferenceProfile": profile,
        "graphStats": build_cultural_graph()["stats"],
        "uiContext": ui_context or {},
    }
