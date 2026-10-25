from __future__ import annotations

import html
import json
import re
from typing import Any

from backend.services.ai_agent_service import _call_deepseek, deepseek_config
from backend.services.culture_knowledge_service import list_faces
from backend.services.rag_knowledge_base import search_documents

PALETTES: dict[str, list[str]] = {
    "忠义": ["#b91524", "#111827", "#f8e4a6", "#ffffff"],
    "威猛": ["#111111", "#b91524", "#f5d06f", "#ffffff"],
    "神怪": ["#d4af37", "#101827", "#41d3ff", "#ffffff"],
    "草莽": ["#117a4f", "#121212", "#e9d36e", "#f8f8f2"],
    "冷峻": ["#f4efe7", "#1c2430", "#d6b35a", "#7f1d1d"],
}


def _find_face(face_key: str | None) -> dict[str, Any] | None:
    key = (face_key or "").strip().lower()
    for face in list_faces():
        aliases = [str(alias).lower() for alias in face.get("aliases", [])]
        if key == face.get("key") or key in aliases or key == str(face.get("title", "")).lower():
            return face
    return None


def _select_palette(prompt: str, seed_face: dict[str, Any] | None) -> tuple[str, list[str]]:
    haystack = f"{prompt} {' '.join(seed_face.get('meanings', [])) if seed_face else ''}"
    for keyword, palette in PALETTES.items():
        if keyword in haystack:
            return keyword, palette
    if seed_face:
        colors = seed_face.get("colors", [])
        if "红" in colors:
            return "忠义", PALETTES["忠义"]
        if "黑" in colors:
            return "威猛", PALETTES["威猛"]
        if "金" in colors or "银" in colors:
            return "神怪", PALETTES["神怪"]
        if "绿" in colors:
            return "草莽", PALETTES["草莽"]
    return "威猛", PALETTES["威猛"]


