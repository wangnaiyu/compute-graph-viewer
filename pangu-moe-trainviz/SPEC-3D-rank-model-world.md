# TrainScope 3D World Spec: Rank Grid 与模型架构映射

> 工作代号：TrainScope 3D World
> 版本：v0.1
> 状态：新建规格草案
> 目标读者：产品、设计、前端、可视化工程、不了解大模型训练的新同事
> 相关页面：`architecture-718b.html`、`trainscope-live.html`、`hpc-topology-viewer/ub-fabric-reference.html`

## 0. 一句话

TrainScope 的 3D 世界不是把模型架构图立起来，而是把“模型结构对象”和“运行时 rank 放置”放进同一个坐标体系：XY 平面表达 rank/device/topology placement，Z 轴表达模型 block 深度，2D 模型架构图作为逻辑计算图与证据面板，通过 `blockId / opId / expertId / rankId` 与 3D 世界联动。

## 1. 本 spec 要解决的疑惑

用户看到两个图时容易混淆：

1. `ub-fabric-reference.html` 这类 topology 页面里，一个格子是不是 rank？
2. 2D 模型架构图到底是 3D 世界的正视图、右视图、俯视图，还是另一种图？
3. layer / block / rank / chip / weight / expert 之间是什么关系？
4. 哪些关系是静态 placement，哪些关系是训练 step 里动态发生的？
5. MoE 里的 EP 要怎么放进这个模型，而不把 EP 误说成 layer 或 card？

本 spec 的答案：

- rank 是运行时执行单元，可以被画成 XY 平面上的格子。
- card/chip 是物理设备，rank 可以一对一映射到 card，也可能不是。
- 模型架构图是逻辑 DAG，不是正视图、右视图或俯视图。
- 3D 世界用正交投影生成 top/front/right views。
- 模型对象和 rank 之间通过 placement map 连接，不通过肉眼猜测。

## 2. 信息来源与可信度

| 信息 | 当前取值 | 可信度 | 用途 |
|---|---:|---|---|
| 模型结构 | openPangu-Ultra-MoE-718B | 官方公开 config / 推理代码 | 作为计算轴底座 |
| block 数 | `num_hidden_layers=61` | 官方公开 config | Z 轴模型深度 |
| Dense block | `first_k_dense_replace=3` | 官方公开 config | blocks 0-2 |
| MoE block | 58 个 | 由 61 - 3 推导 | blocks 3-60 |
| routed experts | `n_routed_experts=256` | 官方公开 config | MoE 内部专家池 |
| shared experts | `n_shared_experts=1` | 官方公开 config | MoE 共享专家 |
| token 选专家数 | `num_experts_per_tok=8` | 官方公开 config | 动态路由 top-k |
| MTP head | `num_nextn_predict_layers=1` | 官方公开 config | 末端训练头 |
| 推荐 rank mesh | `DP=32 / PP=16 / CP=1 / TP=8` | 产品派生样例 | 3D demo placement |
| EP placement | `EP=32`，每 bucket 8 experts | 产品派生样例 | MoE experts 到 rank 的解释 |
| 每 step 遥测 | loss / grad / router / bytes | 需要自采或合成 | 动态 overlay |

重要边界：

- `EP=32` 不是模型 config 原生字段。它是产品样例里的 runtime placement 设定。
- 公开模型结构不能证明官方训练时每个 rank 的真实 placement。
- 没有自采 run 时，所有 step 级动态指标必须标注为 synthetic / reprojected。

## 3. 三种视图的定义

### 3.1 Runtime Rank Grid

代表页面：`hpc-topology-viewer/ub-fabric-reference.html`

它回答：

```text
模型运行时，rank / device / chip / card / node 在哪里？
rank 之间有哪些通信组和通信边？
```

推荐语义：

```text
XY 平面 = runtime placement mesh
格子 = rank tile
格子上的 label = rankId + dp/pp/tp/cp/ep coords
格子的容器 = card / node / fabric / rack
线 = rank 之间的通信关系
```

注意：

- 如果当前 demo 是 one rank per card，可以把格子直接写成 `rank_299 / card_299`。
- 如果未来一张卡多个 rank，格子内部必须再切小格，不允许继续把 card 等同 rank。
- XY 的 x/y 是可视化布局坐标，不天然等于 DP 或 TP。具体 lens 决定 x/y 当前按什么规则排布。

