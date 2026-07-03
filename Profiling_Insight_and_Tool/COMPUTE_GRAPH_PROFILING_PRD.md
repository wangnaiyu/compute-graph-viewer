# 计算图 Profiling 证据工作台 PRD

**产品代号**：Compute Graph Profiling Evidence Workbench  
**版本**：v0.1 草案  
**日期**：2026-06-06  
**状态**：产品定义中  
**目标页面**：`Profiling_Insight_and_Tool/AI_Profiling_Tool/graph-evidence-workbench.html`  
**来源页面**：`Profiling_Insight_and_Tool/AI_Profiling_Tool/MindStudioNext.html` 的「计算图」tab  
**参考页面**：`graphviz/deepseek_v32_report_overlay_demo.html`

---

## 1. 一句话定义

计算图 Profiling 证据工作台是一个面向 Ascend 模型训练/推理开发者的独立诊断页面。它把模型计算图、Profiling 问题节点、右侧诊断证据和底部 Step/Stream 泳道图放在同一个可联动界面里，让开发者从“模型结构上的哪个模块有问题”直接跳到“运行时哪个 step、stream、kernel、wait 或通信段证明了这个问题”。

### 1.1 已确认范围

- 首个支持模型：P0 只优先支持 Qwen2-7B；DeepSeek V3.2 overlay 作为参考形态和后续扩展，不进入 MVP 主路径。
- 真实数据解析：MVP 必须解析真实 `trace_view.json`，不能只消费当前 HTML 里的 `SWIMLANE_DATA` / `FREE_ANALYSIS_DATA`。
- 数据外置：`GRAPH_PROBLEMS`、`QWEN7B_BASE_NODES`、`QWEN7B_NODE_INFO`、demo report、timeline evidence 等数据必须从 HTML 内联迁出为 JSON。
- 内置 demo：页面提供内置 Qwen2-7B demo 数据，保证无外部文件时也能完整展示产品闭环；demo 数据必须走同一套 JSON schema 和解析链路。

---

## 2. 背景与官方文档依据

### 2.1 官方工具链给出的分析路径

MindStudio Insight 的官方定位是面向 Ascend AI 开发者的可视化调优工具，覆盖系统调优、算子调优、服务化调优和内存调优；系统调优提供 Timeline、Memory、Operator、Summary、Communication 等视图，用于快速定位模型性能瓶颈。官方文档同时强调 Insight 可处理真实软硬件运行数据，并支持大规模集群 Profiling 数据分析。

对本产品最关键的官方信息是：

- Timeline 用于展示训练/推理过程中 host 和 device 的运行细节，关联 host API 耗时和 device task 耗时，帮助识别 host/device 瓶颈。
- Timeline 的层级包含 Python/PyTorch、CANN 层 AscendCL/GE/Runtime，以及 Ascend Hardware 下各 stream task flow、step trace、Communication、Overlap Analysis、Memory 等信息。
- `trace_view.json` 可在 TensorBoard、`chrome://tracing/` 和 Perfetto 中打开；其中包含上层应用、CANN 层、底层 NPU 数据和事件详情。
- `kernel_details.csv` 记录 NPU 上执行的 operators，包括 Step Id、Task Id、Stream ID、Name、Type、Accelerator Core、Start Time、Duration、Wait Time、Block Dim、Input/Output Shapes 等字段。
- Summary 支持通信组识别、计算/通信耗时拆解、慢卡/慢链路分析；Communication 用于查看通信时长、等待时长、链路带宽。
- `msprof-analyze advisor` 可分析 Ascend PyTorch Profiler 采集数据并输出性能调优建议；cluster 分析会生成 `cluster_step_trace_time.csv`、`cluster_communication_matrix.json`、`cluster_communication.json` 等文件。
- Operator 视图提供单算子维度和算子类型维度的耗时统计，并支持从算子详情跳转到 Timeline。
- Source/Details 等算子调优视图可基于 `visualize_data.bin` 展示源码与指令/耗时之间的映射。

### 2.2 当前产品断点

`MindStudioNext.html` 已经有「计算图」tab：左侧模型图用 `PtoModelGraphvizPattern.render` 渲染 Qwen2-7B 结构，右侧展示问题节点的指标、影响、修复建议、验证方式和算子背景。它解决了“问题落在模型结构哪里”的问题，但仍有三个不足：