def _local_spec(prompt: str, current_face_key: str | None) -> dict[str, Any]:
    seed = _find_face(current_face_key) or (list_faces()[0] if list_faces() else None)
    palette_name, palette = _select_palette(prompt, seed)
    seed_title = seed.get("title", "川剧脸谱") if seed else "川剧脸谱"
    seed_role = seed.get("role", "传统谱式") if seed else "传统谱式"
    docs = search_documents(f"{prompt} 脸谱 颜色 寓意 谱式", limit=4, current_face_key=current_face_key)
    motifs = ["额心云纹", "对称眼窝", "鼻梁主轴", "腮边火焰纹"]
    if "神" in prompt or palette_name == "神怪":
        motifs = ["额心神纹", "金银眉峰", "天将甲片", "光环式鼻梁"]
    elif "水" in prompt or "白蛇" in prompt:
        motifs = ["水波额纹", "冷白眼窝", "金线鼻梁", "云雾腮纹"]
    elif "草莽" in prompt or palette_name == "草莽":
        motifs = ["斧形额纹", "粗黑眉峰", "山寨旗纹", "开张腮线"]

    return {
        "title": f"AI 创作谱式：{seed_title}意象",
        "seedFace": seed_title,
        "seedRole": seed_role,
        "claimLevel": "AI-generated concept mask, not a traditional canonical facepaint",
        "paletteName": palette_name,
        "palette": palette,
        "motifs": motifs,
        "meaning": [
            f"以{seed_title}的{seed_role}为文化锚点",
            f"用{palette_name}色组强化人物性格",
            "纹样保持左右对称，便于后续映射到三维面罩 UV",
        ],
        "process": [
            "先固定中轴、眉眼和鼻梁，保证舞台远观辨识度。",
            "再叠加额心与腮边纹样，控制复杂度，避免破坏传统谱式秩序。",
            "最后输出为独立 AI 创作方案，不写入原始传统脸谱库。",
        ],
        "ragEvidence": [
            {"title": doc.get("title"), "source": doc.get("source"), "snippet": doc.get("text", "")[:120]}
            for doc in docs
        ],
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _svg_from_spec(spec: dict[str, Any]) -> str:
    palette = list(spec.get("palette") or PALETTES["威猛"])
    while len(palette) < 4:
        palette.append("#ffffff")
    title = html.escape(str(spec.get("title", "AI 创作脸谱")))
    motifs = [html.escape(str(item)) for item in spec.get("motifs", [])[:4]]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 900" role="img" aria-label="{title}">
  <rect width="720" height="900" fill="#08090d"/>
  <ellipse cx="360" cy="450" rx="238" ry="330" fill="{palette[3]}" stroke="{palette[2]}" stroke-width="14"/>
  <path d="M360 126 C282 204 250 292 252 420 C254 578 308 696 360 774 C412 696 466 578 468 420 C470 292 438 204 360 126Z" fill="{palette[0]}" opacity="0.92"/>
  <path d="M360 154 C334 226 320 298 320 386 C320 514 338 638 360 740 C382 638 400 514 400 386 C400 298 386 226 360 154Z" fill="{palette[1]}" opacity="0.92"/>
  <path d="M176 366 C226 274 292 258 332 320 C282 348 238 392 206 456Z" fill="{palette[1]}"/>
  <path d="M544 366 C494 274 428 258 388 320 C438 348 482 392 514 456Z" fill="{palette[1]}"/>
  <path d="M214 464 C266 430 314 438 342 492 C286 520 236 512 196 482Z" fill="{palette[2]}" opacity="0.86"/>
  <path d="M506 464 C454 430 406 438 378 492 C434 520 484 512 524 482Z" fill="{palette[2]}" opacity="0.86"/>
  <circle cx="278" cy="468" r="28" fill="#050505"/>
  <circle cx="442" cy="468" r="28" fill="#050505"/>
  <path d="M360 478 C330 554 324 632 360 698 C396 632 390 554 360 478Z" fill="{palette[2]}" opacity="0.9"/>
  <path d="M230 604 C286 646 324 646 360 610 C396 646 434 646 490 604" fill="none" stroke="{palette[1]}" stroke-width="24" stroke-linecap="round"/>
  <path d="M282 250 C314 200 336 178 360 160 C384 178 406 200 438 250 C400 240 382 248 360 278 C338 248 320 240 282 250Z" fill="{palette[2]}"/>
  <g fill="none" stroke="{palette[2]}" stroke-width="10" stroke-linecap="round" opacity="0.76">
    <path d="M168 560 C230 536 268 552 304 604"/>
    <path d="M552 560 C490 536 452 552 416 604"/>
    <path d="M218 244 C242 184 292 146 342 134"/>
    <path d="M502 244 C478 184 428 146 378 134"/>
  </g>
  <text x="360" y="840" fill="#f8e4a6" font-size="28" font-family="Microsoft YaHei, sans-serif" text-anchor="middle">{title}</text>
  <text x="360" y="872" fill="#9feeff" font-size="17" font-family="Microsoft YaHei, sans-serif" text-anchor="middle">{' · '.join(motifs)}</text>
</svg>"""


def generate_creative_face_design(
    *,
    prompt: str = "",
    current_face_key: str | None = None,
    style: str = "stage-facepaint",
) -> dict[str, Any]:
    clean_prompt = prompt.strip() or "围绕当前脸谱生成一个适合数字展厅展示的 AI 创作脸谱方案"
    local = _local_spec(clean_prompt, current_face_key)
    provider = "local-creative-agent"
    used_deepseek = False

    if deepseek_config()["configured"]:
        try:
            result = _call_deepseek([
                {
                    "role": "system",
                    "content": (
                        "你是川剧脸谱 AI 创作设计 Agent。请输出严格 JSON，不要 Markdown。"
                        "必须声明这是 AI 创作方案，不是传统定谱。字段包括 title, seedFace, seedRole, "
                        "claimLevel, paletteName, palette, motifs, meaning, process。"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "prompt": clean_prompt,
                        "currentFaceKey": current_face_key,
                        "style": style,
                        "localSeed": local,
                    }, ensure_ascii=False),
                },
            ], temperature=0.55, max_tokens=900)
            parsed = _extract_json(result["content"])
            if parsed:
                local.update({key: value for key, value in parsed.items() if value})
                provider = "deepseek-creative-agent"
                used_deepseek = True
        except Exception:
            pass

    svg = _svg_from_spec(local)
    return {
        "provider": provider,
        "usedDeepSeek": used_deepseek,
        "style": style,
        "prompt": clean_prompt,
        "design": local,
        "editableSvg": svg,
        "note": "AI 创作脸谱只作为独立设计方案展示，不会混入原始传统脸谱素材库。",
    }
