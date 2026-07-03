## [LRN-20260703-001] correction

**Logged**: 2026-07-03T10:13:37+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
The PTO tiling workbench should reuse the Ascend 950 standard frame from `feature_taxonomy.html`, not rebuild an inline variant from trace metadata.

### Details
用户纠正 tiling 硬件可视化工作台右侧架构图：该页面确实应该用 950 架构图，但标准来源是 `/Users/yin/pto/ascend-950-workbench-demo/feature_taxonomy.html` 右侧实际使用的 `hardware-frame.html`。错误做法包括两种：根据 fixture `arch.npuArch = dav-2201` 把右侧图动态切到 910B baseline；或者只在 tiling 父页面 inline 调 `PtoMemoryArchitecturePattern.renderArchitecture()`，导致与标准 frame 的尺寸、背景、focus 协议、details 行为漂移。正确做法是让业务页复用标准 `hardware-frame.html?preset=ascend950b`，并通过 `hardware-focus` / `hardware-details` / `hardware-scale` postMessage 协议驱动它。

### Suggested Action
后续处理 PTO 产品页引用 950 架构图的“版本不对”问题时，先查用户指出的标准业务页和 frame 协议，再决定是否更新 shared pattern。不要只根据 trace 元数据切 preset，也不要在另一个业务页复制/重建一套 inline 架构图。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/tiling/index.html, /Users/yin/pto/tiling/src/app.js, /Users/yin/pto/ascend-950-workbench-demo/feature_taxonomy.html, /Users/yin/pto/ascend-950-workbench-demo/hardware-frame.html
- Tags: correction, pto, tiling, memory-architecture, cache-busting

---

## [LRN-20260703-002] correction

**Logged**: 2026-07-03T10:58:59+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
PTO hardware architecture patterns must keep route geometry self-contained in pattern preset data and avoid business-page-only hidden anchors.

### Details
用户指出 Ascend 950 pattern 图里的 `UB→L1` 连线和 AIV2 顶部 `MTE2` lane 不对。根因是 `memory-architecture` 的 950 route preset 把 `aiv2-to-aic` lane 锚到了 `.pto-mem950__notes`，但标准 iframe frame 会隐藏 notes，导致 route 被拉到错误区域；同时 AIV2 的 `l2-to-aiv2-dcache`/`l2-to-aiv2` target bias 太靠上，视觉上压到 core title 区。后续用户又指出 tiling iframe 底部 AIV 被裁剪，根因是产品页 iframe 按 `100% / scale` 反算高度，只覆盖当前 pane 的内部 viewport，没有消费 `hardware-frame.html` 已发出的 `hardware-size` 完整画布尺寸。pattern 的可复用合同没有明确禁止 route 依赖业务页隐藏元素，也没有把 standard frame 的完整 iframe size + pan/fit 验证作为 pattern 验证项。

### Suggested Action
后续修改 PTO hardware architecture 图时，先在 `patterns/memory-architecture/pattern.js` 修 preset route 数据，再同步 `pto/vendor/pto-design-system`。950 route 不得依赖 `.pto-mem950__notes` 或任何业务页可能隐藏的 DOM anchor；AIV2/AIC/AIV1 的 MTE lane 要在 dedicated preview 和标准 `hardware-frame.html` iframe 两处验证。业务页 iframe 应通过 postMessage/focus/size 协议和外层 pan/scale 控制复用标准 frame，不要复制一套不完整的 inline 图；iframe 宿主必须把 `hardware-ready`/`hardware-size` 的完整 width/height 写回外层 CSS frame size，不能用 pane 高度反推 iframe 高度。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto-design-system/patterns/memory-architecture/pattern.js, /Users/yin/pto/vendor/pto-design-system/patterns/memory-architecture/pattern.js, /Users/yin/pto/ascend-950-workbench-demo/hardware-frame.html, /Users/yin/pto/tiling/src/app.js
- Tags: correction, pto, memory-architecture, route-geometry, iframe-pan, ascend-950

---

## [LRN-20260624-001] correction

**Logged**: 2026-06-24T03:55:40Z  
**Priority**: high  
**Status**: promoted  
**Area**: frontend

### Summary
PTO launch pages should use stable card ratios, polished product-level title copy, and category structure instead of noisy tag piles.

### Details
User corrected the `launch_test.html` React conversion: card proportions changed from the previous square preview feel; the page title/subtitle sounded like draft/test copy; and every card showed many tags that reduced readability and looked visually noisy. For PTO launch/index pages, information architecture should come from clear section grouping, card titles, and a small number of meaningful actions. Avoid decorative or low-value tags.

### Suggested Action
When designing PTO launcher pages, keep card dimensions stable with explicit aspect ratios, use finished navigation copy rather than "test/demo/draft" phrasing, remove nonessential tag chips, and reserve badges only for true status or decision-critical metadata. Treat Apple/Google-style launch IA as sparse, scannable, section-led, and action-oriented.

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/launch_test.html, /Users/yin/pto/CLAUDE.md
- Tags: correction, pto, launch, information-architecture, cards, tags
- Promoted: /Users/yin/pto/CLAUDE.md

---

## [LRN-20260701-001] correction

**Logged**: 2026-07-01T16:10:48+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
PTO IDE-frame pages must preserve the exact shared IDE chrome behavior and user-approved architecture viewport defaults.

### Details
用户多次纠正 PTO 页面迁移到 `patterns/ide-frame` 时的偏差。后续处理 `/Users/yin/pto/*` 下 IDE/workbench 页面时，不能只“看起来像” IDE frame，必须逐项满足：

- Activity rail 必须可见并使用 shared `ide-frame` 的 4 个 SVG icon 结构：Explorer、Search、Source control、Terminal；不能用文字、emoji、改过的文件图标或浏览器默认 button 白底。
- Topbar 保持精简一致：英文页面标题；右上角只放必要 icon 控制。Inspector icon 必须可反复点击打开/关闭。若用户要求 light mode，可加一个 theme icon，但不要恢复多余 reset/theme/tag controls。
- 页面默认不应选中业务对象，不应默认 dim 架构图。Diff/path/tag highlight 默认关闭，只有用户点击具体对象或步骤后再聚焦。
- 架构图默认需要按用户指定缩放并左右/上下居中；`a3-a5-migration` 当前要求 40%，`ascend-950-workbench-demo` 当前要求 55%。缩放限制不要禁用按钮；拖拽平移和滚轮/缩放应生效。
- `ide-frame` cursor tracking 要启用：`data-cursor-dots="true"`，鼠标移动时同步 `--ide-cursor-x/y`、`--ide-cursor-alpha`、`--ide-dot-opacity`，离开 frame 后归零。
- Light/dark mode 通过 design-system `data-theme` tokens 切换，避免局部深浅混搭；切换后架构 overlay 需要重绘，当前缩放/居中不能漂移。
- 对每个页面完成后必须打开预览让用户 review，通过后再继续下一个页面。

### Suggested Action
下次处理 PTO IDE/workbench 页面前，先读 `patterns/ide-frame`、`patterns/workbench-shell` 合同，然后按上述 checklist 做结构、默认状态、交互、light/dark、cursor tracking 和 Playwright 验证。不要等用户截图指出后再补。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/a3-a5-migration/index.html, /Users/yin/pto/a3-a5-migration/app.js, /Users/yin/pto/a3-a5-migration/styles.css, /Users/yin/pto/ascend-hardware-map/ascend-hardware-map-v3.html
- Tags: correction, pto, ide-frame, cursor-tracking, architecture-viewport, light-mode

---

## [LRN-20260630-001] correction

**Logged**: 2026-06-30T14:44:57+08:00
**Priority**: critical
**Status**: pending
**Area**: infra

### Summary
For `/Users/yin/pto`, submit and push project work to `main` only; do not push the current feature branch by default.

