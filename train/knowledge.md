Q:如果可视化体验需要超越tensorboard之类，应该着重哪些呈现？
要超越 TensorBoard，重点不应放在“曲线更多、图更炫”，而应放在**让研究者更快判断：哪里变了、为什么变了、下一步该做什么**。

TensorBoard 本身已经覆盖了基础可视化：loss / accuracy 等指标曲线、模型图、权重直方图、embedding 投影、图片/文本/音频展示、profiling 等。([TensorFlow][1]) 所以新的体验要拉开差距，应重点做这些呈现：

## 1. 从“曲线面板”升级为“实验决策视图”

很多实验看完曲线后，真正的问题是：

“这次改动到底有没有价值？”

所以主视图不要只是 runs 列表 + scalar charts，而应呈现：

* 本次实验假设是什么
* 相比 baseline 改了哪些变量
* 哪些指标变好，哪些指标变差
* 结论是否显著
* 推荐下一步动作

例如每个实验可以自动生成一张“实验卡片”：

> 改动：batch size 64 → 128，lr warmup 2k → 5k
> 结果：验证集 accuracy +0.7%，推理延迟 +12%，显存 +18%
> 判断：质量提升较小，成本上升明显，不建议进入候选模型
> 需要复查：class_17、long-tail bucket 退化明显

这比单纯展示 8 条 loss 曲线有用得多。

## 2. 多目标 trade-off，而不是单指标排行榜

TensorBoard 类工具常让人盯着单个 metric。实际研发中，模型优劣通常是多目标问题：

* accuracy / F1 / win rate
* latency
* GPU memory
* throughput
* cost per 1k samples / tokens
* 稳定性
* 安全性或业务约束

建议重点做 **Pareto frontier / trade-off map**。例如：

横轴延迟，纵轴质量，点大小表示成本，颜色表示模型族或数据版本。用户一眼能看出哪些模型是“同等质量更便宜”或“同等延迟更准”。

这类呈现比“按 accuracy 排序”更接近真实决策。

## 3. 指标下钻到样本：从 aggregate 到 case-level

平均指标经常掩盖问题。一个体验更好的系统，应该允许用户从曲线或指标直接点到样本层：

* 哪些样本从对变错
* 哪些样本从错变对
* 哪些类别退化最严重
* 哪些数据 slice 拉低总体表现
* 模型输出、label、置信度、解释字段、媒体内容并排展示

W&B Tables 的方向就是这个：用表格可视化和查询数据，比较不同模型在同一测试集上的表现，找出常见误分类样本，并支持图片、视频、音频等 rich media。([Weights & Biases][2])

如果要超越这类工具，应把样本视图做成核心，而不是附属功能。训练曲线告诉你“发生了什么”，样本视图告诉你“为什么发生”。

## 4. 实验差异视图：突出“变化”而不是“绝对值”

用户通常不是想看某次 run 的全部信息，而是想知道：

“Run B 相比 Run A 变化在哪里？”

建议把 diff 作为一级能力：

* config diff
* code commit diff
* dataset diff
* checkpoint diff
* metric diff
* error slice diff
* prediction diff
* prompt diff，适用于 LLM
* retrieval result diff，适用于 RAG

呈现方式可以是：

| 维度            | Baseline | Candidate |     变化 |
| ------------- | -------: | --------: | -----: |
| eval accuracy |     82.1 |      83.0 |   +0.9 |
| p95 latency   |    180ms |     230ms | +27.8% |
| GPU memory    |     19GB |      24GB | +26.3% |
| hard slice F1 |     61.4 |      57.2 |   -4.2 |

关键不是列出所有信息，而是自动把“值得注意的变化”排在前面。

## 5. 训练过程的“阶段感”呈现

普通 loss curve 太粗。更有价值的是识别训练过程中的阶段：

* warmup 是否稳定
* loss plateau 从什么时候开始
* 是否出现梯度爆炸或梯度消失
* validation gap 何时扩大
* learning rate 变化是否对应 metric 波动
* 数据混合比例变化是否引发性能变化
* checkpoint 之间是否有质量突变

可以做成时间轴：

> step 0–2k：warmup，loss 快速下降
> step 2k–18k：稳定学习，validation 同步提升
> step 18k 后：train loss 继续下降，val loss 持平，疑似过拟合
> step 24k：hard slice 开始退化，建议回滚至 checkpoint-22000

这种“训练叙事”比曲线堆叠更接近专家分析过程。

