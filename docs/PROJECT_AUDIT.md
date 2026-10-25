# AI-Opera 项目文件级剖析与可删除清单

> 审计快照：2026-10-25 13:00–13:30（Asia/Shanghai）
> 仓库状态：git HEAD `27dab87`，工作区干净；`pytest` 36 passed；`tsc --noEmit` 0 error
> 规模：50,058 个文件 / 3,394 MB（审计时）→ **41,864 个文件 / 2,232 MB**（A-1 执行后）
> 说明：审计期间检测到部分文件被重写（mtime 13:07–13:13，内容与 HEAD 一致），以下结论按当前快照给出。
> **§六 是在隔离副本中真实执行删除清单后的对照实验结果**（构建 / 测试 / 浏览器 / 后端接口四项验证）。

---

## 一、主线：一条"从摄像头到文化解释"的体验链路

项目不是"一个网站 + 一堆杂项"，而是**一条主链 + 三条支线**。主链只有 6 站：

```
① 首页选模式            ② 舞台实时变脸            ③ 小谱 AI 导览
index.html + src/App.tsx  stage.html(壳)               public/legacy/xiaopu_floating_agent.js
(React, 轻云/华彩双模式)   └→ public/legacy/swipe_demo_web.html   ↓ /api/ai/agent
                              MediaPipe FaceMesh+Hands           backend/services/ai_agent_service.py
                              + Three.js 脸谱贴合                 ├ rag_knowledge_base.py
                              + 手势/遮脸/吐火/情绪模块            ├ cultural_graph_service.py (GraphRAG+bandit)
                              + 3DGS 视差背景                     └ opera_media_service.py

④ 脸谱收藏馆            ⑤ 个人三维脸谱            ⑥ 展示资产
public/legacy/face_gallery_arc.html   public/personal_model_viewer.html   public/3dgs/backgrounds/*.ksplat
face_knowledge.html / face_painting_play.html   ↑ /api/personal-face/jobs     public/mediapipe/* (自托管 WASM)
唱段 audio/cantos/*.mp3                        backend 3DDFA-V3→UV→GLB 管线   public/legacy/faces/*.png (纹理源)
```

一句话概括主线：
**首页（React 叙事 + 双模式）→ 舞台（iframe 内 MediaPipe 实时关键点 → 动作状态机 → Three.js 脸谱贴合，本地 WASM，不上传画面）→ 小谱 Agent（FastAPI 工具注册表 + 带引用的 RAG + GraphRAG + contextual bandit 推荐，无 Key 时本地降级）→ 收藏馆（角色/颜色/寓意/唱段）→ 个人三维脸谱（多视角采集→质量筛选→3DDFA-V3 拟合→锚点 UV 烘焙→法线图→Blender/trimesh 导出 GLB，全程写 manifest）→ 3DGS 沉浸背景/展厅**。

三条支线（不属于运行主链）：

| 支线 | 目录 | 说明 |
| --- | --- | --- |
| A. 宣传片/答辩视频 | `competition-video/`、`remotion-tech-route/`、`ai-opera-hyperframes/`、根目录 `AI-Opera_voiceover_120s.wav` | 三套并行的视频工程（HyperFrames ×2 + Remotion ×1），共 253 MB + 配音 10 MB |
| B. 训练/离线能力 | `training/gesture`、`training/3dgs`、`training/sam` | 手势 TCN、3DGS 场景、SAM 接入三条 AutoDL 路线，只有文档+脚本，主链不依赖 |
| C. 答辩材料 | `docs/AI-Opera_项目技术细节答辩剖析.md`（825 行/43 节）、`outputs/` PPT、`.codex-checks/` | 文字与幻灯片交付物 |

---

## 二、逐文件剖析

### 2.1 根目录（42 个文件；其中 16 个是 `.codex-*` 残留）