### Details
用户纠正：本项目 GitHub 提交必须落到 `main`，其它远端分支应删除，不能因为当前 checkout 在 feature branch 就直接 `git push`。本次错误是把 `Update Pangu MoE monitor charts` 先推到了 `mem-viewer-arch-zoom`，随后才 cherry-pick 到 `main` 并删除远端非 main 分支。

### Suggested Action
后续在 `/Users/yin/pto` 执行 commit/push 前必须先确认 `origin/main` 是目标；如果当前 worktree 不在 `main` 或有脏工作区，使用临时 worktree 基于 `origin/main` 提交并 `push origin HEAD:main`。推送完成后确认 `git branch -r` 只剩 `origin/main`，不要把当前分支作为默认 upstream 推送。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html
- Tags: correction, git, branch-policy, pto, main-only

---

## [LRN-20260625-004] correction

**Logged**: 2026-06-25T19:37:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Flat 3D architecture view labels should attach to model objects instead of being laid out as separate external annotations.

### Details
用户纠正 Pangu MoE trainviz 正视/侧视标签：外部 row labels 看起来可以解决拥挤，但它们不随 3D 对象的位置、遮挡、缩放、相机切换一起变化，反复微调 x/y 仍会错位。正确方向是复用 3D 模型节点/cluster 自带的 label，让文字和对象绑定；前视/侧视只切换这些内置 label 的可见性、朝向和缩放。侧视可保留 hidden-state 参照线/hover tip，但算子名称不要另做一套右侧排版。

### Suggested Action
后续 3D 模型图的 flat camera view 中，优先用对象自带 label。只有非对象性的解释信息才用 view-only annotation；如果 annotation 不是绑定到具体 mesh 的标签，必须单独说明它是辅助说明，不要拿它替代算子名称。验收时检查切换 iso/front/right 后 label 是否仍贴在对象上。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html
- Tags: correction, pto, threejs, 3d-labels, camera-view, data-viz
- See Also: LRN-20260625-003

---

## [LRN-20260625-003] correction

**Logged**: 2026-06-25T19:12:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Pangu 3D architecture labels must be validated in each target camera view/theme, and weight nodes should use neutral gray.

### Details
用户纠正 Pangu MoE trainviz 正视图：正视图文字标注也需要单独处理，不能沿用轴测/侧视里看起来可读的标签位置；顶部工具条和底部播放条会遮挡正视图默认取景下的结构标签。正视图也不能只放 `Input/Dense/MoE/Final` 四个高层分组标签，必须按横排补齐主要算子行（MLA、Pre-RMSNorm、Router、All-to-All Dispatch/Combine、Expert Pool + Shared Expert、Post-MLP RMSNorm、Final/LM Head/Logits）。另一个视觉要求是权重/参数相关节点应使用灰色填充，不能沿用算子语义色，否则会被误读成执行算子。

### Suggested Action
后续调整 3D 架构视图时，分别用 light/dark + iso/front/right 截图验收标签可读性和控件遮挡；front/right 应使用 view-specific label positions 和 camera targets。`io:parameter`、`*_weight`、`w_*` 等权重节点应统一中性灰填充，语义 palette 只用于算子/模块/通信。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html
- Tags: correction, pto, 3d-labels, camera-view, weights, data-viz

---

## [LRN-20260625-002] correction

**Logged**: 2026-06-25T19:05:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
PTO static-page vendor checks must cover both GitHub Pages and the currently served local worktree.

### Details
用户再次反馈 Pangu MoE trainviz “只剩框架没内容”。根因是 `op-rank-time.html` 已改为正确引用 `./vendor/three/...`，GitHub Pages/main 上也有这些 tracked vendor 文件，但当前本地工作树的 `pangu-moe-trainviz/vendor` 只有 animejs 和 swimlane，没有 `vendor/three`。本地 `http://127.0.0.1:8765/pangu-moe-trainviz/vendor/three/build/three.module.min.js` 返回 404，ES module import 中断，页面只剩静态 IDE 框架。

### Suggested Action
后续改 PTO 静态页面时，浏览器验收必须同时检查当前本地服务 URL 和最终 Pages URL：`requestfailed=[]`、无 4xx module/script 资源、无 console/page error，并确认核心 canvas/DOM 已创建。如果页面引用 repo-vendored 资源，应先用 `rg --files` 确认当前工作树也有对应文件；必要时从目标分支以非破坏方式恢复 vendor（如 `git archive` 解出指定 vendor 目录），不要只在临时 worktree 或 origin/main 验证。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html, /Users/yin/pto/pangu-moe-trainviz/vendor/three
- Tags: correction, pto, local-dev-server, static-assets, vendor, threejs
- See Also: LRN-20260625-001

---

## [LRN-20260625-001] correction

**Logged**: 2026-06-25T08:41:47Z
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
Before pushing PTO static pages to GitHub Pages, verify browser-loaded module/resource paths use tracked deployable vendor files, not local node_modules or sibling dev folders.

### Details
用户纠正 Pangu MoE trainviz 发布问题：页面在本地可工作，但 GitHub Pages 只显示框架没有 3D/泳道内容。根因不是 `swimlane-task` vendor 缺失，而是 `op-rank-time.html` 仍引用 `../hpc-topology-viewer-main/node_modules/three/...`。这些本地开发路径不会随 Pages 部署，导致 Three.js module 404、module script 停止执行，页面只剩静态框架。正确做法是引用 repo 中已跟踪并可在 Pages 上访问的 `./vendor/three/...`，并在 push 后用真实 Pages URL 检查 failed requests、console errors 和 canvas 是否生成。

### Suggested Action
后续修改或发布 PTO 静态页面前，必须检查 HTML/importmap/module imports/fetch/image URLs：禁止依赖未跟踪的 `node_modules`、本地 sibling project 路径或只在本机存在的资源。发布前用 Playwright 打开 GitHub Pages URL，验收 `requestfailed=[]`、无 4xx module/script 资源、无 console/page error，并确认核心 canvas/DOM 内容已创建。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html, /Users/yin/pto/pangu-moe-trainviz/vendor/three
- Tags: correction, pto, github-pages, static-assets, vendor, deployment

---

## [LRN-20260624-005] correction

**Logged**: 2026-06-24T15:01:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
When matching `@samasante/liquid-glass` examples, do not equate importing `<Glass>` material mode with achieving example-grade refraction.

### Details
用户纠正 launch_test 的 liquid glass 效果：页面虽然 vendored 了 `@samasante/liquid-glass` 并把卡片包进 `<Glass>` material mode，但视觉仍明显不像 examples。根因是 source examples 的明显折射主要来自 `refract={position-matched background copy}`、`brightnessInFilter`、强 `strength/bend/brightness` optics 和单独的 crisp overlay；而普通 material wrap 在深色背景、深色半透明卡片和截图内容上只产生较弱 live backdrop bend，容易被 CSS token background/shadow 掩盖。

### Suggested Action
后续要复刻 liquid-glass example 效果时，先读取对应 example，明确它使用 material mode、in-place、还是 `refract` copy mode。若目标是 Apple-like panel/card，应优先使用 `refract` 背景副本 + overlay 内容层，并减少页面自有 glass CSS 对折射的遮盖。验收时检查 DOM 中不仅有 `data-liquid-glass`，还要确认 optics 和 refraction source 与目标 example 一致。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/launch_test.html, /Users/yin/skills/liquid-glass/examples/GlassNotification.tsx, /Users/yin/skills/liquid-glass/examples/GlassContextMenu.tsx
- Tags: correction, pto, liquid-glass, refraction, frontend

---

## [LRN-20260603-001] best_practice