## 6. 系统资源与模型质量叠加

很多训练问题不是模型本身，而是系统瓶颈：

* GPU utilization
* memory
* IO wait
* dataloader throughput
* network
* checkpoint 写入耗时
* distributed training straggler
* cost
* queue time

好的呈现应该把资源曲线和训练指标放在同一时间轴上。例如 validation loss 突然抖动时，能同时看到那一段 GPU utilization、data loading、节点错误、checkpoint 保存等信息。

TensorBoard 已有 profiling 能力，([TensorFlow][1]) 但更进一步的体验应把 profiling 从“性能专家工具”变成“训练异常解释工具”。

## 7. 数据、模型、代码、评估的 lineage 图

实验可视化的核心不是 run，而是 lineage：

> 哪个数据版本 + 哪段代码 + 哪个配置 + 哪个 checkpoint + 哪套 eval 产生了这个结果？

建议做 DAG 视图：

```text
dataset:v12
   ├── preprocessing:v4
   ├── code:commit-a8f31
   ├── config:lr_3e-4_bs128
   └── run:2026-06-09-001
          ├── checkpoint:step_22000
          ├── eval:main_eval_v7
          └── model:candidate_14
```

W&B Artifacts 支持追踪和版本化 run 的输入/输出，例如训练 run 输入 dataset、输出 model checkpoint。([Weights & Biases][3]) MLflow Model Registry 也强调模型生命周期管理、lineage、versioning、aliasing、metadata 等。([MLflow AI Platform][4])

如果可视化要进一步提升，lineage 不应只是审计功能，而应服务于日常判断：哪个实验可信、哪个结果可复现、哪个模型能上线。

## 8. 评估中心：把 eval 做成一等公民

不要把 eval 结果当成几条 metric。应呈现为完整的评估工作台：

* eval set 版本
* 指标定义版本
* 分 slice 结果
* 失败样本聚类
* 回归检测
* 人工标注结果
* judge model 评分
* 置信区间
* 与历史候选模型对比
* 是否通过发布门槛

对 LLM / Agent 场景，还要重点呈现：

* prompt 版本
* system message diff
* tool call trace
* retrieval context
* intermediate reasoning steps 的可审计摘要
* latency / token / cost 分解
* judge 评分理由
* human preference 标注

LangSmith 和 Phoenix 这类 LLM observability / evaluation 工具已经把 tracing、evaluation、monitoring 放到了核心位置。([LangChain 文档][5]) 如果你的场景涉及 LLM、RAG 或 Agent，这部分应该优先级很高。

## 9. 错误聚类和 failure mode 地图

单个 bad case 太多，平均指标太粗。中间层应该是 failure mode：

* 哪类输入经常失败
* 哪些标签容易混淆
* 哪些长度区间退化
* 哪些语言/地区/设备/用户群体退化
* 哪些 prompt pattern 触发失败
* 哪些 retrieval miss 导致 hallucination

可以呈现为：

```text
Failure clusters
1. 长文本截断导致答案缺失：占失败样本 23%
2. OCR 噪声导致实体识别错误：占 17%
3. 多跳问题 retrieval 不完整：占 14%
4. 相似类别混淆：占 11%
```

这类视图直接帮助团队决定下一步是改模型、改数据、改 retrieval，还是改评估集。

## 10. 面向协作的“结论层”

很多工具记录了数据，但没有记录判断。好的系统应该支持：

* run annotation
* 实验结论
* reviewer 评论
* approve / reject 状态
* 发布决策
* 自动生成实验报告
* 一键分享某个对比视图

建议把报告变成可视化体验的一部分，而不是导出后的文档。

例如每周自动生成：

> 本周共 37 次实验。
> 3 个模型超过 baseline。
> 1 个模型进入 staging。
> 主要提升来自数据清洗 v5。
> 主要退化集中在 long-context slice。
> 推荐下周优先处理 retrieval recall，而不是继续调 learning rate。

## 最值得优先做的 6 个视图

如果资源有限，我会按这个顺序做：

1. **实验对比矩阵**：run、config、metric、成本、结论并排。
2. **样本级错误分析器**：从指标下钻到具体 prediction。
3. **多目标 Pareto 图**：质量、延迟、成本、显存放在一起看。
4. **实验 diff 视图**：突出相对 baseline 的变化。
5. **lineage 图**：数据、代码、模型、eval、checkpoint 串起来。
6. **LLM / Agent trace 视图**：如果涉及 LLM，这是核心，不是附加项。

