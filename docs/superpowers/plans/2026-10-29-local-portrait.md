# 纯本地人像修图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加无需密钥、无付费 API 的人脸区域定位、局部柔肤和肤色调整，允许手动修正。

**Architecture:** 复用现有原图坐标系、蒙版画笔、Worker、统一文档历史和草稿。按需在独立 Worker 中运行本地 Face Landmarker，结果只用于修图区域定位，不进行身份识别。模型与运行文件同源托管；人像效果在全局及已有局部调色之后、文字贴纸与边框之前处理。

**Tech Stack:** React、TypeScript、Canvas、Web Worker、IndexedDB，拟采用固定版本的 @mediapipe/tasks-vision 与配套 Face Landmarker 模型。

**Spec:** 本对话中用户确认的第三阶段缩减方案：纯本地人像识别、局部柔肤、肤色调整，不接付费云端服务，原有功能不变。

## Global Constraints

- 不引入账号、后端、照片上传、云端图像编辑或付费接口；现有文字 AI 保持不变。
- 首版定位脸部皮肤，不声称全身皮肤分割或身份识别。至多检测 5 张脸，可单独选中调整；检测不准时手动修正。
- 人像效果默认全为 0，不自动美白或改变原肤色；检测本身不修改照片颜色。
- 全中文状态、加载、失败说明；不支持、离线加载失败、无脸时仍可手动画区域。
- 模型首次加载需要流量，后续使用浏览器缓存；不承诺未缓存时完全离线，也不承诺托管无限免费。
- 保留精确版本、下载来源、SHA-256、模型许可和依赖版权；模型许可不能确证时暂停自动检测发布，不以框架许可替代模型许可。
- 所有生成文件留在项目；不删除用户文件，不动既有未跟踪文档与 QA 文件。
- 旧草稿兼容；模板不保存照片、蒙版、人脸位置；人像参数及区域只进文档历史与用户主动保存的草稿。

## Review Focus

1. 切照片、取消工具或返回首页后到达的检测结果不能写入新文档。
2. 侧脸、无脸、多脸及检测失败时不误套全图；保持手动入口。
3. 人像蒙版在旋转、翻转、拉直、裁剪后仍对应原脸，预览与导出一致。
4. 零强度像素不变，五官排除区和蒙版外不变化，透明度不被算法破坏。
5. 模型不从外部 CDN 执行，照片不进入网络；模型加载失败不影响现有编辑。

## Task 1: 固定模型资产与本地检测适配器

**Files:** 创建 `src/lib/portraitDetector.ts`、`src/workers/portraitWorker.ts`、`src/lib/portraitDetector.test.ts`、`public/models/portrait/NOTICE.md`；新增固定版本模型及同源 WASM 运行资产；仅为依赖/复制资产脚本修改 `package.json` 与锁文件。

**Interfaces:** `detectPortraits(image: ImageBitmap, signal: AbortSignal): Promise<DetectedFace[]>`；`DetectedFace={id:string;landmarks:{x:number;y:number}[]}`；结果归一化到原图方向校正后的坐标。Worker 使用 IMAGE 模式，最多 5 张脸，检测缩略图最长边 1280；转移 Bitmap，不传网络。适配器使用单个活动任务、请求编号，取消后忽略结果并释放 Bitmap。模型只在点击“识别人脸”后初始化。

- [ ] 写失败测试：模拟 Worker，验证成功、无脸、加载失败、取消后迟到消息、连续检测只应用最新任务；验证模型和 WASM 地址均基于 `import.meta.env.BASE_URL`。
- [ ] 运行 `npm.cmd test -- src/lib/portraitDetector.test.ts`，确认新增契约测试失败。
- [ ] 核对官方包/模型文档和实际许可，固定版本并记录哈希；编写同源资产复制步骤，在 GitHub Pages 构建中验证资产存在。
- [ ] 实现适配器及独立 Worker，CPU 路径可用，无 GPU 时不阻塞现有编辑；异常统一为中文。
- [ ] 重跑上述测试及 `npm.cmd run check`；在浏览器真实加载模型并验证样片能返回关键点。许可或真实检测失败则报告，不伪造通过。

## Task 2: 人脸区域与可修正蒙版

**Files:** 创建 `src/domain/portrait.ts`、`src/domain/portrait.test.ts`；扩展 `src/domain/creative.ts`、`src/lib/creativeRender.ts` 和 `src/components/MaskOverlay.tsx` 中相关蒙版路径，不改变现有三种蒙版语义。

**Interfaces:** `PortraitRegion={id:string;name:string;enabled:boolean;mask:PortraitMask;recipe:PortraitRecipe}`；`PortraitRecipe={smooth:number;brightness:number;temperature:number;tint:number;saturation:number}`，smooth 为 0～100，其余 -100～100；`PortraitMask={outline:Point[];exclusions:Point[][];strokes:MaskStroke[];feather:number}`；`createPortraitRegion(face:DetectedFace):PortraitRegion`；`CreativeState.portraits?:PortraitRegion[]`。自动轮廓来自脸部关键点，扣除双眼、眉部和嘴唇；手动模式初始空白蒙版，不能默认为全图。