**Logged**: 2026-06-03T13:49:30+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO IDE 三栏标题区必须由同一层 `ide-frame` pane header 承载，不能把某一栏标题放进内嵌 pattern 的 toolbar 或 pane body。

### Details
在 `/Users/yin/pto/tiling` 的三栏 workbench 中，Source 和 Trace Visual 使用 `pto-ide-frame__pane-header`，但 Memory Architecture 的标题曾放在内部 `hardware-architecture-viewport` toolbar 中；该 toolbar 又位于 `pane-body` 和 module padding 内，导致三栏标题文字视觉高度不一致。正确做法是：IDE/workbench 页面的每个 pane title/meta/control row 都放在同层级的 `pto-ide-frame__pane-header`；如果某个 pane 还需要作为 pattern mount root，应让 pane 自身承载 pattern root class/id，或调整 JS mount root，而不是把标题下沉到 pattern 内部。

### Suggested Action
后续检查或迁移 PTO IDE / workbench 页面时，先核对所有 pane 标题的 DOM 层级、标题元素类型、line-height 和 body padding。嵌入 `hardware-architecture-viewport`、`memory-architecture`、graph、timeline 等 pattern 时，pattern 只能负责 pane body 内的渲染/交互；跨栏统一标题区由 `ide-frame` 负责。这个规则应补充到 `/Users/yin/pto-design-system/SKILL.md` 的 Workflow C / Compose without extra chrome。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/tiling/index.html, /Users/yin/pto/tiling/src/styles.css, /Users/yin/pto-design-system/SKILL.md
- Tags: best_practice, pto, design-system, ide-frame, pane-header, hardware-architecture-viewport

---

## [LRN-20260622-002] correction

**Logged**: 2026-06-22T16:35:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: frontend

### Summary
Liquid glass requests must distinguish real Liquid DOM/WebGPU rendering from CSS glass fallback.

### Details
用户指出 PTO launch 页“完全没有原版那种效果”“玻璃效果实现得不好”，随后又指出“折射的图是死的”。问题是第一版主要是 CSS `backdrop-filter` 和半透明卡片，视觉上更像普通玻璃拟态；第二版虽然接入了 Liquid DOM，但折射采样的是静态背景纹理。后续类似需求应先接入真实库或明确声明 fallback 的限制，并让被折射的 DOM/背景纹理持续运动和 repaint。

### Suggested Action
实现 liquid-dom 效果时优先验证 `GPUQueue.prototype.copyElementImageToTexture`、`navigator.gpu`、canvas 是否插入、`body` 是否进入 active 状态；如果要表现“液态”，还要验证折射源纹理在连续变化，例如每帧更新 `Html` 背景并 dispatch `paint` 事件。CSS fallback 只作为不可用时的降级，不能描述成原版效果。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/launch.html, /Users/yin/pto/js/launch-liquid-glass.js
- Tags: correction, pto, liquid-dom, glass, webgpu, fallback

---

## [LRN-20260622-003] correction

**Logged**: 2026-06-22T17:36:58+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
Liquid glass cards need visible refraction displacement and thickness cues, not just backdrop blur.

### Details
用户指出 PTO launch 页“卡片只有背景模糊效果，没有折射效果，玻璃看起来没有厚度”。问题是卡片视觉仍主要依赖 `backdrop-filter` 和同背景贴图叠加，缺少每张卡片独立的 lens/rim 采样偏移、边缘 prism 色散、厚玻璃暗边/高光；Liquid DOM 的 `spacing` 过大时也会把相邻卡片融合成一整块，削弱单卡边缘厚度。

### Suggested Action
实现卡片级 liquid glass 时，为每个卡片实时计算背景采样坐标，并至少分出 center lens、edge rim/prism、specular highlight 三类层；在 Liquid DOM 参数里优先保留独立卡片边缘，例如让 `spacing` 小于卡片 gap，并降低 `displacementBlur`，提高 `bezelWidth`、`displacementFactor`、`dispersion` 和 specular。验证时不要只看是否有 blur，要采样连续帧变量和截图确认边缘位移、色散、暗边厚度都可见。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/launch.html, /Users/yin/pto/js/launch-liquid-glass.js
- Tags: correction, pto, liquid-dom, refraction, glass-thickness, frontend

---

## [LRN-20260622-001] correction

**Logged**: 2026-06-22T11:27:56+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
TrainScope 3D World must preserve the UB fabric reference page and render model blocks/operators inside the main 3D Z axis.

### Details
用户纠正上一版方向：不应改动 `/Users/yin/pto/hpc-topology-viewer-main/ub-fabric-reference.html`；新训练可视化页应把模型 block 和算子直接画在 3D 世界的 Z 轴上，而不是用左侧“模型结构轴”面板和底部 front/right wireframe 视图解释。`ub-fabric-reference` 只作为 node/card/rank 分层参考，真实产品表达应是 XY rank grid + Z block/operator stack 的同一个主场景。

### Suggested Action
后续修改 `/Users/yin/pto/pangu-moe-trainviz/trainscope-3d-world.html` 时，先冻结参考页状态；移除左侧模型结构轴和底部投影视图，把 block/operator、PP block range、MoE router/expert/shared expert、weight shard 和 runtime activation/gradient/token routing 直接绑定到 3D scene 中。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/trainscope-3d-world.html, /Users/yin/pto/pangu-moe-trainviz/js/3d-world.js, /Users/yin/pto/pangu-moe-trainviz/css/3d-world.css, /Users/yin/pto/hpc-topology-viewer-main/ub-fabric-reference.html
- Tags: correction, pto, trainscope, 3d-world, model-block-z-axis

---

## [LRN-20260604-001] correction

**Logged**: 2026-06-04T10:08:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
Pass Cause Explainer 进入实现前，应先完成源码 schema 和播放语义方案，不能只凭 4 个 MVP 规则直接改 UI。

### Details
用户纠正两点：第一，染色模式按钮仍要保留且默认 Semantic；第二，当前播放看不懂，删除类 pass 在 After 图里只是“缺席”，局部高亮无法解释 reduce/remove 的因果。正确做法是先读完所有 PyPTO pass 源码，形成完整 pass schema，再设计分侧 diff、删除残影、rewire、count badge 和规则步骤 schema。

### Suggested Action
后续推进 `/Users/yin/pto/pass-ir/explain.html` 前，先产出优化 plan 和 schema：覆盖 44 个已注册 pass、PassManager runtime ordering、Before/After dump 命名映射、diff event groups、分侧 playback step。实现时保留 Color Mode 入口，默认 Semantic，并用 Before/After split 或 ghost overlay 表达 removed nodes。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pass-ir/explain.html, /Users/yin/pto/js/pass_cause_diff.js, /Users/yin/pto/js/pass_cause_playback.js, /Users/yin/gitcode/pypto-master/framework/src/passes/pass_mgr/pass_manager.cpp
- Tags: correction, pto, pass-ir, pass-cause, schema, playback

---

## [LRN-20260306-001] correction

**Logged**: 2026-03-06T09:40:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
用户纠正了“整网架构分解页可沿用本地文件/文件夹加载模式”的错误假设。

### Details
该页面没有可供用户本地加载的整网模型数据源。正确方案是：演示数据由前端静态编写并内置维护，不依赖用户上传本地模型文件或文件夹。

### Suggested Action
在 PRD、需求说明和后续实现中统一使用“前端内置静态数据”表述，移除“本地文件/文件夹加载”相关描述。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/DEEPSEEK_ARCHITECTURE_INTERACTIVE_PRD.md
- Tags: correction, scope, data-source

---

## [LRN-20260601-001] correction

**Logged**: 2026-06-01T16:07:35+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: frontend

### Summary
PTO architecture route labels must be positioned as part of route geometry, not left to overlap nearby hardware nodes.