### 3.2 Model Architecture Graph

代表页面：`architecture-718b.html`

它回答：

```text
token 如何经过 Embedding、Dense block、MoE block、Router、Expert、LM Head？
模型里有哪些 op、parameter、state、communication semantic edge？
```

它不是：

```text
不是 rank grid 的俯视图
不是 3D 世界的正视图
不是 3D 世界的右视图
不是硬件拓扑图
```

它是：

```text
逻辑计算图 / computation DAG / model object map
```

它的节点应该是模型对象：

- `embedding`
- `dense_block`
- `moe_block`
- `mla`
- `gate`
- `a2a_dispatch`
- `expert_group_00..31`
- `shared_expert`
- `a2a_combine`
- `final_norm`
- `lm_head`

这些节点只有被 placement map 映射后，才知道它们在哪些 rank 上执行。

### 3.3 3D World

3D 世界回答：

```text
模型结构对象如何投影到 rank/device/chip 上？
每个 rank 持有哪些 layer range、tensor shard、expert bucket、weight shard？
训练 step 中 activation、gradient、token routing、communication 如何流动？
```

推荐坐标：

```text
X = rank grid 横向布局，常用于 TP / EP / device column lens
Y = rank grid 纵向布局，常用于 DP / node / replica lens
Z = model depth，block index 0..60 + MTP/head
```

严格定义：

- X/Y 不是固定物理定律，是当前 lens 下的 rank placement 布局。
- Z 固定表达模型深度，优先使用 block index。
- PP stage 是 Z 轴上的连续 block range，不是新轴。
- rank 是 `x/y` 平面上的格子，并在某个 `z` range 上承担计算。

## 4. 正交投影视图

### 4.1 Top View

Top view 是 `ub-fabric-reference` 最接近的视角。

```text
look from +Z
see X/Y rank mesh
hide model depth
```

用途：

- 看 rank / chip / card / node placement。
- 看 TP/DP/EP/PP/CP 通信组在 XY 平面上的分布。
- 看 All-to-All / AllReduce / SendRecv 走哪些 rank。

### 4.2 Front View

```text
look from +Y
see X/Z
```

用途：

- 固定某个 DP replica 或某个 node slice。
- 看一个 rank group 沿模型深度承担哪些 block。
- 解释 TP / EP 在同一 block 内部如何并排切分。

示意：

```text
FRONT VIEW: X/Z

          TP0      TP1      TP2      TP3      ...      TP7
Z
^  PP5    rank     rank     rank     rank              rank
|         B20-23   B20-23   B20-23   B20-23            B20-23
|
|  MoE    EP16     EP17     EP18     EP19              EP23
|         E128-135 E136-143 E144-151 E152-159          E184-191
|
|  PP0    rank     rank     rank     rank              rank
|         EMB+B0-3 EMB+B0-3 EMB+B0-3 EMB+B0-3          EMB+B0-3
+-----------------------------------------------------------------> X
```

### 4.3 Right View

```text
look from +X
see Y/Z
```

用途：

- 固定某个 TP/EP slice。
- 看多个 DP replica 是否拥有同构 placement。
- 看 PP stage range 如何沿模型深度切开。

示意：

```text
RIGHT VIEW: Y/Z

          DP0          DP1          DP2          ...          DP31
Z
^  PP15   ranks        ranks        ranks                     ranks
|         B58-60       B58-60       B58-60                    B58-60
|
|  PP5    ranks        ranks        ranks                     ranks
|         B20-23       B20-23       B20-23                    B20-23
|
|  PP0    ranks        ranks        ranks                     ranks
|         EMB+B0-3     EMB+B0-3     EMB+B0-3                  EMB+B0-3
+--------------------------------------------------------------------> Y
```

## 5. Rank 的精确定义

rank 是分布式训练运行时的执行进程或通信成员。

一个 rank 应该带这些坐标：

```json
{
  "rankId": 299,
  "deviceId": "910B_299",
  "hostId": "host_37",
  "cardId": "card_3",
  "coords": {
    "dp": 2,
    "pp": 5,
    "cp": 0,
    "tp": 3,
    "ep": 19
  }
}
```

这个 rank 的含义：

