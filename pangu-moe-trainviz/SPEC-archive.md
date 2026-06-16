# Pangu Pro MoE 分布式训练排障可视化 — 产品 Spec

> 工作代号：**TrainScope（盘古训练透视）**
> 模型对象：**Pangu Pro MoE**（72B 级，MoGE 分组专家，Ascend NPU，3D 并行 DP32 / PP8 / TP4）
> 一句话：把一次"loss 崩了但全机零硬件报错"的训练事故，用五层证据一屏闭环、十分钟看穿故障链——而不是翻几小时日志。

---

## 0. 范围与对象

五大可视化对象 + 全局关联：

| # | 可视化对象 | 承载视图 |
|---|---|---|
| ① | 整网算子 + 层数 | 中央 · 架构图 |
| ② | 权重 + Shape + Rank 拓扑上下文 | 右栏 · Inspector |
| ③ | 模型效果（loss/eval） | 底部 · 通信 + 效果 dock 左栏 |
| ④ | 训练关键参数 | 左栏 · 参数信号面板 |
| ⑤ | **分布式通信** | 底部 · 通信 + 效果 dock 右栏（可拖拽高度） |
| ★ | **全局关联** | 贯穿全部：一个兴趣窗口锚 + 选中即双向点亮 |

**边界**：这是"训练正确性"排障，不是性能 profiler。**不接 Chrome Trace（CTF）**。通信数据是"按 step 的轻量流量快照"，非 kernel trace。

---

## 1. 产品价值（为什么这东西该存在）

**问题现状**：千亿级 MoE 训练，稳定跑了 2000 步后 val loss 突然剧烈振荡、生成质量崩塌，而所有 NPU 零报错。工程师此刻面对的是：几十台机器、海量日志、各自为政的监控工具（loss 看 TensorBoard、通信看 profiler、权重要 dump、参数翻 config）。**排障靠经验在不同工具间搬运上下文，靠运气拼出因果。**

**价值主张**：
- **把抽象指标异常翻译成看得见的物理失衡**——"负载均衡损失骤降到 0"是个数字，**而"某张卡在通信拓扑上变成流量黑洞"是一眼能指的形状**。
- **五层证据一屏闭环**：效果 → 参数 → 通信 → 算子 → 权重 → 梯度回溯，在同一界面里沿一条故障链走完，**把数小时的日志考古压缩成一次可视追溯**。
- **全局关联是核心壁垒**：单视图工具看不到"loss 尖峰 ↔ 某个 Gate 算子 ↔ 某张卡 All-to-All ↔ 混合精度写越界"这种**跨层因果**。TrainScope 的护城河就是这条横切链路。

**差异点**：市面工具要么是性能 profiler（看 kernel 耗时/瓶颈，是另一类排障），要么是单一指标看板。TrainScope 专攻**训练正确性的跨对象关联排障**，并以 Pangu Pro MoE 的真实特征（MoGE 分组专家均衡）为锚。

**受众 / 用途**：训练工程师 / 算法 / infra 排障；同时是对外讲 Pangu × Ascend 训练可观测性能力的旗舰 demo。

---

## 2. UX 体验价值点 & 设计点（体验在先）

> 先讲体验缺口与设计应答，再讲功能。每个设计点都对应一个真实的认知负担。

### 2.1 体验缺口 → 设计应答

**缺口 A：从"发现异常"到"定位根因"，最大的负担是在工具间搬运上下文。**
→ **单一兴趣窗口锚**：在底部效果曲线上框选一次异常区间（如 Step 1950~2100），全部五个视图同步聚焦到这段 step，无需在五个工具里各自对一遍时间。**框选一次 = 全局对齐一次。**

**缺口 B：抽象数字（Load Balance Loss 骤降、grad norm 暴涨）无法被直觉感知。**
→ **物理拓扑把数字变成空间形状**：通信视图以 NPU mesh 为底，通信原语画成有向边，边的粗细+色深=实时流量，节点色=利用率。"某专家没被分到 token"直接呈现为"流入某 rank 的边几乎消失"的**黑洞**。数字 → 形状，认知零翻译。

**缺口 C：用户不知道"这个异常到底和哪些东西相关"。**
→ **选中即自解释关联**：点任一视图里的任一对象（算子节点 / 通信边 / 参数尖峰 / 权重项），其余四视图自动点亮关联部分（双向高亮）。关系不靠文档解释，靠点亮自证。