一句话总结：
**TensorBoard 强在“看训练发生了什么”；更高级的可视化应强在“解释为什么、比较值不值得、指导下一步怎么做”。**

[1]: https://www.tensorflow.org/tensorboard?utm_source=chatgpt.com "TensorBoard"
[2]: https://docs.wandb.ai/models/tables?utm_source=chatgpt.com "Tables overview - Weights & Biases Documentation - Wandb"
[3]: https://docs.wandb.ai/models/artifacts?utm_source=chatgpt.com "Artifacts overview - Weights & Biases Documentation - Wandb"
[4]: https://mlflow.org/docs/latest/ml/model-registry/?utm_source=chatgpt.com "ML Model Registry | MLflow AI Platform"
[5]: https://docs.langchain.com/langsmith/home?utm_source=chatgpt.com "LangSmith docs - Docs by LangChain"

Q:hidden state attenweight input ids residual这些是干什么的？如果一个模型架构需要全面可视化，架构上面哪些参数 结构 还有什么需要呈现？
这些词大多来自 Transformer / 大语言模型的前向传播过程。它们不是同一类东西：有的是**输入表示**，有的是**中间激活**，有的是**结构连接**，有的是**可视化指标**。

## 1. 这些东西分别是干什么的？

### input ids

**input ids 是文本被 tokenizer 编码后的整数序列。**

模型不能直接读文字，所以会先把文本切成 token，再把每个 token 映射成一个整数 ID。

例如：

```text
文本: "我喜欢猫"
tokens: ["我", "喜欢", "猫"]
input_ids: [1256, 3921, 871]
```

模型拿到的原始输入通常就是：

```text
input_ids: [1256, 3921, 871]
```

然后这些 ID 会被送进 embedding 层，变成向量：

```text
input_ids → token embeddings
```

所以 input ids 的作用是：

```text
文字 → token → token id → 向量 → 模型计算
```

它本身不是语义向量，只是查表用的索引。

---

### hidden state

**hidden state 是模型每一层输出的 token 表示。**

每个 token 在进入模型后，不再只是一个固定词向量，而是会随着层数增加不断吸收上下文信息。

例如输入：

```text
我 喜欢 猫
```

最初，“猫”的 embedding 只表示“猫”这个 token。经过几层 Transformer 后，“猫”的 hidden state 会包含更多上下文，例如“这是我喜欢的对象”。

形式上可以理解为：

```text
第 0 层 hidden state: embedding 输出
第 1 层 hidden state: 第一层 Transformer 输出
第 2 层 hidden state: 第二层 Transformer 输出
...
第 L 层 hidden state: 最后一层输出
```

常见形状是：

```text
hidden_states: [batch_size, sequence_length, hidden_dim]
```

例如：

```text
[1, 128, 4096]
```

表示：

```text
1 个样本
128 个 token
每个 token 用 4096 维向量表示
```

hidden state 的作用是：

```text
保存每个 token 在当前层的上下文语义表示
```

最后一层 hidden state 通常会接一个输出头，得到下一个 token 的概率分布。

---

### attention weights / attenweight

你说的 **attenweight** 应该是 **attention weights**，也就是注意力权重。

**attention weights 表示每个 token 在计算当前 token 表示时，看了其他 token 多少。**

比如句子：

```text
小明把球放进盒子，因为它很小。
```

模型在理解“它”时，可能会对“球”或“盒子”分配不同注意力权重。

在 self-attention 里，每个 token 会生成：

```text
Query
Key
Value
```

注意力分数大致来自：

```text
attention_score = Q · K
```

然后经过 softmax 变成 attention weights：

```text
attention_weights = softmax(QKᵀ / sqrt(d))
```

再用这些权重对 Value 做加权求和：

```text
attention_output = attention_weights · V
```

所以 attention weights 的作用是：

```text
决定当前 token 从其他 token 的 value 向量中聚合多少信息
```

常见形状是：

```text
attention_weights: [batch_size, num_heads, query_length, key_length]
```

例如：

```text
[1, 32, 128, 128]
```

表示：

```text
1 个样本
32 个注意力头
128 个 query token
每个 query token 对 128 个 key token 有一组注意力分布
```

需要注意：attention weights 可以帮助观察模型关注模式，但它不等同于严格的“因果解释”。一个 token attention 高，不一定说明它就是最终输出的主要原因。

