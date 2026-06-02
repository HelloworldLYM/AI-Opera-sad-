# AI-Opera 手势动作训练

这个目录用于把浏览器采集到的 MediaPipe 关键点序列训练成轻量手势分类模型。适合放到 AutoDL 上运行；AutoDL 没有桌面不影响训练。

## 采集

在本地项目中启动：

```powershell
npm run dev:cpu
```

进入体验馆，启动摄像头，打开“手势训练采集”面板。每段样本建议 1-3 秒，先采这些类别。横向挥手已不作为训练类别，避免与纵向挥手混淆：

- `vertical_swipe`：纵向挥手。手掌张开或自然伸指，从脸部上方向下划过，或从下方向上划过；手要经过脸部核心区域。
- `cover_face`：遮脸。手掌靠近脸部中间区域，遮住鼻口或半张脸，停留 1 秒左右；不要完全把脸移出画面。
- `head_shake`：左右转头。手离开脸，正对镜头开始，快速左-右-左或右-左-右转头。
- `head_nod`：点头。手离开脸，先正视镜头，再明显低头或抬头一次，最后尽量回正。
- `raise_hand`：举手。轻微转头，同时举同侧手；手腕在画面上半部，手离脸中心至少半个脸宽。
- `idle`：静止/无动作

每类先采 30 段以上，最好换 2-3 个不同人、不同光照、不同距离。采集页面会在每段保存后提示质量，某一类达到 30 段时也会提示。导出的 JSON 可以上传到 AutoDL。

## 质检

上传 AutoDL 前，先在本地或 AutoDL 里跑一次数据质检：

```bash
python training/gesture/validate_dataset.py --data ai-opera-gesture-dataset.json --out artifacts/gesture_dataset_report.json
```

报告会检查每类样本数、样本帧长、手部/脸部关键点覆盖率、缺失类别和过短样本。基础目标是 6 个类别每类 30 段以上、每段不少于 8 帧；如果报告里的 `readyForTraining` 为 `false`，优先补采报告中提示的类别。

## 训练

AutoDL 上安装依赖后运行：

```bash
python training/gesture/train_gesture_tcn.py --data ai-opera-gesture-dataset.json --out artifacts/gesture_tcn
```

训练脚本默认会跳过采集页面软质检未通过的样本。确实想保留这些样本时再加 `--keep-failed-quality`。

输出：

- `gesture_tcn.pt`：PyTorch 权重
- `label_map.json`：标签映射
- `metrics.json`：训练/验证准确率

后续可以把模型导出 ONNX 或 TensorFlow.js，再接回前端实时推理。

## 数据格式

浏览器导出的 JSON 顶层为：

```json
{
  "version": 1,
  "exportedAt": "...",
  "samples": [
    {
      "label": "vertical_swipe",
      "frames": [
        {
          "faceBox": {"cx": 0.5, "cy": 0.5, "width": 0.2, "height": 0.3},
          "faceAnchors": [[0.5, 0.4, 0.0]],
          "hands": [[[0.3, 0.4, 0.0]]],
          "selectedHand": [[0.3, 0.4, 0.0]],
          "yaw": 0.0,
          "pitch": 0.0
        }
      ]
    }
  ]
}
```