**缺口 D：排障是一个时间过程，不是一张快照。**
→ **时间是一等公民**：底部 dock 的共享播放条 scrubber 驱动全局 step 游标，**模型效果曲线与通信 mesh 同步演化**，可回放 Step 1997（混合精度更新）→ 1998（路由坍缩）的崩溃瞬间，让"事故发生"被看见而非被推断。

**缺口 E：Rank2 到底是哪个 rank？和 DP/PP/TP 拓扑是什么关系？**
→ **Rank 拓扑总图 + 局部证据放大**：右侧 Inspector 先用 ParallelDemo 风格的细粒度 rank map 展示 `DP32 × PP8 × TP4 = 1024 ranks` 在当前 MoE 诊断窗口里的映射，顶部播放条按 Pangu 算子流推进并联动中间架构图；下方路由热图再放大 `TP2 / Rank2` 列的 0 token 证据。先定位全局位置，再验证局部异常。

### 2.2 设计点（贯穿原则）

1. **信息层级沿排障叙事布局**：左 signal（参数，读到失衡信号）→ 中 stage（架构，定位根算子）→ 右 inspector（权重/shape/rank 拓扑，看清数值畸变与异常 rank 位置）→ 底 dock（效果 + 通信，回放时间过程）。**布局即引导路径。**
2. **全局关联的两根支柱**：① 一个兴趣窗口锚（时间维度对齐）+ ② 选中双向高亮（对象维度对齐）。所有联动都从这两件事派生。
3. **克制的强调（遵守 PTO 硬规则）**：一次只用一种强调机制。流量用粗细、优先级用 fill、关联用描边点亮——**不堆叠 border + 阴影 + 渐变**。至多一层可见边界，不做卡中卡。
4. **viz 色与 UI 色分离**：highlight 色带只出现在图/边/热图/legend，面板/卡片一律走 surface token，深色舞台、白色边线、图节点无阴影。
5. **物理与逻辑同框**：架构图是逻辑视图（层/算子），通信 dock 是物理视图（卡/链路）。同一个故障在两个抽象层各点亮一次，**逻辑根因 ↔ 物理表现**互相印证，是这套设计的高光。

---