---

### residual

**residual 指残差连接。**

Transformer 里每个子模块通常不会直接覆盖输入，而是把模块输出加回原输入。

例如 attention 子层：

```text
x → attention → attention_output
x_new = x + attention_output
```

MLP 子层也是类似：

```text
x → MLP → mlp_output
x_new = x + mlp_output
```

残差连接的作用主要是：

```text
让信息可以跨层直接流动
缓解深层模型训练困难
避免每一层都必须重新学习完整表示
```

没有残差连接，深层网络容易出现梯度消失、表示退化或训练不稳定。

在 Transformer 中，一个简化层结构通常是：

```text
x
↓
LayerNorm
↓
Self-Attention
↓
Residual Add
↓
LayerNorm
↓
MLP / FFN
↓
Residual Add
↓
输出 hidden state
```

也可以写成：

```text
x = x + Attention(LN(x))
x = x + MLP(LN(x))
```

这是很多现代 Transformer 使用的 pre-norm 结构。

---

## 2. 它们之间的关系

可以按数据流理解：

```text
文本
↓
tokenizer
↓
input_ids
↓
embedding
↓
hidden state 第 0 层
↓
Transformer Layer 1
    ├─ attention weights
    ├─ attention output
    ├─ residual add
    ├─ MLP output
    └─ residual add
↓
hidden state 第 1 层
↓
Transformer Layer 2
↓
...
↓
hidden state 最后一层
↓
LM head
↓
logits
↓
softmax
↓
下一个 token 概率
```

其中：

| 名称                |     类型 | 是参数吗 | 作用                 |
| ----------------- | -----: | ---: | ------------------ |
| input ids         |   输入数据 |   不是 | 表示 token 的整数编号     |
| embedding weights |   模型参数 |    是 | 把 token id 映射成向量   |
| hidden state      |   中间激活 |   不是 | 每层每个 token 的上下文表示  |
| attention weights | 中间计算结果 |   不是 | 表示 token 间的信息聚合权重  |
| residual          |   结构连接 | 不是参数 | 把输入直接加到模块输出上       |
| Wq/Wk/Wv/Wo       |   模型参数 |    是 | attention 中的线性投影矩阵 |
| MLP weights       |   模型参数 |    是 | 对 token 表示做非线性变换   |
| LayerNorm 参数      |   模型参数 |    是 | 稳定每层激活分布           |

---

## 3. 如果要全面可视化一个模型架构，需要呈现什么？

可以分成三类：

```text
结构层面
参数层面
运行时数据层面
```

这三类不要混在一起。架构图主要画结构，参数表解释规模，运行时图解释信息流和激活。

---

# A. 结构层面：模型由哪些模块组成

最基础要展示：

```text
输入
↓
Tokenizer
↓
Embedding
↓
Position Encoding / RoPE
↓
N 个 Transformer Block
↓
Final LayerNorm
↓
Output Head / LM Head
↓
Logits / Probabilities
```

对每个 Transformer Block，还要展开：

```text
Transformer Block
├─ LayerNorm / RMSNorm
├─ Multi-Head Self-Attention
│  ├─ Q projection
│  ├─ K projection
│  ├─ V projection
│  ├─ Attention score
│  ├─ Attention weights
│  ├─ Weighted sum
│  └─ Output projection
├─ Residual connection
├─ LayerNorm / RMSNorm
├─ MLP / FFN
│  ├─ up projection
│  ├─ activation, e.g. GELU / SiLU / SwiGLU
│  ├─ gate projection, if gated MLP
│  └─ down projection
└─ Residual connection
```

如果是 decoder-only LLM，还要标出：

```text
causal mask
KV cache
RoPE / positional embedding
```

如果是 encoder-decoder 架构，还要额外画：

```text
Encoder self-attention
Decoder self-attention
Cross-attention
Encoder-decoder attention mask
```

如果是 diffusion、CNN、RNN、MoE、ViT 等架构，重点模块会不同。但 Transformer 可视化通常上面这些是核心。

---

# B. 参数层面：哪些东西是模型学到的

需要标出每类参数的形状和数量。

以 Transformer 为例，主要参数包括：

## 1. Embedding 参数

```text
token_embedding: [vocab_size, hidden_dim]
```

例如：

```text
[32000, 4096]
```

表示词表里有 32000 个 token，每个 token 是 4096 维向量。

---

## 2. Attention 参数

每层通常有：