1. 计算图被塞在大工具的一个 tab 里，独立传播、深链定位和专注分析能力弱。
2. 计算图问题节点与 Timeline 证据是分离的，用户需要在问题详情、Timeline、算子视图之间来回切换。
3. 参考页 `deepseek_v32_report_overlay_demo.html` 底部的 Step / Stream Timeline 仍是本地 DOM bar 图，不符合 PTO 已沉淀的泳道图 pattern，也不足以承载 trace 级别的 stream/task 证据。

### 2.3 产品机会

官方工具链强调多视图分析，但开发者实际调优时经常从某个模型模块或算子开始追问：这个问题到底是 LM Head、Attention、MLP、通信、Host 下发还是某个 stream 上的 wait？本产品把“模型结构图”和“Profiling 时间线证据”前后打通，降低开发者在多个视图之间做人工对齐的成本。

---

## 3. 用户与价值

| 用户 | 典型问题 | 本产品带来的价值 |
|---|---|---|
| 大模型训练开发者 | 不知道慢 step 是哪个模型模块拖慢的 | 在计算图上直接看到 P0/P1/P2 问题节点，并定位到 step/stream 证据 |
| 性能调优工程师 | 需要在 Summary、Communication、Timeline、Operator 多视图之间人工跳转 | 在一个页面完成“结构定位 -> 运行时证据 -> 修复建议 -> 验证指标”闭环 |
| 框架/并行策略工程师 | PP/TP/DP/EP 问题难以映射回模块结构 | 通过图节点和泳道图联动识别 pipeline bubble、通信等待、rank 不均衡 |
| 算子/内核工程师 | 知道某个 op 慢，但缺少上下游上下文 | 在图中看到 op 所属模块、输入输出路径，并在泳道图中看到 stream/task 位置 |
| 技术负责人/评审者 | 调优报告难复核 | 页面天然形成可复核证据链：节点、指标、时间线、数据文件、建议和验收指标 |

核心价值不是替代 MindStudio Insight，而是补上“模型结构语义”和“Profiling 运行时证据”之间的解释层，让开发者更快判断应该改模型并行策略、框架调用、算子实现、通信配置还是采集方式。

---

## 4. 产品目标

### 4.1 用户目标

- 30 秒内判断当前 Profiling 报告是否有关联计算图，以及最严重的问题节点在哪里。
- 2 分钟内从一个 P0/P1 节点看到对应的 step、stream、kernel、wait、communication 或 free/bubble 证据。
- 10 分钟内输出一个可复核的调优判断：问题原因、涉及模块、证据文件、建议修改点、重采后的验证指标。

### 4.2 工程目标

- 从 `MindStudioNext.html` 的「计算图」tab 提取独立页面，不复制整个 AI Assistant/报告工作台。
- 复用 PTO 设计系统和共享 pattern：`model-graphviz`、`swimlane-task`、`panel-shell`、`btn`、`segment-control`、`tag/status-chip`。
- 将 `deepseek_v32_report_overlay_demo.html` 的底部 Step / Stream Timeline 重构为泳道图面板，禁止继续使用页面本地 DOM bar 图表达 stream task。
- 形成可扩展数据契约，MVP 主线支持 Qwen2-7B，后续再扩展 DeepSeek 类模型图和未来 profiling report overlay。
- 将当前 HTML 内联数据迁出为 JSON，并让内置 demo 与真实文件解析共用同一套加载器。

---

## 5. 产品原则

- **结构优先**：计算图是主入口，Timeline 是证据，不反过来用时间线淹没结构。
- **证据可追溯**：每条结论必须能回到 `trace_view.json`、`kernel_details.csv`、`step_trace_time.csv`、`communication*.json`、`analysis.db` 或 `visualize_data.bin`。
- **联动少跳转**：点击图节点、泳道任务、问题列表、mapped node 都应同步 selection。
- **不造新视觉系统**：页面必须消费 PTO design system 与 shared patterns。
- **轻量独立**：作为单独 HTML 页面可直接打开/挂到 launch，不依赖 MindStudioNext 的完整 shell。
- **报告和原始数据分层**：AI 诊断文本可作为解释层，但 timeline/operator/communication evidence 必须保留原始数据来源标记。