| 文件 | 体积 | 作用 | 判定 |
| --- | --- | --- | --- |
| `index.html` | 5.8 KB | Vite 首页入口，挂 React + 原生鼠标轨迹 canvas | 主线，保留 |
| `stage.html` | 24.7 KB | 舞台壳页：双模式切换、启动动画、`iframe` 载入 swipe_demo_web.html | 主线，保留 |
| `src/main.tsx` | 0.2 KB | React 挂载点 | 主线，保留 |
| `src/App.tsx` | 13.1 KB | 首页全部叙事内容：双模式、玩法卡、模块入口（指向 stage/收藏馆/模型页） | 主线，保留 |
| `src/styles/global.css` | 32.7 KB / 1492 行 | 首页手工样式（**没有用 Tailwind**） | 主线，保留 |
| `src/legacy/immersive-background.js` | 16.0 KB | 3DGS 视差背景源码，被 esbuild 打成 `public/legacy/immersive-background.bundle.js` | 主线源码，保留 |
| `package.json` / `package-lock.json` | 1.5 / 97.9 KB | 前端依赖与脚本（predev 自动重建 bundle） | 保留（依赖需瘦身，见 B7/B8） |
| `vite.config.ts` | 0.7 KB | 双入口（index/stage）+ COOP/COEP 头 + `optimizeDeps.exclude` 仍指向已无 import 的包 | 保留（可删 2 行） |
| `tsconfig.json` / `tsconfig.node.json` | 0.6 / 0.2 KB | TS 配置 | 保留 |
| `postcss.config.js` / `tailwind.config.js` | 80 B / 713 B | Tailwind 管线，但全仓无 `@tailwind`、无 tailwind 类名 → **空转** | 可删（与依赖一起） |
| `Dockerfile` / `.dockerignore` | 382 B / 201 B | 只构建后端 API 镜像 | 保留 |
| `requirements.txt` / `-dev` / `-gpu` | 222 / 103 / 188 B | 核心/测试/GPU 三档依赖 | 保留（`-gpu` 实际被 setup:gpu 用来装全部） |
| `pytest.ini` / `ruff.toml` | 63 B / 315 B | 测试与 lint 配置 | 保留 |
| `.env` | 157 B | **含真实 DeepSeek Key（sk-8fb7…）** | 必须删除并轮换 Key |
| `.env.example` | 425 B | 环境变量模板 | 保留 |
| `.gitignore` / `LICENSE` | 815 B / 1.1 KB | 忽略规则 / MIT | 保留 |
| `README.md` / `DESIGN.md` / `PRODUCT.md` / `RUN_GPU.md` | 9.3 / 2.6 / 1.6 / 2.7 KB | 项目说明 / 视觉规范 / 产品定位 / GPU 运行 | 保留 |
| `AI-Opera_voiceover_120s.wav` + `AI-Opera_voiceover_script.txt` | 10.1 MB / 1.9 KB | 宣传片配音与文稿（由 `scripts/generate-ai-opera-voiceover.ps1` 生成） | 支线 A，可删 |
| `.codex-901.*.js`、`.codex-98.*.js`、`.codex-index.*.js` | 1.86 / 0.14 / 0.65 MB | 工具（Codex）产物快照，非项目代码 | 可删 |
| `.codex-*.log`（9 个）、`.codex-capcut-share-*.json`（4 个） | ~40 KB | 历史启动日志、剪映分享链接探测结果 | 可删 |

### 2.2 `public/legacy/`（33 文件 / 46 MB）—— 真正的"应用本体"

| 文件 | 体积 | 作用 | 判定 |
| --- | --- | --- | --- |
| `swipe_demo_web.html` | 185 KB / 5123+ 行 | **舞台运行时全在这一个文件里**：相机、MediaPipe、Three.js、变脸状态机、收藏、手势采集、吐火、模式适配 | 主线核心，绝不可删 |
| `backend_mask_client.js` | 31.9 KB | 调 `/api/hq-mask/*`、`/api/personal-face/*`，轮询进度 | 主线 |
| `personalized_face_renderer.js` | 44.2 KB | Three.js 个人脸谱网格渲染，读 `det2obj.json` + `face_mesh_topology.json` | 主线 |
| `hand_face_gesture_detector.js` | 31.9 KB | 手+脸关键点动作判定（挥手/遮脸/转头/举手） | 主线 |
| `gesture_sequence_recognizer.js` | 7.3 KB | 动作时序状态机与冷却 | 主线 |
| `gesture_dataset_recorder.js` | 23.1 KB | 手势样本采集面板（`training/gesture` 的输入端，开发入口） | 主线次级功能 |
| `emotion_mask_module.js` | 21.0 KB | 情绪→脸谱路由模块（主线程侧） | 主线次级功能 |
| `emotion_mask_worker.js` | 2.5 KB | Web Worker，跑 FaceLandmarker blendshape | 主线次级功能 |
| `vision_bundle.mjs` | 134.6 KB | `@mediapipe/tasks-vision` 的 vendored 打包 | 上面的依赖，保留 |
| `vision_wasm_internal.{js,wasm}` | 0.2 + 9.6 MB | tasks-vision SIMD wasm | 保留（Worker 加载） |
| `vision_wasm_nosimd_internal.{js,wasm}` | 0.2 + 9.4 MB | 非 SIMD 兜底 wasm | 可删（省 9.6 MB，老浏览器才会用到） |
| `face_landmarker.task` | 3.7 MB | 478 点 + 52 blendshape 模型 | 保留 |
| `performance_monitor.js` | 10.0 KB | 帧率/性能 HUD | 保留 |
| `culture_knowledge_engine.js` + `face_knowledge_data.js` | 2.5 + 20.3 KB | 前端本地知识库（离线解释脸谱） | 保留 |
| `xiaopu_floating_agent.js` | 11.6 KB | 小谱浮窗（stage 与三个 legacy 页都挂） | 主线 |
| `opera_media_catalog.js` | 3.5 KB | 唱段目录与链接构造（收藏馆用） | 保留 |
| `face_gallery_arc.html` | 32.3 KB | 脸谱收藏馆（`/digital_exhibition_viewer.html` 重定向到这里） | 主线 |
| `face_knowledge.html` | 19.4 KB | 角色知识页 | 主线次级 |
| `face_painting_play.html` | 28.4 KB | 脸谱填色互动页（仅从知识页可达） | 主线次级 |
| `taste_refinement.css` | 20.1 KB | 舞台/收藏馆共用样式 | 保留 |
| `immersive-background.css` + `.bundle.js` | 11.6 KB + 730 KB | 3DGS 背景样式与**构建产物** | 保留 bundle（`npm run dev` 会自动重建） |
| `auto_emotion_learner.js` | 18.9 KB | 早期"表情学习器"，**CommonJS 孤儿，0 引用** | 可删（死代码） |
| `faces/*.png`（12 张） | ~2.3 MB | 关羽/张飞/典韦/夏侯渊/姜维/宇文成都/巨灵神/法海/程咬金/窦尔敦/郑子明/倪荣 脸谱纹理，UV 烘焙输入 | 保留 |
| `faces_uv/guanyu_uv.png` | 106 KB | UV 烘焙示例产物（`apply_facepaint_to_obj.py` 用） | 保留 |
| `anchors/guanyu.json` | 0.2 KB | 9 个语义锚点（眼/鼻/嘴/下巴/额头/双颊） | 保留 |
| `uv_templates/face_uv_template_landmarks.json` + README | 0.6 KB | UV 模板锚点（对应 png **缺失**，代码有透明画布 fallback） | 保留 |
| `det2obj.json` / `face_mesh_topology.json` | 5.6 / 62.7 KB | 468/478 点网格顶点、三角面、UV | 保留 |
| `audio/opera-background.mp3` + `audio/cantos/*.mp3`（6 首） + ATTRIBUTION | 3.0 + 7.1 MB | 背景乐（CC-BY 已标注）+ 唱段 | 保留 |
| `gallary_bg.png` / `main_poster_3d.png` / `main_poster_panel_v2.png` | 4.6 / 2.3 / 2.7 MB | 收藏馆背景、主视觉海报 | 保留（可压 webp） |
| `huoba.png` / `shanzi2.png` | 473 / 134 KB | 火把贴图 / favicon | 保留 |

