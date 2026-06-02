# AI-Opera 3DGS 数字展厅训练路线

本项目本机按无 GPU 环境设计：电脑负责浏览、管理场景和演示，3D Gaussian Splatting 训练建议放到 AutoDL CUDA 实例完成。

项目里现在有两个独立模块：

- `public/digital_exhibition_viewer.html`：川剧数字展厅，展示个性化三维脸谱、UV 贴图、文化关系和沉浸式展陈。
- `public/classic_scene_3dgs.html`：经典川剧场景 3DGS 重建，后续导入经典场景视频、训练资产和对应唱段。

## 素材要求

- 经典川剧舞台、展馆、后台或陈列空间视频：1080p/4K，60-180 秒，慢速环绕/平移。
- 避免快速甩镜、强压缩、强反光、密集移动人群。
- 如果用照片，建议 200-800 张，画面重叠 70% 以上，覆盖正面、侧面、地面、顶棚、展柜和细节。
- 每个空间单独建一个 `sceneId`，例如 `sichuan-opera-stage-001`。

## AutoDL 基本流程

1. 上传视频或图片到 AutoDL，例如 `/root/autodl-tmp/ai-opera-scenes/raw/stage_001.mp4`。
2. 用 `autodl_prepare_scene.py` 抽帧并生成 COLMAP/3DGS 命令清单。
3. 安装 COLMAP、CUDA PyTorch 和 GraphDeco/Inria 3D Gaussian Splatting。
4. 运行 COLMAP 稀疏重建，再运行 3DGS 训练。
5. 导出 `point_cloud.ply` 或 splat 资产，并写入 `scene_manifest.json`。
6. 拷贝导出的场景文件夹到本项目 `public/digital_exhibition/scenes/{sceneId}`。
7. 经典剧目场景打开 `/classic_scene_3dgs.html?scene={sceneId}`，用户可以 360 度自由探索，并播放对应唱段。

## 当前项目已接好的部分

- `GET /api/3dgs/status`：查看本机/外部训练能力。
- `GET /api/3dgs/scenes`：列出数字展厅场景。
- `GET /api/3dgs/classic-scenes`：列出经典川剧 3DGS 场景。
- `POST /api/3dgs/scenes`：登记一个待训练或已导入的场景 manifest。
- `public/digital_exhibition_viewer.html`：Three.js 360 度自由探索 Viewer。
- `public/classic_scene_3dgs.html`：经典场景重建 + 唱段 Viewer。

## 不要夸大的点

未导入 AutoDL 训练出的 splat/point cloud 前，项目展示的是程序化数字展厅预览，不应宣称已经完成真实川剧场景 3DGS 重建。
