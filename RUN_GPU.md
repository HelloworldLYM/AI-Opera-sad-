# GPU 运行说明

这个项目现在默认接入项目内的 `3DDFA-V3`，不再依赖 3DDFA_V2。流程是：

1. 前端摄像头抓取当前人脸图像。
2. 后端调用 `3DDFA-V3/export_obj_adapter.py`，用 CUDA PyTorch 重建 `face.obj`。
3. 后端生成脸谱 UV。
4. 如果本机有 Blender，就用 Blender 导出更完整的 GLB；如果没有 Blender，就自动用 Python/trimesh 导出可用 GLB。
5. 前端把生成的 GLB 加入收藏馆。

## 第一次安装

在项目根目录运行：

```powershell
npm run setup:gpu
```

等价于：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-gpu.ps1
```

脚本会创建 `.venv`、安装 CUDA 版 PyTorch、安装后端依赖，并检查 `3DDFA-V3/assets` 里的权重是否齐全。

默认 PyTorch CUDA wheel 使用 `cu121`：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-gpu.ps1 -TorchIndexUrl https://download.pytorch.org/whl/cu121
```

如果你的显卡驱动太旧，需要先更新 NVIDIA 驱动，或者换成你机器匹配的 PyTorch CUDA wheel。

## 启动项目

```powershell
npm run dev:gpu
```

启动后打开：

```text
http://127.0.0.1:3000
```

后端健康检查：

```text
http://127.0.0.1:8000/api/hq-mask/health
```

## 关键环境变量

`scripts/start-gpu.ps1` 会自动设置这些变量：

```powershell
$env:HQ_MASK_MODE="real"
$env:HQ_MASK_FACE_PROVIDER="3ddfa-v3"
$env:DDFA_V3_REPO_PATH="项目目录\3DDFA-V3"
$env:DDFA_V3_PYTHON="项目目录\.venv\Scripts\python.exe"
$env:DDFA_V3_DEVICE="cuda"
$env:DDFA_V3_DETECTOR="retinaface"
$env:DDFA_V3_BACKBONE="resnet50"
$env:HQ_MASK_GLB_EXPORTER="auto"
```

`HQ_MASK_GLB_EXPORTER=auto` 会优先用 Blender；找不到 Blender 时自动走 Python/trimesh。

## Blender 放桌面或任务栏

后面你把 Blender 5.1 或 4.5.9 下载/解压到桌面即可，项目会自动找这些位置里的 `blender.exe`：

```text
桌面\Blender 5.1\blender.exe
桌面\blender-5.1.0-windows-x64\blender.exe
桌面\Blender 4.5.9\blender.exe
桌面\blender-4.5.9-windows-x64\blender.exe
桌面\blender\blender.exe
桌面\blender.exe
```

也支持桌面下几层目录内的 `blender.exe`、Program Files 里的 Blender Foundation 目录，以及任务栏固定快捷方式的真实目标。找到后 `npm run dev:gpu` 会自动设置 `BLENDER_BIN`，后端健康检查里的 `blenderReady` 会变成 `true`。

如果你想手动指定：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-gpu.ps1 -BlenderBin "C:\Users\20360\Desktop\Blender 4.5.9\blender.exe"
```

想强制使用 Blender 导出，而不是自动降级到 trimesh：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-gpu.ps1 -GlbExporter blender
```
