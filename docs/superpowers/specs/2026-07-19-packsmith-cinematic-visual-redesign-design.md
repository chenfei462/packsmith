# Packsmith 电影级沉浸式视觉重构设计

## 目标

在现有 React、React Three Fiber、GSAP 和多路由架构上，将 Packsmith 重构为具有 Noomo 式电影感的产品体验。网站需要同时满足两点：第一眼具备强烈、精致、可记忆的视觉冲击；用户继续浏览后仍能清楚理解 Pack、Passport、六运行时安装计划与信任校验。

本次重构不复制 Noomo 的品牌与具体作品，而是吸收其全屏 3D、超大排版、滚动叙事、玻璃材质和连续镜头语言，并将其转译为 Packsmith 自身的“数字铸造厂”世界观。

## 核心概念

视觉母题为“电影级玻璃铸造厂”。一个透明的 Packsmith Passport 核心体贯穿所有路由，在不同页面中连续变形：

- Home：碎片被吸附、校验并铸造成完整 Pack。
- Registry：核心体展开成 53 个 Pack 节点组成的空间星图。
- Pack detail：星图收束成分层 Passport 检查仪。
- Docs：检查仪延展成带有光流的六阶段数据管线。

路由切换不重新展示无关 loading 动画，而是由同一个 3D 主体完成形态过渡。每个页面有独立构图，但材质、光源和运动规律保持一致。

## 视觉语言

### 色彩

- 背景：近黑色 `#050608`，局部使用冷灰蓝雾化层，不使用大面积蓝紫渐变。
- 主文字：冷银白 `#F2F5F7`。
- 次级文字：高对比雾灰 `#A6AFBA`。
- 主能量色：电青 `#35E5D1`。
- 风险与热能色：珊瑚橙 `#FF6A3D`。
- 稀有强调：极少量虹彩折射，限定在玻璃边缘和选中状态。

背景保持深黑，但不能是一块平面纯色。空间层由微尘、体积雾、极细网格、镜面反射和远景结构构成。装饰光斑不得脱离 3D 物体独立漂浮。

### 排版

- Display：继续使用 Archivo Black，但降低无差别粗重感，主要用于首页 H1、页面章节数字和关键动词。
- Body：IBM Plex Sans；数据、校验和命令使用 IBM Plex Mono。
- H1 在桌面端控制在视口宽度的 42%-70%，通过换行与构图形成电影片头感，不使用 viewport 驱动的连续字号缩放。
- 页面首屏文案不放入卡片；标题直接与 3D 主体叠合，保留下一节内容提示。
- 正文行宽控制在 46-64 个字符，信息区恢复工具产品应有的扫描效率。
- 字间距为 0，不使用负字距。

### 材质

- 主体：烟黑玻璃、冷银阳极氧化金属、透明树脂、发光蚀刻线路。
- 玻璃采用真实厚度感、边缘色散、低强度粗糙反射，而不是普通半透明卡片。
- 玻璃 UI 仅用于 Passport 层、筛选托盘和浮动检查器；普通内容区不套玻璃卡。
- 圆角限制在 3-8px，避免大圆角 SaaS 卡片风格。

## 页面设计

### Home

首屏为全屏无边框 3D 场景。Passport 核心体位于画面右中区域，由 48-72 个金属与玻璃碎片构成。H1 左对齐覆盖在场景前方，文案只保留产品名、字面价值和两个命令入口。

首屏滚动过程分为四个镜头：

1. 碎片从远景聚拢，形成未完成 Pack。
2. 六条运行时轨道接入核心体，展示一次编写、六种安装计划。
3. 扫描光穿过 Passport 层，风险、权限和 checksum 依次显影。
4. 核心体完成封装并向 Registry 方向展开。

后续内容以全宽场景带组织，不使用重复卡片网格。Demo 控件成为悬浮在场景下方的精密操作台，命令、风险和运行时信息随步骤切换。

### Registry

核心体拆解为 53 个 Pack 节点，节点以非均匀空间轨道分布。搜索和筛选时，节点从当前位置平滑重排，不全部淡出重进。选中节点向镜头移动并打开微型 Passport 标签。

DOM 结果列表仍是信息权威来源，但视觉上改成横向技术索引：细分隔线、固定列节奏、紧凑行高、清晰 hover/focus 扫描光。筛选器成为横跨页面的玻璃控制台，不制作多个独立输入卡片。

### Pack Detail

Pack 节点移动至画面中心并展开成六层 Passport：Identity、Publisher、Permissions、Risk、Writes、Verification。滚动经过每个内容段时，对应 3D 层沿 Z 轴抽出并被扫描光照亮。

