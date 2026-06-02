# UV Templates

- `face_uv_template.png` 是标准人脸 UV 模板图；
- `face_uv_template_landmarks.json` 保存模板空间关键锚点；
- 每张脸谱需要对应 `public/legacy/anchors/{textureKey}.json`；
- `generate_face_uv.py` 会把平面脸谱图按照 anchors 展开到模板 UV 空间；
- 如果 `face_uv_template.png` 暂时不存在，脚本应使用 1024x1024 透明画布作为 fallback。
