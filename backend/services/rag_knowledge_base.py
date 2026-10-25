from __future__ import annotations

import re
from typing import Any

from backend.services.culture_knowledge_service import FACES


COLOR_DOCS = [
    ("color-red", "红色脸谱寓意", "红色常表现忠义、英勇、正直，适合关羽、姜维等忠勇人物。"),
    ("color-black", "黑色脸谱寓意", "黑色常表现刚直、威猛、粗豪、公正，舞台上强调力量与压迫感。"),
    ("color-white", "白色脸谱寓意", "白色可表现冷峻、奸诈、威严或超脱，具体含义需要结合人物身份判断。"),
    ("color-blue", "蓝色脸谱寓意", "蓝色多表现刚强、骁勇、有心计，也常用于绿林英雄或江湖人物。"),
    ("color-green", "绿色脸谱寓意", "绿色常表现草莽、猛烈、侠气或不受拘束的英雄气质。"),
    ("color-yellow", "黄色脸谱寓意", "黄色常表现骁勇、凶猛、彪悍，也可以带出战场压迫感。"),
    ("color-gold", "金银脸谱寓意", "金色、银色多用于神怪、神佛、天将等非凡人物，强调神性和威严。"),
]

PROJECT_DOCS = [
    {
        "id": "project-ai-architecture",
        "title": "项目 AI 架构",
        "category": "project",
        "tags": ["AI", "Agent", "RAG", "视觉识别", "三维生成"],
        "text": (
            "AI-Opera 项目由视觉感知、手势理解、个性化三维脸谱面罩生成、RAG 文化认知、"
            "AI 导览 Agent 五部分组成。视觉层识别人脸、手部关键点和姿态；生成层完成多视角筛选、"
            "三维脸型拟合、脸谱 UV 烘焙、细节法线图和 GLB 导出；RAG 与 Agent 负责文化讲解、"
            "体验推荐、系统状态解释和生成路线说明。"
        ),
    },
    {
        "id": "project-cpu-mode",
        "title": "无 GPU 的 CPU 演示模式",
        "category": "project",
        "tags": ["CPU", "GPU", "fallback", "mock", "3DDFA-V3"],
        "text": (
            "个人电脑没有 GPU 时，项目使用 CPU 模式启动。后端设置 DDFA_V3_DEVICE=cpu，"
            "HQ_MASK_FACE_PROVIDER=auto。若 3DDFA-V3 资产完整，则可在 CPU 上慢速重建；"
            "若资产不完整或运行过慢，会降级到前端 OBJ 或 mock 路径，保证体验馆、陈列馆、RAG 导览、"
            "manifest 和三维展示继续可用。"
        ),
    },
    {
        "id": "project-generation-route",
        "title": "个性化三维脸谱面罩生成路线",
        "category": "project",
        "tags": ["三维面罩", "多视角", "UV", "normal map", "GLB", "manifest"],
        "text": (
            "生成路线为多视角短 burst 采集、清晰度和姿态覆盖筛选、3DMM 风格脸型拟合、"
            "脸谱 UV 映射、细节法线图生成、Blender 或 trimesh 导出 GLB。系统会写入 capture_manifest "
            "和 asset_manifest，记录 profile、source、入选帧、姿态覆盖、OBJ、GLB、normal map 地址。"
        ),
    },
    {
        "id": "project-gesture-training",
        "title": "AutoDL 手势训练路线",
        "category": "training",
        "tags": ["AutoDL", "手势识别", "TCN", "LSTM", "1D-CNN", "关键点"],
        "text": (
            "AutoDL 不需要桌面，适合作为离线训练环境。本地前端采集 MediaPipe 人脸、手部关键点序列，"
            "标注挥手、遮脸、转头、点头、举手、静止等类别；上传到 AutoDL 后训练 TCN、LSTM 或 1D-CNN；"
            "训练完成后导出 ONNX、TensorFlow.js 或 PyTorch CPU 权重，再回到本地项目推理。"
        ),
    },
    {
        "id": "project-rag-agent",
        "title": "RAG 与 AI Agent 价值",
        "category": "project",
        "tags": ["RAG", "Agent", "DeepSeek", "知识库", "导览"],
        "text": (
            "RAG 将脸谱角色、颜色、寓意、剧目、故事和项目技术路线拆成可检索片段；AI Agent 在回答前读取"
            "当前脸谱、系统健康状态、生成 profile 和推荐结果，再调用 DeepSeek 或本地 RAG fallback 生成讲解。"
            "这样 AI 不只是聊天，而是能基于项目状态进行讲解、推荐和诊断。"
        ),
    },
]