- [ ] 写失败测试：合法轮廓、五官排除、多脸独立 ID、越界点过滤、无效关键点拒绝、默认零效果。
- [ ] 运行 `npm.cmd test -- src/domain/portrait.test.ts` 确认失败，再实现数据结构及关键点到多边形映射。
- [ ] 人像蒙版先栅格化脸部并羽化，随后按顺序应用补画/擦除，复用现有原图到输出仿射映射；提供检测失败时手动画皮肤入口。
- [ ] 浏览器像素测试：脸内有覆盖，五官排除处无覆盖，手动画/擦有效；旋转翻转拉直裁剪后覆盖同一原图点；原有画笔/渐变/径向回归通过。

## Task 3: 保边柔肤和肤色像素处理

**Files:** 创建 `src/lib/portraitMath.ts`、`src/lib/portraitMath.test.ts`；在人像相关路径扩展 `src/lib/creativeRender.ts`、`src/workers/imageWorker.ts`、`src/components/PhotoCanvas.tsx`。

**Interfaces:** `applyPortraitRecipe(source:Uint8ClampedArray,width:number,height:number,recipe:PortraitRecipe):Uint8ClampedArray`；`applyPortraitAdjustments(source,width,height,portraits:PortraitRegion[],geometry:ImageGeometry):Uint8ClampedArray`。颜色算法复用已有调色引擎；柔肤使用缩放一致的局部边缘感知平滑（亮度边缘权重），禁止简单全图模糊。效果仅按人像蒙版合成，保留原 alpha。

- [ ] 写失败测试：全零逐字节不变、纯色稳定、皮肤纹理减弱但强边缘保留、alpha 不变、每项颜色控制方向正确。
- [ ] 运行 `npm.cmd test -- src/lib/portraitMath.test.ts` 确认失败，实现算法及强度混合。
- [ ] 在共用渲染管线接入人像处理；普通预览、原尺寸导出、缩略图使用同一文档。旧文档无 portraits 时走原路径。
- [ ] 重跑算法测试；浏览器检查区域外逐像素不变、五官保护、预览/导出区域一致、20MB 原图处理不冻结界面。导出尺寸不因检测缩图而降低。

## Task 4: 人像工具、手动修正及历史草稿

**Files:** 创建 `src/components/PortraitPanel.tsx`；仅相关入口/状态接线修改 `src/App.tsx`、`src/styles.css`；新增 `src/App.test.tsx`、`src/lib/presetStore.test.ts` 中人像用例。

**Interfaces:** 新增主工具状态 `portrait`；手机“更多→人像修图”、桌面独立入口。面板提供识别人脸、选脸、添加手动区域、显示蒙版、补画/擦除、大小/羽化、柔肤和四项肤色控制、重置当前脸、应用/取消。原图坐标点绘制复用现有蒙版控件，进入该工具隔离比较/缩放/裁剪手势。每次连续滑动/笔画只提交一条历史。

- [ ] 写失败 UI 测试：检测状态明确、无脸提示且手动入口可用、多脸只改选中项、切工具/照片/首页使旧任务失效、取消恢复入口文档、撤销重做、键盘标签可访问。
- [ ] 运行 `npm.cmd test -- src/App.test.tsx` 确认失败后实现面板和接线；使用任务编号及源照片身份双重保护。
- [ ] 扩展草稿往返测试：保存人像区域、配方及修正笔画后恢复一致；旧草稿缺字段正常；模板备份无 portraits、无关键点、无模型资源。
- [ ] 运行上述测试与 `npm.cmd run check`，确认既有操作无回归。

## Task 5: 验收与发布

**Files:** 更新 `README.md` 的人像说明及版权入口；新增项目内人像验收脚本，截图与缓存放项目 `.deployment`、`node_modules/.cache`。

- [ ] 完整运行 `npm.cmd test`、`npm.cmd run check`、`npm.cmd run build`、`git diff --check`，记录实际结果。
- [ ] 浏览器验证 320/390/615/1440：画布可见、无横向溢出、选脸和手动修正可触达；检测与笔画不触发对比滑块；全套第一/二阶段脚本回归。
- [ ] 真实模型样片测试，并使用合成输入固定验证像素算法；无脸/模型缺失/不支持/取消/连续换图/存储失败均保留现有编辑。监控网络，基础修图没有照片请求，模型资源只有同源 GET。
- [ ] 检查许可和包内资产来源，完成一次最终独立审查，修复重要问题后复验；未解决项明确报告。
- [ ] 仅提交本次点名文件并沿用现有 GitHub Pages 发布流程；检查对应 SHA 的 Actions 成功后，再执行线上交互、模型加载、草稿和导出验收。不把本地通过等同于线上通过。

## 官方参考（实施时核对实际版本）

- Face Landmarker Web：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Face Mesh V2 模型卡（标注 Apache 2.0，需核对实际分发资产是否对应）：https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf

## Self-review

已覆盖免费约束、模型许可、按需加载、本地处理、脸部非身份识别、保边柔肤、手动修正、多脸、手势隔离、统一历史、旧草稿、模板排除、导出原尺寸、失败回退及分辨率验收。云端图像服务、身体塑形、全身皮肤分割、自动祛痘和生成式补绘均不在本阶段。
