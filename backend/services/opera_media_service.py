from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

from backend.services.culture_knowledge_service import list_faces

PUBLIC_ROOT = Path(__file__).resolve().parents[2] / "public"
FALLBACK_AUDIO_URL = "/legacy/audio/opera-background.mp3"
SICHUAN_OPERA_CENTER_URL = "http://cjfzyjzx.scyishu.org.cn/"

_FACE_OPERA: dict[str, tuple[str, str, str, str]] = {
    "guanyu": ("关羽", "华容道", "关羽 义释曹操", "hua-rong-dao"),
    "zhangfei": ("张飞", "古城会", "张飞 古城会", "gu-cheng-hui"),
    "dianwei": ("典韦", "战宛城", "典韦 战宛城", "zhan-wan-cheng"),
    "chengyaojin": ("程咬金", "响马传", "程咬金 响马传", "xiang-ma-zhuan"),
    "jiangwei": ("姜维", "铁笼山", "姜维 铁笼山", "tie-long-shan"),
    "xiahouyuan": ("夏侯渊", "定军山", "夏侯渊 定军山", "ding-jun-shan"),
    "yuwenchengdu": ("宇文成都", "车轮战", "宇文成都 车轮战", "che-lun-zhan"),
    "julingshen": ("巨灵神", "大闹天宫", "巨灵神 大闹天宫", "da-nao-tian-gong"),
    "fahai": ("法海", "金山寺", "法海 金山寺 白蛇传", "jin-shan-si"),
    "douerdun": ("窦尔敦", "盗御马", "窦尔敦 盗御马", "dao-yu-ma"),
    "zhengziming": ("郑子明", "斩黄袍", "郑子明 斩黄袍", "zhan-huang-pao"),
    "nirong": ("倪荣", "打渔杀家", "倪荣 打渔杀家", "da-yu-sha-jia"),
}


def _platform_candidates(query: str, opera: str) -> list[dict[str, str]]:
    encoded = quote(query)
    encoded_opera = quote(opera)
    return [
        {
            "label": "川剧发展研究中心",
            "type": "sichuan-opera-site",
            "url": SICHUAN_OPERA_CENTER_URL,
            "note": f"打开川剧发展研究中心官网，在站内检索《{opera}》",
        },
        {
            "label": "梨园戏考·剧目资料",
            "type": "opera-archive-site",
            "url": f"https://liyuan.xikao.com/play/{encoded_opera}",
            "note": f"直达《{opera}》剧目资料页，辅助查找剧种、版本与演出资料",
        },
        {
            "label": "哔哩哔哩检索",
            "type": "video-search",
            "url": f"https://search.bilibili.com/all?keyword={encoded}",
            "note": "跳转后选择全本、名家或官方上传版本",
        },
        {
            "label": "优酷检索",
            "type": "video-search",
            "url": f"https://so.youku.com/search_video/q_{encoded}",
            "note": "跳转后选择全本、名家或官方上传版本",
        },
        {
            "label": "全网检索",
            "type": "web-search",
            "url": f"https://www.baidu.com/s?wd={encoded}",
            "note": "补充查找剧目全本、选段和名家版本",
        },
    ]


def _local_audio_exists(url: str) -> bool:
    path = PUBLIC_ROOT.joinpath(*url.lstrip("/").split("/"))
    return path.exists() and path.is_file()


def _face_entry(face_key: str) -> tuple[str, str, str, str] | None:
    if face_key in _FACE_OPERA:
        return _FACE_OPERA[face_key]
    for face in list_faces():
        if face.get("key") == face_key:
            opera = (face.get("opera") or ["经典剧目"])[0]
            title = face.get("title") or face_key
            return (title, opera, f"{title} {opera}", face_key)
    return None


def get_opera_media(face_key: str) -> dict[str, Any]:
    entry = _face_entry(face_key)
    if not entry:
        raise KeyError(face_key)
    face_title, opera, cue, slug = entry
    query = f"戏曲 {opera} {cue} 原版 全剧 经典唱段"
    local_audio_url = f"/legacy/audio/cantos/{slug}.mp3"
    audio_ready = _local_audio_exists(local_audio_url)
    return {
        "faceKey": face_key,
        "faceTitle": face_title,
        "opera": opera,
        "cantoTitle": f"《{opera}》经典唱段",
        "cue": cue,
        "localAudioUrl": local_audio_url,
        "audioUrl": local_audio_url if audio_ready else FALLBACK_AUDIO_URL,
        "fallbackAudioUrl": FALLBACK_AUDIO_URL,
        "audioReady": audio_ready,
        "audioStatus": "ready" if audio_ready else "missing-local-canto",
        "searchQuery": query,
        "videoCandidates": _platform_candidates(query, opera),
        "agentSummary": (
            f"Agent 已为{face_title}匹配剧目《{opera}》，生成唱段路径和原视频入口。"
            if audio_ready
            else f"Agent 已为{face_title}匹配剧目《{opera}》，并提供原视频入口。"
        ),
    }


def list_opera_media() -> dict[str, Any]:
    items = []
    for face in list_faces():
        key = str(face.get("key", ""))
        if key:
            items.append(get_opera_media(key))
    return {
        "count": len(items),
        "fallbackAudioUrl": FALLBACK_AUDIO_URL,
        "items": items,
    }
