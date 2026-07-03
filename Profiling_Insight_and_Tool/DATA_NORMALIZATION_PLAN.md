# Profiling Insight Data Normalization Plan

日期：2026-06-16

## 1. 同步结果

- `Profiling_Insight_and_Tool` 已执行 `git fetch origin`
- 当前 `main` 与 `origin/main` 一致：`0 ahead / 0 behind`
- 本地工作区有未提交改动，因此未执行 `pull` / `merge`

## 2. 当前项目数据来源盘点

### 2.1 MindStudioNext：单文件内嵌报告型

当前 `AI_Profiling_Tool/MindStudioNext.html` 仍是主数据容器，核心特征：

- 报告正文 markdown 以内嵌字典 `MDS` 存在页面里，而不是外部 md/json
- 报告目录用 `REPORTS` 常量维护
- 计算图问题映射 `GRAPH_PROBLEMS`、图节点 `QWEN7B_BASE_NODES`、节点说明 `QWEN7B_NODE_INFO` 全部内嵌
- 部分源码视图数据走 `SOURCE_VIEW_DATA` 内嵌常量
- Timeline 直接吃 `traceEvents` JSON 片段

这说明它本质上是“演示页面 + 预置报告仓”的单体页面，不是稳定的数据层。

### 2.2 AI_Profiling_Tool README：文档描述与现状不完全一致

`AI_Profiling_Tool/README.md` 把数据源描述为：

- `SWIMLANE_DATA`
- `FREE_ANALYSIS_DATA`
- `OP_VIEW_DATA`
- `COMM_VIEW_DATA`
- `SOURCE_VIEW_DATA`

但当前仓库里并没有独立的 `chart-data.js` 文件，主数据事实上仍主要堆在 `MindStudioNext.html` 内。结论：

- README 描述的是“理想拆分态”
- 实际实现仍偏“单 HTML 内嵌态”

这是第一处需要归一的断点。

### 2.3 Graph Evidence Workbench：已开始走外置 JSON + schema

`AI_Profiling_Tool/js/graph-evidence/CONTRACT.md` 和 `loader.js` 已经建立了更健康的数据契约：

- `data/*.json` 外置
- `schemaVersion` 校验
- `graph / nodeInfo / problemMap / report / trace` 分文件加载
- `trace_view.json` 通过 parser 转成 `laneModel`
- `sourceFiles`、`generatedAt`、`reportId` 被显式保留

当前已经落地的数据包包括：

- `qwen2-7b.graph.json`
- `qwen2-7b.node-info.json`
- `qwen2-7b.problem-map.json`
- `qwen2-7b.demo-report.json`
- `qwen2-7b.demo.trace_view.json`
- `qwen2-7b.demo.evidence.json`

这是本项目里最接近“标准化数据层”的部分。

### 2.4 AscendProfKit：面向原始 profiler 产物和 evidence 副本

`AscendProfKit` 的 skills 反复引用这些原始来源：

- `trace_view.json`
- `kernel_details.csv`
- `op_statistic.csv`
- `step_trace_time.csv`
- `communication.json`
- `communication_matrix.json`
- `cluster_analysis.db`
- `visualize_data.bin`

这里的数据语义是对的，但形态是“原始产物 + 经验型脚本 + evidence 复制品”，还不是统一产品 schema。

## 3. 与 TrainScope SPEC 的差异

对照 `pangu-moe-trainviz/SPEC.md`，差异主要有 5 类。

### 3.1 产品模式不同

`Profiling_Insight_and_Tool` 目前是：

- 离线报告
- 问题卡驱动
- 单次诊断 / 事后分析

`TrainScope` 是：

- 实时监护
- 双轴联动
- step/phase 驱动

### 3.2 数据组织粒度不同

`Profiling_Insight_and_Tool` 当前主要围绕：

- report
- issue
- visualization card
- evidence file

`TrainScope` 围绕：

- compute axis graph
- physical axis placement
- stepTrace
- timeseries
- commSnapshots

也就是说，前者是“问题中心”，后者是“时序中心 + 运行态中心”。

### 3.3 运行时物理语义缺失

Graph Evidence Workbench 已有：

- `nodeId`
- `runtimeOpName`
- `streamId`
- `stepId`

但缺少 TrainScope 需要的：

- `rankId`
- `deviceId`
- `TP/PP/CP/DP/EP coords`
- `placementMap.byNode / byRank / byDevice`
- 物理轴通信 overlay 所需的 group/lens 语义

### 3.4 时间模型不同

Profiling 侧时间数据目前主要来自：

- `trace_view.json`
- `step_trace_time.csv`

但页面消费形态还是“某个问题卡附一个 timeline 视图”。

TrainScope 要求的时间模型是统一的：

- 全局 step 轴
- phase rail
- loss / grad / load balance 等 timeseries
- 同一 step 上 compute/physical 双轴同步

### 3.5 demo 与真实数据混杂程度不同

MindStudioNext 和当前 demo report 中，很多 `sourceFiles` 仍指向：

- `MindStudioNext.html#...`
- 内嵌 report 文本

TrainScope 在 spec 里明确要求：

- 逻辑轴接真实遥测
- 物理轴自采/合成要明确标注
- adapter 可替换