### 2.3 `public/mediapipe/`（20 文件 / 34.3 MB）

自托管 MediaPipe FaceMesh(468) + Hands(21) 的 JS/WASM/packed assets，被 `swipe_demo_web.html` 以 `/mediapipe/...` 直接加载（本地推理、不上传画面）。**属主线，不可删**；若只为省体积可去掉非 SIMD 那一套，但老设备会失去兜底。

### 2.4 `public/3dgs/`（54.5 MB）

| 文件 | 体积 | 作用 |
| --- | --- | --- |
| `huaqingchi.ksplat` / `leifengta.ksplat` | 27.1 / 27.2 MB | 两张 3DGS 沉浸背景（舞台右侧"场景卡"可切换） |
| `*.poster.jpeg` / `*.preview.mp4` / `*.manifest.json` | ~70 KB / 240 KB / 2.6 KB | 封面、预览、相机与视差参数 |
| `index.json` / `SHA256SUMS.txt` | 0.7 / 1.0 KB | 场景索引与校验 |

保留（是"3DGS 陈列馆"的实证）。只留一张可省 27 MB，但会少一个可演示场景。

### 2.5 `public/` 其余

| 路径 | 体积 | 作用 | 判定 |
| --- | --- | --- | --- |
| `digital_exhibition_viewer.html` | 0.8 KB | 纯跳转页 → `/legacy/face_gallery_arc.html` | 保留 |
| `personal_model_viewer.html` | 70.7 KB | 个人三维脸谱查看页（Three.js + manifest/normal map） | 主线 |
| `digital_exhibition/scenes/*/scene_manifest.json` | 1.9 KB | 3DGS 场景清单（后端 `list_scenes` 读） | 保留 |
| `digital_exhibition/museum_viewer.js` | 42.9 KB | **0 引用**：属于已不存在的 `classic_scene_3dgs.html` | 可删（死代码） |
| `digital_exhibition/exhibition.css` | 5.2 KB | 同上，**0 引用** | 可删（死代码） |
| `generated_masks/autodl_user_001/personal_face.obj` | 4.3 MB | 演示用个人脸型 OBJ（模型页、3D 打印 demo 的默认资产） | 保留 |

### 2.6 `backend/`（77 文件 / 1.1 MB）—— 无冗余，全部在用