### Details
用户指出 `UB→L1` tag 和 `Aux Scalar` 图元重叠，正确表达是把 tag 移到路径线上。修复时应优先扩展 shared `memory-architecture` route contract（例如 `labelDx` / `labelDy`），再对具体 route 做偏移，而不是用页面级绝对定位或改节点布局。

### Suggested Action
后续修改 PTO 架构图通路线标时，先检查 `routeGeometry()` 的 label point 生成逻辑，并通过 route 配置调整标签位置；保证标签贴近对应线段、不覆盖 AIC/AIV 图元。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/vendor/pto-design-system/patterns/memory-architecture/pattern.js
- Tags: correction, pto, memory-architecture, route-labels

---

## [LRN-20260530-004] correction

**Logged**: 2026-05-30T10:17:26+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO architecture viewport title/header regions must be borderless as well as transparent.

### Details
用户纠正 `ascend-hardware-map/ascend-hardware-map-v3.html` 和 `ascend-950-workbench-demo/feature_taxonomy.html` 的 architecture title 区仍残留 bottom border。即使背景已经透明，如果 toolbar 底边还存在，标题区仍会被视觉上切成独立 header。shared `hardware-architecture-viewport` pattern 应明确清掉 `.pto-hw-viewport__toolbar` 的 `border-bottom`，并用足够优先级压过页面本地 `.stage-head`、`.hw-toolbar`、`.panel-shell-header` 等规则。

### Suggested Action
后续验收 PTO architecture viewport 时，把“标题区是否和 dots 图面连续”拆成三项检查：无实色背景、无 bottom divider、统一 shared toolbar height。任一项来自页面本地 CSS 覆盖都应回到 shared pattern 处理。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.css, /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.json
- Tags: correction, pto, design-system, hardware-architecture, transparent-header, borderless-toolbar

---

## [LRN-20260530-003] correction

**Logged**: 2026-05-30T10:13:59+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO hardware architecture viewport title/header regions must be transparent over the same dotted root surface as the diagram stage.

### Details
用户纠正 `Ascend 950B Memory Architecture Pattern / 1 AIC + 2 AIV...` 这个标题区不应该是黑色背景；它应透出和下方图面一致的灰色 dots。根因是 dots 曾只画在 stage 上，后续即使移到 root，也会被页面局部 `.main-stage { background: var(--panel-shell-bg); }` 这类同级或后加载规则覆盖。正确 pattern 是在 `.pto-hw-viewport` 根容器绘制 dotted surface，让 `.pto-hw-viewport__toolbar` 和 `.pto-hw-viewport__stage` 都透明，并通过 shared `--pto-hw-viewport-toolbar-height` 统一标题区高度。

### Suggested Action
后续修改 PTO architecture viewport 时，先确认标题区和图面共用同一层 root dotted background；不要在页面局部给 architecture title/header 加实色背景或独立高度。若页面有 `.main-stage`、`.right-pane`、`.panel-shell-header` 等本地规则，必须检查 selector 优先级是否覆盖 shared pattern。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.css, /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.json
- Tags: correction, pto, design-system, hardware-architecture, viewport-background, transparent-header

---

## [LRN-20260525-001] correction

**Logged**: 2026-05-25T09:51:13+08:00  
**Priority**: high  
**Status**: pending  
**Area**: infra

### Summary
When the user expects a GitHub push to `main`, do not push the current checked-out branch just because it has an upstream.

### Details
The `ai-cpu-aicore` folder lived inside the larger `/Users/yin/pto` repository. I committed the folder correctly, but pushed the current branch `yin/pto/cannvisual` before confirming the requested target branch. The correct repair was to create a temporary worktree at `origin/main`, copy only `ai-cpu-aicore/`, commit on top of `main`, and push `HEAD:main`. Since `main` and the current branch had diverged significantly, a direct `670b699:main` push would have pulled unrelated branch history into `main`.

### Suggested Action
For Git push requests in this workspace, treat GitHub as main-only unless the user explicitly says otherwise. Confirm the intended target branch from user context before pushing. If the target is `main` but the current branch is different, use a clean worktree or equivalent path-limited commit on top of `origin/main`, then push `HEAD:main`.

### Metadata
- Source: user_feedback
- Related Files: ai-cpu-aicore/
- Tags: correction, git, github, branch-target, main, main-only

---
## [LRN-20260519-001] correction

**Logged**: 2026-05-19T15:05:20+08:00
**Priority**: medium
**Status**: pending
**Area**: docs

### Summary
PTO 的旧 `button-preview.html` 已改名为 `design-system-preview.html`。

### Details
用户纠正说 `button-preview.html` 这个页面已经改名。后续 PTO 设计系统、pattern 抽取、模块 onboarding、memory architecture diagram 相关流程，不应再读取或更新 `/Users/yin/pto/button-preview.html`。当前正确入口是 `/Users/yin/pto/design-system-preview.html`；共享目录对应入口是 `/Users/yin/pto/design-system-share/design-system-preview.html`。

### Suggested Action
后续使用 PTO 相关技能时，把 `design-system-preview.html` 当作设计系统预览/目标状态参考；不要因为旧 skill 文档记忆再尝试打开或更新 `button-preview.html`。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/.codex/skills/pto-pattern-extractor/SKILL.md, /Users/yin/.codex/skills/pto-module-onboarding-to-design-system/SKILL.md, /Users/yin/.codex/skills/pto-mem-architecture-diagram/SKILL.md
- Tags: correction, pto, design-system, preview, renamed-file

---

## [LRN-20260519-002] correction

**Logged**: 2026-05-19T15:34:48+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
PTO Graphviz colormap 应在颜色分配算法阶段统一输出亮度和饱和度，而不是在容器渲染层临时压暗。

### Details
用户指出 `Transformer Core` 背景过亮时，正确修复方向不是对容器背景单独做暗化/降饱和，而是让 colormap 本身输出同一 tone 的颜色。这样模块、算子、容器拿到的颜色来自同一套 hue 分配和统一 saturation/lightness 规则，避免出现某些颜色对白字对比不足、某些颜色异常抢眼的问题。

### Suggested Action
后续维护 PTO Graphviz/TorchVista 风格图时，把 hue 分配和 tone 归一化放在 `ptoBuildColorMap` / palette generation 这类算法入口；渲染层只消费颜色，不再为某个节点类型做局部补救。

### Metadata
- Source: user_feedback
- Related Files: graphviz/generate_deepseek_v32_source_graph.py, graphviz/deepseek_v32_source_graph.html
- Tags: correction, pto, graphviz, colormap, accessibility

---

## [LRN-20260309-001] correction

**Logged**: 2026-03-09T14:35:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
用户纠正了“计算链路锁定应放在底部独立 panel”这一交互方向。

### Details
对计算图问题定位来说，锁定一条节点的全部上下游，更合适的交互不是额外打开一个底部只读 panel，而是在原始计算图主画布中直接隐藏无关节点，并对剩余子图重新布局。这样用户仍然保留原有的缩放、平移、选择和详情操作语境，操作成本明显更低。

### Suggested Action
后续涉及“局部聚焦/路径锁定/子图分析”的功能时，优先采用原位聚焦、视图裁剪和重布局方案，避免引入割裂主工作流的附属 panel。

### Metadata
- Source: user_feedback
- Related Files: js/app.js, index.html, css/style.css
- Tags: correction, interaction, graph-focus, ux

---

## [LRN-20260309-002] correction

**Logged**: 2026-03-09T14:58:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: frontend

### Summary
链路锁定的退出入口应只在激活后出现，并放在主菜单附近做高显著提示。

### Details
把“退出 lock”入口放在图标题区域且样式不够显著，容易导致两个问题：一是未激活时存在感过强，形成误导；二是触发后用户难以在主操作区附近快速发现退出路径。更合适的方案是将其放在主菜单右侧，并在未锁定时强制隐藏，激活后以主按钮样式展示。

