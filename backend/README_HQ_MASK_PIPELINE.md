# 个性化三维脸谱面罩后端管线

当前后端真实模式默认使用“多视角采集 + 质量筛选 + 3DDFA-V3/3DMM 风格脸型拟合 + UV 烘焙 + 细节法线图 + GLB 导出”的工程路线。项目根目录里的 `3DDFA-V3` 是当前可用的脸型拟合 provider：

```text
multi-view face frames -> quality/pose screening -> 3DDFA-V3 OBJ -> facepaint UV bake -> detail normal map -> GLB -> public/generated_masks
```

不再把单张图路线表述为“高保真人脸重建”。正式功能名称使用“个性化三维脸谱面罩生成”。前端会采集一段短 burst，并随帧发送亮度、对比度、姿态角、追踪置信度等元数据；后端会生成 `capture_manifest.json`，筛掉低质量帧，再进入重建。

前端仍会发送 `fallbackObjText`，但真实模式会优先使用筛选后的摄像头图像跑 `3ddfa-v3`；只有摄像头图像不可用时才退回前端导出的 OBJ。

## Provider

- `3ddfa-v3`：默认真实重建 provider，调用 `3DDFA-V3/export_obj_adapter.py`。
- `fallback-obj`：摄像头图像不可用时的保底路径，直接保存前端实时网格 OBJ。
- `mock`：开发兜底，不依赖 3DDFA。

`provider="auto"` 时，会先尝试 `3ddfa-v3`，再按输入情况退回 `fallback-obj` 或 `mock`。

## 输出元数据

每个后端任务会在 job 目录写入：

- `capture_manifest.json`：输入帧数量、入选帧数量、清晰度/曝光/姿态覆盖评分。
- `fallback.obj`：前端实时网格兜底输入，仅在前端提供时存在。

每个生成会在 `public/generated_masks/{sessionId}` 写入：

- `personal_face.obj`
- `{textureKey}_mask.glb`
- `{textureKey}_detail_normal.png`
- `{textureKey}_asset_manifest.json`

这些元数据用于展示“这是个性化三维脸谱面罩资产”，而不是不可验证地宣称完整高保真人脸重建。

`{textureKey}_asset_manifest.json` 会记录 profile、source、capture 入选帧、pose coverage、OBJ/GLB 地址、normal map 地址和生成路线。前端陈列馆与 `personal_model_viewer.html` 会读取这些字段，用于展示可追溯的生成证据链。

## 启动

首次安装：

```powershell
npm run setup:gpu
```

启动前后端：

```powershell
npm run dev:gpu
```

没有 NVIDIA GPU 的个人电脑使用 CPU 模式：

```powershell
npm run setup:cpu
npm run dev:cpu
```

CPU 模式会设置 `DDFA_V3_DEVICE=cpu` 和 `HQ_MASK_FACE_PROVIDER=auto`。如果 3DDFA-V3 资产完整，它会在 CPU 上真实跑重建，但速度会明显慢；如果资产不完整或不适合当前机器，会自动退回前端 OBJ/mock 路径，保证体验馆、陈列馆、manifest、性能统计和三维面罩展示仍可运行。

只想快速演示、不跑 3DDFA-V3 时：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-cpu.ps1 -MockOnly
```

## DeepSeek RAG / Agent

项目已内置 AI 导览 Agent 接口：

- `GET /api/ai/config`
- `POST /api/ai/ask`
- `POST /api/ai/agent`
- `POST /api/ai/recommend`
- `POST /api/ai/narration`
- `POST /api/ai/report`
- `GET /api/culture/graph`
- `GET /api/ai/graph`
- `POST /api/ai/visual-qa`
- `POST /api/ai/clip/search`
- `POST /api/ai/creative-face`
- `POST /api/ai/sam/segment`
- `GET /api/3dgs/status`
- `GET /api/3dgs/scenes`
- `GET /api/3dgs/classic-scenes`

没有配置 DeepSeek key 时，接口会使用本地脸谱知识库做 RAG fallback；配置 key 后，会调用 DeepSeek 的 OpenAI 兼容 Chat Completion API 生成更自然的导览回答。
VLM、CLIP、SAM 和 3DGS 训练服务都是可插拔接口：未配置外部服务时，项目使用本地图像统计、颜色/语义检索、关键点遮挡和程序化数字展厅预览；配置 AutoDL/API 后会自动升级 provider。

数字展厅和经典场景重建已拆分为两个独立模块：

- `public/digital_exhibition_viewer.html`：展示个性化三维脸谱模型和 UV 贴图展陈。
- `public/classic_scene_3dgs.html`：等待导入经典川剧场景视频、3DGS 资产和对应唱段。

本机 PowerShell 配置方式：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm run dev:cpu
```