| 文件 | 体积 | 作用 |
| --- | --- | --- |
| `app.py` | 34 KB | FastAPI 40 条路由：`/api`、`/api/ai/*`、`/api/culture/*`、`/api/opera/media`、`/api/hq-mask/*`、`/api/personal-face/*`、`/api/3d-print/*`、`/api/3dgs/*` |
| `services/ai_agent_service.py` | 24.2 KB | 工具注册表 + DeepSeek 编排 + 本地降级、讲解词、观展报告 |
| `services/rag_knowledge_base.py` | 48.1 KB | 60+ 条带 `source/sourceUrl` 语料 + 加权词法检索（v2：同义扩展/二元短语/来源多样性）+ 情绪映射 |
| `services/cultural_graph_service.py` | 12.6 KB | 角色-颜色-寓意-剧目图 + 一跳子图 + contextual bandit 推荐 |
| `services/culture_knowledge_service.py` | 5.9 KB | 12 张脸谱的结构化底表 |
| `services/face_reconstruction_service.py` | 14.3 KB | 3DDFA-V3 / fallback-obj / mock 三 provider |
| `services/multiview_quality_service.py` | 7.2 KB | 多视角采集 manifest、清晰度/姿态筛选、reconstruction profile |
| `services/uv_service.py` / `backend/scripts/generate_face_uv.py` | 4.8 / 8.5 KB | 锚点驱动 UV 烘焙 |
| `services/detail_map_service.py` | 2.2 KB | 高度派生法线图 |
| `services/blender_service.py` / `trimesh_service.py` / `scripts/apply_facepaint_to_obj.py` | 6.8 / 5.7 / 11.8 KB | GLB 导出双路径（Blender 优先，trimesh 兜底） |
| `services/job_store.py` | 5.1 KB | 内存任务队列与摘要 |
| `services/print_service.py` | 7.4 KB | 3D 打印 preflight / demo job |
| `services/gaussian_gallery_service.py` | 8.9 KB | 3DGS 场景清单与 manifest 管理 |
| `services/multimodal_retrieval_service.py` | 8.2 KB | CLIP 外部服务 + 颜色直方图降级 |
| `services/segmentation_service.py` | 6.7 KB | SAM2 外部服务 + 关键点多边形降级 |
| `services/vision_quality_service.py` | 12.1 KB | VLM 质检 + 本地图像统计降级 |
| `services/creative_face_design_service.py` | 8.3 KB | 结构化 SVG 脸谱创作（非文生图） |
| `services/opera_media_service.py` | 4.7 KB | 脸谱→剧目→唱段/视频检索入口 |
| `backend/scripts/run_hq_mask_pipeline.py` | 9.3 KB | 命令行整条管线（不经 app） |
| `backend/tests/*`（4 个） | 8.3 KB | 36 个离线测试 |
| `backend/README_HQ_MASK_PIPELINE.md` | 7.9 KB | 管线文档 |
| `backend/samples/` | 仅 `.gitkeep` | `SAMPLE_OBJ=raw_face.obj` **不存在**，该 fallback 永不触发 |
| `backend/jobs/` | 空目录 ×2 + `.gitkeep` | 运行期任务产物，可随时清 |

### 2.7 `training/`（12 文件 / 0.2 MB）

| 路径 | 作用 | 判定 |
| --- | --- | --- |
| `gesture/README.md`、`dataset_schema.json`、`validate_dataset.py`、`train_gesture_tcn.py` | 浏览器采集 → 质检 → TCN 训练完整说明与脚本 | 保留（答辩"可扩展"证据） |
| `3dgs/README.md`、`autodl_prepare_scene.py` | AutoDL 抽帧 + COLMAP/3DGS 命令生成 | 保留 |
| `sam/README.md` | SAM2 外部服务接入约定 | 保留 |

### 2.8 `scripts/`（14 文件 / 0.1 MB）

| 分组 | 文件 | 判定 |
| --- | --- | --- |
| 环境（主线） | `setup-cpu.ps1`、`start-cpu.ps1`、`setup-gpu.ps1`、`start-gpu.ps1` | 保留 |
| 静态预览 | `static-preview-server.mjs` | 保留（无后端时预览 public） |
| 视频后期（支线 A） | `capcut-capture.mjs`、`process-capcut-*.ps1`（3 个）、`process_capcut_*.py`（2 个）、`render_capcut_uniform_subtitles.py`、`generate-ai-opera-voiceover.ps1`、`enhance_video_clarity.py` | 可删（且 `capcut-capture.mjs` 硬编码了本机 `C:/Users/20360/.cache/codex-runtimes/...` 的 playwright 路径，换机即失效） |

### 2.9 `docs/`、`.github/`

- `docs/AI-Opera_项目技术细节答辩剖析.md`（34.9 KB / 825 行 / 43 节）：按"真正实现 / 工程兜底 / 预留 / 不宜夸大"四档写，是答辩主材料 → 保留。
- `docs/rag_sources.md`（5.1 KB / 27 条来源）：RAG 语料溯源 → 保留。
- `.github/workflows/ci.yml`：pytest + ruff + `npm run build` → 保留。

### 2.10 非主线目录（体积大头都在这里）

| 目录 | 体积 / 文件数 | 是什么 | 判定 |
| --- | --- | --- | --- |
| `.venv-cpu/` | 1,068.8 MB / 28,405 | CPU 虚拟环境（PyTorch CPU + FastAPI 全套），`setup:cpu` 可重建 | 可删（重建约 10 分钟） |
| `.npm-cache/` | 798.0 MB / 7,958 | npm 缓存（含 npx 临时包） | 可删（会自动重建） |
| `3DDFA-V3/` | 382.3 MB / 82 | 外部 3DMM 仓库 + 权重（`face_model.npy` 99 MB、`net_recon.pth` 92 MB、RetinaFace 104 MB），**资产齐全可真实重建**；`.gitignore` 已排除 | 单独归档，不进交付包 |
| `tmp/` | 200.1 MB / 72 | PPT 提取（`ai_opera_materials.pptx` 44.6 MB、`ppt-analysis` 57.6 MB、`ppt_media_extract` 45.2 MB）、`gh-cli` 52.6 MB、调试页与日志 | 可删 |
| `remotion-tech-route/` | 166.8 MB / 6,638 | 独立的 Remotion 视频工程（自带 node_modules 与 public 素材） | 支线 A，可删/外置 |
| `dist/` | 139.2 MB / 103 | `vite build` 产物（整套 public 拷贝），`npm run build` 可重生 | 可删 |
| `competition-video/` | 42.7 MB / 212 | HyperFrames 宣传片（10 段配音 wav、故事板 png、`film.html`） | 支线 A，可删/外置 |
| `ai-opera-hyperframes/` | 43.6 MB / 24 | 另一版 HyperFrames 视频（`out/*.mp4` 成品 40 MB）；**部分文件已被 git 跟踪** | 支线 A，需确认 |
| `.codex-checks/` | 15.9 MB / 33 | 人工检查截图 + PPT 抽图（`ppt-media/*`） | 可删 |
| `output/playwright/` | 8.8 MB / 12 | Playwright 页面截图与静态服务器日志 | 可删 |
| `changduan/` | 7.4 MB / 6 | 6 首 mp3，与 `public/legacy/audio/cantos/*.mp3` **MD5 完全一致**（白蛇传=jin-shan-si），**0 引用** | 可删 |
| `backups/` | 2.9 MB / 72 | 9 组"改前快照"（2026-05-27/28 前后端文件） | 可删（git 有历史） |
| `outputs/` | 2.8 MB / 2 | 路演 PPT 交付物 + `ppt-test`（内含 node_modules 壳） | 需确认（可能是交付物） |
| `AI-Opera/` | ~0.02 MB / 32 | 只剩 `.gitattributes` + `.git` 的**空壳嵌套仓库** | 可删 |
| `node_modules/` | 200.9 MB / 5,735 | 前端依赖 | 可删（`npm ci` 重建） |
| `.pytest_cache/`、`.ruff_cache/`、`.playwright-cli/`、`test-results/` | ~17 KB | 测试/lint/浏览器缓存 | 可删 |
| `.agents/` | 空 | 空目录 | 可删 |