### Suggested Action
后续新增“模式退出”类操作时，默认遵循“未激活强隐藏、激活后近主入口显示、样式高显著”的规则。

### Metadata
- Source: user_feedback
- Related Files: index.html, css/style.css, js/app.js
- Tags: correction, ux, visibility, toolbar

---

## [LRN-20260309-003] correction

**Logged**: 2026-03-09T15:10:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
用户要求后续所有需求必须先给出 plan，并在确认后再执行。

### Details
此前在收到明确需求后会直接进入实现，这与用户当前偏好的协作方式不一致。后续在该工作区内，收到任何新需求时，应先输出简明 plan，等待用户确认，再开始修改代码或文档。

### Suggested Action
将“先 plan、后执行”作为当前用户的显式协作约束，在后续请求中默认遵守，除非用户明确改回允许直接执行。

### Metadata
- Source: user_feedback
- Related Files: .learnings/LEARNINGS.md
- Tags: correction, collaboration, planning

---

## [LRN-20260311-001] correction

**Logged**: 2026-03-11T14:12:10+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
仅把竖向视图的渲染引擎切到 AntV 还不够，必须同时继承 viewer 的 compact op 视觉语言并控制整网边信息密度。

### Details
这次用户明确否定了首版 AntV 竖向实现，原因不是“没换引擎”，而是“视觉语言断裂且不可读”：算子 pill 没有继承 compact op 样式、布局挤在一起、tensor edge label 仍然有描边。说明后续凡是替换图引擎或布局算法，不能只追求功能等价，还要保证节点样式、信息密度和阅读节奏与现有 viewer 语义保持一致。

### Suggested Action
后续涉及计算图渲染迁移时，优先复用已有节点 DOM/CSS 组件，再做布局替换；边上的 tensor 信息默认采用无边框、低密度、摘要式展示。

### Metadata
- Source: user_feedback
- Related Files: visual-test.html, js/antv-flow.js, js/renderer.js
- Tags: correction, antv, compact-op, readability, edge-label

---

## [LRN-20260311-002] correction

**Logged**: 2026-03-11T15:02:00+08:00  
**Priority**: high  
**Status**: pending  

## [LRN-20260313-001] correction

**Logged**: 2026-03-13T16:40:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
面向用户的分析文档不能默认按开发者速记方式写，必须优先照顾产品经理和入门开发者的阅读路径。

### Details
这次用户明确指出两类问题。第一，文档默认读者并不是 CANN/算子开发者，因此像 AST、IR、Liveness、Lazy Execution 这类术语不能直接使用，必须先基于官方文档给出定义和通俗解释。第二，文档在表达上不能拆成过多碎 bullet，否则会让非技术读者失去主线。更合适的写法是：先讲背景，再讲概念，再结合真实案例逐步解释，并用少量结构化列表辅助理解。

### Suggested Action
后续在当前工作区撰写面向用户的技术分析文档时，默认遵循以下规则：先交代读者假设；术语首次出现必须解释；优先使用连续段落和示例代码块；只有在确实需要枚举时才使用 bullets；官方文档定义和真实案例必须并列呈现。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/developer_doc_zh.md
- Tags: correction, docs, readability, pm-audience, terminology

---
**Area**: frontend

### Summary
为了解决 tensor 标签重叠，不能把整网 edge tensor 信息默认全部隐藏；至少要保留稀疏边的可见摘要，并给 edge 明确的 hover hitbox。

### Details
这次根据 TensorBoard 思路把 edge tensor 信息切成“默认隐藏、交互揭示”后，用户立即反馈“tensor 全部不见了，hover edge 也没反应”。问题说明两点：第一，TensorBoard 的降噪策略不能机械照搬到当前 viewer，当前场景仍需要让稀疏边保持基础可见性；第二，AntV/X6 的 1px edge 线本身不足以承担 hover 交互，必须提供显式的宽命中区，否则 tooltip 设计等于不存在。

### Suggested Action
后续做计算图 edge 降噪时，优先采用“稀疏边默认显示简短摘要、密集边 hover/select 展示、始终保留 tooltip 详情”的分级规则；同时默认给 edge 配透明宽 hitbox，而不是依赖细线本身承载 hover。

### Metadata
- Source: user_feedback
- Related Files: visual-test.html, js/antv-flow.js
- Tags: correction, tensor-edge, hover, hitbox, readability

---

## [LRN-20260311-003] correction

**Logged**: 2026-03-11T07:53:36Z  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
聚合视图按钮如果被接成 `data-mode`，会让 grouped/aggregate 功能在 UI 上看起来像消失了，即使底层逻辑还在。

### Details
这次 `index.html` 里的聚合按钮被写成了 `data-mode="group"`，但 `js/app.js` 实际上把“染色”和“聚合视图”分成两套控制：染色走 `setColorMode(...)` 和 `data-mode`，聚合走 `setViewMode('grouped')` 和 `data-view-mode`。因此 grouped graph、lock flow 等代码都还在，但用户从面板上已经无法进入聚合视图，主观感受就是“昨天做的功能不见了”。

### Suggested Action
后续改 viewer 控制面板时，强制区分 color-mode 和 view-mode 按钮；聚合能力至少保留 `original` 与 `grouped` 两个显式入口，避免功能存在但无入口的假消失。

### Metadata
- Source: user_feedback
- Related Files: index.html, js/app.js
- Tags: correction, grouped-view, control-panel, wiring, regression

---

## [LRN-20260311-004] correction

**Logged**: 2026-03-11T16:40:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
整网架构迁移的主优先级不是复刻设计稿里 L3 示意算子的精确排布，而是先统一各 level 的样式语义和展开态视觉规则。

### Details
用户明确说明设计图中的 L3 算子只是示意。真正需要优先落地的是两条大逻辑：第一，同一个 level 的算子 pill 在未展开时要统一复用 compact op 的填充、描边、阴影，只通过染色区分；第二，算子下钻展开后，父级卡片的填充要改为 20% 透明度的纯色并去掉渐变，组内子节点继承原有样式；当子节点里存在多条 pipeline 时，再通过 pipeline 染色区分。说明后续实现顺序必须是“样式语义层 -> 展开态规则 -> pipeline 染色 -> 几何细节”，不能先盯着 L3 示意布局逐像素复刻。

### Suggested Action
后续更新 `mvp` 整网架构模块时，先抽象 level-style 和 expanded-style 规则表，再让 scene builder / node renderer 按规则驱动渲染；几何细节只在上述语义稳定后再微调。

### Metadata
- Source: user_feedback
- Related Files: mvp/app.js, mvp/styles.css
- Tags: correction, architecture-viewer, compact-op, expanded-state, pipeline-color

---

## [LRN-20260313-002] best_practice

**Logged**: 2026-03-13T06:27:19Z  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
面向产品经理和入门开发者的技术文档，除了定义术语，还要显式回答读者自然会追问的“直观问题”。

### Details
这次用户继续追问的点非常典型：`X 是什么`、`token 和 tensor 是什么关系`、`循环体怎么理解`、`parser 到底具体干了啥`、`动态维度如何绑定`、`缓存命中是什么意思`、`NPU 和 SIM 是什么关系`。这些问题说明，仅仅按“概念定义 -> 六步流程”去写，仍然不够贴近非专业读者的阅读路径。更有效的写法是：在主线说明之外，补上“代码写法 -> AST/IR 变化 -> 运行状态变化”的一对一映射，并把最自然的追问直接写进文档正文。

---

## [LRN-20260316-002] correction

**Logged**: 2026-03-16T12:20:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
写 `pass / loop / controlflow` 类研究笔记时，不能只停在 PyPTO 通用框架描述，必须覆盖 CANN/PyPTO 关于循环的完整定义，并用 DeepSeek 真实算子和真实循环变量把链路讲透。