```text
Wq: [hidden_dim, num_heads * head_dim]
Wk: [hidden_dim, num_kv_heads * head_dim]
Wv: [hidden_dim, num_kv_heads * head_dim]
Wo: [num_heads * head_dim, hidden_dim]
```

需要展示：

```text
num_heads
num_kv_heads
head_dim
hidden_dim
是否使用 GQA / MQA
```

如果是标准 MHA：

```text
num_heads = num_kv_heads
```

如果是 GQA：

```text
num_kv_heads < num_heads
```

如果是 MQA：

```text
num_kv_heads = 1
```

这会影响 KV cache 的大小和推理速度。

---

## 3. MLP / FFN 参数

常见结构：

```text
MLP(x) = down_proj(activation(up_proj(x)))
```

如果是 gated MLP，例如 SwiGLU：

```text
MLP(x) = down_proj(silu(gate_proj(x)) * up_proj(x))
```

参数包括：

```text
up_proj: [hidden_dim, intermediate_dim]
gate_proj: [hidden_dim, intermediate_dim]
down_proj: [intermediate_dim, hidden_dim]
```

需要展示：

```text
hidden_dim
intermediate_dim
activation function
是否 gated
```

---

## 4. Normalization 参数

常见有：

```text
LayerNorm
RMSNorm
```

参数通常是：

```text
norm_weight: [hidden_dim]
norm_bias: [hidden_dim]  # 有些架构没有 bias
```

需要标出：

```text
norm 类型
pre-norm 还是 post-norm
是否有 bias
epsilon
```

---

## 5. Output head 参数

语言模型最后通常有：

```text
lm_head: [hidden_dim, vocab_size]
```

或者转置写法：

```text
[vocab_size, hidden_dim]
```

还需要说明：

```text
lm_head 是否和 token embedding 权重共享
```

也就是：

```text
tie_word_embeddings = true / false
```

---

# C. 运行时数据层面：输入进去后发生了什么

这部分不是模型参数，但对可视化非常重要。

## 1. Tensor shape 流动

每一步都应标出张量形状。

例如：

```text
input_ids: [batch, seq_len]
↓
embeddings: [batch, seq_len, hidden_dim]
↓
Q: [batch, num_heads, seq_len, head_dim]
K: [batch, num_kv_heads, seq_len, head_dim]
V: [batch, num_kv_heads, seq_len, head_dim]
↓
attention_weights: [batch, num_heads, seq_len, seq_len]
↓
attention_output: [batch, seq_len, hidden_dim]
↓
MLP output: [batch, seq_len, hidden_dim]
↓
logits: [batch, seq_len, vocab_size]
```

这是全面可视化里最关键的部分之一。没有 shape，架构图容易变成“概念图”，很难用于调试或解释。

---

## 2. Attention mask

需要展示：

```text
causal mask
padding mask
sliding window mask
block sparse mask
cross-attention mask
```

对 decoder-only 模型，causal mask 很关键：

```text
第 t 个 token 只能看第 1 到 t 个 token
不能看未来 token
```

可视化时可以用矩阵表示：

```text
允许关注: 1
禁止关注: 0

token1  1 0 0 0
token2  1 1 0 0
token3  1 1 1 0
token4  1 1 1 1
```

---

## 3. Positional encoding / RoPE

Transformer 本身对顺序不敏感，所以需要位置信息。

需要说明：

```text
absolute positional embedding
relative positional bias
RoPE
ALiBi
```

现在很多 LLM 使用 RoPE。可视化时应该标出：

```text
RoPE 作用在 Q 和 K 上
不是直接加到 hidden state 上
```

典型流程：

```text
hidden state
↓
Q, K projection
↓
apply RoPE to Q and K
↓
QK attention score
```

---

## 4. KV cache

如果可视化推理过程，尤其是自回归生成，需要展示 KV cache。

训练时通常是：

```text
一次输入完整序列
```

推理生成时是：

```text
每次生成一个 token
复用之前 token 的 K/V
```

KV cache 保存的是历史 token 的 K 和 V：

```text
past_key_values
```

作用是避免每生成一个 token 都重新计算所有历史 token 的 K/V。

需要展示：

```text
当前 token 的 Q
历史 token 的 cached K/V
当前 token 对历史 K/V 做 attention
生成下一个 token
```

---

## 5. Hidden state 演化

如果要解释模型内部表示，需要展示不同层的 hidden states：