```text
DP2  = 第 2 个数据副本，吃自己的 mini-batch shard
PP5  = 第 5 个流水线 stage，只负责某段 blocks
CP0  = 本例不做上下文切分
TP3  = 当前 stage 内张量/attention/MLP 的第 4/8 片
EP19 = MoE block 内承载 expert bucket 19，例如 experts 152-159
```

禁止说法：

```text
rank_299 跑完整盘古模型
rank_299 就是第 299 张卡
rank_299 就是一层模型
EP19 就是一层
EP19 就是一张卡
```

推荐说法：

```text
rank_299 运行在 910B_299 上。
它属于 DP2 / PP5 / TP3 / CP0 / EP19。
它持有 PP5 覆盖 block range 内的 TP3 权重分片。
在 MoE block 中，它还承载 EP19 对应的 expert bucket。
```

## 6. Model Object 到 Rank 的映射规则

### 6.1 Block 到 PP Stage

PP 把模型深度切成连续 block range。

示例：

```json
{
  "ppStages": [
    { "pp": 0, "blocks": [0, 1, 2, 3], "extra": ["embedding"] },
    { "pp": 1, "blocks": [4, 5, 6, 7] },
    { "pp": 5, "blocks": [20, 21, 22, 23] },
    { "pp": 15, "blocks": [58, 59, 60], "extra": ["final_norm", "lm_head", "mtp_head"] }
  ]
}
```

### 6.2 Block 内部到 TP Shard

TP 切的是同一个 block 内部的矩阵、head 或输出维。

例如 `PP5 / TP3`：

```text
Blocks 20-23 内：
- MLA Q/K/V/O projection 的第 4/8 片
- Dense MLP 或 MoE projection 的第 4/8 片
- 必要时参与 TP all-reduce / reduce-scatter / all-gather
```

### 6.3 MoE Expert 到 EP Bucket

EP 只在 MoE block 内有意义。

专家身份必须带 `blockId`：

```text
block 20 / expert 152
block 21 / expert 152
```

这两个不是同一份 weight。

示例 EP bucket：

```json
{
  "blockId": 20,
  "epBucket": 19,
  "expertIds": [152, 153, 154, 155, 156, 157, 158, 159],
  "rankIds": [299]
}
```

如果未来 expert 被 shard 或 replicated：

```json
{
  "blockId": 20,
  "expertId": 152,
  "owners": [
    { "rankId": 299, "shard": "w1:0/2,w2:0/2" },
    { "rankId": 300, "shard": "w1:1/2,w2:1/2" }
  ]
}
```

### 6.4 DP Replica

DP 复制同一套 placement pattern，处理不同数据 shard。

```text
DP0 / PP5 / TP3 / EP19 和 DP2 / PP5 / TP3 / EP19
模型结构位置相同
rank/device 不同
batch shard 不同
gradient sync group 相关
```

## 7. Weight / Parameter 的位置

weight 是静态驻留对象，不是流动的线。

### 7.1 Dense 模型参数

Dense block 的参数包括：

- attention projection weights
- dense MLP gate/up/down weights
- RMSNorm weights

它们按 PP 和 TP 放到 rank 上：

```text
PP stage 决定哪些 block 的 weight 在这个 rank group 上
TP shard 决定这些 weight 的哪一片在这个 rank 上
DP replica 决定这份 placement 被复制到哪个数据副本
```

### 7.2 MoE 参数

MoE block 的参数包括：

- router / gate weight
- routed expert weights
- shared expert weights
- norm / residual 相关参数

其中 routed expert weight 要按 `blockId + expertId` 定位。

```text
block 20 / expert 152 / w1
block 20 / expert 152 / w2
block 21 / expert 152 / w1
```

这三者都不是同一个参数。

### 7.3 Optimizer State

optimizer state 跟随 parameter ownership。

UI 表达：

```text
weight tile = 参数
thin backplate = optimizer state
gradient overlay = backward 产生的更新信号
```

## 8. 静态关系与动态关系

### 8.1 静态关系

run 初始化后基本固定：

- model config
- block 类型：Dense / MoE
- PP stage range
- rank -> device placement
- rank -> dp/pp/cp/tp/ep coords
- parameter shard ownership
- expert bucket ownership
- communication group membership

### 8.2 动态关系

每个 step / micro-batch 会变化：

- activation flow
- gradient flow
- token -> top-k experts routing
- All-to-All bytes
- expert token count
- rank util
- loss contribution
- grad norm
- overflow / underflow signal

