# 光调本地人脸检测资源

仅用于定位修图区域，不识别身份、不上传照片。模型与运行库由当前网站同源提供。

## 模型

- 原始资产（未修改）：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- 版本：float16/1；长度：3,758,596 字节。
- SHA-256：64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff
- 官方任务说明：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- 官方说明将模型包的组件映射至以下模型卡；它们注明 Apache License 2.0：
  - FaceMesh V2：https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
  - FaceDetector：https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf
  - Blendshape：https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- 本应用关闭表情系数输出。模型对遮挡、侧脸、远距离、暗光可能失败；允许用户手工修正。

## 运行库

MediaPipe Vision Tasks，Google，@mediapipe/tasks-vision 固定版本 0.10.32，Apache-2.0。
官方源码：https://github.com/google-ai-edge/mediapipe/tree/v0.10.32
包的完整性由 pnpm-lock.yaml 记录。构建脚本将原始 vision_bundle.cjs（仅改文件扩展名）和 WASM 原样复制至此目录；保留其内置版权声明。运行资产为约 22MB，首次加载有网络流量，此后由浏览器缓存管理。

完整 Apache 2.0 及上游附加许可见 [LICENSE.txt](./LICENSE.txt)。
