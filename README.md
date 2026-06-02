# AI-Opera（伤心版）

AI-Opera（伤心版）是一个面向川剧变脸与脸谱文化展示的 Web 互动项目。项目把实时摄像头体验、MediaPipe 人脸与手势追踪、Three.js 三维脸谱渲染、个人三维脸谱模型展示、川剧唱段联动、RAG 知识库和“小谱”AI 导览 Agent 组合到同一套体验流程中。

## 核心功能

- 首页双模式入口：轻云入戏、华彩入境。
- 实时舞台：摄像头画面中进行脸谱贴合、挥手/转头/遮脸等动作触发变脸。
- 脸谱收藏馆：以弧形舞台陈列已有脸谱，切换脸谱时联动播放对应唱段。
- 个人三维脸谱模型：展示个人 OBJ 与脸谱 UV 贴图后的三维面罩，可旋转查看。
- 脸谱知识页：展示角色故事、颜色寓意、绘制过程，并提供“川剧猜猜猜”互动。
- 小谱 AI 导览：在非首页页面以悬浮脸谱入口出现，支持川剧文化、项目技术、当前脸谱和三维模型问答。
- 后端 AI 服务：FastAPI 提供 RAG、Agent、推荐、媒体检索、三维生成任务和系统状态接口。

## 技术栈

- 前端：React、Vite、TypeScript、Three.js、MediaPipe Face Mesh、MediaPipe Hands。
- 后端：FastAPI、Python、RAG 检索、DeepSeek OpenAI-compatible Chat Completion API。
- 三维链路：OBJ 模型、UV 贴图、GLB 展示、Blender/trimesh 导出路径。
- 本地运行：支持 CPU-only 演示模式；GPU/AutoDL 训练与 3DDFA-V3 权重按需单独配置。

## 快速启动

安装前端依赖：

```bash
npm install
```

启动前端：

```bash
npm run dev
```

CPU 模式启动前后端：

```powershell
npm run setup:cpu
npm run dev:cpu
```

构建前端：

```bash
npm run build
```

## 环境变量

复制 `.env.example` 为 `.env`，再按需填写：

```text
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_TIMEOUT_SECONDS=25
HQ_MASK_FACE_PROVIDER=auto
DDFA_V3_DEVICE=cpu
```

注意：`.env` 不会上传到 GitHub。不要把真实 API Key 写入 README 或源码。

## 关于 3DDFA-V3

本仓库不直接提交 `3DDFA-V3/` 目录和其中的大模型权重，因为普通 GitHub 仓库无法接收超过 100 MB 的文件。需要完整三维重建能力时，请在本地单独恢复 3DDFA-V3 代码和权重，并参考 `RUN_GPU.md`、`backend/README_HQ_MASK_PIPELINE.md` 进行配置。

没有 GPU 或未配置完整 3DDFA-V3 权重时，项目仍可运行前端舞台、脸谱收藏馆、小谱导览、RAG 问答和示例三维模型展示。

## 主要目录

- `src/`：Vite/React 首页入口。
- `public/legacy/`：舞台页、收藏馆、脸谱知识页、绘制页、小谱浮窗等核心页面。
- `public/generated_masks/`：示例个人三维脸谱 OBJ。
- `changduan/`：脸谱对应的本地唱段音频。
- `backend/`：FastAPI 后端、RAG、Agent、媒体资源、三维生成服务。
- `docs/`：答辩技术剖析、RAG 来源整理。
- `scripts/`：本地 CPU/GPU 启动与工程脚本。
- `training/`：动作样本和视觉模型训练相关脚本。

## 说明

项目当前定位是“个性化三维脸谱面罩”和“川剧非遗数字互动体验”，不是身份级高保真人脸重建系统。答辩或展示时建议重点突出：实时视觉交互、RAG 文化解释、小谱 Agent、唱段联动、三维脸谱资产留存和非遗传播价值。