## 3. 界面分区（workbench-shell 落地）

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TrainScope · 盘古训练透视      事故：Step2000 后 val loss 振荡 · 零硬件报错     │
├───────────────┬──────────────────────────────────────┬─────────────────────┤
│ ④ 参数信号面板 │  ① 整网架构图 [主舞台]                 │ ② 权重/Shape Inspector│
│  [左 rail]    │  Pangu Pro MoE DAG · PP分色            │  [右 inspector]      │
│  ▸静态配置     │  展开 Layer-k MoE 块:                  │  Weight Diff +       │
│   DP/PP/TP/EP │   Gate→All-to-All分发→MoGE专家         │  路由热图(双联对比)   │
│   lr/batch/seq│   →All-to-All汇聚                      │                     │
│  ▸动态指标     │  通信算子=蓝色 edge tag                 │                     │
│   grad norm   │  异常步节点=黄色告警                    │                     │
│   Load Bal⚡   │                                       │                     │
│   ⟵宽可拖⟶     │            ⟵ 宽可拖 ⟶                  │      ⟵宽可拖⟶        │
├───────────────┴──────────────────────────────────────┴─────────────────────┤
│  ⟱ 高度可拖 ⟱                                                               │
│  ③ 模型效果 + ⑤ 分布式通信 [底部 dock · 左右并排 · 共用 step 播放条]             │
│  左：train/val loss · eval(MMLU) 曲线，可框选兴趣窗口                         │
│  右：8 DP × 4 TP NPU mesh，边粗细=流量，节点色=利用率，TP2 黑洞，P2P 气泡        │
│  ◀ ▶ ▮ ───●────── shared scrubber：同时驱动效果曲线 + 通信 mesh              │
└──────────────────────────────────────────────────────────────────────────┘
```

**两层 frame/split（PtoWorkbenchShell）**：
- 外层 `.workbench-frame`（column）：frame header = 顶部品牌/事故条；其下是一个 **vertical split**（`direction:'vertical'`，panes=`[主区, 通信+效果dock]`，当前实现 `sizes:[61,39]`，`minSize:[260,200]`，gutter 可上下拖 → dock 高度可调）。
- 主区内层 = **horizontal split**（`panes:['#param-rail','#graph-stage','#inspector']`，当前实现 `sizes:[21,51,28]`，`minSize:[220,480,340]`，三栏宽可拖）。用 `initNestedResizablePanes` 组织外 vertical + 内 horizontal。
- 每个 pane 视觉由产品侧给：`background:var(--surface-2)` + `1px solid var(--border-subtle)` + `border-radius:var(--radius-md)`，内部内容块用 recessed `--surface-1`。gutter 把手由 pattern `::before` 免费提供，不自造。
- `storageKey` 持久化各分栏比例。

---

## 4. 排障叙事（七步闭环 · 串起所有视图的脚本）

**故事张力**：Pangu Pro MoE 的招牌是 **MoGE（Mixture of Grouped Experts）**，设计上就保证专家负载跨设备均衡。本次事故的反差在于——**故障源是混合精度写越界，绕过了路由逻辑本身**，让"本该不会失衡"的 MoGE 也崩了。

| 步 | 用户动作 | 点亮的视图 | 看到什么 |
|---|---|---|---|
| 1 | 在底部效果曲线③**框选** loss 异常段 | 设全局兴趣窗口 → ②③④⑤ 全按该 step 聚焦 | val loss Step2000 后高频尖峰、eval 跳水 |
| 2 | 看左栏④自动高亮的尖峰 → 点它 | 中央①展开对应 MoE 块 + 底部⑤高亮该 TP 组 | **Load Balance Loss 骤降≈0** + MoE 梯度暴涨（路由失效） |
| 3 | 点底部⑤的**流量黑洞边**(All-to-All) | 中央①刷亮 All-to-All 算子 + Gate 节点亮黄 | TP Rank2 流入边几乎消失、token 交换量低两个量级、P2P 气泡累积 |
| 4 | 点中央①的 **Gate 节点** | 右栏②出 Weight Diff + Rank 拓扑总图 + 路由热图；底部⑤标受影响 Rank2 | Gate dispatch shape 不一致：TP2 / Rank2 `[2048,1]` vs 其余 `[2048,4]` |
| 5 | 播放右栏② Rank 拓扑总图 | 中央架构图按 Pangu 算子流同步选中 | `one step batch → Embedding → Attention → Gate → Dispatch → Experts → Combine → logits/loss`；TP2 列在异常阶段高亮 |
| 6 | 看右栏②权重详情与路由热图 | — | `W_gate` Rank2 分片 `[4096,256]`→`[4096,64]`，数值 -inf（混合精度下溢）；路由热图 TP2 / Rank2 列全白 |
| 7 | 中央①右键 Gate **"追溯梯度流"** | 底部效果曲线③回退标到 Step1997 + 左栏④标混合精度更新事件 | **根因链闭环**：混合精度存储越界 → 权重畸变 → 路由坍缩 → 通信失衡 → loss 爆炸 |

---

## 5. 全局关联机制（技术）

**两个广播通道**，由一个轻量事件总线（借 workbench `GEW.bus` 思路自建，不接其 trace）驱动：

1. **兴趣窗口广播** `interestWindow:{ stepStart, stepEnd }`：时间轴框选发出 → 各视图按 step 范围取值/聚焦/求异常步。
2. **选中广播** `select:{ objectType, id, relatedNodeIds, rankIds, stepCursor }`：任一视图选中一个对象发出 → 各视图点亮关联。
   - 关系解析复用 model-training-graphviz 的 `relationForNode`：自身 ∪ `relatedNodeIds` ∪ `trainingEvidence[id].relatedNodeIds` ∪ 图上直连节点。
   - 跨视图映射表 `byNode / byRank`：nodeId ↔ relatedNodeIds ↔ 物理 rankIds ↔ evidence 双向索引。

3. **时间游标** `stepCursor`（底部 shared scrubber 驱动）：通信 dock 按 stepCursor 取该步流量快照实时重绘；效果曲线/参数面板画游标竖线。播放=游标自增。
4. **拓扑播放** `topology-playback`（右栏 Rank 拓扑总图发出 select）：按 Pangu 算子流推进 `token_ids → embedding → attention → moe_norm → gate → a2a_dispatch → experts → a2a_combine → final_norm → lm_head → logits`；每一步 `Bus.emit('select')` 到中央架构图，MoE 内部节点会触发中间图自动展开并选中。

**联动调用**：架构图用 `controller.selectNode(id,{relatedNodeIds,source})` / `controller.setPhase({nodeId,relatedNodeIds})`（**只改强调，绝不移动视口**）。

---

## 6. 数据模型（schema）

五类数据，全部静态 JSON / JS globals（demo 自带，无后端）：

```jsonc
// 1) model graph —— 复用 model-training-graphviz 运行时 schema
{
  "width": ..., "height": ...,
  "clusters": [{ "id","label","x","y","width","height","colorKey","repeat":"× N" }],
  "nodes":    [{ "id","label","typeLabel","kind":"op|tensor","x","y","width","height","colorKey" }],
  "edges":    [{ "source","target","tag","edgeType":"communication|parameter|gradient|cache" }],
  "trainingEvidence": {
    "<nodeId>": { "dimension","metric","what","evidence":[],"action","relatedNodeIds":[],"sources":[] }
  }
}
// Pangu Pro MoE 拓扑：Embedding → N×Transformer(含 MoE 块: Gate→All-to-All分发→MoGE专家组→All-to-All汇聚) → LM Head
// All-to-All / AllReduce 边 edgeType:"communication"（蓝），权重边 parameter（紫），梯度边 gradient（橙）