---

## 6. 信息架构

目标页面采用 `deepseek_v32_report_overlay_demo.html` 的大图 + 右侧 inspector + 底部证据时间线布局，但用 PTO shared pattern 收敛视觉和行为。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: Home / Report name / Data source / Priority filters / Export  │
├──────────────────────────────────────────────┬───────────────────────┤
│                                              │ Right Inspector        │
│ Model Graph Stage                            │ - Diagnosis           │
│ - model graphviz pattern                     │ - Evidence            │
│ - report priority overlays                   │ - Operators           │
│ - mapped node selection                      │ - Actions             │
│ - pan / zoom / fit                           │ - Mapped Nodes        │
│                                              │ - Data Source         │
├──────────────────────────────────────────────┴───────────────────────┤
│ Bottom Evidence Swimlane                                               │
│ - Step lanes / Stream lanes / Communication lanes / Coverage            │
│ - pattern/swimlane task bars                                            │
│ - playhead / search / filter / focus selected node                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. 核心功能需求

### F1. 独立页面抽取

**描述**：从 `MindStudioNext.html` 的「计算图」tab 抽取独立页面，保留计算图、问题节点、节点详情、名称映射、pan/zoom、cluster expand/collapse。

**范围**：

- 保留 `buildQwenGraphData`、pan/zoom、selection、cluster expand/collapse 等页面逻辑。
- 将 `GRAPH_PROBLEMS`、`QWEN7B_BASE_NODES`、`QWEN7B_NODE_INFO` 等数据迁出为 JSON 文件，由页面异步加载。
- 保留 `PtoModelGraphvizPattern.render`，后续优先迁移到 vendored `patterns/model-graphviz/pattern.js`，避免长期内嵌 pattern 代码。
- 不保留 AI 对话、报告 markdown tab、代码 tab、文档 tab、历史记录侧栏。
- MVP 首个模型只支持 Qwen2-7B；非 Qwen2-7B 报告显示明确“不在 MVP 支持范围”的 empty state。

**验收标准**：

- 新页面能独立打开并渲染 Qwen2-7B 计算图。
- 页面渲染所需业务数据来自 JSON，不再来自 HTML 内联常量。
- 无关联图的报告显示明确 empty state。
- 点击 P0/P1/P2 节点，右侧 inspector 更新。
- cluster 折叠/展开后保持视口锚点和 selection。

### F2. 参考 report overlay 交互

**描述**：参考 `graphviz/deepseek_v32_report_overlay_demo.html`，将诊断结果作为 overlay 显示在模型图上，并提供 priority filter。

**需求**：

- Header 提供 All / P0 / P1 / P2 / Off 过滤。
- 右侧 inspector 默认显示最高优先级节点。
- Mapped Nodes 列表可点击并 focus 图节点。
- Selection dimming：选中节点时非相关节点弱化。
- 所有 P0/P1/P2 使用 `model-graphviz` pattern 已定义的 priority overlay，不再画额外可见边框。

**验收标准**：

- 过滤 P0 时仅保留 P0 overlay 和对应 mapped list。
- Off 时保留纯计算图，隐藏报告 overlay 和 inspector 诊断态。
- 从 Mapped Nodes 点击节点时，图 stage 平滑定位到该节点。

### F3. 底部 Step / Stream Timeline 替换为泳道图

**描述**：将参考页底部 Step / Stream Timeline 的 DOM stack/stream bar 替换为 PTO 泳道图面板，使用 `vendor/pto-design-system/patterns/swimlane-task` 的 task bar renderer 和 tooltip。

**泳道分层**：

- Step lane：按 Step ID 展示 Computing、Communication(Not Overlapped)、Free/Bubble、Preparing 等阶段。
- Stream lane：按 Stream ID 展示 Ascend Hardware task flow，突出 selected graph node 相关 kernel。
- Communication lane：展示 HCCL/hcom 通信任务、wait/transit、通信域、rank/group。
- Overlap lane：展示 overlap/free 分析，用于识别计算通信重叠不足。
- Coverage lane：展示当前报告中哪些图节点有 runtime evidence，哪些只有 AI 推断或报告文本。