---

## 三、可删除清单（按"删了会损失什么"分四档）

### A-1 档：实测零功能影响（约 1.16 GB，已用隔离副本验证）

| # | 路径 | 体积 | 理由 |
| --- | --- | --- | --- |
| A1 | `.npm-cache/` | 798.0 MB | 实测 `npm config get cache` = `%LOCALAPPDATA%\npm-cache`，**这个目录根本没被 npm 使用**，纯遗留 |
| A2 | `tmp/` | 200.1 MB | PPT 提取/gh-cli/调试页/日志，全部一次性 |
| A3 | `dist/` | 139.2 MB | 构建产物；只影响 `npm run preview`，`npm run build` 重生 |
| A4 | `.codex-checks/` | 15.9 MB | 检查截图与 PPT 抽图 |
| A5 | `output/` | 8.8 MB | Playwright 截图 + 服务器日志 |
| A6 | `.pytest_cache/`、`.ruff_cache/`、`.playwright-cli/`、`test-results/`、`.agents/` | ~17 KB | 工具缓存/空目录 |
| A7 | `backend/jobs/*`（保留 `.gitkeep`） | 0 | 运行期目录，任务创建时 `mkdir(parents=True)` 自动重建（已实测） |
| A8 | `public/digital_exhibition/museum_viewer.js`、`exhibition.css` | 48 KB | 0 引用；其宿主 `classic_scene_3dgs.html` 已不存在 |
| A9 | `public/legacy/auto_emotion_learner.js` | 18.9 KB | 0 引用，CommonJS 孤儿 |

> **✅ 执行记录（2026-10-25 14:20）**：A-1 已实际删除完毕。体积 3,394.1 MB → **2,232.0 MB（−1,162.1 MB）**。
> 删除后复验：`pytest` 36 passed、`tsc --noEmit` 0 error、资源爬取 95 行与清理前 **diff = 0**、12 个关键资产全部 200、3 个已删文件 404。
> 3 个被 git 跟踪的死代码文件用 `git rm` 删除（已暂存，**未提交**）。
> 唯一例外：`backend/jobs/hq_mask_pipeline_be7qpc0o` 是 0 字节空目录，但 ACL 拒绝访问（连 ACL 都读不到），需管理员权限删：
> ```powershell
> takeown /f "…\backend\jobs\hq_mask_pipeline_be7qpc0o" /r /d y
> icacls "…\backend\jobs\hq_mask_pipeline_be7qpc0o" /grant "${env:USERNAME}:(F)" /t
> Remove-Item "…\backend\jobs\hq_mask_pipeline_be7qpc0o" -Recurse -Force
> ```

### A-2 档：环境本体（约 1.27 GB）—— 删掉后"暂时不可运行"，必须先重装

| # | 路径 | 体积 | 删后影响 / 恢复方式 |
| --- | --- | --- | --- |
| A10 | `.venv-cpu/` | 1,068.8 MB | `npm run dev:cpu` 直接抛 `CPU virtual environment not found`；恢复 = `npm run setup:cpu`（装 CPU 版 torch + opencv/scipy/trimesh，**要联网、要下几百 MB**） |
| A11 | `node_modules/` | 200.9 MB | `npm run dev` / `npm run build` 均不可用；恢复 = `npm install` |

> A-2 不是"功能被删"，而是"项目暂时跑不起来"。**如果答辩机可能离线，这两项不要删**（或先确认能联网重装）。

### B 档：低风险（B6 为条件性降级），已在隔离副本中实测（B1–B6/B9/B10 约 23 MB；B7/B8 属依赖瘦身，收益在重装后体现）