目标运行时选择器直接驱动 3D 轨道和写入路径变化。命令复制完成时只触发一次短促能量闭环，不使用庆祝型装饰动画。

### Docs

场景为一条从左后方进入、向右前方离开的透明数据管线。六个文档主题对应六个结构不同的节点。桌面侧边导航控制镜头沿管线移动；移动端下拉选择控制同一状态。

正文区采用编辑式版面：大章节编号、清晰摘要、命令带与来源链接。章节切换时当前节点亮起、光流穿过、相邻节点进入浅景深，不将正文放在玻璃卡片中。

## 动效系统

### 页面进入

- 0-180ms：环境光和主体轮廓建立。
- 160-700ms：标题按行切入，位移不超过 36px。
- 260-1000ms：3D 主体完成第一段镜头动作。
- 600ms 后：次级信息和操作控件进入。

### 滚动

- GSAP ScrollTrigger 负责章节时间轴、标题拆分和镜头关键帧。
- 原生滚动为基础；只有在桌面高性能模式启用轻量阻尼，避免破坏浏览器回退、键盘和可访问性。
- 进入视区的内容以位移、遮罩和轻微景深变化为主，不让正文长时间处于 `opacity: 0`。
- 3D 镜头移动与 DOM 内容共用归一化 progress，路由切换时必须清理 ScrollTrigger 和 listener。

### 鼠标与触摸

- 桌面鼠标产生 1.5-3 度视差和局部光源偏移。
- 可点击 3D 节点必须同时存在 DOM 控件，不依赖 hover 才能操作。
- 移动端使用触摸拖动观察主体，但不劫持垂直滚动。

### 路由过渡

路由过渡持续 650-900ms。当前场景先收束为 Passport 核心体，新场景再从核心体展开。标题与场景使用同一个 easing，但 DOM 路由内容在语义上立即可用。浏览器后退与直接深链必须得到相同最终构图。

## 3D 技术方案

- 保留 React Three Fiber 和 Three.js。
- 为玻璃主体增加 MeshPhysicalMaterial，控制 transmission、thickness、ior、roughness 与 chromatic aberration。
- 使用少量自定义 GLSL 实现扫描光、边缘蚀刻与管线能量流，不将整个页面依赖于复杂 shader。
- 后处理仅使用低强度 Bloom、轻量色差和可关闭的 Depth of Field。
- 主场景继续保持单 Canvas、单 Experience root、按路由形态切换。
- 复杂玻璃体优先使用程序化几何与 instancing；外部 GLB 仅用于无法合理程序化的核心物件。

## 性能与降级

- High：完整玻璃折射、体积雾、Bloom、DOF、64-96 粒子。
- Balanced：降低 DPR、移除 DOF、缩减粒子与折射采样。
- Low：保留主体几何、扫描线和基础灯光，禁用昂贵后处理。
- Reduced motion：镜头使用固定稳定构图，章节切换即时完成，保留材质和信息层次。
- No WebGL：使用相同构图的 CSS 玻璃核心体与静态光轨，不显示与页面无关的通用占位图。
- 移动端：粒子不超过 36，DPR 上限 1.5，玻璃折射层不超过 3，避免透明层过度叠加。

## 生图提示词

生成结果用于纹理、氛围底图和 Passport 展示图，不直接替代可交互 3D 主体。所有图片要求无文字、无品牌 Logo、无 UI 按钮，以便页面叠加真实内容。

### 1. 玻璃 Passport 核心体

中文：

> 电影级产品视觉，一枚悬浮在纯黑空间中的未来数字护照核心体，烟黑透明玻璃与冷银金属框架，多层透明薄片沿 Z 轴展开，内部有精密电青色蚀刻线路与少量珊瑚橙校验光，真实厚度、边缘折射、微弱虹彩色散、工业设计摄影、Octane Render、超高细节、干净锐利、主体完整可见、中央偏右构图、黑色留白背景，无文字，无 Logo，无人物，无紫色主色，16:9

English:

> cinematic product visualization of a futuristic digital passport core floating in pure black space, smoked transparent glass and cold silver anodized metal frame, multiple glass layers separated along the Z axis, intricate electric cyan etched circuits inside, restrained coral-orange verification beam, realistic thickness, edge refraction, subtle iridescent dispersion, premium industrial design photography, Octane render, ultra detailed, sharp and clean, full object visible, object placed slightly right of center with generous black negative space, no text, no logo, no people, no dominant purple, 16:9

### 2. 六运行时轨道

中文：