**交互**：

- 点击泳道 task，高亮相关计算图节点和 inspector evidence。
- 点击计算图节点，泳道自动滚到该节点的 runtime evidence。
- 支持 playhead、拖拽/滚轮缩放、按 task name/operator name 搜索。
- tooltip 必须包含 op/task 名称、lane、start、duration、wait、stream/rank、source file。
- 内置 demo 也必须通过 `trace_view.json` parser 产出泳道数据，不能手写最终泳道条形数据绕过解析器。

**验收标准**：

- 不再使用 `step-row`、`stream-lane-row` 这类本地 DOM bar 作为主 timeline 表达。
- Task bar 由 `PtoSwimlaneTaskPattern.drawTaskBar` 绘制。
- Tooltip 由 `PtoSwimlaneTaskPattern.initHoverTooltip` 提供或兼容其数据结构。
- 能解析真实 `trace_view.json` 并生成 Step/Stream lanes。
- 缺少 trace 数据时显示数据缺口，而不是伪造完整泳道图。

### F4. 证据数据契约

**描述**：定义独立页面消费的数据结构，保证图、问题、timeline、operator、communication 可关联。

**输入数据类型**：

| 数据 | 典型来源 | 用途 |
|---|---|---|
| Model graph schema | 本地模型结构 JSON / `QWEN7B_BASE_NODES` | 渲染计算图 |
| Problem node mapping | AI report / `GRAPH_PROBLEMS` | 将 P0/P1/P2 问题映射到图节点 |
| `trace_view.json` | Ascend PyTorch Profiler | 生成 Step/Stream/Host/CANN/NPU 泳道 |
| `kernel_details.csv` | Ascend PyTorch Profiler | 提供 operator、stream、duration、wait、shape 字段 |
| `step_trace_time.csv` / cluster step trace | profiler / msprof-analyze cluster | Step 对比、computing/communication/free |
| `communication.json` / `communication_matrix.json` | profiler / cluster output | 通信 wait/transit/bandwidth evidence |
| `analysis.db` | profiler parsed output | Summary/Communication 详情数据 |
| `visualize_data.bin` | msProf op simulator | Source/Details 级别算子证据 |

**MVP JSON 文件建议**：

```text
AI_Profiling_Tool/
├── graph-evidence-workbench.html
└── data/
    ├── qwen2-7b.graph.json
    ├── qwen2-7b.node-info.json
    ├── qwen2-7b.problem-map.json
    ├── qwen2-7b.demo-report.json
    ├── qwen2-7b.demo.trace_view.json
    └── qwen2-7b.demo.evidence.json
```

**加载策略**：

- 默认加载内置 Qwen2-7B demo JSON，保证页面无外部文件时可完整展示。
- 当用户提供真实 Profiling 文件时，以真实 `trace_view.json` 为准重新生成泳道 evidence。
- `qwen2-7b.demo.evidence.json` 只能作为 parser regression fixture，不允许作为 MVP 的唯一渲染来源。
- JSON schema 要保留 `schemaVersion`、`modelId`、`reportId`、`sourceFiles`、`generatedAt` 字段，避免 demo、真实报告和后续模型混用时无法追踪来源。

**关联键**：

- `nodeId`：模型图节点 ID。
- `issueId`：报告问题 ID。
- `opName` / `runtimeOpName`：模型语义名与 profiler 算子名。
- `stepId`、`rankId`、`streamId`、`taskId`：runtime 定位。
- `sourceFile`、`sourceLine`：源码/报告来源。
- `confidence`：映射置信度，区分 raw、derived、AI inferred。

**验收标准**：

- 页面无业务数据硬编码；业务 JSON 结构变化时应在加载阶段给出 schema error。
- 每条 inspector evidence 显示数据来源和置信度。
- 对同名算子、多实例算子、cluster folded node 允许一对多映射。
- 无法映射时显示 unmapped reason。

### F5. 右侧 Inspector

**描述**：右侧面板给出当前选中对象的诊断闭环。

**信息结构**：

1. Diagnosis：问题摘要、priority、dimension、影响指标。
2. Evidence：关键事实，含数据文件和字段。
3. Operators：Top operators / mapped runtime ops。
4. Actions：修复建议和参数位置。
5. Verification：重采后应观察的指标。
6. Mapped Nodes：相关计算图节点列表。
7. Data Coverage：当前证据覆盖率和缺失数据。