### Details
这次用户明确指出两类偏差。第一，`Pass_如何把前端IR变成Execute_Graph_研究笔记.md` 没有把循环相关定义研究全，尤其缺少 tile 逐块遍历、loop_unroll、动态 loop path、运行时调度等更完整的循环层次。第二，`Loop_循环体与ControlFlow_研究笔记.md` 虽然做了层次拆分，但没有真正建立在 DeepSeek 真实算子和真实循环变量之上，深度与官方 wiki 摘要差异不够大。后续这类文档不能只“解释框架概念”，而要做到“官方定义 + 本地实现 + DeepSeek 实例”三者同时落地。

### Suggested Action
后续重写这类研究稿时，默认遵循：
1. 先整理 CANN/PyPTO 对 loop/controlflow 的全域定义；
2. 明确区分 `模型重复 / 源码循环 / tile遍历 / 子图路径 / 运行时调度循环`；
3. 至少选 1-2 个 DeepSeek 真实 kernel，把真实循环变量、真实 shape、真实 pass 产物串起来；
4. 不满足这四点时，不要提交为“研究笔记完成版”。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/Pass_如何把前端IR变成Execute_Graph_研究笔记.md, 业务理解/Loop_循环体与ControlFlow_研究笔记.md
- Tags: correction, docs, loops, controlflow, deepseek, depth

### Suggested Action
后续在当前工作区撰写产品向技术文档时，默认增加一段“读者最可能追问的问题”或把这些问题折进正文，优先解释对象关系、状态变化和一对一示例，而不是只给抽象定义。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/developer_doc_zh.md
- Tags: best_practice, docs, pm-audience, faq, mental-model

---

## [LRN-20260311-004] correction

**Logged**: 2026-03-11T16:05:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
修复功能回归时，不能把用户已经确认过的面板视觉结构一起回退。

### Details
这次在修复 grouped/aggregate 入口接线时，我把 `index.html` 的控制面板从用户昨天已经确认过的“图形设置 / 视图 / 染色”中文分区样式改回了旧的英文结构。虽然逻辑部分被修正了，但用户感知首先是“昨天做好的 UI 被退回去了”。对这种界面任务，已确认的视觉结构本身也是需求的一部分，不能因为修 wiring 就随手换回旧版布局。

### Suggested Action
后续处理 UI 回归时，先最小化修接线或状态逻辑；如果必须改 DOM，也要对照最近一次用户确认的截图或结构，避免功能修复伴随未请求的视觉回退。

### Metadata
- Source: user_feedback
- Related Files: index.html, css/style.css
- Tags: correction, ui-regression, control-panel, visual-consistency

---

## [LRN-20260311-005] correction

**Logged**: 2026-03-11T22:40:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
改动整网架构布局前，必须先做影响面分析，明确 `mvp` 私有样式和主 viewer 共享面板的边界，不能只凭当前页面表象判断“其他 UI 没被影响”。

### Details
这次用户再次指出控制面板的紧凑布局丢失，说明我之前虽然把实现集中在 `mvp/`，但没有先回查共享 `index.html` / `css/style.css` 的当前状态，也没有把“设计稿对比”和“共享 UI 回归检查”作为布局改动前置步骤。结果是：即便本轮没直接改控制面板，也错误地给出了“昨天面板没被带坏”的判断，影响了后续验收。

### Suggested Action
后续所有整网/竖向布局相关修改，先执行两步检查：第一，对照设计稿抽出几何与层级差异清单；第二，检查共享文件 `index.html`、`css/style.css`、`js/app.js` 当前状态，确认控制面板、锁定入口、聚合入口没有回退，再开始写布局代码。

### Metadata
- Source: user_feedback
- Related Files: mvp/app.js, mvp/styles.css, index.html, css/style.css
- Tags: correction, impact-analysis, regression-check, shared-ui, layout

---

## [LRN-20260311-006] correction

**Logged**: 2026-03-11T23:02:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: frontend

### Summary
收到“按备份回退”请求时，必须先验证备份目录是否真的包含可恢复文件，不能直接假设备份可用。

### Details
这次用户明确给了 `mvp_before` 作为回退来源，但实际目录里只有 `.DS_Store`，没有任何可恢复的源码文件。如果不先检查备份内容，就会在用户预期“立即回退”时产生额外往返和误判。

### Suggested Action
后续所有“按备份/副本/快照回退”的请求，先执行目录清点和文件比对，再决定复制、覆盖还是需要用户补充正确路径。

### Metadata
- Source: user_feedback
- Related Files: mvp_before, mvp
- Tags: correction, backup, rollback, verification

---

## [LRN-20260316-003] correction

**Logged**: 2026-03-16T12:20:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
写 PBC 时不能沿用研究复盘式长篇叙述，必须优先采用体验驱动、价值导向的表达方式。

### Details
这次在基于 PTO 工程产出帮助用户撰写 PBC 时，我按“背景-过程-产出”展开，篇幅偏长，且更像项目总结或研究回顾。用户明确要求“体验驱动产品，要价值导向”，说明 PBC 的重点不是解释自己做了多少分析，而是突出用户体验改善、产品方向推动、业务价值和影响结果。

### Suggested Action
后续在当前工作区协助撰写 PBC、述职或绩效材料时，默认采用“做了什么体验优化、解决了什么关键问题、带来了什么产品价值”的框架，优先短句、结果导向、少背景铺垫。

### Metadata
- Source: user_feedback
- Related Files: .learnings/LEARNINGS.md
- Tags: correction, pbc, value-oriented, experience-driven, writing

---

## [LRN-20260316-004] correction

**Logged**: 2026-03-16T12:28:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
在拆分研究文档主题时，不能因为因果相关就把两篇文档写成互相侵入；必须严格区分“主问题”和“支撑背景”。

### Details
这次用户指出 `Pass_如何把前端IR变成Execute_Graph_研究笔记.md` 和 `Loop_循环体与ControlFlow_研究笔记.md` 出现了明显混淆。复查后确认问题成立：前者前半篇大量展开 loop 分类，后者后半篇又深入 ROOT/LEAF、Execute Graph 和 swimlane，导致两篇文档都失去单一主线。正确做法应是：Pass 文档主讲 IR 如何经 pass 变成 execute graph，loop 只保留必要背景；Loop 文档主讲模型 loop、源码 loop、tile loop、controlflow 的分层关系，ROOT/LEAF 和 swimlane 只作为结果落点简述。

### Suggested Action
后续撰写同主题系列研究文档时，先明确每篇文档只回答一个主问题，并在开头写出“不覆盖什么”；正文中若出现支撑背景，控制在一节内，避免把相邻主题整段搬进来。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/Pass_如何把前端IR变成Execute_Graph_研究笔记.md, 业务理解/Loop_循环体与ControlFlow_研究笔记.md
- Tags: correction, docs, scope-control, pass, loop, controlflow

---

## [LRN-20260317-001] correction

**Logged**: 2026-03-17T15:25:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: docs

### Summary
在 Markdown 文档中插入复杂流程图时，不应把内联 SVG/XML 源码直接留在正文里，应该抽成独立资源文件再引用。

### Details
这次用户指出 `Loop_循环体与ControlFlow_研究笔记.md` 第 7 节的图后面出现了大段乱码。复查后确认原因是把完整的 SVG/XML 源码直接写进了 Markdown 正文，导致某些渲染环境把源码当作普通文本显示。更稳妥的做法是把图保存成独立 `.svg` 文件，然后在正文中只保留标准图片引用。

