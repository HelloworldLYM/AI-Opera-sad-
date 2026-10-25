from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from backend.services.cultural_graph_service import (
    contextual_bandit_recommend,
    explain_graph_context,
)
from backend.services.culture_knowledge_service import answer_query, list_faces, search_faces
from backend.services.opera_media_service import get_opera_media
from backend.services.rag_knowledge_base import search_documents

DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"

COLOR_KNOWLEDGE: dict[str, str] = {
    "红": "红色常用于表现忠义、英勇、正直，也适合关羽、姜维等忠勇人物。",
    "黑": "黑色常用于表现刚直、威猛、粗豪、公正，舞台上强调力量与压迫感。",
    "白": "白色常用于表现冷峻、奸诈、威严或超脱，具体含义需要结合人物身份判断。",
    "蓝": "蓝色多表现刚强、骁勇、有心计，也常用于绿林英雄或江湖人物。",
    "绿": "绿色常表现草莽、猛烈、侠气或不受拘束的英雄气质。",
    "黄": "黄色常表现骁勇、凶猛、彪悍，也可以带出战场压迫感。",
    "金": "金色、银色多用于神怪、神佛、天将等非凡人物，强调神性和威严。",
}


def _sanitize_xiaopu_text(value: Any) -> str:
    """Remove Markdown marker characters that should never appear in Xiaopu replies."""
    text = str(value or "").replace("#", "").replace("*", "")
    lines = [line.strip() for line in text.splitlines()]
    return "\n".join(lines).strip()