**验收标准**：

- 所有指标必须带单位。
- 修复建议必须能关联到至少一个 evidence 或标为 inferred。
- Verification 不能只写“重采验证”，必须包含目标指标变化。

### F6. 深链和导出

**描述**：支持页面级分享和复核。

**需求**：

- URL 参数支持 `reportId`、`nodeId`、`priority`、`stepId`。
- 支持导出当前视图为 JSON snapshot。
- 支持复制 evidence summary。

**验收标准**：

- 打开带 `nodeId` 的 URL 后自动选中该节点并定位泳道图。
- 导出内容包含版本、输入文件、selected state、evidence list。

---

## 8. 非功能需求

### 8.1 性能

- 首屏 2 秒内出现 header、empty/loading、inspector shell。
- 10k task 以内泳道图交互保持可用；超过阈值时启用采样/虚拟滚动策略。
- 图节点点击到 inspector 更新小于 100 ms。
- Timeline 搜索结果定位小于 300 ms。

### 8.2 可靠性

- 原始 profiler 文件缺失时，页面降级显示缺失字段，不报错空白。
- AI 推断映射必须和 raw evidence 分层显示。
- 多报告切换时清理 selection、playhead、tooltip、scroll 状态。

### 8.3 可访问性

- Priority filter、playhead、timeline task selection 支持键盘操作。
- 泳道图 tooltip 内容在 inspector 中也应有文本版本，不能只靠 hover。
- P0/P1/P2 不能只用颜色区分，必须有文字标签。

---

## 9. 设计系统与 Pattern 约束

必须复用：

- `vendor/pto-design-system/tokens/foundation.css`
- `vendor/pto-design-system/tokens/semantic.css`
- `vendor/pto-design-system/tokens/components.css`
- `vendor/pto-design-system/css/style.css`
- `vendor/pto-design-system/patterns/model-graphviz/pattern.css`
- `vendor/pto-design-system/patterns/model-graphviz/pattern.js`
- `vendor/pto-design-system/patterns/swimlane-task/pattern.css`
- `vendor/pto-design-system/patterns/swimlane-task/pattern.js`

推荐复用：

- `panel-shell` / `panel-shell-quiet`
- `btn` / `btn-ghost` / `segment-control`
- `tag` / `status-chip` / `priority-badge`
- `inspector-rail` token family

禁止：

- 在业务页重写 model graphviz 的节点几何、priority overlay、cluster title pill、fold control。
- 在业务页用本地 DOM/CSS 重新实现泳道 task bar segment。
- 对卡片/面板使用额外彩色边框、左侧 rail、阴影或非系统圆角。
- 使用远程 CDN 作为核心运行依赖。

---

## 10. 里程碑

### M0. PRD 与数据盘点

- 完成 PRD。
- 盘点 `MindStudioNext.html` 中计算图相关数据和函数。
- 列出可直接迁移、需抽象、需补数据的部分。

### M1. 独立静态页面 MVP

- 新建 standalone page。
- 接入 `model-graphviz` pattern。
- 完成图节点点击、右侧 inspector、priority filter。
- 接入 `AI_Profiling_Tool/data/*.json` 加载器，Qwen2-7B demo 不再内联在 HTML。
- 不接入泳道图，只保留底部 empty/loading shell。

### M2. 泳道图证据面板

- 接入 `swimlane-task` pattern。
- 实现真实 `trace_view.json` parser，至少支持 PyTorch/CANN/Ascend Hardware 事件分层、Step ID、Stream ID、task duration。
- 用 `data/qwen2-7b.demo.trace_view.json` 生成 Step/Stream lanes。
- 完成图节点和泳道 task 双向联动。

### M3. 数据契约与多报告支持

- 完成 HTML 内联数据迁移，业务数据全部落到 `AI_Profiling_Tool/data/*.json`。
- 支持 Qwen2-7B 多个 reportId。
- 支持 trace/kernel/communication 缺失检查和 coverage 面板。

### M4. 验证与发布入口