ONLINE_DOCS = [
    {
        "id": "online-ihchina-sichuan-opera-overview",
        "title": "川剧非遗概况与艺术体系",
        "category": "online-source",
        "tags": ["川剧", "非遗", "五种声腔", "行当", "巴蜀文化", "中国非遗数字博物馆"],
        "source": "中国非物质文化遗产网·中国非物质文化遗产数字博物馆",
        "sourceUrl": "https://www.ihchina.cn/project_details/13161/",
        "text": (
            "中国非物质文化遗产数字博物馆资料显示，川剧流行于四川、重庆及周边部分地区，"
            "以高腔、胡琴、弹戏、昆曲、灯调五种声腔构成重要艺术体系。川剧行当包括小生、旦角、"
            "生角、花脸、丑角，表演生活气息浓郁，兼具虚实相生、遗形写意的戏曲美学。"
            "变脸、藏刀、钻火圈、开慧眼等绝技是川剧塑造人物和制造舞台奇观的重要方式。"
        ),
    },
    {
        "id": "online-ihchina-sichuan-opera-value-risk",
        "title": "川剧的研究价值与传承压力",
        "category": "online-source",
        "tags": ["川剧", "巴蜀文化", "保护", "传承", "非遗价值"],
        "source": "中国非物质文化遗产网·中国非物质文化遗产数字博物馆",
        "sourceUrl": "https://www.ihchina.cn/project_details/13161/",
        "text": (
            "川剧具有巴蜀文化、艺术、历史、民俗等多方面的研究和认知价值，在中国戏曲史与"
            "巴蜀文化发展史上具有独特地位。资料同时指出，地方戏曲面临观众减少、市场萎缩、"
            "经费不足等传承压力，因此数字化展示、教育普及和互动体验可以作为传播与保护的补充路径。"
        ),
    },
    {
        "id": "online-mct-sichuan-opera-digital-protection",
        "title": "川剧保护传承中的数字化与沉浸式展示",
        "category": "online-source",
        "tags": ["文旅部", "数字化", "沉浸式展示", "川剧保护", "博物馆", "新业态"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/qg/202410/t20241017_955759.html",
        "text": (
            "文旅部资料提到，四川在川剧保护传承中推进资料整理修复、数字转化、文献数据库、"
            "名家名剧名段记录、戏曲博物馆和数字展示区建设，也探索将川剧演出融入景区、街区和"
            "沉浸式互动体验空间。本项目的 RAG 导览、三维面罩资产和交互体验可被解释为面向年轻观众的"
            "数字化传播实践。"
        ),
    },
    {
        "id": "online-mct-sichuan-opera-international-reach",
        "title": "川剧绝活的传播与国际认知",
        "category": "online-source",
        "tags": ["文旅部", "变脸", "滚灯", "传播", "海外巡演", "川剧节"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/qg/202410/t20241017_955759.html",
        "text": (
            "文旅部资料显示，四川通过川剧汇演、川剧节、新媒体节目、文创产品和优秀剧目巡演等方式"
            "推广川剧，以变脸、滚灯等为代表的川剧绝活受到多国观众关注。项目展示时可以把 AI 互动"
            "定位为帮助观众先被绝活吸引，再进一步理解川剧整体艺术的入口。"
        ),
    },
    {
        "id": "online-smithsonian-face-changing-performance",
        "title": "Face Changing 的表演机制与情绪表达",
        "category": "online-source",
        "tags": ["Smithsonian", "bian lian", "face changing", "情绪", "面具", "丝线"],
        "source": "Smithsonian National Museum of Asian Art",
        "sourceUrl": "https://asia-archive.si.edu/learn/for-educators/teaching-china-with-the-smithsonian/videos/face-changing/",
        "text": (
            "Smithsonian 教育资料将 bian lian 解释为四川戏曲中的重要表演形式：演员穿着鲜明服装，"
            "在观众难以察觉的速度中多次更换面具。资料提到一种机制是通过与服装相连的丝线牵引面具，"
            "并指出面具颜色和表情可表达恐惧、紧张、放松、狡黠、绝望、愤怒等情绪。"
        ),
    },
    {
        "id": "online-chinaculture-face-changing-techniques",
        "title": "变脸技法：抹脸、吹脸、扯脸",
        "category": "online-source",
        "tags": ["ChinaCulture", "变脸技法", "抹脸", "吹脸", "扯脸", "白蛇传"],
        "source": "ChinaCulture / Shanghai Daily",
        "sourceUrl": "https://en.chinaculture.org/classics/2014-06/19/content_539622_2.htm",
        "text": (
            "ChinaCulture 转载资料介绍了抹脸、吹脸、扯脸等变脸技法：抹脸通过隐藏油彩快速改变面部颜色，"
            "吹脸利用舞台上预置的彩粉附着到油面，扯脸则把多层彩绘丝质面具通过隐蔽线索逐层揭去。"
            "资料还提醒，变脸虽然吸引人，但只是川剧整体艺术中的一部分，不能替代对唱腔、剧目和表演的理解。"
        ),
    },
    {
        "id": "online-chinadaily-bianlian-emotion",
        "title": "变脸用于表现人物情绪突变",
        "category": "online-source",
        "tags": ["China Daily", "变脸", "情绪", "吹脸", "抹脸", "扯脸"],
        "source": "China Daily",
        "sourceUrl": "https://usa.chinadaily.com.cn/weekly/2012-10/05/content_15797023.htm",
        "text": (
            "China Daily 报道把变脸描述为四川戏曲中表现人物情绪突变的技艺。报道概括了吹脸、抹脸、"
            "扯脸三类常见技法，并说明演员通过挥臂、转身、扭手等舞台动作完成瞬间换脸。"
            "这为项目中的手势触发、转头触发和情绪化面罩切换提供了文化解释依据。"
        ),
    },
    {
        "id": "online-cgtn-mask-colors-meaning",
        "title": "变脸面具颜色与意义",
        "category": "online-source",
        "tags": ["CGTN", "颜色", "脸谱", "面具", "寓意"],
        "source": "CGTN",
        "sourceUrl": "https://news.cgtn.com/news/2023-07-28/Why-do-masks-have-different-colors-in-face-changing-performance--1lOnUhLB3IA/index.html",
        "text": (
            "CGTN 的视频页面说明，川剧变脸表演中面具会在演出中切换，不同颜色承载不同含义。"
            "项目知识库因此把颜色、人物性格、剧目语境和用户当前佩戴脸谱关联起来，用于 RAG 问答和导览推荐。"
        ),
    },
    {
        "id": "online-cctv-face-changing-history",
        "title": "川剧变脸的历史线索",
        "category": "online-source",
        "tags": ["CCTV", "变脸", "乾隆", "清代", "历史", "粉末"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108713.shtml",
        "text": (
            "CCTV 英文资料介绍，川剧变脸被称作 bian lian，是四川戏曲的重要看点。资料把早期变脸追溯到"
            "清代乾隆时期，提到早期演员可通过红、黑、金等彩粉或手掌中隐藏的彩膏迅速改变脸部颜色。"
            "这能支持项目中“动作触发 + 面部状态改变”的文化解释。"
        ),
    },
    {
        "id": "online-cctv-face-changing-masks",
        "title": "从油彩到多层面具的变脸方式",
        "category": "online-source",
        "tags": ["CCTV", "变脸", "扯脸", "面具", "丝质面具", "1920s"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108713.shtml",
        "text": (
            "CCTV 资料提到，20 世纪 20 年代以后，川剧艺人开始使用多层面具进行快速切换，"
            "从油纸、猪膀胱等材料发展到现代全脸彩绘丝质面具。项目中的个性化三维脸谱面罩，"
            "可以被解释为把传统多层面具逻辑转译成数字资产和实时渲染逻辑。"
        ),
    },
    {
        "id": "online-cctv-face-changing-emotion-colors",
        "title": "变脸颜色与人物情绪",
        "category": "online-source",
        "tags": ["CCTV", "颜色", "情绪", "红色", "黑色", "人物心境"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108713.shtml",
        "text": (
            "CCTV 资料指出，脸谱类型和颜色变化可以反映人物情绪，例如红色、黑色可用于表现不同强度的情绪。"
            "项目中的情绪触发、手势触发和脸谱切换，可用此解释为数字化模拟戏曲舞台中“情绪外化为脸谱”的表达。"
        ),
    },
    {
        "id": "online-cctv-face-changing-origin-story",
        "title": "变脸叙事：以变换面貌迷惑追捕者",
        "category": "online-source",
        "tags": ["CCTV", "变脸故事", "侠义", "逃脱", "叙事功能"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108713.shtml",
        "text": (
            "CCTV 资料提到，变脸曾被用于一个劫富济贫者被追捕时通过变换脸面迷惑官吏并逃脱的故事。"
            "这说明变脸并不只是炫技，也承担叙事功能：隐藏身份、制造悬念、表达人物处境。"
        ),
    },
    {
        "id": "online-cctv-three-types-powder",
        "title": "吹脸：粉末与油面结合的瞬时变色",
        "category": "online-source",
        "tags": ["CCTV", "吹脸", "粉末", "油彩", "技法"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108701.shtml",
        "text": (
            "CCTV 的 Three Types of Face Changes 资料介绍，吹脸利用舞台上预置彩粉与演员脸部油面结合，"
            "形成瞬时变色效果。数字项目可以把这种“瞬时状态切换”转译为手势识别后触发贴图或面罩切换。"
        ),
    },
    {
        "id": "online-cctv-three-types-smearing",
        "title": "抹脸：手掌隐藏颜料完成变脸",
        "category": "online-source",
        "tags": ["CCTV", "抹脸", "手部动作", "颜料", "技法"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108701.shtml",
        "text": (
            "抹脸技法通过在手掌或特定部位隐藏颜料，借助手部动作快速改变脸部色彩。"
            "本项目的手势识别与遮脸触发，很适合用抹脸技法作为文化解释：用户动作不是普通按钮，而是对传统表演动作的交互化。"
        ),
    },
    {
        "id": "online-cctv-three-types-pulling",
        "title": "扯脸：多层脸谱逐层揭去",
        "category": "online-source",
        "tags": ["CCTV", "扯脸", "多层面具", "丝线", "动作掩护"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/operamaster/20090625/108701.shtml",
        "text": (
            "扯脸通常把多层脸谱预先叠戴，通过服装、动作和隐蔽牵引逐层揭去。"
            "项目中的陈列馆、多脸谱切换、三维面罩资产可以与“多层脸谱”概念对应，表现传统技法的数字化映射。"
        ),
    },
    {
        "id": "online-cctv-chinese-learning-bianlian",
        "title": "变脸用于表现性格与情感",
        "category": "online-source",
        "tags": ["CCTV", "变脸", "性格", "情感", "艺术特技"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/english/special/chinese/20090727/109067.shtml",
        "text": (
            "CCTV 中文学习资料将变脸解释为川剧中的艺术特技，用来表现人物性格和情感。"
            "这为项目的 AI 导览提供了清晰表述：AI 不是只换一张图，而是在帮助用户理解脸谱如何表达人物性格和情绪。"
        ),
    },
    {
        "id": "online-cctv-stage-spectacle",
        "title": "变脸作为舞台奇观和观众入口",
        "category": "online-source",
        "tags": ["CCTV", "舞台奇观", "观众吸引", "绝活", "脸谱"],
        "source": "CCTV.com",
        "sourceUrl": "https://www.cctv.com/performance/special/C15666/01/20060503/101224.shtml",
        "text": (
            "CCTV 综艺资料把变脸称为川剧表演绝活和舞台奇观，观众会被头一扭、手一挥后连续变化的脸谱吸引。"
            "项目可以把实时视觉识别和三维面罩展示设计成“先吸引，再讲解”的体验入口。"
        ),
    },
    {
        "id": "online-sc-gov-heritage-modern-life",
        "title": "非遗融入现代生活与年轻传播",
        "category": "online-source",
        "tags": ["四川省政府", "非遗+", "年轻人", "数字技术", "文旅"],
        "source": "四川省人民政府网站 / 四川日报",
        "sourceUrl": "https://www.sc.gov.cn/10462/10464/10797/2025/5/30/847c260ebb374867aa9b9da918ac91da.shtml",
        "text": (
            "四川省政府网站转发四川日报报道指出，“非遗+科技”“非遗+文旅”和非遗 IP 授权等探索，"
            "正在让非遗进入更多现代生活场景，也吸引年轻群体。本项目的 AI 导览、三维脸谱和交互体验，"
            "可被定位为非遗融入现代数字体验的一种实践。"
        ),
    },
    {
        "id": "online-cctv-digital-mapping-facepaint",
        "title": "数字绘图与立体投影赋能川剧脸谱",
        "category": "online-source",
        "tags": ["央视网", "非遗里的中国", "数字绘图", "mapping", "川剧脸谱"],
        "source": "央视网",
        "sourceUrl": "https://news.cctv.com/2024/10/19/ARTIiRD39MppVWTU0f1eb0ik241019.shtml",
        "text": (
            "央视网《非遗里的中国》相关报道提到，数字绘图与 mapping 立体投影技术让川剧脸谱呈现更绚丽的光彩，"
            "也让年轻观众通过科技窗口领略川剧艺术。项目中的三维面罩、法线材质和 AI 讲解，可与这种数字化表达方向对应。"
        ),
    },
    {
        "id": "online-mct-archive-exhibition",
        "title": "珍稀川剧档案文献的整理与活化",
        "category": "online-source",
        "tags": ["文旅部", "四川省艺术研究院", "川剧档案", "文献展", "数字服务平台"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/preview/special/kygz/9550/202501/t20250127_958174.htm",
        "text": (
            "文旅部资料介绍，四川省艺术研究院长期收集整理川剧木刻本、石印本、手抄剧本、黑胶唱片等档案文献，"
            "并推进川剧文献数字服务平台和川剧数字博物馆建设。本项目的 RAG 知识库可以视作小型、面向互动展示的知识组织尝试。"
        ),
    },
    {
        "id": "online-mct-digital-museum-case",
        "title": "川剧数字博物馆与沉浸式体验案例",
        "category": "online-source",
        "tags": ["文旅部", "数字博物馆", "VR", "沉浸式体验", "川剧艺术传播"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/preview/special/kygz/9550/202401/t20240115_950828.htm",
        "text": (
            "文旅部资料介绍，线上川剧艺术传播数字博物馆通过数字媒体技术和 VR 全景技术，将实物展品数字化，"
            "为移动和电脑终端提供戏曲资源与沉浸式体验。项目的本地网页体验馆与 AI 导览，可作为更轻量的互动展示原型。"
        ),
    },
    {
        "id": "online-mct-digital-standard-traditional-theatre",
        "title": "非遗数字化保护中的传统戏剧采集要素",
        "category": "online-source",
        "tags": ["文旅部", "行业标准", "非遗数字化保护", "传统戏剧", "采集要素"],
        "source": "中华人民共和国文化和旅游部 / 行业标准 PDF",
        "sourceUrl": "https://zwgk.mct.gov.cn/zfxxgkml/hybz/202308/W020230804371068594733.pdf",
        "text": (
            "文旅部行业标准资料涉及非物质文化遗产数字化保护，传统戏剧类项目的采集要素可包括项目基本信息、"
            "代表剧目、音乐、表演、舞台美术、传承等。项目 RAG 资料可以据此继续扩展为角色、剧目、唱腔、表演和舞美多维结构。"
        ),
    },
    {
        "id": "online-sc-budget-digital-scan",
        "title": "川剧文献数字化扫描与科研支持",
        "category": "online-source",
        "tags": ["四川文旅厅", "预算", "川剧文献", "数字化扫描", "科研"],
        "source": "四川省文化和旅游厅",
        "sourceUrl": "https://wlt.sc.gov.cn/scwlt/cwhtj2/2025/3/3/e730e9e1faff4b098c8eaba151da7021/files/%E5%9B%9B%E5%B7%9D%E7%9C%81%E6%96%87%E5%8C%96%E5%92%8C%E6%97%85%E6%B8%B8%E5%8E%852025%E5%B9%B4%E9%83%A8%E9%97%A8%E9%A2%84%E7%AE%97%E5%85%AC%E5%BC%80%E8%AF%B4%E6%98%8E.pdf",
        "text": (
            "四川省文化和旅游厅预算公开资料中出现川剧文献及科研图书数字化扫描、国家级非遗代表性传承人补助等事项。"
            "这说明川剧数字资源建设和传承支持具有现实政策语境，项目可强调自己是面向展示与教育的轻量化补充。"
        ),
    },
    {
        "id": "online-google-mediapipe-face-mesh",
        "title": "MediaPipe Face Mesh 与 468 个实时人脸关键点",
        "category": "technical-source",
        "tags": ["Google", "MediaPipe", "Face Mesh", "468 landmarks", "实时人脸追踪"],
        "source": "Google AI Edge / MediaPipe Wiki",
        "sourceUrl": "https://github.com/google-ai-edge/mediapipe/wiki/MediaPipe-Face-Mesh",
        "text": (
            "MediaPipe Face Mesh 是可实时估计人脸几何的方案，文档说明其能估计 468 个 3D 人脸关键点，"
            "并可在移动设备等场景实时运行。本项目使用 Face Mesh 作为 AI 视觉感知层，驱动脸谱贴合、姿态估计和交互触发。"
        ),
    },
    {
        "id": "online-arxiv-mediapipe-hands",
        "title": "MediaPipe Hands 与端侧实时手部追踪",
        "category": "technical-source",
        "tags": ["MediaPipe Hands", "hand tracking", "手势识别", "端侧实时", "arXiv"],
        "source": "arXiv 2006.10214",
        "sourceUrl": "https://arxiv.org/abs/2006.10214",
        "text": (
            "MediaPipe Hands 论文聚焦端侧实时手部追踪，适合在浏览器和移动端交互中提供手部关键点。"
            "项目使用手部关键点序列识别挥手、遮脸、举手等动作，并将采集数据导出用于 AutoDL 上训练时序模型。"
        ),
    },
    {
        "id": "online-arxiv-rag-foundation",
        "title": "RAG：参数记忆与外部知识检索结合",
        "category": "technical-source",
        "tags": ["RAG", "Retrieval-Augmented Generation", "Lewis 2020", "外部知识", "来源可追溯"],
        "source": "arXiv 2005.11401 / NeurIPS 2020",
        "sourceUrl": "https://arxiv.org/abs/2005.11401",
        "text": (
            "Lewis 等提出的 Retrieval-Augmented Generation 将预训练模型的参数记忆与外部非参数知识库结合，"
            "用于知识密集型任务，并强调检索知识、更新知识和提供依据的重要性。本项目采用 RAG，让 DeepSeek 回答前先检索川剧与项目资料。"
        ),
    },
    {
        "id": "online-google-react-agent",
        "title": "ReAct：推理与行动结合的 Agent 范式",
        "category": "technical-source",
        "tags": ["ReAct", "Agent", "reasoning", "acting", "tool use", "Google Research"],
        "source": "Google Research / arXiv 2210.03629",
        "sourceUrl": "https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/",
        "text": (
            "ReAct 范式让语言模型交替进行推理和动作，通过工具或外部环境获得观察结果，提升知识问答、事实验证和决策任务的可解释性。"
            "本项目的 AI 导览 Agent 采用类似思想：读取 RAG 片段、当前脸谱、系统健康状态和推荐工具结果后再生成回答。"
        ),
    },
    {
        "id": "online-arxiv-tcn-sequence",
        "title": "TCN 适合关键点时序建模",
        "category": "technical-source",
        "tags": ["TCN", "Temporal Convolutional Network", "sequence modeling", "手势训练", "AutoDL"],
        "source": "arXiv 1803.01271 / OpenReview",
        "sourceUrl": "https://openreview.net/forum?id=rk8wKk-R-",
        "text": (
            "Bai、Kolter、Koltun 的时序建模研究表明，简单卷积时序网络在多类序列任务上可作为强基线，"
            "并具备较长有效记忆。本项目的 AutoDL 手势训练脚本使用轻量 TCN 处理 MediaPipe 关键点序列。"
        ),
    },
    {
        "id": "online-arxiv-3ddfa-large-pose",
        "title": "3DDFA：大姿态人脸三维稠密对齐",
        "category": "technical-source",
        "tags": ["3DDFA", "3D Dense Face Alignment", "3DMM", "人脸重建", "姿态"],
        "source": "arXiv 1511.07212 / CVPR 2016",
        "sourceUrl": "https://arxiv.org/abs/1511.07212",
        "text": (
            "3D Dense Face Alignment 通过将稠密 3D 人脸模型拟合到图像，解决大姿态下的人脸对齐问题。"
            "本项目将 3DDFA 系列定位为三维脸型拟合 provider，用于生成个性化三维脸谱面罩，而不是身份级高保真人脸重建。"
        ),
    },
    {
        "id": "online-github-3ddfa-v3",
        "title": "3DDFA-V3 与几何引导的人脸重建",
        "category": "technical-source",
        "tags": ["3DDFA-V3", "CVPR2024", "face reconstruction", "几何引导", "极端表情"],
        "source": "3DDFA-V3 official GitHub",
        "sourceUrl": "https://github.com/wang-zidu/3DDFA-V3",
        "text": (
            "3DDFA-V3 官方实现说明其使用面部分割几何引导提升重建特征与图像的对齐，并改善极端表情捕捉。"
            "项目可以把它作为可替换 provider，并在无 GPU 或资产不完整时通过 auto 策略降级到前端 OBJ 或 mock。"
        ),
    },
    {
        "id": "online-arxiv-deca-detail",
        "title": "DECA：可动画的细节人脸模型路线",
        "category": "technical-source",
        "tags": ["DECA", "3D face", "detail", "normal map", "future provider"],
        "source": "arXiv 2012.04012",
        "sourceUrl": "https://arxiv.org/abs/2012.04012",
        "text": (
            "DECA 研究从野外图像中恢复人脸形状、表情、反照率、姿态、光照和细节位移图，强调可动画的个体细节。"
            "本项目当前不宣称 DECA 级别高保真人脸重建，但把 DECA/EMOCA 类路线列为未来增强方向。"
        ),
    },
    {
        "id": "online-one-euro-filter",
        "title": "One Euro Filter 用于低延迟平滑",
        "category": "technical-source",
        "tags": ["One Euro Filter", "temporal smoothing", "低延迟", "姿态追踪", "交互"],
        "source": "1€ Filter / CHI 2012",
        "sourceUrl": "https://gery.casiez.net/1euro/",
        "text": (
            "One Euro Filter 面向交互系统中的实时信号平滑，目标是在低抖动和低延迟之间取得平衡。"
            "本项目的人脸姿态、面罩贴合和手势关键点可使用类似滤波思路，减少面具抖动并保持交互响应。"
        ),
    },
    {
        "id": "online-chinadaily-technique-actions",
        "title": "挥臂、转身、扭手与变脸动作掩护",
        "category": "online-source",
        "tags": ["China Daily", "动作", "挥臂", "转身", "扭手", "变脸"],
        "source": "China Daily",
        "sourceUrl": "https://usa.chinadaily.com.cn/weekly/2012-10/05/content_15797023.htm",
        "text": (
            "China Daily 报道提到，演员可通过挥臂、转身、扭手等舞台动作完成瞬间换脸。"
            "这为项目中的挥手、转头、遮脸等自然交互提供文化依据：用户动作被 AI 感知后触发脸谱切换。"
        ),
    },
    {
        "id": "online-smithsonian-emotion-list",
        "title": "面具表情与恐惧、紧张、放松等心理状态",
        "category": "online-source",
        "tags": ["Smithsonian", "面具表情", "恐惧", "紧张", "愤怒", "情绪"],
        "source": "Smithsonian National Museum of Asian Art",
        "sourceUrl": "https://asia-archive.si.edu/learn/for-educators/teaching-china-with-the-smithsonian/videos/face-changing/",
        "text": (
            "Smithsonian 教育资料提到，变脸面具的颜色和表情可表现恐惧、紧张、放松、狡黠、绝望、愤怒等状态。"
            "项目可以把情绪触发、角色讲解和面罩切换解释为“情绪状态可视化”的数字体验。"
        ),
    },
    {
        "id": "online-chinaculture-bianlian-not-whole-opera",
        "title": "变脸不是川剧的全部",
        "category": "online-source",
        "tags": ["ChinaCulture", "川剧整体艺术", "唱腔", "剧目", "误区"],
        "source": "ChinaCulture / Shanghai Daily",
        "sourceUrl": "https://en.chinaculture.org/classics/2014-06/19/content_539622_2.htm",
        "text": (
            "ChinaCulture 资料提醒，变脸非常吸引观众，但并不是川剧艺术的全部。"
            "因此项目的 AI 导览不应只展示换脸特效，还应通过 RAG 解释剧目、角色、色彩、表演和非遗保护语境。"
        ),
    },
    {
        "id": "online-mct-new-media-promotion",
        "title": "川剧的新媒体传播与节展推广",
        "category": "online-source",
        "tags": ["文旅部", "新媒体", "川剧节", "巡演", "传播"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/qg/202410/t20241017_955759.html",
        "text": (
            "文旅部资料提到通过川剧汇演、川剧节、新媒体节目、文创产品和优秀剧目巡演推广川剧。"
            "项目可被包装为“面向新媒体和互动展陈的 AI 川剧体验原型”，帮助用户从短时互动进入文化理解。"
        ),
    },
    {
        "id": "online-mct-digital-recording-famous-works",
        "title": "名家名剧名段记录与 RAG 素材方向",
        "category": "online-source",
        "tags": ["文旅部", "名家名剧名段", "记录", "数据库", "RAG 素材"],
        "source": "中华人民共和国文化和旅游部",
        "sourceUrl": "https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/qg/202410/t20241017_955759.html",
        "text": (
            "文旅部资料提到名家名剧名段记录、资料整理修复和文献数据库建设。"
            "项目后续可继续把经典剧目、唱段、表演身段和代表性传承人资料结构化，扩展 RAG 知识深度。"
        ),
    },
    {
        "id": "online-ihchina-performance-aesthetics",
        "title": "川剧表演的虚实相生与遗形写意",
        "category": "online-source",
        "tags": ["中国非遗数字博物馆", "虚实相生", "遗形写意", "戏曲美学", "表演"],
        "source": "中国非物质文化遗产网·中国非物质文化遗产数字博物馆",
        "sourceUrl": "https://www.ihchina.cn/project_details/13161/",
        "text": (
            "中国非遗数字博物馆资料提到，川剧表演具有虚实相生、遗形写意等戏曲美学特征。"
            "项目中的三维面罩并不追求完全复制现实人脸，而是把个人脸型与脸谱符号结合，符合戏曲写意表达的数字化方向。"
        ),
    },
    {
        "id": "online-ihchina-stage-stunts",
        "title": "川剧绝技不止变脸",
        "category": "online-source",
        "tags": ["中国非遗数字博物馆", "藏刀", "钻火圈", "开慧眼", "绝技"],
        "source": "中国非物质文化遗产网·中国非物质文化遗产数字博物馆",
        "sourceUrl": "https://www.ihchina.cn/project_details/13161/",
        "text": (
            "中国非遗数字博物馆资料列举了川剧变脸、藏刀、钻火圈、开慧眼等绝技。"
            "项目当前聚焦变脸和脸谱，后续可扩展喷火、扇子、身段动作、舞台灯光等互动特效，让体验更接近川剧综合舞台。"
        ),
    },
    {
        "id": "online-sc-gov-tech-tourism-ip",
        "title": "非遗 IP、科技和文旅融合",
        "category": "online-source",
        "tags": ["四川省政府", "非遗IP", "科技", "文旅融合", "消费场景"],
        "source": "四川省人民政府网站 / 四川日报",
        "sourceUrl": "https://www.sc.gov.cn/10462/10464/10797/2025/5/30/847c260ebb374867aa9b9da918ac91da.shtml",
        "text": (
            "四川省政府网站报道强调，非遗 IP 授权、科技赋能和文旅融合能创造新的消费与体验场景。"
            "本项目可以作为川剧脸谱 IP 的互动展示与教育原型，适合展馆、课程、活动和短视频传播。"
        ),
    },
    {
        "id": "online-mct-performance-digitalization-industry",
        "title": "演艺产业数字化的场景意义",
        "category": "online-source",
        "tags": ["文旅部", "演艺产业", "数字化", "云演播", "新业态"],
        "source": "中华人民共和国文化和旅游部 PDF",
        "sourceUrl": "https://www.mct.gov.cn/preview/special/kygz/9551/202104/W020210422332706553919.pdf",
        "text": (
            "文旅部相关材料讨论演艺产业数字化，涉及云演播、云展演、演艺资源数字化和新业务新模式。"
            "项目虽然是课程/展示原型，但方向上契合演艺资源数字化、互动化和可复用资产化。"
        ),
    },
    {
        "id": "online-mct-digital-standard-metadata",
        "title": "RAG 知识库应保存来源和元数据",
        "category": "online-source",
        "tags": ["数字化保护", "元数据", "来源", "可追溯", "RAG"],
        "source": "中华人民共和国文化和旅游部 / 行业标准 PDF",
        "sourceUrl": "https://zwgk.mct.gov.cn/zfxxgkml/hybz/202308/W020230804371068594733.pdf",
        "text": (
            "非遗数字化保护的标准化思路强调采集、整理和描述。项目 RAG 文档保留 source、sourceUrl、category、tags 等元数据，"
            "能让 AI 回答更可追溯，也方便后续从摘要片段升级到向量数据库。"
        ),
    },
    {
        "id": "online-arxiv-rag-provenance",
        "title": "RAG 对事实性和来源依据的意义",
        "category": "technical-source",
        "tags": ["RAG", "事实性", "provenance", "知识更新", "幻觉降低"],
        "source": "arXiv 2005.11401 / NeurIPS 2020",
        "sourceUrl": "https://arxiv.org/abs/2005.11401",
        "text": (
            "RAG 论文指出，纯参数模型访问和更新知识有限，外部知识检索有助于知识密集任务、世界知识更新和来源依据。"
            "项目中 AI 导览必须先检索川剧资料和项目状态，再调用 DeepSeek 生成回答，以减少幻觉。"
        ),
    },
    {
        "id": "online-react-agent-trust",
        "title": "Agent 工具调用提升可解释性",
        "category": "technical-source",
        "tags": ["ReAct", "Agent", "可解释性", "工具调用", "状态诊断"],
        "source": "arXiv 2210.03629",
        "sourceUrl": "https://arxiv.org/abs/2210.03629",
        "text": (
            "ReAct 论文表明，推理与行动结合可以让模型与知识库或环境交互，并生成更可解释的任务轨迹。"
            "项目中的 Agent 工具包括 RAG 检索、系统健康、生成 profile、脸谱推荐和 CPU/GPU 状态解释。"
        ),
    },
    {
        "id": "online-mediapipe-hands-dataset-need",
        "title": "从规则手势到训练式时序识别",
        "category": "technical-source",
        "tags": ["MediaPipe Hands", "关键点", "训练数据", "手势识别", "TCN"],
        "source": "arXiv 2006.10214 + 项目实现",
        "sourceUrl": "https://arxiv.org/abs/2006.10214",
        "text": (
            "MediaPipe Hands 提供手部关键点，但具体手势类别仍需要项目语境下的时序识别。"
            "因此项目加入浏览器数据采集器，把关键点序列标注为挥手、遮脸、转头、点头、举手、静止，再上传 AutoDL 训练。"
        ),
    },
]


def _face_docs() -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for face in FACES:
        text = (
            f"{face['title']}属于{face['role']}。颜色：{'、'.join(face.get('colors', []))}。"
            f"寓意：{'、'.join(face.get('meanings', []))}。"
            f"相关剧目：{'、'.join(face.get('opera', []))}。{face.get('story', '')}"
        )
        docs.append(
            {
                "id": f"face-{face['key']}",
                "title": f"{face['title']}脸谱知识",
                "category": "face",
                "faceKey": face["key"],
                "tags": [face["title"], *face.get("aliases", []), *face.get("colors", []), *face.get("meanings", []), *face.get("opera", [])],
                "text": text,
            }
        )
    return docs


def _color_docs() -> list[dict[str, Any]]:
    return [
        {
            "id": doc_id,
            "title": title,
            "category": "color",
            "tags": [title.replace("脸谱寓意", ""), "颜色", "寓意"],
            "text": text,
        }
        for doc_id, title, text in COLOR_DOCS
    ]


def build_documents() -> list[dict[str, Any]]:
    return [*_face_docs(), *_color_docs(), *EMOTION_FACE_MAPPING_DOCS, *PROJECT_DOCS, *ONLINE_DOCS]


def _tokens(text: str) -> list[str]:
    lowered = text.lower()
    latin = re.findall(r"[a-z0-9_\-]+", lowered)
    cjk = re.findall(r"[\u4e00-\u9fff]", lowered)
    words = re.findall(r"[\u4e00-\u9fff]{2,}", lowered)
    return latin + cjk + words


def search_documents(query: str, limit: int = 8, current_face_key: str | None = None) -> list[dict[str, Any]]:
    query_text = (query or "").strip()
    documents = build_documents()
    if current_face_key:
        query_text = f"{query_text} {current_face_key}"
    if not query_text:
        return documents[:limit]

    query_terms = _tokens(query_text)
    scored: list[tuple[float, dict[str, Any]]] = []
    for doc in documents:
        haystack = f"{doc['title']} {' '.join(map(str, doc.get('tags', [])))} {doc['text']}".lower()
        score = 0.0
        for term in query_terms:
            if not term:
                continue
            if term in str(doc.get("title", "")).lower():
                score += 4.0
            if term in " ".join(map(str, doc.get("tags", []))).lower():
                score += 2.5
            if term in haystack:
                score += 1.0
        if current_face_key and doc.get("faceKey") == current_face_key:
            score += 3.0
        if score > 0:
            compact = {
                "id": doc["id"],
                "title": doc["title"],
                "category": doc["category"],
                "faceKey": doc.get("faceKey"),
                "tags": doc.get("tags", [])[:8],
                "text": doc["text"],
                "source": doc.get("source"),
                "sourceUrl": doc.get("sourceUrl"),
                "score": round(score, 3),
            }
            scored.append((score, compact))

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    return [doc for _, doc in scored[: max(1, min(limit, 20))]]


# These records are retrieved by the existing RAG index. They are curatorial,
# stage-oriented mappings, not medical or psychological diagnoses.
EMOTION_FACE_MAPPING_DOCS = [
    {
        "id": "emotion-map-neutral-guanyu",
        "title": "平静情绪匹配关羽",
        "category": "emotion-face-mapping",
        "emotionKeys": ["neutral", "calm", "平静", "中性"],
        "mappedFaceKey": "guanyu",
        "mappedTextureFile": "关羽.png",
        "mappingPriority": 100,
        "tags": ["平静", "中性", "关羽", "红脸", "忠勇", "沉稳", "情绪脸谱映射"],
        "source": "CCTV 戏曲频道",
        "sourceUrl": "https://www.cctv.com/opera/20040707/101097.shtml",
        "text": (
            "当视觉模型输出 neutral 或 calm 时，体验映射到关羽。关羽的红整脸、丹凤眼和卧蚕眉强调忠勇、"
            "端正与稳定气度，适合作为情绪切换的平静基准脸谱。此映射是数字舞台叙事，不等同于心理诊断。"
        ),
    },
    {
        "id": "emotion-map-angry-zhangfei",
        "title": "愤怒情绪匹配张飞",
        "category": "emotion-face-mapping",
        "emotionKeys": ["angry", "anger", "愤怒", "生气"],
        "mappedFaceKey": "zhangfei",
        "mappedTextureFile": "张飞.png",
        "mappingPriority": 120,
        "tags": ["愤怒", "生气", "张飞", "黑脸", "刚烈", "勇猛", "情绪脸谱映射"],
        "source": "CCTV 戏曲频道",
        "sourceUrl": "https://www.cctv.com/opera/20040707/101097.shtml",
        "text": (
            "当视觉模型输出 angry 时，体验映射到张飞。张飞勾黑色脸、环眉环眼，舞台形象刚烈、勇猛、"
            "声势外放，与高唤醒度的愤怒表情最接近，因此作为首选脸谱。"
        ),
    },
    {
        "id": "emotion-map-happy-chengyaojin",
        "title": "喜悦情绪匹配程咬金",
        "category": "emotion-face-mapping",
        "emotionKeys": ["happy", "joy", "喜悦", "开心"],
        "mappedFaceKey": "chengyaojin",
        "mappedTextureFile": "程咬金.png",
        "mappingPriority": 100,
        "tags": ["喜悦", "开心", "程咬金", "绿脸", "豪放", "诙谐", "情绪脸谱映射"],
        "source": "北京市人民政府门户网站",
        "sourceUrl": "https://www.beijing.gov.cn/renwen/lsfm/jycc/201904/t20190402_1869829.html",
        "text": (
            "当视觉模型输出 happy 或 joy 时，体验映射到程咬金。程咬金的草莽豪杰形象豪爽、直来直去，"
            "并带有喜剧式憨直，适合承接开朗、外放的喜悦状态。"
        ),
    },
    {
        "id": "emotion-map-sad-fahai",
        "title": "悲伤情绪匹配法海",
        "category": "emotion-face-mapping",
        "emotionKeys": ["sad", "sadness", "悲伤", "低落"],
        "mappedFaceKey": "fahai",
        "mappedTextureFile": "法海.png",
        "mappingPriority": 90,
        "tags": ["悲伤", "低落", "法海", "冷峻", "克制", "情绪脸谱映射"],
        "source": "AI-Opera 脸谱角色知识库",
        "sourceUrl": None,
        "text": (
            "当视觉模型输出 sad 时，体验映射到法海。知识库中的法海谱式冷峻、克制、秩序感强，"
            "用于表现低唤醒度的沉郁状态。该关系是策展式近似匹配，而非传统戏曲中的固定情绪公式。"
        ),
    },
    {
        "id": "emotion-map-surprised-julingshen",
        "title": "惊讶情绪匹配巨灵神",
        "category": "emotion-face-mapping",
        "emotionKeys": ["surprised", "surprise", "惊讶", "震惊"],
        "mappedFaceKey": "julingshen",
        "mappedTextureFile": "巨灵神.png",
        "mappingPriority": 100,
        "tags": ["惊讶", "震惊", "巨灵神", "神怪脸", "夸张", "情绪脸谱映射"],
        "source": "AI-Opera 脸谱角色知识库",
        "sourceUrl": None,
        "text": (
            "当视觉模型输出 surprised 时，体验映射到巨灵神。金、银、黑强对比和放大的神怪纹样具有"
            "强烈突发感与舞台张力，适合把惊讶表情转译为夸张的神将脸谱。"
        ),
    },
    {
        "id": "emotion-map-disgust-dianwei",
        "title": "厌恶情绪匹配典韦",
        "category": "emotion-face-mapping",
        "emotionKeys": ["disgusted", "disgust", "厌恶", "嫌恶"],
        "mappedFaceKey": "dianwei",
        "mappedTextureFile": "典韦.png",
        "mappingPriority": 90,
        "tags": ["厌恶", "嫌恶", "典韦", "黄脸", "凶猛", "压迫感", "情绪脸谱映射"],
        "source": "北京市人民政府门户网站",
        "sourceUrl": "https://www.beijing.gov.cn/renwen/lsfm/jycc/201904/t20190402_1869829.html",
        "text": (
            "当视觉模型输出 disgusted 时，体验映射到典韦。黄色脸谱常表现骁勇、桀骜或凶猛，"
            "典韦的厚重黑线和战场压迫感可承接厌恶表情中的排斥与紧张。"
        ),
    },
    {
        "id": "emotion-map-fear-douerdun",
        "title": "恐惧情绪匹配窦尔敦",
        "category": "emotion-face-mapping",
        "emotionKeys": ["fearful", "fear", "恐惧", "紧张"],
        "mappedFaceKey": "douerdun",
        "mappedTextureFile": "窦尔敦.png",
        "mappingPriority": 80,
        "tags": ["恐惧", "紧张", "窦尔敦", "蓝脸", "刚强", "警觉", "情绪脸谱映射"],
        "source": "Smithsonian National Museum of Asian Art",
        "sourceUrl": "https://asia-archive.si.edu/learn/for-educators/teaching-china-with-the-smithsonian/videos/face-changing/",
        "text": (
            "当视觉模型输出 fearful 时，体验映射到窦尔敦。Smithsonian 资料说明变脸面具可表现恐惧与紧张；"
            "项目再结合窦尔敦蓝脸所代表的刚强、有心计与警觉，将恐惧转译为戒备状态。"
        ),
    },
]

_EMOTION_ALIASES = {
    "neutral": "neutral", "calm": "neutral", "平静": "neutral", "中性": "neutral",
    "happy": "happy", "joy": "happy", "喜悦": "happy", "开心": "happy",
    "angry": "angry", "anger": "angry", "愤怒": "angry", "生气": "angry",
    "sad": "sad", "sadness": "sad", "悲伤": "sad", "低落": "sad",
    "surprised": "surprised", "surprise": "surprised", "惊讶": "surprised", "震惊": "surprised",
    "disgusted": "disgusted", "disgust": "disgusted", "厌恶": "disgusted", "嫌恶": "disgusted",
    "fearful": "fearful", "fear": "fearful", "恐惧": "fearful", "紧张": "fearful",
}


def resolve_emotion_face_mapping(emotion: str) -> dict[str, Any]:
    normalized = str(emotion or "").strip().lower()
    canonical = _EMOTION_ALIASES.get(normalized)
    if canonical is None:
        raise KeyError(f"Unsupported emotion: {emotion}")

    query = f"情绪脸谱映射 {canonical} {normalized}"
    hits = search_documents(query, limit=20)
    hit_rank = {doc["id"]: index for index, doc in enumerate(hits)}
    candidates = [
        doc
        for doc in EMOTION_FACE_MAPPING_DOCS
        if canonical in [str(item).lower() for item in doc.get("emotionKeys", [])]
        and doc["id"] in hit_rank
    ]
    if not candidates:
        candidates = [
            doc
            for doc in EMOTION_FACE_MAPPING_DOCS
            if canonical in [str(item).lower() for item in doc.get("emotionKeys", [])]
        ]
    if not candidates:
        raise KeyError(f"No RAG mapping for emotion: {canonical}")

    candidates.sort(
        key=lambda doc: (
            hit_rank.get(doc["id"], 999),
            -int(doc.get("mappingPriority", 0)),
            doc["id"],
        )
    )
    selected = candidates[0]
    face_key = str(selected["mappedFaceKey"])
    face = next((item for item in FACES if str(item["key"]) == face_key), None)
    if face is None:
        raise KeyError(f"Mapped face does not exist: {face_key}")

    return {
        "emotion": canonical,
        "face": face,
        "textureFile": selected["mappedTextureFile"],
        "reason": selected["text"],
        "evidence": {
            "documentId": selected["id"],
            "title": selected["title"],
            "source": selected.get("source"),
            "sourceUrl": selected.get("sourceUrl"),
        },
        "policy": "rag-emotion-face-v1",
        "disclaimer": "这是面向数字舞台的文化映射，不构成心理状态或健康诊断。",
    }