| # | 路径 | 体积 | 理由 / 注意 |
| --- | --- | --- | --- |
| B1 | `changduan/` | 7.4 MB | 与 `public/legacy/audio/cantos/` 逐字节重复，0 引用 |
| B2 | `backups/` | 2.9 MB | 9 组手工快照，已被 git 历史覆盖 |
| B3 | `AI-Opera/` | ~0 MB | 空壳嵌套 git 仓库 |
| B4 | 根目录 `.codex-901.*.js`、`.codex-98.*.js`、`.codex-index.*.js` | 2.65 MB | 工具打包产物，非项目代码 |
| B5 | 根目录 `.codex-*.log`、`.codex-capcut-share-*.json` | ~40 KB | 旧启动日志与剪映探测结果 |
| B6 | `public/legacy/vision_wasm_nosimd_internal.*` | 9.6 MB | ⚠️ **会造成条件性功能降级**：vendored `vision_bundle.mjs` 用 `WebAssembly.validate` 判断 SIMD，无 SIMD 时按 `${base}/vision_wasm_nosimd_internal.{js,wasm}` 加载。删后老浏览器（Safari <16.4 / 2023 年前的 WebView）点“情绪换脸”会落到 `模型不可用，请刷新页面后重试` 面板——页面不崩（`emotion_mask_module.js` 有 catch），但该模块不可用。现代浏览器无感 |
| B7 | 未使用的 npm 依赖：`zustand`、`@mediapipe/camera_utils`、`@mediapipe/face_mesh`、`@mediapipe/hands`、`@mediapipe/tasks-vision` | 重装后约省 20–30 MB | 运行期一律走 `public/mediapipe/` 与 `public/legacy/vision_bundle.mjs` 自托管副本。**已实测**：删掉后 `vite build`、`vite dev`、`pytest` 全部通过。注意 `postcss` 不在此列——它是 Vite 自己的依赖，npm 会 hoist 到顶层，删不干净也不必删 |
| B8 | `tailwindcss` + `autoprefixer` + **`postcss.config.js` + `tailwind.config.js`** | 重装后约省 15 MB | 全仓无 `@tailwind`、无 `@apply`、无 tailwind 类名。**必须成对删除**：实测只删依赖而留下 `postcss.config.js` 时，构建直接失败 `Loading PostCSS Plugin failed: Cannot find module 'tailwindcss'`；成对删后构建通过，产物 CSS 25.1 KB vs 原 25.2 KB（说明 Tailwind 一行样式都没产出） |
| B9 | `scripts/` 视频后期 9 个文件（capcut×7、voiceover、enhance_video_clarity） | ~40 KB | 属于支线 A，且硬编码本机 playwright 路径。注意：其中 3 个 capcut 脚本**引用 `remotion-tech-route/`**，要和 C2 一起删或一起留 |
| B10 | `.env`（**先轮换 Key 再删**） | 157 B | 内含真实 `sk-8fb7…`，不应留在任何可分发目录 |

> B7/B8 修改后执行：`npm install` → `npm run build` → 确认 `dist/` 正常、`tsc` 0 error。

### C 档：需你确认（删了就少一个交付物/材料，约 266 MB）

| # | 路径 | 体积 | 删前确认 |
| --- | --- | --- | --- |
| C1 | `competition-video/` | 42.7 MB | 是否还要重剪宣传片（`compositions/film.html` + 10 段配音源） |
| C2 | `remotion-tech-route/` | 166.8 MB | 技术路线视频工程（6 个 composition），若成片已导出可整包删 |
| C3 | `ai-opera-hyperframes/` | 43.6 MB | 含已导出的 `out/*.mp4`；其中源码部分**已被 git 跟踪**，删前先 `git rm` 或确认不要 |
| C4 | 根 `AI-Opera_voiceover_120s.wav` + `_script.txt` | 10.1 MB | 与 C1–C3 配套的配音成品 |
| C5 | `outputs/`（路演 PPT） | 2.8 MB | 是否作为答辩交付物保留 |
| C6 | `3DDFA-V3/` | 382.3 MB | 只影响"真实三维重建"，删后走 fallback-obj/mock；建议**移出项目目录另行归档**，而不是删除 |
| C7 | `public/3dgs/backgrounds/` 其中一张 `.ksplat` | 27 MB | 只留一张沉浸背景可省 27 MB |
| C8 | `public/generated_masks/autodl_user_001/personal_face.obj` | 4.3 MB | 模型页与 3D 打印 demo 的默认资产，删了首屏会空 |

### D 档：不能删（主链运行所需）

```
index.html  stage.html  src/**（4 文件）  package.json  package-lock.json
vite.config.ts  tsconfig*.json  .gitignore  LICENSE  README.md  DESIGN.md  PRODUCT.md  RUN_GPU.md
.env.example  requirements*.txt  pytest.ini  ruff.toml  Dockerfile  .dockerignore
.github/workflows/ci.yml
public/legacy/：swipe_demo_web.html  backend_mask_client.js  personalized_face_renderer.js
  hand_face_gesture_detector.js  gesture_sequence_recognizer.js  gesture_dataset_recorder.js
  emotion_mask_module.js  emotion_mask_worker.js  vision_bundle.mjs  vision_wasm_internal.*
  face_landmarker.task  performance_monitor.js  culture_knowledge_engine.js  face_knowledge_data.js
  xiaopu_floating_agent.js  opera_media_catalog.js  face_gallery_arc.html  face_knowledge.html
  face_painting_play.html  taste_refinement.css  immersive-background.css  immersive-background.bundle.js
  det2obj.json  face_mesh_topology.json  faces/**  faces_uv/**  anchors/**  uv_templates/**
  audio/**  gallary_bg.png  main_poster_3d.png  main_poster_panel_v2.png  huoba.png  shanzi2.png
public/mediapipe/**  public/3dgs/**  public/digital_exhibition_viewer.html
public/personal_model_viewer.html  public/generated_masks/**  public/digital_exhibition/scenes/**
backend/**（app.py + 18 个 services + 3 个 scripts + 4 个 tests + README）
docs/**  training/**  scripts/setup-{cpu,gpu}.ps1  scripts/start-{cpu,gpu}.ps1  scripts/static-preview-server.mjs
```