产品上必须用不同视觉语义区分：

| 类型 | 推荐表达 |
|---|---|
| 静态 ownership | 边框、标签、固定 tile |
| 动态 activation | 正向 pulse / flow |
| 动态 gradient | 反向 pulse / orange overlay |
| 动态 token routing | MoE dispatch/combine line width |
| 动态异常 | deviation badge / heat / tooltip |

## 9. 数据契约

### 9.1 `modelConfig`

```json
{
  "modelId": "openPangu-Ultra-MoE-718B",
  "numBlocks": 61,
  "denseBlocks": [0, 1, 2],
  "moeBlocks": { "start": 3, "end": 60 },
  "mtpHeads": 1,
  "hiddenSize": 7680,
  "routedExperts": 256,
  "sharedExperts": 1,
  "expertsPerToken": 8
}
```

### 9.2 `parallelConfig`

```json
{
  "dp": 32,
  "pp": 16,
  "cp": 1,
  "tp": 8,
  "ep": 32,
  "source": "product_demo_placement",
  "note": "EP is modeled as expert placement inside DP groups, not an extra multiplier for total card count."
}
```

### 9.3 `rankPlacement`

```json
{
  "rankId": 299,
  "deviceId": "910B_299",
  "nodeId": "node_37",
  "cardId": "card_3",
  "grid": { "x": 3, "y": 2 },
  "coords": { "dp": 2, "pp": 5, "cp": 0, "tp": 3, "ep": 19 },
  "stageBlocks": [20, 21, 22, 23],
  "labels": ["PP5", "TP3", "DP2", "EP19"]
}
```

### 9.4 `expertPlacement`

```json
{
  "blockId": 20,
  "epBucket": 19,
  "expertIds": [152, 153, 154, 155, 156, 157, 158, 159],
  "ownerRankIds": [299],
  "ownerDeviceIds": ["910B_299"]
}
```

### 9.5 `parameterPlacement`

```json
{
  "parameterId": "blocks.20.moe.experts.152.w1",
  "kind": "routed_expert_weight",
  "blockId": 20,
  "expertId": 152,
  "owners": [
    { "rankId": 299, "shard": "full_or_tp3" }
  ],
  "optimizerStateOwners": [
    { "rankId": 299, "state": ["m", "v"] }
  ]
}
```

### 9.6 `runtimeTrace`

```json
{
  "step": 1998,
  "microBatch": 7,
  "phase": "forward",
  "events": [
    {
      "type": "moe_dispatch",
      "blockId": 20,
      "sourceRankId": 292,
      "targetRankId": 299,
      "epBucket": 19,
      "tokens": 128,
      "bytes": 3932160
    },
    {
      "type": "expert_compute",
      "rankId": 299,
      "blockId": 20,
      "expertIds": [152, 153, 154, 155, 156, 157, 158, 159],
      "tokens": 128
    }
  ]
}
```

## 10. 交互需求

### 10.1 Hover rank tile

必须回答：

```text
这个 rank 在哪张卡上？
属于哪个 DP / PP / TP / CP / EP？
负责哪些 blocks？
持有哪些 weight shard？
持有哪些 expert bucket？
当前 step 有没有异常？
```

### 10.2 Hover block

必须回答：

```text
这是 Dense 还是 MoE block？
属于哪个 PP stage？
哪些 rank group 执行它？
它有哪些参数？
如果是 MoE，它有哪些 expert bucket？
```

### 10.3 Hover expert bucket

必须回答：

```text
这是哪个 block 的 bucket？
包含哪些 expertId？
在哪些 rank/device 上？
当前 step 收到了多少 token？
All-to-All dispatch/combine 是否异常？
```

### 10.4 Hover model graph node

必须联动：

- 在 2D 模型架构图中高亮该逻辑节点。
- 在 3D world 中高亮所有相关 `blockId/opId`。
- 在 rank grid 中高亮 owner ranks。
- 在 inspector 中显示 source boundary：official config / product placement / runtime trace。

## 11. MVP 视图组合

MVP 不需要一次做完整 3D WebGL。可以先做三个互相联动的 2D 视图：

1. `Architecture Graph`
   - 使用现有 `architecture-718b.html`
   - 表达模型逻辑 DAG

