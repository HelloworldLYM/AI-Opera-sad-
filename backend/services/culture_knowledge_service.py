from __future__ import annotations

from typing import Any

FACES: list[dict[str, Any]] = [
    {
        "key": "guanyu",
        "title": "关羽",
        "aliases": ["关公", "关云长", "guanyu"],
        "role": "红整脸",
        "colors": ["红"],
        "meanings": ["忠义", "勇武", "守信"],
        "opera": ["华容道", "单刀会"],
        "story": "关羽以忠义著称，华容道义释曹操让他的舞台人格兼具勇武与重情。",
    },
    {
        "key": "zhangfei",
        "title": "张飞",
        "aliases": ["张翼德", "zhangfei"],
        "role": "黑十字门脸",
        "colors": ["黑"],
        "meanings": ["刚烈", "豪爽", "勇猛"],
        "opera": ["古城会"],
        "story": "张飞鲁莽而重义，黑脸和夸张眉眼突出其声势与猛劲。",
    },
    {
        "key": "dianwei",
        "title": "典韦",
        "aliases": ["dianwei"],
        "role": "黄花三块瓦脸",
        "colors": ["黄", "黑"],
        "meanings": ["骁勇", "凶猛", "护主"],
        "opera": ["战宛城"],
        "story": "典韦死守营门，为曹操断后，黄色块面与重黑线强调战场压迫感。",
    },
    {
        "key": "chengyaojin",
        "title": "程咬金",
        "aliases": ["程知节", "chengyaojin"],
        "role": "绿花脸",
        "colors": ["绿"],
        "meanings": ["草莽", "豪放", "猛烈"],
        "opera": ["响马传"],
        "story": "程咬金的绿脸突出瓦岗好汉的江湖气和直来直去的英雄性格。",
    },
    {
        "key": "jiangwei",
        "title": "姜维",
        "aliases": ["jiangwei"],
        "role": "红三块瓦脸",
        "colors": ["红"],
        "meanings": ["忠勇", "谋略", "儒将"],
        "opera": ["铁笼山"],
        "story": "姜维承接诸葛亮遗志，红三块瓦比猛将谱式更收敛，突出智勇兼备。",
    },
    {
        "key": "xiahouyuan",
        "title": "夏侯渊",
        "aliases": ["xiahouyuan"],
        "role": "黑脸净",
        "colors": ["黑"],
        "meanings": ["威猛", "刚烈", "强硬"],
        "opera": ["定军山"],
        "story": "夏侯渊是定军山守将，黑脸净谱式强调武将的沉稳与压迫感。",
    },
    {
        "key": "yuwenchengdu",
        "title": "宇文成都",
        "aliases": ["yuwenchengdu"],
        "role": "黄脸",
        "colors": ["黄", "金"],
        "meanings": ["骁勇", "高傲", "威压"],
        "opera": ["车轮战"],
        "story": "宇文成都作为隋唐猛将，黄脸与锐线表现盛名、勇力和王朝衰势的碰撞。",
    },
    {
        "key": "julingshen",
        "title": "巨灵神",
        "aliases": ["julingshen"],
        "role": "神怪脸",
        "colors": ["金", "银", "黑"],
        "meanings": ["神力", "威严", "先锋"],
        "opera": ["大闹天宫"],
        "story": "巨灵神常作为天庭先锋出场，神怪脸谱用金银黑强对比制造非凡气息。",
    },
    {
        "key": "fahai",
        "title": "法海",
        "aliases": ["fahai"],
        "role": "僧脸 / 神佛谱式",
        "colors": ["白", "金"],
        "meanings": ["法力", "庄严", "执拗"],
        "opera": ["金山寺", "白蛇传"],
        "story": "法海以护法降妖之名介入白蛇传，谱式应保持冷峻、庄严和秩序感。",
    },
    {
        "key": "douerdun",
        "title": "窦尔敦",
        "aliases": ["窦尔墩", "douerdun"],
        "role": "蓝花脸",
        "colors": ["蓝"],
        "meanings": ["刚强", "心计", "绿林"],
        "opera": ["盗御马", "连环套"],
        "story": "窦尔敦盗御马是蓝脸记忆点，蓝色表现刚强和有心计的江湖气。",
    },
    {
        "key": "zhengziming",
        "title": "郑子明",
        "aliases": ["郑恩", "zhengziming"],
        "role": "破脸",
        "colors": ["黑", "绿", "白"],
        "meanings": ["憨直", "冲突", "奇特"],
        "opera": ["斩黄袍"],
        "story": "郑子明常用破脸谱式，左右不完全对称，表现人物命运与性格冲突。",
    },
    {
        "key": "nirong",
        "title": "倪荣",
        "aliases": ["nirong"],
        "role": "绿脸英雄类",
        "colors": ["绿"],
        "meanings": ["刚勇", "侠气", "扶弱"],
        "opera": ["打渔杀家"],
        "story": "倪荣带有江湖英雄扶弱除暴的色彩，绿脸和粗眉眼突出虎劲。",
    },
]


def _haystack(face: dict[str, Any]) -> str:
    values: list[str] = []
    for key in ("key", "title", "role", "story"):
        values.append(str(face.get(key, "")))
    for key in ("aliases", "colors", "meanings", "opera"):
        values.extend(str(item) for item in face.get(key, []))
    return " ".join(values).lower()


def list_faces() -> list[dict[str, Any]]:
    return FACES


def search_faces(query: str, limit: int = 8) -> list[dict[str, Any]]:
    terms = [term.strip().lower() for term in query.replace("，", " ").replace("、", " ").split() if term.strip()]
    if not terms:
        return FACES[:limit]

    scored: list[tuple[int, dict[str, Any]]] = []
    for face in FACES:
        haystack = _haystack(face)
        score = sum(3 if term in face["title"].lower() else 1 for term in terms if term in haystack)
        if score:
            scored.append((score, face))
    scored.sort(key=lambda item: (-item[0], item[1]["title"]))
    return [face for _, face in scored[:limit]]


def answer_query(query: str) -> dict[str, Any]:
    matches = search_faces(query, limit=3)
    if not matches:
        return {
            "answer": "暂未匹配到对应脸谱资料，请尝试输入人物名、颜色、寓意或剧目。",
            "matches": [],
        }

    best = matches[0]
    answer = (
        f"{best['title']}属于{best['role']}，常见颜色为{'、'.join(best['colors'])}。"
        f"这些色彩和纹样主要表达{'、'.join(best['meanings'])}。{best['story']}"
    )
    return {"answer": answer, "matches": matches}