### Suggested Action
后续在当前工作区编写业务理解文档时，如果流程图需要长期保留或结构较复杂，默认落成独立 `.svg` 文件，并在 Markdown 中通过相对路径引用；不要混用外链图片和整段内联 SVG 源码。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/Loop_循环体与ControlFlow_研究笔记.md, 业务理解/tiled_flash_attention_flow.svg
- Tags: correction, docs, markdown, svg, rendering

---

## [LRN-20260317-002] correction

**Logged**: 2026-03-17T15:40:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: docs

### Summary
当文档编号同时承担“概念层次”的含义时，导读、术语和预备说明不应占用正式数字编号。

### Details
这次用户指出 `Loop_循环体与ControlFlow_研究笔记.md` 的标题索引不易读，原因不是只有跳号，而是“1/2”这些数字本应对应四层 loop，却被前置的阅读地图和定义章节占用了。正确做法应是：导读和术语解释使用无编号标题，正式数字编号从概念主线开始；案例和补充说明都挂回对应主章节，不要独立漂成一章。

### Suggested Action
后续在当前工作区撰写带编号的业务理解文档时，先确认数字编号到底表达“阅读顺序”还是“概念层次”。如果编号承担概念语义，导读、术语表、定义说明默认不编号。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/Loop_循环体与ControlFlow_研究笔记.md
- Tags: correction, docs, heading-structure, numbering, readability

---

## [LRN-20260318-001] correction

**Logged**: 2026-03-18T10:15:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
当用户明确说“要的是产品体验，不是文档”时，输出物应从研究笔记切换成 PRD、体验主线和首版范围定义。

### Details
这次在 PTO 相关讨论中，虽然前面已经整理了较多业务理解和测试用例设计思路，但用户明确指出自己要的不是继续补文档，而是先看一份产品 PRD。这说明在当前工作区，研究材料已经足够支撑判断时，下一步应主动切换到产品化表达：目标用户、核心场景、工作台结构、首版用例池、验收标准，而不是继续沿用“概念分析 -> 再出一篇笔记”的路径。

### Suggested Action
后续在 PTO 相关任务中，如果上下文已经形成稳定判断，应优先输出 PRD、页面结构或交互方案；研究笔记只作为支撑材料，不再作为默认主产物。

### Metadata
- Source: user_feedback
- Related Files: 业务理解/PTO_数据流调试工作台_PRD.md
- Tags: correction, prd, product-experience, pto

---

## [LRN-20260318-002] correction

**Logged**: 2026-03-18T10:34:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: docs

### Summary
在 PTO 的产品体验判断上，不能忽略现有 `mvp` 和 `test` 已经实现的连续下钻能力，更不能倒退回“靠菜单切层”的设计假设。

### Details
这次用户指出：在 `/Users/yin/pto/mvp` 和 `/Users/yin/pto/test` 里，模型 → 算子 → 计算图的打通已经具备，用户不需要手动切换就能下钻。复查代码后确认这一点成立：`mvp/app.js` 通过 layer 选择、group 展开和 operator 细节展开，已经把层级下钻做成了连续体验；`test/app.js` 通过统一 sample、单画布渲染和 inspector，把 source/pass/mvp 派生数据纳入同一工作台。因此，后续产品设计不应再把“数据旅程”实现成左侧菜单或 tab 切换，而应该以“共享焦点 + 连续下钻 + 联动证据”为前提继续深化。

### Suggested Action
后续讨论 PTO 核心工作台时，默认基于已有连续下钻能力做增强：补上下文、映射、证据和对比，而不是重新设计一个分层切换框架。

### Metadata
- Source: user_feedback
- Related Files: mvp/app.js, test/app.js, test/data-adapters.js
- Tags: correction, product, pto, drilldown, continuity

---

## [LRN-20260528-001] correction

**Logged**: 2026-05-28T15:41:25+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: frontend

### Summary
For PTO architecture evidence pages, a Diff control can mean overlaying comparison cards on the architecture diagram, not switching the right panel away from the diagram.

### Details
In the A3/A5 feature taxonomy page planning, the user corrected the proposed right-side "small card diff view": the intended behavior is not a tab or replacement view. The memory architecture diagram remains visible as the base layer, and diff cards are layered on top of or anchored around the diagram nodes/routes.

### Suggested Action
When implementing the new PTO A3/A5 migration taxonomy module, keep the memory architecture pattern mounted while Diff is active. Use small PTO-system cards as overlays anchored to relevant architecture regions, with route/node focus still active.

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/ascend-950-workbench-demo/FEATURE_TAXONOMY_PRD.md
- Tags: correction, pto, frontend, architecture, overlay, diff

---

## [LRN-20260528-002] correction

**Logged**: 2026-05-28T17:27:51+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO 新页面如果是工作台式三栏布局，不能只复用 token 和局部 pattern；必须先检查并套用已有 shell/layout pattern，例如 `ide-frame`。

### Details
在 A3/A5 migration taxonomy 页面中，用户明确要求使用 `/Users/yin/pto-design-system` 里的 skill 和 design system。实现时虽然复用了 token、按钮、memory-architecture pattern，但外层三栏 shell 先写成了模块私有布局，没有先完成“页面结构需求 -> 现有 pattern 映射”的校验，遗漏了 `patterns/ide-frame`。这违反了 PTO new module design-system-first 的意图：工作台框架本身也属于 design system，不只是颜色和内部图表属于 design system。

### Suggested Action
后续在 `/Users/yin/pto` 创建或改造工作台页面时，先列出 shell、split pane、nav、editor、inspector、toolbar 等 UI pieces，并对照 `vendor/pto-design-system/patterns/` 查找匹配 pattern。只在确认没有可用 shell/pattern 后才写模块级布局；若写新视觉或新结构，需要先走 preview/approval gate。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/a3-a5-migration-taxonomy/index.html, /Users/yin/pto/vendor/pto-design-system/patterns/ide-frame/
- Tags: correction, pto, frontend, design-system, ide-frame, pattern-mapping

---

## [LRN-20260528-003] correction

**Logged**: 2026-05-28T17:29:36+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
当用户要求使用 PTO design-system skill 时，必须先打开并执行相关 `SKILL.md`，不能凭已有印象或只复用局部资源开始实现。

### Details
在 A3/A5 migration taxonomy 页面第一轮实现中，用户要求“用 `/Users/yin/pto-design-system` 里的 skill”。正确动作应先读取相关 `SKILL.md`，再按其中 workflow 执行 required baseline、UI piece mapping、pattern 查找和 preview gate 判断。实际执行时先进入了实现，把已有 token 和 memory-architecture pattern 当成了足够的 design-system 复用，遗漏了 skill 流程本身，导致外层 shell 没先匹配 `ide-frame`。

### Suggested Action
后续凡是用户明确说“用某个 skill”或任务触发 PTO design-system skill，第一步必须打开对应 `SKILL.md` 并按 checklist 落地；实现前要在工作记录或回复中明确列出已读取的 skill 和将要复用的 pattern。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/a3-a5-migration-taxonomy/index.html, /Users/yin/.codex/skills/pto-new-module-design-system/SKILL.md, /Users/yin/.codex/skills/pto-mem-architecture-diagram/SKILL.md
- Tags: correction, pto, skill-md, design-system, workflow

---

## [LRN-20260528-004] correction

**Logged**: 2026-05-28T17:36:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO 的 A3/A5 算子迁移页面不能只做差异 taxonomy；内容质量应接近 950 operator developer guide 的角色化教程深度。

### Details
用户指出上一版页面内容不满意，明显不如 `/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html`。该 guide 的强点是围绕开发者角色、课件页码、术语速查、分层学习路线、实战练习和常见误区组织内容，而不是只罗列硬件/软件差异。重建 A3/A5 migration 页面时，应把 `FEATURE_TAXONOMY_PRD.md` 作为差异信号源，把 950 guide 作为内容组织质量基准。