- 加入 launch 页面入口。
- 做桌面/移动基础响应式验证。
- 完成导出 snapshot、深链 URL、回归测试。

---

## 11. 成功指标

| 指标 | 目标 |
|---|---|
| 首次定位 P0 问题节点时间 | 小于 30 秒 |
| 从问题节点找到 runtime evidence 时间 | 小于 2 分钟 |
| 报告 evidence 覆盖率 | MVP 示例中 P0/P1 节点覆盖率大于 80% |
| 人工跨视图跳转次数 | 从 4-6 次降低到 1-2 次 |
| 调优建议可复核率 | 每条 P0/P1 建议至少 1 条 raw evidence |
| 页面空白/崩溃率 | 缺文件场景 0 空白页 |

---

## 12. 风险与开放问题

### 12.1 风险

- 模型语义节点与 runtime operator 名称天然不一致，容易出现错误映射。
- 大规模 `trace_view.json` 直接渲染可能造成性能问题，需要聚合或虚拟化。
- cluster 数据和单卡数据字段不完全一致，需做适配层。
- AI report 的问题描述可能比 raw evidence 更完整，但不能替代原始数据。
- `MindStudioNext.html` 当前大量代码内嵌，直接复制会形成维护债务。

### 12.2 已确认决策

- MVP 优先支持 Qwen2-7B。
- MVP 解析真实 `trace_view.json`，现有 `SWIMLANE_DATA` / `FREE_ANALYSIS_DATA` 只作为迁移参考，不作为目标数据源。
- `GRAPH_PROBLEMS`、`QWEN7B_BASE_NODES`、`QWEN7B_NODE_INFO` 等从 HTML 内联迁出到 JSON。
- 页面保留内置 demo 数据，且 demo 数据也通过真实解析链路展示。

### 12.3 仍需确认

- `pattern/swimlane` 指的是当前 `swimlane-task` task bar pattern，还是需要抽象完整 swimlane viewport pattern？
- MVP 是否需要支持用户拖入本地 `trace_view.json`，还是先只从内置 JSON URL 加载？
- JSON schema 是否需要在 M1 就固化为独立 `schema/*.json` 文件，还是先在 loader 中做轻量校验？

---

## 13. 官方参考资料

- MindStudio Insight 8.3.0 Introduction: https://www.hiascend.com/document/detail/en/mindstudio/830/GUI_baseddevelopmenttool/MindStudioInsight/Insight_userguide_0002.html
- MindStudio Insight 8.3.0 Timeline GUI Description: https://www.hiascend.com/document/detail/en/mindstudio/830/GUI_baseddevelopmenttool/MindStudioInsight/Insight_userguide_0034.html
- MindStudio Insight 8.3.0 Timeline Basic Functions: https://www.hiascend.com/document/detail/en/mindstudio/830/GUI_baseddevelopmenttool/MindStudioInsight/Insight_userguide_0036.html
- Ascend PyTorch Profiler Timeline and Summary Data: https://www.hiascend.com/document/detail/en/mindstudio/700/TITools/Profiling/atlasprofiling_16_1149.html
- MindStudio Insight 8.3.0 Summary GUI Description: https://www.hiascend.com/document/detail/en/mindstudio/830/GUI_baseddevelopmenttool/MindStudioInsight/Insight_userguide_0049.html
- msprof-analyze Profile Data Analysis: https://www.hiascend.com/document/detail/en/mindstudio/700/quickstart/PTtraingquickstart/pttools_qucikstart_0011.html
- MindStudio Insight Operator fields and Click To Timeline: https://www.hiascend.com/document/detail/zh/mindstudio/80RC1/GUI_baseddevelopmenttool/msascendinsightug/Insight_userguide_0039.html
- Ascend operator source hot map / `visualize_data.bin`: https://www.hiascend.com/document/detail/zh/mindstudio/70RC2/ODtools/Operatordevelopmenttools/atlasopdev_16_0088.html

## 14. 本地参考资料

- `Profiling_Insight_and_Tool/AI_Profiling_Tool/MindStudioNext.html`
- `graphviz/deepseek_v32_report_overlay_demo.html`
- `vendor/pto-design-system/patterns/model-graphviz/pattern.json`
- `vendor/pto-design-system/patterns/swimlane-task/pattern.json`