// 2) timeseries —— 每 step 训练指标（自绘曲线用）
{ "steps":[...], "series": { "train_loss":[], "val_loss":[], "eval_mmlu":[], "grad_norm":[], "load_balance_loss":[] } }

// 3) commSnapshots —— 每 step 物理 mesh 流量快照
{ "devices":[{ "rankId","dp","pp","tp","util" }],
  "byStep": { "<step>": { "flows":[{ "src","dst","prim":"all2all|allreduce|p2p","bytes" }], "util":{ "<rankId>":0..1 } } } }

// 4) weightDetail —— 每节点权重/shape 详情
{ "<nodeId>": { "normal":{ "shape":[...],"hist":[...] }, "anomaly":{ "step":1998,"shape":[...],"hist":[...],"note":"-inf 下溢" },
  "routingHeatmap":{ "rows","cols","matrix":[[...]] } } }

// 5) rankTopologyPlayback —— 右栏 Rank 拓扑总图的播放步骤（当前实现内置于 inspector.js）
[
  { "id":"batch", "nodeId":"token_ids", "stage":0, "label":"one step batch" },
  { "id":"embedding", "nodeId":"embedding", "stage":0 },
  { "id":"attention", "nodeId":"attention", "stage":1 },
  { "id":"gate", "nodeId":"gate", "stage":3, "anomaly":true },
  { "id":"dispatch", "nodeId":"a2a_dispatch", "stage":3, "anomaly":true },
  { "id":"experts", "nodeId":"experts", "stage":4, "anomaly":true },
  { "id":"combine", "nodeId":"a2a_combine", "stage":5, "anomaly":true },
  { "id":"logits", "nodeId":"logits", "stage":7 }
]
```

---

## 7. 功能点（MVP vs 二期）

**MVP（七步闭环跑通所必需）**：
- F1 底部效果曲线：train/val loss + eval 曲线，**框选兴趣窗口**，画 step 游标竖线，与通信 dock 共用播放条。
- F2 中央架构图：Pangu Pro MoE 拓扑渲染，cluster 折叠/展开（展开 MoE 块见 Gate/专家/All-to-All），节点 hover 证据面板，选中双向高亮，右键"追溯梯度流"。
- F3 左栏参数面板：静态配置（并行/lr/batch/seq）+ 动态指标小图（grad norm / Load Balance Loss），异常尖峰高亮+可点。
- F4 右栏 Inspector：Weight Diff（正常 vs 异常 step 直方图）+ Gate dispatch shape + **Rank 拓扑总图（顶部播放条、PP stage、rank cell、TP2 高亮、logits/loss）** + 路由热图，点/播放时联动中央架构图。
- F5 底部通信 + 效果 dock：左曲线、右 NPU mesh + 通信原语边，**流量与效果曲线随 step 同步变化**，黑洞/气泡高亮，shared scrubber 播放/拖动。
- F6 全局联动：兴趣窗口 + 选中 + step 游标 + 拓扑播放四类事件贯通。

**二期**：
- 多故障场景切换（除路由坍缩外，加 TP AllReduce 掉队 / PP 气泡）。
- 显存维度叠加（接 ParallelDemo 的并行/显存逻辑，补激活显存公式）。
- 证据导出 / 排障报告快照。
- 接灵衢硬件层口子（mesh 之下的物理互联故障对照）。

---

## 8. 复用 / 新建 / 设计系统缺口

| 模块 | 来源 | 状态 |
|---|---|---|
| 分栏外壳（含底部可拖拽 dock） | `PtoWorkbenchShell.initNestedResizablePanes` | ✅ 直接复用 |
| 中央架构图 + 联动高亮 + 证据 hover | `PtoModelTrainingGraphvizPattern.render` | ✅ 直接复用，新造 Pangu Pro MoE graph JSON |
| 通信拓扑 mesh + 通信边 | `PtoModelGraphvizPattern`（device 节点 + communication 蓝边） | ✅ 复用底图，流量粗细/黑洞用 edge 权重 + node fill；逐 step 重绘 |
| 底部播放条 / scrubber | 产品侧轻量 transport + design-system button/input token | ✅ 已实现，绑定 `stepCursor`，同时驱动效果曲线与通信 mesh |
| 右栏 Rank 拓扑播放条 | ParallelDemo 拓扑语义 + 产品侧轻量 transport | ✅ 已实现，绑定 `topology-playback → select`，联动中央架构图 |
| 右栏 Inspector 外壳 | `panel-shell` + `panel` + `tag`/`status-*` | ✅ 基础组件组合 |
| 参数面板 | `card`/`input`/`tag` + form grid | ✅ 基础组件组合 |
| loss/梯度数值曲线（折线图） | `patterns/training-metrics-chart` | ✅ 已沉淀为共享 pattern，支持曲线、异常点、brush 兴趣窗口、cursor |

---

## 9. 技术栈 & 工程

- 纯原生 HTML/CSS/JS，无框架、无外部 UI 库、无 CDN（不引 split.js，分栏用 PtoWorkbenchShell）。
- **Token 引入顺序**：`tokens/foundation.css` → `tokens/semantic.css` → `tokens/components.css` → `css/style.css`。
- **Pattern 引入顺序**：`model-graphviz` 的 css/js → `model-training-graphviz` 的 css/js → `workbench-shell` → `training-metrics-chart`。
- 颜色/间距/字体/圆角一律 `var(--*)`；viz 色带仅用于图/边/热图；优先级用 fill（P0 红 / P1 橙 / P2 黄，**P2 不用蓝**）。
- 页面 chrome 走 PTO 基线：透明顶栏、首个外壳紧贴 header、不加装饰带。
- 数据全静态 JSON 内嵌/同目录加载；通信快照按 step 取，**不接 CTF trace**。
- 文件结构（建议）：
  ```
  pangu-moe-trainviz/
    index.html
    css/app.css
    js/{bus,graph-view,timeline,param-rail,inspector,comm-dock,info,app}.js
    data/{graph,timeseries,comm,weight}.js
  ```

---

## 10. 验收 / 成功标准

1. 七步排障叙事在界面上**全程可点、可联动**走通，无需任何外部日志。
2. 框选一次兴趣窗口，五视图同步聚焦；点任一对象，其余视图点亮关联。
3. 通信流量与效果曲线随 shared scrubber 播放**逐 step 演化**，能回放出 Step1997→1998 的崩溃瞬间。
4. 右栏 Rank 拓扑总图可播放/拖动，步骤能联动中央架构图对应节点；播放到 MoE 内部节点时，中央图自动展开并选中。
5. 视觉 100% 走 PTO token，零私造控件，至多一层可见边界，图节点无阴影。

---

## 11. 当前实现状态

- 页面目录：`/Users/yin/pto/pangu-moe-trainviz/`
- 工作代号：**TrainScope · 盘古训练透视**
- 已接入 launch 入口与预览图。
- 已实现：三栏主区、底部通信+效果 dock、共享 step 播放条、架构图 MoE 折叠/展开、权重/shape Inspector、Rank 拓扑总图播放条、路由热图 hover、面板 info 说明。
- 已验证：JS 语法检查、浏览器截图、右栏拓扑播放条拖到 `Attention` 后中央架构图同步选中 `attention` 节点。