```text
embedding 层 hidden state
浅层 hidden state
中层 hidden state
深层 hidden state
最终 hidden state
```

可以做：

```text
PCA / t-SNE / UMAP 降维图
token representation heatmap
layer-wise similarity
activation norm by layer
```

但要注意：降维图只能辅助观察，不是严格证明。

---

## 6. Attention weights 可视化

可以展示：

```text
每层 attention
每个 head 的 attention
某个 query token 对所有 key token 的权重
平均 attention map
attention rollout
```

典型图是：

```text
x 轴: key token
y 轴: query token
颜色: attention weight
```

需要分清：

```text
layer
head
token position
```

否则 attention 图很容易误读。

---

## 7. Residual stream 可视化

对 Transformer 来说，residual stream 很重要。可以展示：

```text
每层 attention 写入 residual stream 的变化量
每层 MLP 写入 residual stream 的变化量
residual stream 的 norm
不同模块对最终 logits 的贡献
```

这类可视化更接近 mechanistic interpretability。

可以画：

```text
x
├─ attention contribution
├─ MLP contribution
└─ residual accumulated state
```

---

## 8. Logits 和输出概率

语言模型最后会产生：

```text
logits: [batch, seq_len, vocab_size]
```

然后：

```text
probabilities = softmax(logits)
```

可视化时可以展示：

```text
top-k token 概率
logit distribution
temperature 影响
sampling 策略
greedy / top-k / top-p
```

例如：

```text
最后一个位置的 logits
↓
softmax
↓
Top 5 next tokens
```

这有助于解释模型为什么输出某个 token。

---

# D. 超参数层面：架构配置必须列清楚

一张完整的架构说明图或文档通常需要列出这些配置：

| 类别        | 需要展示                                       |
| --------- | ------------------------------------------ |
| 基础规模      | num_layers, hidden_dim, vocab_size         |
| Attention | num_heads, num_kv_heads, head_dim          |
| MLP       | intermediate_dim, activation, gated or not |
| 位置编码      | RoPE, absolute PE, ALiBi 等                 |
| Norm      | LayerNorm / RMSNorm, pre-norm / post-norm  |
| 上下文长度     | max_position_embeddings / context length   |
| 输入输出      | tokenizer, vocab, special tokens, lm_head  |
| Mask      | causal mask, padding mask, sliding window  |
| 参数共享      | embedding 和 lm_head 是否共享                   |
| 推理机制      | KV cache, decoding strategy                |
| 精度        | fp32, fp16, bf16, int8, int4               |
| MoE 架构    | experts 数量, top-k routing, shared expert   |
| 训练目标      | next-token prediction, MLM, seq2seq loss 等 |

---

# E. 如果是“全面可视化”，建议用 5 层视图

不要只画一张大图。更好的方式是分层展示。

## 第 1 层：整体架构图

展示：

```text
Input text
↓
Tokenizer
↓
Embedding
↓
Transformer Blocks × N
↓
Final Norm
↓
LM Head
↓
Next-token distribution
```

目标：让人知道模型总体怎么走。

---

## 第 2 层：单个 Transformer Block 展开图

展示：

```text
RMSNorm
↓
Q/K/V projection
↓
RoPE
↓
Attention
↓
Output projection
↓
Residual
↓
RMSNorm
↓
MLP
↓
Residual
```

目标：解释每一层内部结构。

---

## 第 3 层：张量 shape 图

展示：

```text
[batch, seq]
[batch, seq, hidden]
[batch, heads, seq, head_dim]
[batch, heads, seq, seq]
[batch, seq, vocab]
```

目标：帮助工程实现、调试、复现。

---

## 第 4 层：参数规模表

展示每个模块的参数量：

```text
Embedding 参数量
Attention 参数量 / layer
MLP 参数量 / layer
Norm 参数量 / layer
LM head 参数量
总参数量
```

目标：解释模型大小来自哪里。

---

## 第 5 层：运行时行为图

展示：

```text
attention heatmap
hidden state norm
activation distribution
residual contribution
top-k logits
KV cache growth
memory / FLOPs
```

目标：解释模型实际运行时发生了什么。

---

## 4. 最小但完整的 Transformer 可视化清单

如果你要做一个完整架构可视化，至少应该包含：