---

## 四、清理后的体积

| 场景 | 剩余 | 说明 |
| --- | --- | --- |
| 当前 | 3,394 MB | — |
| 删 A-1 + A-2 | ~962 MB | 功能等价，但重装依赖前项目不可运行 |
| 删 A+B | ~940 MB | 功能等价，代码更干净 |
| 删 A+B+C（C6 改为外移） | ~290 MB | 只剩主链 + 文档 + 训练脚本；C6 另存 |
| 只交 git 跟踪内容 | 164.2 MB | 202 个文件，含 54 MB 3DGS、34 MB mediapipe、10 MB 配音 |
| 精简交付包（去掉 C4 + C7 一张） | ~127 MB | 答辩 U 盘/网盘最实用的口径 |

---

## 五、建议的清理顺序（PowerShell，先看再删）

```powershell
# 0) 先备份关键交付物（PPT、成品视频）到项目外

# 1) 预览体积（不落盘）
$safe = @('.npm-cache','tmp','dist','.codex-checks','output','.pytest_cache','.ruff_cache','.playwright-cli','test-results','changduan','backups','AI-Opera')
$env2 = @('.venv-cpu','node_modules')
foreach ($t in ($safe + $env2)) {
  if (Test-Path $t) {
    $s = (Get-ChildItem $t -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    "{0,-18} {1,8:N1} MB" -f $t, ($s/1MB)
  }
}

# 2a) A-1 + B1/B2/B3：实测零功能影响，可直接删
# Remove-Item -Recurse -Force .npm-cache, tmp, dist, .codex-checks, output,
#   .pytest_cache, .ruff_cache, .playwright-cli, test-results, changduan, backups, AI-Opera

# 2b) A-2：删完必须能联网重装，否则项目不可运行（离线答辩机跳过这一步）
# Remove-Item -Recurse -Force .venv-cpu, node_modules
# 恢复：npm install ; npm run setup:cpu

# 3) 死代码（B6/B7 相关的 nosimd 与依赖见下行说明）
# Remove-Item public\legacy\auto_emotion_learner.js
# Remove-Item public\digital_exhibition\museum_viewer.js, public\digital_exhibition\exhibition.css

# 4) 根目录工具残留
# Get-ChildItem -File .codex-* | Remove-Item -Force

# 5) 轮换 DeepSeek Key 后再删
# Remove-Item .env

# 6) 被 git 跟踪的文件要用 git rm 才会同步索引
# git rm public\legacy\auto_emotion_learner.js public\digital_exhibition\museum_viewer.js `
#        public\digital_exhibition\exhibition.css public\legacy\vision_wasm_nosimd_internal.js `
#        public\legacy\vision_wasm_nosimd_internal.wasm changduan\*.mp3 AI-Opera_voiceover_120s.wav
```

依赖瘦身分两组、互不相同的配套文件：

```powershell
# B7（未用 npm 包）：改 package.json，并删掉 vite.config.ts 里 optimizeDeps.exclude 的两行
# B8（Tailwind）：改 package.json，同时删 postcss.config.js + tailwind.config.js —— 必须成对
npm install
npm run build      # build:immersive + tsc + vite build
.\.venv-cpu\Scripts\python.exe -m pytest -q
```

> ⚠️ **Windows PowerShell 5.1 的坑（实测踩到）**：`Set-Content -Encoding UTF8` / `Out-File -Encoding UTF8` 会给 `package.json` 写 BOM，Vite 读它会报
> `Unexpected token '﻿', "﻿{..." is not valid JSON`。改 `package.json` 请用：
> ```powershell
> $json = (Get-Content package.json -Raw) | ConvertFrom-Json
> # …修改…
> [IO.File]::WriteAllText("$PWD\package.json", ($json | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
> ```
> 或者改完用 VS Code 另存为 “UTF-8（无 BOM）”。

---

## 六、删除演练实测（2026-10-25，隔离副本）

为回答"删了到底会不会坏"，把主链文件复制到 `%TEMP%\aiopera-audit2`，**真的执行了 A-1 + B 档的代码级删除**（含卸载 8 个 npm 包、删 4 个文件、删 2 个配置文件），然后与原始树做同条件对照。

| 验证项 | 原始树 | 删除后副本 | 结论 |
| --- | --- | --- | --- |
| `pytest -q` | 36 passed | **36 passed** | 后端零影响 |
| `tsc --noEmit` | 0 error | **0 error** | 类型零影响 |
| `vite build` | JS 148.6 KB / CSS 25.2 KB | **成功**，JS 148.6 KB / CSS 25.1 KB | 构建零影响，Tailwind 确实零产出 |
| 静态服务器资源爬取 | 95 个本地 URL，43 个非 200 | **95 个，43 个，逐行 diff = 0** | 无新增 404 |
| 静态模式浏览器（7 页） | console 4 / pageerror 2 / 4xx 5 | **console 4 / pageerror 2 / 4xx 5**（内容逐条一致，仅端口号不同） | 运行时零差异 |
| Dev 模式浏览器（7 页） | console 0 / pageerror 0 / 4xx 0 / 音频 abort 1 | **完全一致** | 开发模式零差异 |
| 后端接口 | — | `/api`、health、ai/config、rag/search、rag/stats、agent、graph、recommend、opera/media、3dgs/scenes、3d-print/capability、preflight 全部 200 | 接口零影响 |
| 异步任务 | — | mock job → `done`；personal-face job → `done`（自动写 manifest/OBJ） | 任务链零影响 |
| 运行期目录 | — | `backend/jobs/<jobId>` 自动重建 | 可安全清空 |
| 保留资产探测 | 200 | `/legacy/faces/关羽.png`、`cantos/*.mp3`、`face_landmarker.task`、`vision_wasm_internal.wasm`、`mediapipe/hands/hands.js`、`*.ksplat`、`personal_face.obj` 全部 200 | 关键资产未误删 |
| 删除项探测 | 200 | `auto_emotion_learner.js` / `museum_viewer.js` / `exhibition.css` → 404 | 确实删掉了且无人引用 |
| **nosimd 探测** | 200 | **404** | 唯一一处真实能力缺口（见 B6） |

**两棵树共有的既有问题（与删除无关，建议单独立项修）**：

1. 静态预览模式下 `/mediapipe/hands/face_mesh_solution_packed_assets.data` 与 `.../face_mesh_solution_simd_wasm_bin.wasm` 404——FaceMesh 的资源被拼到了 Hands 的目录；`swipe_demo_web.html` 里两个 `locateFile` 都写对了，疑似两个 solution 同时初始化时的全局 base 竞争。该现象在静态预览模式复现、dev 模式因加载时序不同未复现，两棵树表现相同。
2. 静态预览服务器未注册 `.tsx` MIME，导致 `/` 的 `main.tsx` 以 `application/octet-stream` 返回（Vite dev 正常，仅影响 `static-preview-server.mjs`）。
3. `face_gallery_arc.html` 在无后端时会 404 `/api/opera/media/guanyu`（预期行为，需同时起后端）。

### 结论

- **A-1 + B 档的代码级删除：功能等价，已实证。** 唯一例外是 B6（无 SIMD 老浏览器上的情绪换脸），属可控降级。
- **A-2（`.venv-cpu` / `node_modules`）：不是功能问题，是"删完必须重装才能跑"**；离线答辩机请保留。
- **C 档全部是"少一个交付物/素材"，不影响程序运行**；但 C6（3DDFA）删了会让真实重建退化为 fallback/mock（已实测 `ddfaV3Ready:false` + mock job 正常）。
- **B10（`.env`）是有意的功能变化**：删掉后 Agent 走本地 RAG（实测 `provider=local-rag`），回答质量下降但不报错。

---

## 七、审计中顺手发现的 6 个问题

1. **`.env` 里有真实 DeepSeek API Key**（`sk-8fb75894c14c49aea12d164b86baf7df`）。`.gitignore` 虽然忽略了 `.env`，但当前目录是"副本 - 副本"，极易被打包外发。**先到平台轮换该 Key，再删文件。**
2. **`/classic_scene_3dgs.html` 是死链**：`gaussian_gallery_service.py` 的 `_default_classic_scene()`（`/api/3dgs/status`、`/api/3dgs/classic-scenes`、`GET /api/3dgs/scenes/{id}` 都会返回 `entryUrl`）指向 `/classic_scene_3dgs.html?scene=classic-placeholder`，但 `public/` 下没有这个文件；配套的 `museum_viewer.js` / `exhibition.css` 因此成为孤儿。要么补页面，要么把该入口改成收藏馆。
3. **`face_uv_template.png` 缺失**：`uv_service.py` 与 `run_hq_mask_pipeline.py` 都指向 `public/legacy/uv_templates/face_uv_template.png`，实际只有 landmarks.json（README 说明会 fallback 到 1024×1024 透明画布，但生成质量会打折）。
4. **`backend/samples/raw_face.obj` 缺失**：`face_reconstruction_service.py` 的 `SAMPLE_OBJ` 分支永远不会命中，该兜底实际不可用。
5. **前端依赖与实现脱节**：`public/mediapipe/` 与 `public/legacy/vision_bundle.mjs` 是自托管副本，但 `package.json` 仍装着 4 个 `@mediapipe/*` 包；`zustand` 从未 import；`tailwind` 整条管线空转。`vite.config.ts` 的 `optimizeDeps.exclude` 也仍指向这些已无 import 的包。
6. **文档小漂移**：`docs/rag_sources.md` 提到的 `/api/ai/rag/stats` 现在确实存在（audit 期间补齐）；README 测试数已与 36 个用例一致。唯一遗留是 `classic_scene_3dgs.html` 的表述（training/3dgs/README 里仍当作已接好的页面）。