也就是说，TrainScope 对 provenance 分层更严格。

## 4. 归一目标

目标不是把两个产品做成一个页面，而是统一成一套“可被不同页面消费的数据底座”。

统一后的数据层建议分 4 层：

### L0 Raw Artifacts

保留原始产物，不做语义改写：

- trace json
- profiler csv
- communication json
- cluster db
- visualize bin

### L1 Normalized Evidence Package

把原始产物整理成统一产品包：

- `meta.json`
- `graph.json`
- `problem_map.json`
- `report.json`
- `lane_model.json`
- `op_views.json`
- `comm_views.json`
- `source_views.json`
- `timeseries.json`
- `placement.json`

### L2 Product Adapters

按页面需要二次投影：

- `mindstudio_next_adapter`
- `graph_evidence_adapter`
- `trainscope_adapter`

### L3 UI State

页面自己维护的交互态：

- selected node
- selected issue
- selected step
- active phase
- active lens

## 5. 建议的统一 schema

建议以 Graph Evidence Workbench 的 `schemaVersion + sourceFiles + generatedAt` 为基础，向 TrainScope 扩展，而不是反过来。

### 5.1 Canonical meta

```json
{
  "schemaVersion": "0.2",
  "packageType": "profiling_report|training_live",
  "modelId": "qwen2-7b|openpangu-ultramoe-718b",
  "reportId": "r20260526",
  "runId": "optional",
  "generatedAt": "ISO8601",
  "sourceFiles": [],
  "sourceMode": "embedded|normalized|raw-derived|synthetic-physical|live"
}
```

### 5.2 Shared runtime identity

所有页面共用一套对象主键：

- `nodeId`
- `issueId`
- `reportIssueRef`
- `stepId`
- `streamId`
- `rankId`
- `deviceId`
- `runtimeOpName`
- `commGroupId`

### 5.3 Shared evidence object

```json
{
  "text": "...",
  "sourceFile": "kernel_details.csv",
  "sourceField": "Duration(us)",
  "confidence": "raw|derived|inferred",
  "scope": "compute|timeline|communication|source|physical"
}
```

### 5.4 Optional physical extension

对 Profiling 项目先可选支持，给 TrainScope 完整支持：

- `placementMap`
- `ranks`
- `cards`
- `coords.tp/pp/cp/dp/ep`
- `commSnapshots.byStep.byPhase`

## 6. 迁移顺序

### Phase 1：先收口 Profiling 项目内部

1. 把 `MindStudioNext.html` 里的业务数据持续迁出
2. 废弃“README 说有 chart-data.js，实际没有”的不一致状态
3. 用统一 `data/packages/<reportId>/` 目录承载报告数据

### Phase 2：让 MindStudioNext 和 GEW 共用同一包

1. `MindStudioNext` 不再直接依赖内嵌 `REPORTS/MDS/QWEN7B_*`
2. `Graph Evidence Workbench` 继续使用 loader，但读同一份 package
3. issue 卡、graph inspector、swimlane 都从 package 取数

### Phase 3：补 TrainScope 所需扩展

1. 在 normalized package 上追加 `timeseries / placement / commSnapshots`
2. 给已有 profiling 报告增加“可选 physical axis 投影”
3. 引入 adapter，把 Qwen 类 profiling report 和 Pangu 类 training monitor 接到同一 runtime identity

### Phase 4：统一生成链路

做一个离线构建器：

- 输入：raw profiler directory / synthetic runtime telemetry / embedded legacy report
- 输出：canonical normalized package

这样三个页面都不再自己做数据拼装。

## 7. 本次建议落地方向

优先级建议如下：

1. 先把 `Profiling_Insight_and_Tool` 认定的“标准数据层”定为 `graph-evidence` 这一套外置 JSON 契约
2. 让 `MindStudioNext` 逐步改成该契约的消费者，而不是继续扩大单 HTML 内嵌数据
3. 再把 `TrainScope` 作为上层扩展 schema 的消费者，补 physical axis、timeseries、stepTrace

原因：

- `graph-evidence` 已经有 schema、loader、parser，最接近可复用底座
- `TrainScope` 的 schema 更强，但它包含大量实时监护专属语义，直接拿来做 Profiling 底座会过重

## 8. 风险与待确认

- `MindStudioNext` 当前是否仍需要保留“单文件可分享”能力；如果要保留，需要额外做 package embed/export 能力
- `trace_view.json` 是否始终可得；若 cluster 只保留部分 rank 明细，需要定义 partial coverage 规则
- `visualize_data.bin` 这类大文件是否进入 canonical package，还是只保留索引与 provenance
- TrainScope 的物理轴数据当前有一部分是 synthetic/self-sampled，归一时必须保留 `sourceMode`，不能伪装成 raw profiler truth

## 9. 结论

当前两个项目不是“功能重复”，而是处在同一演进链的两个阶段：

- `Profiling_Insight_and_Tool`：从单页演示型工具，往“外置证据包 + 计算图/泳道联动”过渡
- `pangu-moe-trainviz`：从产品 spec 层定义“实时双轴运行时监护”

归一的正确路径不是合并页面，而是统一：

- 对象主键
- 证据类型
- provenance 字段
- runtime identity
- package schema

然后各页面各自保留自己的交互模型。