```text
1. tokenizer → input_ids
2. token embedding
3. positional encoding / RoPE
4. Transformer block 数量
5. 每个 block 内部结构
6. attention 的 Q/K/V/O projection
7. attention heads 和 head_dim
8. attention mask
9. attention weights
10. residual connections
11. LayerNorm / RMSNorm
12. MLP / FFN 结构
13. activation function
14. hidden states 的层间流动
15. tensor shapes
16. 参数矩阵形状
17. lm_head / classifier head
18. logits / probabilities
19. KV cache, 如果展示推理
20. 总参数量、每层参数量、显存和计算量
```

一句话概括：

```text
input ids 是模型读入的 token 编号；
hidden state 是每层对 token 的内部表示；
attention weights 是 token 之间信息聚合的权重；
residual 是让信息跨层直接流动的结构连接。
```

如果要全面可视化模型架构，不能只画模块名，还要同时呈现：

```text
数据流 + 模块结构 + 参数形状 + 张量 shape + 中间激活 + 注意力模式 + 残差路径 + 输出分布
```
如果你要全面可视化一个 Transformer / LLM 架构，最合理的是分 5 张图。

图 1：整体数据流图
Raw Text
↓
Tokenizer
↓
Input IDs [B, S]
↓
Token Embedding [B, S, D]
↓
Transformer Block × L
↓
Final RMSNorm / LayerNorm
↓
LM Head
↓
Logits [B, S, V]
↓
Softmax / Sampling
↓
Output Token

这张图给非技术读者看。

图 2：单个 Transformer Block 展开图
x: [B, S, D]

 ┌──────────────────────────────┐
 │ RMSNorm                      │
 │ Self-Attention               │
 │   Q projection               │
 │   K projection               │
 │   V projection               │
 │   RoPE on Q/K                │
 │   Causal Mask                │
 │   Attention Weights          │
 │   O projection               │
 └──────────────────────────────┘
        ↓
x + attention_output

 ┌──────────────────────────────┐
 │ RMSNorm                      │
 │ MLP / SwiGLU                 │
 │   gate projection            │
 │   up projection              │
 │   activation                 │
 │   down projection            │
 └──────────────────────────────┘
        ↓
output = residual + mlp_output

这张图给工程和研究人员看。

图 3：Shape 流动图

以通用 decoder-only LLM 为例：

input_ids:
[B, S]

embedding:
[B, S, D]

Q:
[B, H_q, S, d_head]

K:
[B, H_kv, S, d_head]

V:
[B, H_kv, S, d_head]

attention_scores:
[B, H_q, S, S]

attention_weights:
[B, H_q, S, S]

attention_output:
[B, S, D]

mlp_hidden:
[B, S, D_ff]

block_output:
[B, S, D]

logits:
[B, S, Vocab]

这张图最适合调试代码。

图 4：参数表

至少列这些：

模块	参数 / 配置	说明
vocab size	V	词表大小
hidden size	D	hidden state 维度
num layers	L	Transformer block 数量
num attention heads	H_q	query heads
num key-value heads	H_kv	K/V heads，决定是否 GQA/MQA
head dim	d_head	每个头的维度
intermediate size	D_ff	MLP 中间维度
norm type	RMSNorm / LayerNorm	归一化方式
activation	SiLU / GELU / SwiGLU	FFN 激活函数
position encoding	RoPE / ALiBi / absolute PE	位置信息方式
context length	max position / seq length	最大上下文
tie embeddings	true / false	embedding 和 lm_head 是否共享
dtype	fp32 / fp16 / bf16 / int8 / int4	权重或推理精度
图 5：运行时可视化

这个才是真正的“模型内部行为图”：

attention heatmap
hidden state norm by layer
activation histogram
residual stream norm
MLP output norm
attention entropy
top-k logits
KV cache growth
gradient norm, if training
loss scale, if mixed precision training

其中最有价值的几类是：

1. attention heatmap：看 token 之间的信息读取模式
2. hidden state norm：看哪一层激活异常
3. residual contribution：看 attention 和 MLP 分别写入多少信息
4. logits top-k：看模型最终倾向输出什么
5. KV cache：看推理时显存如何随上下文增长

我上面关于 **Qwen-7B** 主要写了这些内容：

## 1. Qwen-7B 的基础结构参数

以原始 **Qwen-7B** 为例，它大致是一个 **decoder-only Transformer**，类似 GPT/LLaMA 这一类自回归语言模型。

关键配置是：

```text
num_hidden_layers = 32
hidden_size = 4096
num_attention_heads = 32
head_dim = 128
vocab_size = 151936
seq_length = 8192
max_position_embeddings = 32768
tie_word_embeddings = false
```

