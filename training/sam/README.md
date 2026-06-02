# AI-Opera SAM 遮挡增强路线

当前网页已经用 MediaPipe Hands 凸包做本地遮挡，并增加了时序平滑和羽化边界。后端新增 `POST /api/ai/sam/segment`，用于接入外部 SAM/SAM2 服务。

## 本机无 GPU 时

- 前端继续实时运行，使用手部关键点多边形遮挡，不依赖大模型。
- 后端返回 `provider=local-sam-fallback`，可用于答辩说明“已预留 SAM 分割升级接口”。

## 接入 AutoDL/SAM 服务

1. 在 AutoDL 上启动一个 HTTP 服务，接收：
   - `imageBase64`
   - `prompts[].positivePoints`
   - `prompts[].box`
   - `faceBox`
2. 服务返回：
   - `segments[].maskBase64` 或 `segments[].polygon`
   - `segments[].confidence`
   - `segments[].class = hand_occluder | person | face_boundary`
3. 本项目 `.env` 配置：
   - `AI_SAM_SERVICE_URL=http://你的服务地址/segment`
   - `AI_SAM_PROVIDER=sam2-autodl`

## 推荐优化目标

- 手遮脸时让手真实压在面罩前面。
- 面罩边界在脸颊、下巴、额头处更贴合。
- 多人/背景干扰时，稳定区分主体人物、手部和脸谱面罩。