2. `Rank Grid Top View`
   - 参考 `ub-fabric-reference.html`
   - 每个 tile 是 rank
   - 支持 DP/PP/TP/EP lens

3. `Orthographic Wireframe`
   - front view: X/Z
   - right view: Y/Z
   - 先用 SVG/Canvas 或 terminal wireframe，解释坐标关系

这三个视图共享同一个 selection state：

```json
{
  "selected": {
    "rankIds": [299],
    "blockIds": [20, 21, 22, 23],
    "opIds": ["gate", "a2a_dispatch", "expert_group_19"],
    "expertIds": [152, 153, 154, 155, 156, 157, 158, 159]
  }
}
```

## 12. UI 文案规范

推荐文案：

```text
rank 是运行时进程，不等同于 card。
模型 block 是逻辑结构，不等同于 rank。
PP 决定这个 rank 覆盖哪些连续 blocks。
TP 决定这些 blocks 内部矩阵的哪一片在这个 rank 上。
EP 决定 MoE block 的哪些 experts 放在这个 rank 上。
DP 决定这个 rank 属于哪份数据副本。
weight 静态驻留；activation / gradient / token routing 是动态流动。
```

禁止文案：

```text
这张卡负责整个模型
这个 EP 是一层
这个 expert bucket 就是一张卡
模型架构图是 topology 的正视图
rank grid 是模型架构图的俯视图
```

## 13. 验收标准

### 13.1 概念准确性

- 用户能在 30 秒内看懂 `rank != card != block`。
- 用户能理解 `2D architecture graph` 是逻辑 DAG，不是 3D 正交投影。
- 用户能理解 `XY rank grid` 表示 runtime placement。
- 用户能理解 `Z axis` 表示 model block depth。
- 用户能理解 `PP stage = Z 上的连续 block range`。
- 用户能理解 `EP bucket` 只在 MoE block 内有效。

### 13.2 数据准确性

- 所有 expert placement 必须带 `blockId`。
- 所有 rank tile 必须带 `rankId` 和 `coords`。
- 所有 parameter ownership 必须能追溯到 rank。
- 所有 runtime event 必须带 `step` 和 `phase`。
- 所有 synthetic/reprojected 数据必须标注。

### 13.3 交互准确性

- 点击/hover model graph node 能找到相关 rank。
- 点击/hover rank 能找到相关 block/op/expert。
- 点击/hover expert bucket 能找到对应 block 和 rank。
- 切换 DP/PP/TP/EP lens 不改变底层数据，只改变布局与强调。

## 14. 非目标

MVP 不做：

- 官方未公开训练 placement 的伪造声明。
- kernel-level profiler timeline。
- 每个专家的完整 256×58 全量展开默认视图。
- 把 EP 当作 world size 乘数重复计数。
- 把 2D 模型架构图强行解释为 3D 正视图或右视图。
- 把 card、chip、device、rank 混成同一个概念。

## 15. 交付计划

### Step 1: 概念 wireframe

- terminal / markdown 画 top/front/right 三个投影。
- 明确每个投影回答的问题。
- 明确 2D 模型架构图不属于正交投影。

### Step 2: 数据 schema

- 落 `modelConfig`
- 落 `parallelConfig`
- 落 `rankPlacement`
- 落 `expertPlacement`
- 落 `parameterPlacement`
- 落 `runtimeTrace`

### Step 3: Rank Grid Top View

- 基于 `ub-fabric-reference.html` 的格子语义。
- 每个格子显示 rank。
- hover tip 显示 coords 与 stage blocks。

### Step 4: Orthographic Views

- front view: X/Z
- right view: Y/Z
- 与 rank grid 共用 selection state。

### Step 5: Architecture Graph Bridge

- 使用现有 `architecture-718b.html`。
- model node hover -> rank owners。
- rank hover -> model objects。

### Step 6: Runtime Overlay

- forward activation
- backward gradient
- MoE dispatch/combine
- DP/TP all-reduce
- deviation radar

## 16. 最终产品判断

正确的产品心智应该是：

```text
模型架构图告诉我“模型里面是什么”。
rank grid 告诉我“运行时在哪里跑”。
3D world 告诉我“模型对象如何落到这些 rank 上”。
runtime overlay 告诉我“这一步训练里数据和通信如何流动”。
```

这比“把模型图画成立体”更准确，也更能解释大模型训练里 layer、rank、weight、expert、communication 的真实关系。