### Suggested Action
后续重跑该页面任务前，先产出内容数据结构和信息架构：角色路径、重点差异、迁移检查、架构证据、profiling 验收。不要先写 UI，也不要只把 9 类差异塞进中间内容区。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/a3-a5-migration-rebuild-task-prd.md, /Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html
- Tags: correction, pto, content-strategy, a3-a5, operator-migration

---

## [LRN-20260530-001] correction

**Logged**: 2026-05-30T09:15:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO hardware architecture “细节” controls mean showing bank data, not hiding base labels or notes.

### Details
用户纠正 detail/zoom/readout 控件仍不统一，并指出“细节开关”理解错了：这里的细节是之前版本加过的 bank 数据层。错误做法是把 detail 当作 compact/full 视图，隐藏容量、cache label、queue label 或 notes。正确做法是让 detail 只控制 bank-data overlay，例如 2201/3510 UB bank group/bank size 信息；基础架构文本应保持稳定可见。

### Suggested Action
后续修改 PTO 架构图时，将 bank/detail overlay 放在 shared `memory-architecture` pattern；将 detail/zoom/readout 的视觉规则放在 shared `hardware-architecture-viewport` pattern，并用足够明确的 `.pto-hw-viewport ...` selector 防止页面局部 `.btn-sm`、`.hw-control` 覆盖。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/vendor/pto-design-system/patterns/memory-architecture/pattern.js, /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.css
- Tags: correction, pto, design-system, hardware-architecture, bank-detail

---

## [LRN-20260530-002] correction

**Logged**: 2026-05-30T09:48:00+08:00  
**Priority**: high  
**Status**: pending  
**Area**: frontend

### Summary
PTO architecture viewport controls and detail data must come from the clean reference and the shared pattern, not ad hoc page UI.

### Details
用户纠正三点：第一，architecture header 不应展示 metadata/path chips，例如 `pattern: memory-architecture-layout`、`preset: ascend950b`、`source: md...`、`无 iframe` 或 selected path readout；第二，控件统一为 compact `细节开 / − / readout / +`，并收录到 `hardware-architecture-viewport` pattern；第三，bank/detail 数据必须对齐 `/Users/yin/pto-main-pages-clean/ascend-950-workbench-demo/index.html`，950 UB 是 `bank 8组 x 2个/组`、`单bank 16KB`、`对齐 32B`、`搬运 MTE2/MTE3` 加 mini grid，不能编造 2201/3510 bank chip。

### Suggested Action
后续修改 PTO 架构页前，先 diff clean reference 的 `patterns/memory-architecture` detail rows，再改 shared pattern。Architecture viewport 必须默认使用黑色点阵 stage、透明 title toolbar 和统一 compact controls；页面级 CSS 不能重写 title 背景、控件尺寸或 metadata chip。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto-main-pages-clean/ascend-950-workbench-demo/index.html, /Users/yin/pto/vendor/pto-design-system/patterns/memory-architecture/pattern.js, /Users/yin/pto/vendor/pto-design-system/patterns/hardware-architecture-viewport/pattern.css
- Tags: correction, pto, design-system, hardware-architecture, viewport-background, bank-detail

---

## [LRN-20260624-001] correction

**Logged**: 2026-06-24T13:55:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
PTO data-viz palettes must preserve semantic hue families and existing colormap forbidden hue ranges before tuning light/dark S/L.

### Details
用户纠正 Pangu MoE trainviz palette：同一种语义算子应保持色系一致，且已有 `colormap.js` 明确通过 150°-300° 可用色相弧段避开正红、橙黄和正绿色区间。错误做法是为四组 palette 手写不同语义色，并引入橙、粉红、草绿等禁区色；同时把 light mode 的 L 值压得过低，导致颜色又暗又脏。正确做法是先锁定每个语义算子的 hue family，再让 palette 只调整饱和度/明度曲线；light 可以比 dark 低饱和/低明度，但仍应保持干净、可读。

### Suggested Action
后续修改 PTO 可视化 palette 时，先读取并复用现有 colormap 规则；如果需要 palette preview，应把每个语义 key 的 hue 稳定性和 forbidden hue range 作为验收项。不要用临时 hardcoded overrides 绕过 shared colormap。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/js/colormap.js, /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html, /Users/yin/pto/pangu-moe-trainviz/palette-lab.html
- Tags: correction, pto, palette, colormap, data-viz

---

## [LRN-20260624-002] correction

**Logged**: 2026-06-24T14:08:00+08:00
**Priority**: high
**Status**: pending
**Area**: frontend

### Summary
For PTO visualization palettes, infer semantic color categories from the visible visual layer, not automatically from internal operator keys.

### Details
用户进一步纠正 Pangu MoE trainviz palette：这里说的语义不是 `sem:attention / sem:gate / sem:comm` 这种内部算子 key，而是页面上可见的分类，例如 `Dense`、`MoE`、`R0`、`R7`、`R16`。每一类应占一个稳定色相家族，例如 MoE 全部保持紫色系，rank row 也应保持本行自己的色相家族。另一个误解是“避开正红/正绿”不等于删除所有暖色；amber/orange 等暖色仍可用。Light mode 正确方向是降低饱和度并提高明度，而不是降低明度。

### Suggested Action
后续做 palette lab 或 swimlane/architecture 色彩编码时，先列出用户实际看到的 category labels，并让这些 labels 成为 colormap 的一级 key。内部 op key 只能作为同一 category 内的轻微变体。Light/dark 调整必须显式验证同 key 的 light saturation 更低、lightness 更高。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/pangu-palette.js, /Users/yin/pto/pangu-moe-trainviz/palette-lab.html, /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html
- Tags: correction, pto, palette, semantic-color, swimlane

---

## [LRN-20260624-003] correction

**Logged**: 2026-06-24T14:23:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Palette alternatives must provide visibly different choices, not just tiny global saturation/lightness changes.

### Details
用户纠正 Pangu MoE trainviz palette lab：四套 palette 如果只共享同一组 category hue anchors、只微调 S/L，看起来就是一模一样，不能作为可选方案。正确做法是在保持每套内部语义一致的前提下，为每套方案提供不同的 category hue anchors。例如 Dense 仍在蓝系、MoE 仍在紫系、rank 行仍各自同色系，但 Balanced / Cool / Warm / Soft 应有明显不同的 Dense blue、MoE purple、rank warm/cool anchor 组合。

### Suggested Action
后续设计 palette picker 时，至少验证两层差异：同一 palette 内 category hue family 稳定；不同 palette 间 category anchors 明显不同。不要把“profile”只实现为全局 S/L 曲线。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/pangu-palette.js, /Users/yin/pto/pangu-moe-trainviz/palette-lab.html
- Tags: correction, pto, palette, alternatives, data-viz

---

## [LRN-20260624-004] correction

**Logged**: 2026-06-24T14:45:00+08:00
**Priority**: medium
**Status**: pending
**Area**: frontend

### Summary
Light-mode data-viz palettes should be clean pastel, not low-chroma gray/paper tints.

### Details
用户纠正 Pangu MoE palette lab：方案 1 的暗色模式可用，但浅色模式发灰发脏。仅仅提高 lightness 并大幅降低 saturation 会让暖色变米灰、紫色变粉灰。正确方向是仍满足 light mode 的 `S < dark`、`L > dark`，但保持足够 chroma，并避免过高 lightness 把颜色洗成灰。

### Suggested Action
后续设计 light palette 时，用数值和截图同时验收：同 key 的 light saturation 低于 dark、lightness 高于 dark，同时 warm/cool swatches 仍有明确 hue identity。不要把“低饱和”实现为接近灰色。

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/pangu-palette.js, /Users/yin/pto/pangu-moe-trainviz/palette-lab.html
- Tags: correction, pto, palette, light-mode, data-viz

---