含义是：

```text
32 层 Transformer Block
每个 token 的 hidden state 是 4096 维
attention 有 32 个头
每个 head 是 128 维
词表大小约 15 万
训练/推理支持较长上下文
embedding 和 lm_head 不共享权重
```

---

## 2. Hidden State 在 Qwen-7B 里是什么形状

Qwen-7B 的 hidden size 是 4096，所以每层 hidden state 是：

```text
hidden_states: [B, S, 4096]
```

其中：

```text
B = batch size
S = sequence length
4096 = 每个 token 的向量维度
```

例如输入 128 个 token，batch size 为 1：

```text
[1, 128, 4096]
```

这表示每个 token 在每一层都有一个 4096 维表示。

---

## 3. Attention 部分怎么写

Qwen-7B 里：

```text
num_attention_heads = 32
head_dim = 128
32 × 128 = 4096
```

所以 attention 的 Q/K/V 通常可以看成：

```text
Q: [B, 32, S, 128]
K: [B, 32, S, 128]
V: [B, 32, S, 128]
```

attention weights 是：

```text
attention_weights: [B, 32, S, S]
```

表示：

```text
每一层
每一个 attention head
每个 token 对其他 token 的注意力分布
```

Qwen-7B 原始版本可以近似画成：

```text
hidden_states [B, S, 4096]
↓
QKV projection [4096 → 3 × 4096]
↓
Q, K, V
↓
attention weights [B, 32, S, S]
↓
attention output [B, S, 4096]
```

---

## 4. Qwen-7B 的 MLP / FFN 维度

这里是我特别提醒过的点：**Qwen-7B 的 FFN 维度容易被说错。**

它的配置里：

```text
intermediate_size = 22016
```

但因为 Qwen-7B 使用的是类似 **SwiGLU / gated MLP** 的结构，所以实际有两个分支：

```text
w1: 4096 → 11008
w2: 4096 → 11008
```

然后做门控：

```text
a1 * silu(a2)
```

再降维回 4096：

```text
down projection: 11008 → 4096
```

所以可视化时最好写成：

```text
MLP / SwiGLU:

input: [B, S, 4096]

w1: 4096 → 11008
w2: 4096 → 11008

gate output: [B, S, 11008]

down projection:
11008 → 4096

output: [B, S, 4096]
```

不要简单写成：

```text
FFN = 11008
```

更严谨是：

```text
config.intermediate_size = 22016
gated branch width = 11008
```

---

## 5. Qwen-7B 的 Transformer Block 应该这样画

单层结构可以画成：

```text
x: [B, S, 4096]

↓
RMSNorm
↓
Self-Attention
    ├─ Q projection: 4096 → 4096
    ├─ K projection: 4096 → 4096
    ├─ V projection: 4096 → 4096
    ├─ RoPE on Q/K
    ├─ causal mask
    ├─ attention weights: [B, 32, S, S]
    └─ output projection: 4096 → 4096
↓
Residual Add
x = x + attention_output

↓
RMSNorm
↓
MLP / SwiGLU
    ├─ w1: 4096 → 11008
    ├─ w2: 4096 → 11008
    ├─ silu + gate
    └─ down projection: 11008 → 4096
↓
Residual Add
x = x + mlp_output
```

更简洁的公式是：

```text
y = x + Attention(RMSNorm(x))
z = y + MLP(RMSNorm(y))
```

这就是 **pre-norm Transformer**。

---

## 6. Qwen-7B 可视化时最该呈现什么

如果你要专门画 Qwen-7B 的架构图，建议至少标这些：

```text
Input IDs: [B, S]
Token Embedding: [151936, 4096]
Hidden States: [B, S, 4096]
Transformer Blocks × 32
Attention Heads: 32
Head Dim: 128
Q/K/V: [B, 32, S, 128]
Attention Weights: [B, 32, S, S]
MLP Branch Width: 11008
RMSNorm
Residual Add
RoPE
Causal Mask
LM Head: [4096, 151936]
Logits: [B, S, 151936]
```

一句话概括：

```text
Qwen-7B 是 32 层、hidden size 4096、32 个 attention head 的 decoder-only Transformer；
每层由 RMSNorm + Self-Attention + Residual + RMSNorm + SwiGLU MLP + Residual 组成；
最终把 hidden state 映射到 151936 维词表 logits，用来预测下一个 token。
```