def deepseek_config() -> dict[str, Any]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    base_url = os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL).strip() or DEFAULT_DEEPSEEK_BASE_URL
    model = os.environ.get("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL).strip() or DEFAULT_DEEPSEEK_MODEL
    return {
        "configured": bool(api_key),
        "baseUrl": base_url,
        "model": model,
        "timeoutSeconds": float(os.environ.get("DEEPSEEK_TIMEOUT_SECONDS", "25")),
    }


def _chat_completion_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _compact_face(face: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": face.get("key"),
        "title": face.get("title"),
        "role": face.get("role"),
        "colors": face.get("colors", []),
        "meanings": face.get("meanings", []),
        "opera": face.get("opera", []),
        "story": face.get("story"),
    }


def _find_face_by_key(face_key: str | None) -> dict[str, Any] | None:
    normalized = (face_key or "").strip().lower()
    if not normalized:
        return None
    for face in list_faces():
        aliases = [str(item).lower() for item in face.get("aliases", [])]
        if normalized == str(face.get("key", "")).lower() or normalized in aliases:
            return face
    return None


def retrieve_rag_context(query: str, current_face_key: str | None = None, limit: int = 5) -> dict[str, Any]:
    current_face = _find_face_by_key(current_face_key)
    matches = search_faces(query, limit=limit)
    if current_face and all(face.get("key") != current_face.get("key") for face in matches):
        matches = [current_face, *matches[: max(0, limit - 1)]]

    matched_colors = sorted({
        color
        for face in matches
        for color in face.get("colors", [])
        if color in COLOR_KNOWLEDGE
    })
    color_notes = [{"color": color, "note": COLOR_KNOWLEDGE[color]} for color in matched_colors]
    return {
        "query": query,
        "currentFace": _compact_face(current_face) if current_face else None,
        "matches": [_compact_face(face) for face in matches],
        "colorNotes": color_notes,
        "documents": search_documents(query, limit=limit + 3, current_face_key=current_face_key),
        "graph": explain_graph_context(query, current_face_key=current_face_key),
    }


def recommend_face(
    current_face_key: str | None = None,
    viewed_face_keys: list[str] | None = None,
    preference_events: list[dict[str, Any]] | None = None,
    ui_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    recommendation = contextual_bandit_recommend(
        current_face_key=current_face_key,
        viewed_face_keys=viewed_face_keys,
        preference_events=preference_events,
        ui_context=ui_context,
        limit=5,
    )
    face = _find_face_by_key(recommendation["face"].get("key")) or recommendation["face"]
    return {
        **recommendation,
        "face": _compact_face(face),
    }


def _run_agent_tools(
    message: str,
    current_face_key: str | None = None,
    ui_context: dict[str, Any] | None = None,
    system_health: dict[str, Any] | None = None,
    reconstruction_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ui = ui_context or {}
    viewed_face_keys = ui.get("viewedFaceKeys") or ui.get("viewedFaces") or []
    preference_events = ui.get("preferenceEvents") or []
    graph = explain_graph_context(message, current_face_key=current_face_key)
    recommendation = recommend_face(
        current_face_key=current_face_key,
        viewed_face_keys=viewed_face_keys,
        preference_events=preference_events,
        ui_context=ui,
    )
    tools = [
        {
            "name": "rag.search",
            "purpose": "检索脸谱文化、项目技术和外部资料摘要",
            "result": search_documents(message, limit=6, current_face_key=current_face_key),
        },
        {
            "name": "graphrag.subgraph",
            "purpose": "沿角色-颜色-寓意-剧目关系取一跳子图",
            "result": graph,
        },
        {
            "name": "bandit.recommend_face",
            "purpose": "根据当前脸谱、观展历史和偏好事件推荐下一张脸谱",
            "result": recommendation,
        },
    ]
    if system_health:
        tools.append({
            "name": "system.health",
            "purpose": "读取后端生成能力、CPU/GPU fallback 与 RAG 状态",
            "result": system_health,
        })
    if reconstruction_profile:
        tools.append({
            "name": "generation.profile",
            "purpose": "读取三维面罩生成路线和 claim level",
            "result": reconstruction_profile,
        })
    if current_face_key:
        try:
            tools.append({
                "name": "opera.media_search",
                "purpose": "根据当前脸谱匹配剧目唱段，并生成原视频检索入口",
                "result": get_opera_media(current_face_key),
            })
        except KeyError:
            pass
    return {
        "toolCalls": tools,
        "graph": graph,
        "recommendation": recommendation,
    }


def _local_rag_answer(query: str, current_face_key: str | None = None) -> dict[str, Any]:
    rag = retrieve_rag_context(query, current_face_key=current_face_key)
    lower = query.lower()
    if any(term in lower for term in ["gpu", "cpu", "显卡", "电脑", "配置", "跑不动"]):
        answer = (
            "当前项目已经支持 CPU 模式。没有 GPU 时，系统会优先保持体验馆、陈列馆、RAG 导览和三维展示可用；"
            "个性化三维脸谱生成会按 auto 策略尝试 3DDFA-V3 CPU 重建，必要时降级到前端 OBJ 或 mock，"
            "因此展示不会因为没有 GPU 直接中断。"
        )
    elif any(term in query for term in ["推荐", "下一张", "下一个", "体验"]):
        recommendation = recommend_face(current_face_key)
        answer = recommendation["reason"]
    elif any(term in query for term in ["生成", "流程", "路线", "agent", "rag", "ai"]):
        top_doc = (rag.get("documents") or [{}])[0]
        answer = top_doc.get("text") or (
            "本项目的 AI 链路包括视觉感知、VLM 视觉质检、CLIP-style 多模态检索、"
            "AI 创作脸谱设计、手势理解、SAM-style 遮挡分割、个性化三维脸谱面罩生成、"
            "RAG 文化检索和导览 Agent。后端会记录多视角采集、质量筛选、UV 烘焙、"
            "细节法线图、GLB 导出和 manifest，让生成过程可以解释、可以追溯。"
        )
    else:
        base = answer_query(query)
        if base.get("matches"):
            answer = base.get("answer") or "暂未匹配到对应脸谱资料。"
        else:
            top_doc = (rag.get("documents") or [{}])[0]
            answer = top_doc.get("text") or "暂未匹配到对应脸谱资料。"

    return {
        "answer": _sanitize_xiaopu_text(answer),
        "provider": "local-rag",
        "model": None,
        "rag": rag,
        "usedDeepSeek": False,
    }


def _call_deepseek(messages: list[dict[str, str]], *, temperature: float = 0.35, max_tokens: int = 900) -> dict[str, Any]:
    config = deepseek_config()
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")

    payload = {
        "model": config["model"],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    request = urllib.request.Request(
        _chat_completion_url(config["baseUrl"]),
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=float(config["timeoutSeconds"])) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek API HTTP {exc.code}: {detail[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"DeepSeek API network error: {exc.reason}") from exc

    data = json.loads(body)
    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    return {"content": content, "raw": data}


def answer_with_rag(query: str, current_face_key: str | None = None) -> dict[str, Any]:
    rag = retrieve_rag_context(query, current_face_key=current_face_key)
    if not deepseek_config()["configured"]:
        return _local_rag_answer(query, current_face_key=current_face_key)

    system = (
        "你是 AI-Opera 项目的川剧脸谱导览助手“小谱”。只能依据项目 RAG context 和系统状态回答；"
        "可以补充常识性表述，但不要编造剧目、人物或技术能力。"
        "项目定位是个性化三维脸谱面罩生成，不要宣称身份级高保真人脸重建。"
        "回答使用中文，简洁、有展馆讲解感。"
        "不要使用 Markdown 格式，回答中绝对不要出现 # 或 * 两个字符。"
    )
    user = (
        f"用户问题：{query}\n\n"
        f"RAG context JSON：{json.dumps(rag, ensure_ascii=False)}"
    )
    try:
        result = _call_deepseek([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ])
        return {
            "answer": _sanitize_xiaopu_text(result["content"]),
            "provider": "deepseek",
            "model": deepseek_config()["model"],
            "rag": rag,
            "usedDeepSeek": True,
        }
    except Exception as exc:
        fallback = _local_rag_answer(query, current_face_key=current_face_key)
        fallback["llmError"] = str(exc)
        return fallback


def run_agent(
    message: str,
    current_face_key: str | None = None,
    ui_context: dict[str, Any] | None = None,
    system_health: dict[str, Any] | None = None,
    reconstruction_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rag = retrieve_rag_context(message, current_face_key=current_face_key)
    tool_results = _run_agent_tools(
        message=message,
        current_face_key=current_face_key,
        ui_context=ui_context,
        system_health=system_health,
        reconstruction_profile=reconstruction_profile,
    )
    recommendation = tool_results["recommendation"]
    tool_context = {
        "currentFaceKey": current_face_key,
        "uiContext": ui_context or {},
        "systemHealth": system_health or {},
        "reconstructionProfile": reconstruction_profile or {},
        "recommendation": recommendation,
        "graphSummary": tool_results["graph"].get("summary"),
    }

    if not deepseek_config()["configured"]:
        local = _local_rag_answer(message, current_face_key=current_face_key)
        return {
            **local,
            "agentMode": "local-tool-agent",
            "toolContext": tool_context,
            "toolCalls": tool_results["toolCalls"],
            "suggestedActions": _suggest_actions(message, recommendation),
        }

    system = (
        "你是 AI-Opera 项目的川剧脸谱导览助手“小谱”。你的职责包括："
        "1) 基于 RAG 解释脸谱文化；2) 基于 GraphRAG 说明角色、颜色、寓意、剧目关系；"
        "3) 根据 contextual bandit 推荐下一张脸谱；4) 根据系统状态解释 CPU/GPU/生成路线；"
        "5) 解释 Agent、RAG、VLM 质检、CLIP 多模态检索、SAM 遮挡和三维面罩生成的 AI 价值。"
        "你必须使用 tool calls 中给出的工具结果，但不要声称自己真的启动了摄像头或完成了生成任务。"
        "不要使用“高保真人脸重建”作为既有能力表述。"
        "不要使用 Markdown 格式，回答中绝对不要出现 # 或 * 两个字符。"
    )
    user = (
        f"用户消息：{message}\n\n"
        f"RAG context：{json.dumps(rag, ensure_ascii=False)}\n\n"
        f"Tool calls：{json.dumps(tool_results['toolCalls'], ensure_ascii=False)}\n\n"
        f"Tool context：{json.dumps(tool_context, ensure_ascii=False)}"
    )
    try:
        result = _call_deepseek([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], temperature=0.28, max_tokens=1100)
        return {
            "answer": _sanitize_xiaopu_text(result["content"]),
            "provider": "deepseek",
            "model": deepseek_config()["model"],
            "usedDeepSeek": True,
            "agentMode": "deepseek-rag-tool-agent",
            "rag": rag,
            "toolContext": tool_context,
            "toolCalls": tool_results["toolCalls"],
            "suggestedActions": _suggest_actions(message, recommendation),
        }
    except Exception as exc:
        local = _local_rag_answer(message, current_face_key=current_face_key)
        return {
            **local,
            "agentMode": "local-tool-agent",
            "toolContext": tool_context,
            "toolCalls": tool_results["toolCalls"],
            "suggestedActions": _suggest_actions(message, recommendation),
            "llmError": str(exc),
        }


def generate_narration(
    current_face_key: str | None = None,
    ui_context: dict[str, Any] | None = None,
    duration_seconds: int = 30,
) -> dict[str, Any]:
    face = _find_face_by_key(current_face_key) or (list_faces()[0] if list_faces() else None)
    face_key = str(face.get("key", current_face_key or "guanyu")) if face else (current_face_key or "guanyu")
    rag = retrieve_rag_context(
        f"{face_key} 当前脸谱 展馆讲解 AI 生成路线 变脸 技法",
        current_face_key=face_key,
        limit=6,
    )
    duration = max(15, min(int(duration_seconds or 30), 90))

    local_script = _local_narration(face, rag, duration, ui_context or {})
    if not deepseek_config()["configured"]:
        return {
            "script": _sanitize_xiaopu_text(local_script),
            "provider": "local-rag",
            "model": None,
            "usedDeepSeek": False,
            "durationSeconds": duration,
            "rag": rag,
        }

    system = (
        "你是 AI-Opera 川剧脸谱数字体验馆的现场讲解员。"
        "请依据 RAG context 和当前 UI 状态生成一段适合语音播报的中文展馆讲解词。"
        "语言要华丽但准确，突出 AI 感知、RAG、Agent、三维脸谱面罩和非遗传播价值。"
        "不要编造未实现功能，不要声称身份级高保真人脸重建。"
        "不要使用 Markdown 格式，讲解词中绝对不要出现 # 或 * 两个字符。"
    )
    user = (
        f"目标时长：约 {duration} 秒。\n"
        f"当前 UI 状态：{json.dumps(ui_context or {}, ensure_ascii=False)}\n"
        f"RAG context：{json.dumps(rag, ensure_ascii=False)}"
    )
    try:
        result = _call_deepseek([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], temperature=0.34, max_tokens=900)
        return {
            "script": _sanitize_xiaopu_text(result["content"]),
            "provider": "deepseek",
            "model": deepseek_config()["model"],
            "usedDeepSeek": True,
            "durationSeconds": duration,
            "rag": rag,
        }
    except Exception as exc:
        return {
            "script": _sanitize_xiaopu_text(local_script),
            "provider": "local-rag",
            "model": None,
            "usedDeepSeek": False,
            "durationSeconds": duration,
            "rag": rag,
            "llmError": str(exc),
        }


def generate_visit_report(payload: dict[str, Any]) -> dict[str, Any]:
    current_face_key = payload.get("currentFaceKey")
    viewed_face_keys = payload.get("viewedFaceKeys") or []
    ui_context = payload.get("uiContext") or {}
    performance = payload.get("performance") or {}
    gesture_dataset = payload.get("gestureDataset") or {}
    generation = payload.get("generation") or {}
    recommendation = recommend_face(current_face_key, viewed_face_keys)
    rag = retrieve_rag_context(
        "观展报告 川剧脸谱 AI Agent RAG 三维面罩 手势训练 性能数据",
        current_face_key=current_face_key,
        limit=8,
    )
    faces = [_compact_face(_find_face_by_key(face_key)) for face_key in viewed_face_keys if _find_face_by_key(face_key)]
    local_report = _local_visit_report(
        current_face_key=current_face_key,
        faces=faces,
        ui_context=ui_context,
        performance=performance,
        gesture_dataset=gesture_dataset,
        generation=generation,
        recommendation=recommendation,
    )
    if not deepseek_config()["configured"]:
        return {
            "report": _sanitize_xiaopu_text(local_report),
            "provider": "local-rag",
            "model": None,
            "usedDeepSeek": False,
            "rag": rag,
            "recommendation": recommendation,
        }

    system = (
        "你是 AI-Opera 项目的观展报告生成 Agent。请根据输入数据生成中文观展报告，"
        "包括体验概览、脸谱文化学习、AI 能力说明、生成资产与性能、手势训练数据建议、下一步推荐。"
        "报告要适合答辩展示，事实准确，不夸大项目能力。"
        "不要使用 Markdown 格式，报告中绝对不要出现 # 或 * 两个字符。"
    )
    user = json.dumps(
        {
            "currentFaceKey": current_face_key,
            "viewedFaces": faces,
            "uiContext": ui_context,
            "performance": performance,
            "gestureDataset": gesture_dataset,
            "generation": generation,
            "recommendation": recommendation,
            "rag": rag,
        },
        ensure_ascii=False,
    )
    try:
        result = _call_deepseek([
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ], temperature=0.28, max_tokens=1500)
        return {
            "report": _sanitize_xiaopu_text(result["content"]),
            "provider": "deepseek",
            "model": deepseek_config()["model"],
            "usedDeepSeek": True,
            "rag": rag,
            "recommendation": recommendation,
        }
    except Exception as exc:
        return {
            "report": _sanitize_xiaopu_text(local_report),
            "provider": "local-rag",
            "model": None,
            "usedDeepSeek": False,
            "rag": rag,
            "recommendation": recommendation,
            "llmError": str(exc),
        }


def _local_narration(
    face: dict[str, Any] | None,
    rag: dict[str, Any],
    duration_seconds: int,
    ui_context: dict[str, Any],
) -> str:
    title = face.get("title", "当前脸谱") if face else "当前脸谱"
    role = face.get("role", "川剧脸谱") if face else "川剧脸谱"
    colors = "、".join(face.get("colors", [])) if face else "多色"
    meanings = "、".join(face.get("meanings", [])) if face else "人物性格与情绪"
    story = face.get("story", "") if face else ""
    mode = ui_context.get("personalObjState") or "实时交互"
    return (
        f"欢迎进入 AI-Opera 智能川剧变脸体验。此刻呈现的是{title}，属于{role}，"
        f"主要色彩为{colors}，象征{meanings}。{story}"
        f"在这个系统中，AI 先通过人脸与手部关键点理解你的姿态和动作，再把脸谱纹样映射到个性化三维面罩上。"
        f"后台 RAG 知识库会检索川剧非遗、变脸技法和项目技术资料，Agent 再生成讲解、推荐和诊断。"
        f"当前生成状态为{mode}。这不是单纯换一张图，而是把传统脸谱的写意表达转化为可交互、可解释、可追溯的数字文化体验。"
    )


def _local_visit_report(
    current_face_key: str | None,
    faces: list[dict[str, Any]],
    ui_context: dict[str, Any],
    performance: dict[str, Any],
    gesture_dataset: dict[str, Any],
    generation: dict[str, Any],
    recommendation: dict[str, Any],
) -> str:
    face_names = "、".join(face.get("title", "") for face in faces if face.get("title")) or current_face_key or "当前脸谱"
    gallery_count = ui_context.get("galleryCount", 0)
    dataset_total = gesture_dataset.get("totalSamples", 0)
    by_label = gesture_dataset.get("byLabel", {})
    fps = performance.get("fps") or performance.get("currentFps") or "--"
    personal_state = ui_context.get("personalObjState", "unknown")
    rec_face = recommendation.get("face", {}).get("title", "下一张脸谱")
    rec_reason = recommendation.get("reason", "")
    label_summary = "、".join(f"{label}:{count}" for label, count in sorted(by_label.items())) or "暂无训练样本"
    return (
        f"# AI-Opera 观展报告\n\n"
        f"## 体验概览\n本次体验已进入个人脸谱陈列流程，当前/已体验脸谱包括：{face_names}。"
        f"陈列馆中记录约 {gallery_count} 个条目，个人三维面罩状态为 {personal_state}。\n\n"
        f"## AI 能力\n系统使用视觉 AI 识别人脸、手部动作和姿态；使用 VLM-style 视觉质检、CLIP-style 多模态检索、"
        f"SAM-style 遮挡分割和 RAG 检索川剧与项目资料；使用导览 Agent 完成讲解、推荐、创作和系统诊断；"
        f"三维生成链路保留 capture manifest 和 asset manifest，支持可追溯展示。\n\n"
        f"## 性能与资产\n当前 FPS 指标：{fps}。生成信息：{json.dumps(generation, ensure_ascii=False)}。\n\n"
        f"## 手势训练数据\n本地已保存 {dataset_total} 段手势样本，标签分布：{label_summary}。"
        f"建议每类至少 30 段，覆盖不同人、光照、距离和动作速度，再上传 AutoDL 训练 TCN 模型。\n\n"
        f"## 下一步推荐\n{rec_reason or f'推荐继续体验{rec_face}，形成颜色和人物性格对照。'}"
    )


def _suggest_actions(message: str, recommendation: dict[str, Any]) -> list[dict[str, str]]:
    actions = [
        {"type": "ask", "label": "解释当前脸谱", "prompt": "请解释我当前佩戴的脸谱人物、颜色和寓意。"},
        {"type": "recommend", "label": "推荐下一张", "prompt": f"推荐我下一张体验{recommendation['face']['title']}。"},
        {"type": "ask", "label": "讲生成路线", "prompt": "请用展馆讲解词说明这个项目的 AI 生成路线。"},
    ]
    if any(term in message.lower() for term in ["cpu", "gpu", "显卡"]):
        actions.insert(0, {"type": "ask", "label": "解释 CPU 模式", "prompt": "我的电脑没有 GPU，这个项目会如何降级并保持演示？"})
    return actions