> 六条精密发光轨道连接到一个透明玻璃核心体，轨道由冷银金属、透明管线和电青能量流构成，少量橙色状态节点，空间深度明显，黑色电影背景，低调体积雾，工程美学与高级科幻产品设计，真实光照，无文字，无图标，无 Logo，无人物，宽幅 21:9

English:

> six precision luminous runtime rails converging into a transparent glass core, cold silver metal, clear conduits and electric cyan energy flow, sparse coral-orange status nodes, strong spatial depth, cinematic black environment, restrained volumetric haze, premium engineering aesthetic and high-end sci-fi product design, physically based lighting, no text, no icons, no logo, no people, ultra-wide 21:9

### 3. Registry 空间星图

中文：

> 深黑空间中的高级三维软件包目录星图，53 个大小不一的玻璃与金属节点沿非均匀轨道分布，节点之间有极细电青连接线，少量橙色高风险节点，前景清晰、远景浅景深、精密信息可视化、克制而震撼、真实 3D 渲染，无文字，无 UI 卡片，无行星，无人物，无 Logo，16:9

English:

> premium three-dimensional software package constellation in deep black space, 53 varied glass and metal nodes distributed across asymmetric orbital paths, hairline electric cyan connections, sparse coral-orange high-risk nodes, crisp foreground with shallow depth of field in the distance, precise information visualization, restrained yet spectacular, photoreal 3D render, no text, no UI cards, no planets, no people, no logo, 16:9

### 4. Docs 生物荧光数据管线

中文：

> 一条透明烟黑玻璃数据管线穿过黑色空间，六个精密结构节点，电青光流在管线内部运动，局部珊瑚橙校验环，融合生物荧光流体与工业机械设计，细腻折射、微尘与体积光，画面左后方进入右前方离开，留出正文叠加空间，无文字，无 Logo，无人物，16:9

English:

> transparent smoked-glass data pipeline traveling through black space, six precision structural nodes, electric cyan light flowing inside the conduit, selective coral-orange verification rings, a fusion of bioluminescent fluid and industrial mechanical design, delicate refraction, micro dust and volumetric light, entering from the rear left and exiting toward the front right, generous space for editorial copy, no text, no logo, no people, 16:9

### 5. 金属与玻璃材质纹理

中文：

> 无缝 PBR 材质图集，烟黑透明玻璃、冷银拉丝金属、极细电青蚀刻线路、少量珊瑚橙热能痕迹，工业级精度，正交俯视，无透视，无阴影，无文字，4K，方形

English:

> seamless PBR material atlas featuring smoked transparent glass, cold silver brushed metal, ultra-fine electric cyan etched circuitry and sparse coral-orange thermal traces, industrial precision, orthographic top view, no perspective, no cast shadows, no text, 4K, square

### 6. Passport 终端展示图

中文：

> 高端电影级终端设备特写，一块超薄透明玻璃显示面板嵌入冷银金属底座，屏幕内部只有抽象数据行、校验轨迹和六条运行时路径，不出现可读文字，电青主光、橙色警示光、黑色摄影棚背景、真实产品摄影、细腻反射、锐利焦点，无人物，无 Logo，16:9

English:

> premium cinematic terminal device close-up, ultra-thin transparent glass display embedded in a cold silver metal base, abstract data rows, verification traces and six runtime paths inside the display with no readable text, electric cyan key light, restrained coral-orange warning light, black studio environment, photoreal product photography, refined reflections, sharp focus, no people, no logo, 16:9

## 验收标准

- 四个路由首屏都必须在第一视口明确呈现 Packsmith 产品主题与独立 3D 构图。
- 首页 H1、3D 主体和主要操作在桌面及 375px 移动端不重叠。
- 页面不依赖重复卡片墙或装饰性渐变球来制造层次。
- 每个路由至少有一段由滚动或产品状态驱动的 3D 形态变化。
- 路由切换保持单 Canvas，并且不会留下重复 listener、ScrollTrigger 或场景资源。
- reduced-motion、低性能和无 WebGL 模式仍保留相同信息结构与视觉母题。
- 所有正文、按钮和状态文本符合 WCAG AA 对比度，键盘焦点可见。
- 375、768、1024、1440 宽度无横向溢出、文字遮挡或不可操作控件。
- 首页、Registry、Pack detail、Docs 均通过实际浏览器截图和 Canvas 非空检查。

## 不包含范围

- 不复制 Noomo 的 Logo、作品资产、文案或专有 3D 模型。
- 不引入营销 CMS、账号系统、后端 API 或新的 Pack 数据源。
- 不用生成图片替代需要实时响应的核心 3D 场景。
- 不为了视觉效果破坏现有路由、深链、Passport 数据真实性或 CLI 边界。