也可以在项目根目录新建 `.env`：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
AI_VLM_SERVICE_URL=
AI_CLIP_SERVICE_URL=
AI_SAM_SERVICE_URL=
AI_3DGS_TRAIN_SERVICE_URL=
```

`scripts/start-cpu.ps1` 和 `scripts/start-gpu.ps1` 会自动读取 `.env`。`.env` 已加入 `.gitignore`，不要把真实 key 写入 `.env.example`。

如果需要更强推理或更稳定输出，可以把 `DEEPSEEK_MODEL` 改为平台当前可用的更高规格模型。API key 不要写入代码或提交到仓库。

前端体验馆中点击“AI 导览 Agent”，即可询问当前脸谱、查看脸谱关系图、使用轻量偏好推荐自动切换下一张脸谱、生成展馆讲解词、调用浏览器语音播报、生成观展报告，并解释 CPU 模式和项目 AI 架构。

GraphRAG 会把原有 12 张脸谱组织为“角色-颜色-寓意-剧目”关系图；推荐策略使用 contextual bandit 风格的轻量打分，把当前脸谱、已看过的脸谱和本地偏好事件合并成下一张脸谱推荐。采集训练面板保留为开发优化入口，不作为普通用户主流程。

RAG 知识库现在包含 60+ 条片段，覆盖：

- 脸谱人物、别名、颜色、寓意、剧目和故事片段。
- 红、黑、白、蓝、绿、黄、金银等颜色寓意片段。
- 项目 AI 架构、CPU fallback、个性化三维面罩生成路线、RAG/Agent 价值。
- AutoDL 手势训练路线。
- 外部资料摘要：川剧非遗概况、数字化保护、变脸技法、面具颜色与情绪表达、数字博物馆、非遗+科技。
- 技术资料摘要：RAG、ReAct Agent、MediaPipe Face Mesh/Hands、TCN、3DDFA、3DDFA-V3、DECA、One Euro Filter。

外部来源清单见 `docs/rag_sources.md`。

可用接口：

```text
GET /api/ai/rag/search?q=关羽为什么是红脸
GET /api/ai/rag/search?q=AutoDL手势训练
```

## AutoDL 训练建议

AutoDL 没有桌面也不影响训练。建议只把它作为离线训练环境：

```text
本地前端采集关键点序列 JSON/CSV
-> 上传 AutoDL
-> 训练 TCN/LSTM/1D-CNN 手势识别模型
-> 导出 ONNX / TensorFlow.js / PyTorch CPU 权重
-> 下载回本地项目推理
```

不建议把完整展馆前端部署到 AutoDL。展示仍放在本地电脑，AutoDL 用来训练视觉小模型，DeepSeek API 用来提供 RAG 和 Agent 推理。

本地体验馆已经提供“手势训练采集”面板。启动摄像头后选择标签、开始采集、做动作、停止保存、导出 JSON。导出的数据上传 AutoDL 后可运行：

```bash
python training/gesture/validate_dataset.py --data ai-opera-gesture-dataset.json --out artifacts/gesture_dataset_report.json
```

```bash
python training/gesture/train_gesture_tcn.py --data ai-opera-gesture-dataset.json --out artifacts/gesture_tcn
```

健康检查：

```text
GET http://127.0.0.1:8000/api/hq-mask/health
```

## GLB 导出

`HQ_MASK_GLB_EXPORTER=auto` 时，后端会优先使用 Blender；如果找不到 Blender，会自动使用 Python/trimesh 导出可用 GLB。Blender 版本会把 `{textureKey}_detail_normal.png` 接到材质 Normal 输入，更适合最终展示；trimesh 版本会忽略法线图，但仍保留 OBJ/GLB 和 manifest，适合“有显卡就先跑起来”的最小环境。

## Blender 自动发现

后端和 `scripts/start-gpu.ps1` 都会自动寻找桌面、Program Files、任务栏固定快捷方式里的 `blender.exe`，优先匹配 `Blender 5.1`、`Blender 4.5.9`、`blender-4.5.9-windows-x64` 这类目录。也可以手动设置：

```powershell
$env:BLENDER_BIN="C:\Users\20360\Desktop\Blender 4.5.9\blender.exe"
```

健康检查会返回：

```json
{
  "blenderReady": true,
  "blenderBin": "C:\\Users\\20360\\Desktop\\Blender 5.1\\blender.exe"
}
```
