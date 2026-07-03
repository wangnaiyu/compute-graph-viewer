(function () {
  const $ = (id) => document.getElementById(id);

  const tokens = ["昇", "腾", "模", "型", "训", "练", "开", "发"];
  let graphController = null;
  let renderedModel = null;
  let renderedGraphData = null;
  let decoderFlipTimer = null;
  let wheelLockUntil = 0;
  let state = {
    model: "qwen7b",
    phase: "tokens",
    blockIndex: 0,
    tokenIndex: 5,
    attendIndex: 4,
  };

  const phaseSteps = [
    {
      id: "tokens",
      label: "Tokens",
      title: "Tokens · 样本进入模型",
      nodeId: "input_tokens",
      nodeLabel: "Token IDs",
      copy: "训练样本先被切成 token ids；SEQ_LENGTH 决定每个样本的上下文长度。",
      meaning: "Token 数会线性放大 Embedding、MLP 和 logits，且二次影响 Attention。",
      action: "首轮 OOM 时优先检查 SEQ_LENGTH、MBS 和重算配置。",
      lens: "tokens",
    },
    {
      id: "embedding",
      label: "Embedding",
      title: "Embedding · token 变成 hidden states",
      nodeId: "token_embedding",
      nodeLabel: "Embedding Lookup",
      relatedNodeIds: ["token_embedding_weight", "hidden_states"],
      copy: "Embedding 把离散 token id 查表为 hidden states，hidden size 会沿主干一路传播。",
      meaning: "词表大小和 hidden size 决定输入侧参数规模，并与 LM Head 共享形状约束。",
      action: "校验 tokenizer、vocab size、hidden size 和权重 shard 是否一致。",
      lens: "tokens",
    },
    {
      id: "attention",
      label: "Attention",
      title: "Attention · 上下文路由",
      nodeId: "scaled_attention",
      nodeLabel: "Scaled Attention",
      relatedNodeIds: ["qkv_weight", "qkv_linear", "rope_cache", "rotary_apply", "kv_cache", "attn_output_linear"],
      copy: "当前 token 正在读取左侧上下文，训练侧主要关注序列长度、KV/激活显存和 attention kernel 利用率。",
      meaning: "长上下文会放大 attention 计算、KV 状态和激活重算压力。",
      action: "如果 MFU 低且 HBM 高，优先检查重算、TP 切分和 attention kernel。",
      lens: "attention",
    },
    {
      id: "mlp",
      label: "MLP",
      title: "MLP · token 独立变换",
      nodeId: "silu_multiply",
      nodeLabel: "SwiGLU MLP",
      relatedNodeIds: ["mlp_norm", "gate_weight", "up_weight", "mlp_gate_linear", "mlp_up_linear", "down_weight", "mlp_output_linear"],
      copy: "MLP 不在 token 之间通信，而是在每个 token 内部扩展再压回 hidden size。",
      meaning: "intermediate size 决定矩阵乘规模，是 Dense decoder 的主要算力消耗之一。",
      action: "MFU 低但通信不高时，检查 MLP fusion、TP 切分和矩阵形状。",
      lens: "tokens",
    },
    {
      id: "logits",
      label: "Logits",
      title: "Logits · 词表概率分布",
      nodeId: "lm_head",
      nodeLabel: "LM Head Linear",
      relatedNodeIds: ["final_norm", "shared_lm_weight", "logits"],
      copy: "LM Head 把 hidden states 投影到词表 logits，再通过 softmax 得到 next-token 分布。",
      meaning: "训练时 logits 不是终点，它会继续进入 cross entropy 和反向传播。",
      action: "遇到 loss spike 时，同时看 logits 分布、梯度范数和最后投影显存。",
      lens: "logits",
    },
    {
      id: "loss",
      label: "Loss",
      title: "Loss · 监督信号进入反传",
      nodeId: "logits",
      nodeLabel: "Logits",
      relatedNodeIds: ["lm_head", "shared_lm_weight", "final_norm"],
      copy: "训练版解释器把概率分布继续接到 loss，让用户看到前向输出如何变成梯度信号。",
      meaning: "loss 健康度决定当前训练是否在有效学习，尖峰通常需要联查数据、梯度和硬件事件。",
      action: "先看 loss/val loss 是否同向异常，再查 batch、学习率和数据样本。",
      lens: "loss",
    },
    {
      id: "backward",
      label: "Backward",
      title: "Backward · 参数更新路径",
      nodeId: "decoder_output",
      nodeLabel: "Layer Output",
      relatedNodeIds: ["lm_head", "silu_multiply", "scaled_attention", "token_embedding_weight", "qkv_weight", "gate_weight", "up_weight", "down_weight"],
      copy: "反向传播把 loss 信号沿 LM Head、MLP、Attention 和 Embedding 传回参数张量。",
      meaning: "梯度路径越长，越需要残差、Norm、重算和并行策略一起保证稳定性。",
      action: "出现梯度异常时，联查 grad norm、loss spike、activation checkpoint 和 optimizer state。",
      lens: "loss",
    },
  ];

  const modelConfigs = {
    qwen7b: {
      name: "Qwen7B",
      task: "Pretrain",
      layerCount: 32,
      seq: "SEQ 8192",
      parallel: "TP1 · PP1",
      batch: "MBS1 · GBS64",
      graph: () => makeDenseGraph({
        name: "Qwen7B",
        layers: 32,
        hidden: 4096,
        heads: "32 heads",
        intermediate: 22016,
        vocab: 151936,
        seq: 8192,
        parallel: "TP1 / PP1",
        batch: "MBS1 / GBS64",
      }),
    },
    qwen3: {
      name: "Qwen3-8B",
      task: "Pretrain",
      layerCount: 36,
      seq: "SEQ 4096",
      parallel: "TP2 · PP1",
      batch: "MBS1 · GBS128",
      graph: () => makeDenseGraph({
        name: "Qwen3-8B",
        layers: 36,
        hidden: 4096,
        heads: "32 heads / GQA",
        intermediate: 22016,
        vocab: 151936,
        seq: 4096,
        parallel: "TP2 / PP1",
        batch: "MBS1 / GBS128",
      }),
    },
    qwenmoe: {
      name: "Qwen3-MoE",
      task: "Pretrain",
      layerCount: 48,
      seq: "SEQ 4096",
      parallel: "TP2 · PP4 · EP8",
      batch: "MBS1 · GBS128",
      graph: () => makeMoeGraph({
        name: "Qwen3-MoE",
        layers: "MoE Decoder",
        experts: "128 experts / topk 8",
        parallel: "TP2 / PP4 / EP8",
        includeMtp: false,
      }),
      phasePatch: {
        mlp: {
          nodeId: "expert_combine",
          nodeLabel: "Expert Combine",
          relatedNodeIds: ["router_weight", "router", "topk_select", "dispatch_state", "expert_dispatch", "routed_expert_weight", "routed_experts", "shared_expert"],
          copy: "MoE 阶段先由 Router 给 token 打分，再用 TopK 分发到专家，训练瓶颈经常转向 all-to-all 和负载均衡。",
          meaning: "EP、TopK 和专家负载共同决定 MFU；单个专家快不代表整体训练快。",
          action: "低利用率时优先检查 expert load、all-to-all overlap 和 straggler rank。",
        },
      },
    },
    deepseek: {
      name: "DeepSeek V3.2",
      task: "Pretrain",
      layerCount: 61,
      seq: "SEQ 16384+",
      parallel: "TP4 · PP8 · EP64 · CP2",
      batch: "MBS1 · GBS256",
      graph: () => makeMoeGraph({
        name: "DeepSeek V3.2",
        layers: "Decoder × 61",
        experts: "256 experts / topk 8",
        parallel: "TP4 / PP8 / EP64 / CP2",
        includeMtp: true,
      }),
      phasePatch: {
        attention: {
          nodeId: "scaled_attention",
          nodeLabel: "MLA / Sparse Attention",
          relatedNodeIds: ["qkv_weight", "qkv_linear", "sparse_index", "kv_cache", "attn_output_linear"],
          copy: "DeepSeek 的长上下文 attention 要同时解释 MLA、稀疏索引、KV 状态和 CP 切分。",
          meaning: "SEQ 增长会传导到 sparse index、attention kernel、HBM 和通信域。",
          action: "先判断瓶颈来自索引构建、KV path 还是 all-to-all / CP 通信。",
        },
        logits: {
          nodeId: "mtp_head",
          nodeLabel: "LM Head + MTP",
          relatedNodeIds: ["lm_head", "mtp_weight", "logits"],
          copy: "DeepSeek 的输出侧还要解释 MTP 辅助头，它会给训练 loss 增加额外梯度路径。",
          meaning: "主 logits 和 MTP auxiliary loss 需要分开看，否则 loss 归因会混在一起。",
          action: "解释 loss 曲线时区分主 LM Head 与 MTP 对梯度的贡献。",
        },
      },
    },
  };

  const baseLogits = [
    { token: "开发", logit: 3.9 },
    { token: "流程", logit: 3.2 },
    { token: "模型", logit: 2.7 },
    { token: "工具", logit: 2.2 },
    { token: "数据", logit: 1.8 },
    { token: "训练", logit: 1.5 },
    { token: "平台", logit: 1.2 },
    { token: "脚本", logit: 0.8 },
  ];

  function evidenceItem(priority, dimension, metric, what, evidence, action, relatedNodeIds = [], sources = []) {
    return { priority, dimension, metric, what, evidence, action, relatedNodeIds, sources };
  }

  function denseEvidence(config) {
    return {
      input_tokens: evidenceItem("P2", "data", `SEQ_LENGTH ${config.seq}`, "训练样本首先被切成 token ids；序列长度决定每层要处理的 token 数。", [
        `${config.seq} 是单样本上下文长度，直接影响激活显存和 attention 计算量。`,
        "微批次 MBS 与 GBS 决定一次前后向覆盖多少 token。",
      ], "如果首轮就 OOM，优先缩短 SEQ_LENGTH 或开启重算。", ["token_embedding"]),
      token_embedding: evidenceItem("P2", "parameter lookup", `hidden ${config.hidden}`, "Embedding 把 token id 映射到 hidden states，是模型数据流的入口。", [
        `hidden size=${config.hidden} 会沿着 Attention、MLP、RMSNorm 和 LM Head 传播。`,
        `vocab=${config.vocab} 决定 embedding 和输出投影形状。`,
      ], "检查 tokenizer 路径、词表大小和权重转换是否一致。", ["input_tokens", "token_embedding_weight", "hidden_states"]),
      token_embedding_weight: evidenceItem(null, "parameter tensor", "embedding.weight", "Embedding Weight 是 token id 查表时读取的参数张量。", [
        "config.json 提供 vocab_size、hidden_size 这类形状证据；权重索引提供 shard 证据。",
      ], "在图里把它作为 Parameter 输入接到 Embedding Lookup。", ["token_embedding"], ["config.json", "safetensors.index"]),
      hidden_states: evidenceItem("P2", "activation tensor", `hidden ${config.hidden}`, "Hidden States 是 embedding 之后真正进入 decoder layer 的激活张量。", [
        "训练中它是保存、重算、反传都会触达的主干对象。",
      ], "讲训练链路时，优先沿 tensor 流向解释。", ["token_embedding", "attn_norm"]),
      qkv_weight: evidenceItem(null, "parameter tensor", "q_proj/k_proj/v_proj", "QKV Weight 是 Attention 线性投影读取的权重输入。", [
        "model code 证明 Q/K/V 投影路径；config 给出 head 和 hidden 的形状约束。",
      ], "排查 attention 显存或通信时，把 QKV 权重和 QKV 激活分开看。", ["qkv_linear"], ["modeling_qwen.py", "config.json"]),
      rope_cache: evidenceItem(null, "state tensor", "RoPE cache", "RoPE Cache 是位置编码状态，用于把位置信息注入 Q/K。", [
        "它来自模型实现和序列长度约束，不是独立源码文件节点。",
      ], "长上下文异常时，联查 RoPE 形状、seq_length 和 attention kernel。", ["rotary_apply"], ["modeling_qwen.py"]),
      kv_cache: evidenceItem(null, "state tensor", "KV cache / activation", "训练图中 KV Cache 表示 attention 路径上需要保存或重算的 K/V 状态。", [
        "它帮助解释长上下文为什么会放大 HBM 和重算压力。",
      ], "用 profiling 区分 KV/激活压力和参数权重读取压力。", ["scaled_attention"], ["profiling summary"]),
      scaled_attention: evidenceItem("P1", "compute / memory", "Attention", "Attention 让当前 token 读取上下文重点，是序列长度最敏感的训练节点。", [
        `${config.layers} layers、${config.heads}、${config.parallel} 共同决定 attention 的切分和通信域。`,
        "长上下文会放大 QK^T、softmax、KV cache/激活保存和重算压力。",
      ], "观察 MFU、HBM 与通信等待；若 MFU 低且 HBM 高，优先看重算和 TP 切分。", ["qkv_weight", "qkv_linear", "rope_cache", "kv_cache", "rotary_apply", "attn_output_linear"]),
      silu_multiply: evidenceItem("P2", "compute", `intermediate ${config.intermediate}`, "SwiGLU MLP 执行 Gate/Up 投影和 SiLU 乘法，是 Dense decoder 的主要算力消耗之一。", [
        `intermediate size=${config.intermediate} 解释了 MLP 为什么比 hidden size 宽很多。`,
        "MLP 对矩阵乘吞吐敏感，和 tensor parallel 的切分策略强相关。",
      ], "如果 attention 正常但 MFU 偏低，检查 MLP fusion、TP 切分和重算粒度。", ["gate_weight", "up_weight", "mlp_gate_linear", "mlp_up_linear", "down_weight", "mlp_output_linear"]),
      decoder_output: evidenceItem("P2", "activation tensor", "layer output", "Layer Output 表示一个 decoder layer 结束后的 hidden states，会进入下一层或最终 RMSNorm。", [
        "训练时它通常对应残差后的激活保存、重算和梯度回传边界。",
      ], "解释收敛或显存问题时，把它当作层间张量边界来看。", ["mlp_output_linear", "final_norm"]),
      lm_head: evidenceItem("P2", "loss / backward", "logits", "LM Head 把 hidden states 投影到词表 logits，随后进入 loss、反向传播和优化器更新。", [
        "词表越大，logits、cross entropy 和梯度路径越容易变成显存压力点。",
        `${config.batch} 会改变 logits/loss 的统计稳定性和梯度累积节奏。`,
      ], "遇到 loss spike 时同时看 logits、梯度范数和最后投影的通信/显存。", ["shared_lm_weight", "logits", "final_norm"]),
      shared_lm_weight: evidenceItem(null, "parameter tensor", "lm_head.weight", "Shared LM Weight 是输出词表投影读取的参数张量。", [
        "采样配置解释推理侧 top_p/eos；训练前向里真正输入 LM Head 的是权重 tensor。",
      ], "不要把 generation_config 画成 logits 的输入节点。", ["lm_head", "logits"], ["generation_config.json", "safetensors.index"]),
    };
  }

  function makeDenseGraph(config) {
    const mainX = 560;
    const leftX = 190;
    const rightX = 930;
    const nodes = [
      { id: "input_tokens", label: "Token IDs", typeLabel: "Input", kind: "tensor", x: mainX, y: 48, width: 176, height: 48, colorKey: "io:input" },
      { id: "token_embedding_weight", label: "Embedding Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 150, width: 232, height: 52, colorKey: "io:parameter" },
      { id: "token_embedding", label: "Embedding Lookup", typeLabel: "Op", kind: "op", x: mainX, y: 150, width: 246, height: 56, colorKey: "sem:embedding" },
      { id: "hidden_states", label: "Hidden States", typeLabel: "Tensor", kind: "tensor", x: mainX, y: 224, width: 210, height: 48, colorKey: "io:activation" },
      { id: "attn_norm", label: "Attention RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 304, width: 232, height: 54, colorKey: "sem:norm" },
      { id: "qkv_weight", label: "QKV Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 384, width: 188, height: 52, colorKey: "io:parameter" },
      { id: "qkv_linear", label: "QKV Linear", typeLabel: "Op", kind: "op", x: mainX, y: 384, width: 204, height: 54, colorKey: "sem:linear" },
      { id: "rope_cache", label: "RoPE Cache", typeLabel: "State", kind: "tensor", x: leftX, y: 464, width: 176, height: 52, colorKey: "io:state" },
      { id: "rotary_apply", label: "Apply RoPE", typeLabel: "Op", kind: "op", x: mainX, y: 464, width: 204, height: 54, colorKey: "sem:position" },
      { id: "kv_cache", label: "KV Cache", typeLabel: "State", kind: "tensor", x: leftX, y: 544, width: 164, height: 52, colorKey: "io:state" },
      { id: "scaled_attention", label: "Scaled Attention", typeLabel: "Op", kind: "op", x: mainX, y: 544, width: 224, height: 54, colorKey: "sem:attention" },
      { id: "attn_output_linear", label: "Attention Output", typeLabel: "Op", kind: "op", x: mainX, y: 624, width: 230, height: 54, colorKey: "sem:linear" },
      { id: "mlp_norm", label: "MLP RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 704, width: 214, height: 54, colorKey: "sem:norm" },
      { id: "gate_weight", label: "Gate Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 794, width: 180, height: 52, colorKey: "io:parameter" },
      { id: "mlp_gate_linear", label: "Gate Linear", typeLabel: "Op", kind: "op", x: mainX - 126, y: 794, width: 190, height: 54, colorKey: "sem:mlp" },
      { id: "up_weight", label: "Up Weight", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 794, width: 164, height: 52, colorKey: "io:parameter" },
      { id: "mlp_up_linear", label: "Up Linear", typeLabel: "Op", kind: "op", x: mainX + 126, y: 794, width: 190, height: 54, colorKey: "sem:mlp" },
      { id: "silu_multiply", label: "SiLU Multiply", typeLabel: "Op", kind: "op", x: mainX, y: 874, width: 214, height: 54, colorKey: "sem:mlp" },
      { id: "down_weight", label: "Down Weight", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 954, width: 184, height: 52, colorKey: "io:parameter" },
      { id: "mlp_output_linear", label: "MLP Output", typeLabel: "Op", kind: "op", x: mainX, y: 954, width: 214, height: 54, colorKey: "sem:linear" },
      { id: "decoder_output", label: "Layer Output", typeLabel: "Tensor", kind: "tensor", x: mainX, y: 1034, width: 204, height: 48, colorKey: "io:activation" },
      { id: "final_norm", label: "Final RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 1120, width: 214, height: 54, colorKey: "sem:norm" },
      { id: "shared_lm_weight", label: "Shared LM Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 1208, width: 224, height: 52, colorKey: "io:parameter" },
      { id: "lm_head", label: "LM Head Linear", typeLabel: "Op", kind: "op", x: mainX, y: 1208, width: 224, height: 54, colorKey: "sem:head" },
      { id: "logits", label: "Logits", typeLabel: "Output", kind: "tensor", x: mainX, y: 1292, width: 176, height: 48, colorKey: "io:output" },
    ];
    return {
      width: 1120,
      height: 1360,
      clusters: [
        { id: "transformer", label: `${config.name} Transformer`, x: mainX - 270, y: 92, width: 540, height: 1110, colorKey: "module:transformer" },
        { id: "decoder_layer", label: `Decoder Layer × ${config.layers}`, x: mainX - 232, y: 282, width: 464, height: 790, repeat: config.layers, colorKey: "module:decoder" },
        { id: "attention_box", label: "Self Attention", x: mainX - 190, y: 354, width: 380, height: 296, colorKey: "module:attention" },
        { id: "mlp_box", label: "SwiGLU MLP", x: mainX - 210, y: 684, width: 420, height: 306, colorKey: "module:mlp" },
      ],
      nodes,
      edges: [
        { source: "input_tokens", target: "token_embedding", tag: "ACT", edgeType: "activation" },
        { source: "token_embedding_weight", target: "token_embedding", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "token_embedding", target: "hidden_states", tag: "H", edgeType: "activation" },
        { source: "hidden_states", target: "attn_norm", tag: "ACT", edgeType: "activation" },
        { source: "qkv_weight", target: "qkv_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "attn_norm", target: "qkv_linear", tag: "QKV", edgeType: "parameter" },
        { source: "rope_cache", target: "rotary_apply", tag: "State", edgeType: "state", dashed: true },
        { source: "qkv_linear", target: "rotary_apply", tag: "RoPE", edgeType: "state" },
        { source: "kv_cache", target: "scaled_attention", tag: "State", edgeType: "cache", dashed: true },
        { source: "rotary_apply", target: "scaled_attention", tag: "KV", edgeType: "cache" },
        { source: "scaled_attention", target: "attn_output_linear", tag: "ACT", edgeType: "activation" },
        { source: "attn_output_linear", target: "mlp_norm", tag: "RES", edgeType: "activation" },
        { source: "mlp_norm", target: "mlp_gate_linear", tag: "W1", edgeType: "parameter" },
        { source: "gate_weight", target: "mlp_gate_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "mlp_norm", target: "mlp_up_linear", tag: "W2", edgeType: "parameter" },
        { source: "up_weight", target: "mlp_up_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "mlp_gate_linear", target: "silu_multiply", tag: "GATE", edgeType: "activation" },
        { source: "mlp_up_linear", target: "silu_multiply", tag: "UP", edgeType: "activation" },
        { source: "silu_multiply", target: "mlp_output_linear", tag: "W", edgeType: "parameter" },
        { source: "down_weight", target: "mlp_output_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "mlp_output_linear", target: "decoder_output", tag: "ACT", edgeType: "activation" },
        { source: "decoder_output", target: "final_norm", tag: "ACT", edgeType: "activation" },
        { source: "shared_lm_weight", target: "lm_head", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "final_norm", target: "lm_head", tag: "W", edgeType: "parameter" },
        { source: "lm_head", target: "logits", tag: "LOSS", edgeType: "gradient" },
      ],
      trainingEvidence: denseEvidence(config),
    };
  }

  function makeMoeGraph(config) {
    const evidence = denseEvidence({
      name: config.name,
      layers: config.layers,
      hidden: 4096,
      heads: "MLA / GQA",
      intermediate: config.experts,
      vocab: 151936,
      seq: "long context",
      parallel: config.parallel,
      batch: "MBS1",
    });
    evidence.router = evidenceItem("P1", "MoE routing", config.experts, "Router 给每个 token 选择专家，训练瓶颈经常来自负载不均和 all-to-all。", [
      `${config.parallel} 必须和 router topk、expert 数量一起解释。`,
    ], "低 MFU 时先看 expert load、all-to-all overlap 和 straggler rank。", ["router_weight", "topk_select", "expert_dispatch"]);
    evidence.expert_combine = evidenceItem("P2", "MoE output", "weighted sum", "Expert Combine 是 MoE 分支回到主干 hidden states 的同步点。", [
      "Combine 附近等待高时，需要判断是专家负载不均还是通信拓扑问题。",
    ], "联查 EP 拆分、router topk 和 rank 拓扑。", ["routed_experts", "shared_expert", "final_norm"]);
    if (config.includeMtp) {
      evidence.mtp_head = evidenceItem("P2", "auxiliary objective", "MTP", "MTP 是额外的多 token 预测头，会增加输出侧 loss 和梯度路径。", [
        "主 logits 和 MTP auxiliary loss 需要分开解释。",
      ], "解释 loss 曲线时区分主 LM Head 与 MTP 对梯度的贡献。", ["mtp_weight", "logits"]);
    }
    return {
      width: 1120,
      height: config.includeMtp ? 1320 : 1240,
      clusters: [
        { id: "transformer", label: `${config.name} Transformer`, x: 198, y: 92, width: 620, height: 1046, colorKey: "module:transformer" },
        { id: "decoder_layer", label: config.layers, x: 236, y: 282, width: 544, height: 742, repeat: 48, colorKey: "module:decoder" },
        { id: "attention_box", label: "Attention", x: 270, y: 344, width: 476, height: 190, colorKey: "module:attention" },
        { id: "moe_box", label: "Router + Experts", x: 258, y: 604, width: 500, height: 330, colorKey: "module:moe" },
      ],
      nodes: [
        { id: "input_tokens", label: "Token IDs", typeLabel: "Input", kind: "tensor", x: 510, y: 48, width: 176, height: 48, colorKey: "io:input" },
        { id: "token_embedding_weight", label: "Embedding Weight", typeLabel: "Parameter", kind: "tensor", x: 122, y: 150, width: 232, height: 52, colorKey: "io:parameter" },
        { id: "token_embedding", label: "Embedding Lookup", typeLabel: "Op", kind: "op", x: 510, y: 150, width: 246, height: 56, colorKey: "sem:embedding" },
        { id: "hidden_states", label: "Hidden States", typeLabel: "Tensor", kind: "tensor", x: 510, y: 224, width: 210, height: 48, colorKey: "io:activation" },
        { id: "qkv_weight", label: config.includeMtp ? "MLA Weight" : "QKV Weight", typeLabel: "Parameter", kind: "tensor", x: 122, y: 386, width: 188, height: 52, colorKey: "io:parameter" },
        { id: "qkv_linear", label: config.includeMtp ? "MLA Projection" : "QKV Linear", typeLabel: "Op", kind: "op", x: 392, y: 386, width: 214, height: 54, colorKey: "sem:linear" },
        { id: "sparse_index", label: "Sparse Index", typeLabel: "State", kind: "tensor", x: 908, y: 386, width: 194, height: 52, colorKey: "io:state" },
        { id: "kv_cache", label: "KV Cache", typeLabel: "State", kind: "tensor", x: 908, y: 466, width: 164, height: 52, colorKey: "io:state" },
        { id: "scaled_attention", label: config.includeMtp ? "MLA / Sparse Attention" : "Scaled Attention", typeLabel: "Op", kind: "op", x: 610, y: 440, width: 252, height: 54, colorKey: "sem:attention" },
        { id: "attn_output_linear", label: "Attention Output", typeLabel: "Op", kind: "op", x: 510, y: 560, width: 230, height: 54, colorKey: "sem:linear" },
        { id: "router_weight", label: "Router Weight", typeLabel: "Parameter", kind: "tensor", x: 122, y: 650, width: 196, height: 52, colorKey: "io:parameter" },
        { id: "router", label: "Router Linear", typeLabel: "Op", kind: "op", x: 510, y: 650, width: 214, height: 54, colorKey: "sem:router" },
        { id: "topk_select", label: "TopK Select", typeLabel: "Op", kind: "op", x: 510, y: 728, width: 214, height: 54, colorKey: "sem:router" },
        { id: "dispatch_state", label: "Dispatch Buffer", typeLabel: "State", kind: "tensor", x: 908, y: 728, width: 210, height: 52, colorKey: "io:state" },
        { id: "expert_dispatch", label: "All-to-All Dispatch", typeLabel: "Comm", kind: "op", x: 318, y: 816, width: 218, height: 54, colorKey: "sem:communication" },
        { id: "routed_expert_weight", label: "Routed Expert Weight", typeLabel: "Parameter", kind: "tensor", x: 122, y: 898, width: 242, height: 52, colorKey: "io:parameter" },
        { id: "routed_experts", label: "Routed Experts", typeLabel: "Expert", kind: "op", x: 510, y: 816, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "shared_expert", label: "Shared Expert", typeLabel: "Expert", kind: "op", x: 692, y: 816, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "expert_combine", label: "Expert Combine", typeLabel: "Op", kind: "op", x: 510, y: 928, width: 214, height: 54, colorKey: "sem:combine" },
        { id: "decoder_output", label: "Layer Output", typeLabel: "Tensor", kind: "tensor", x: 510, y: 1012, width: 204, height: 48, colorKey: "io:activation" },
        { id: "final_norm", label: "Final RMSNorm", typeLabel: "Op", kind: "op", x: 510, y: 1090, width: 214, height: 54, colorKey: "sem:norm" },
        { id: "shared_lm_weight", label: "LM Head Weight", typeLabel: "Parameter", kind: "tensor", x: 122, y: 1170, width: 210, height: 52, colorKey: "io:parameter" },
        { id: "lm_head", label: "LM Head Linear", typeLabel: "Op", kind: "op", x: config.includeMtp ? 410 : 510, y: 1170, width: 224, height: 54, colorKey: "sem:head" },
        ...(config.includeMtp ? [
          { id: "mtp_weight", label: "MTP Weight", typeLabel: "Parameter", kind: "tensor", x: 908, y: 1170, width: 172, height: 52, colorKey: "io:parameter" },
          { id: "mtp_head", label: "MTP Head", typeLabel: "Aux", kind: "op", x: 650, y: 1170, width: 196, height: 54, colorKey: "sem:mtp" },
        ] : []),
        { id: "logits", label: "Logits", typeLabel: "Output", kind: "tensor", x: 510, y: config.includeMtp ? 1260 : 1236, width: 176, height: 48, colorKey: "io:output" },
      ],
      edges: [
        { source: "input_tokens", target: "token_embedding", tag: "ACT", edgeType: "activation" },
        { source: "token_embedding_weight", target: "token_embedding", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "token_embedding", target: "hidden_states", tag: "H", edgeType: "activation" },
        { source: "qkv_weight", target: "qkv_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "hidden_states", target: "qkv_linear", tag: "QKV", edgeType: "parameter" },
        { source: "qkv_linear", target: "scaled_attention", tag: "ATTN", edgeType: "activation" },
        { source: "sparse_index", target: "scaled_attention", tag: "State", edgeType: "state", dashed: true },
        { source: "kv_cache", target: "scaled_attention", tag: "State", edgeType: "cache", dashed: true },
        { source: "scaled_attention", target: "attn_output_linear", tag: "ACT", edgeType: "activation" },
        { source: "attn_output_linear", target: "router", tag: "ROUTE", edgeType: "activation" },
        { source: "router_weight", target: "router", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "router", target: "topk_select", tag: "TOPK", edgeType: "parameter" },
        { source: "dispatch_state", target: "expert_dispatch", tag: "State", edgeType: "state", dashed: true },
        { source: "topk_select", target: "expert_dispatch", tag: "A2A", edgeType: "communication" },
        { source: "expert_dispatch", target: "routed_experts", tag: "EP", edgeType: "communication" },
        { source: "topk_select", target: "shared_expert", tag: "SHARED", edgeType: "activation" },
        { source: "routed_expert_weight", target: "routed_experts", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "routed_experts", target: "expert_combine", tag: "WEIGHT", edgeType: "activation" },
        { source: "shared_expert", target: "expert_combine", tag: "SUM", edgeType: "activation" },
        { source: "expert_combine", target: "decoder_output", tag: "ACT", edgeType: "activation" },
        { source: "decoder_output", target: "final_norm", tag: "ACT", edgeType: "activation" },
        { source: "shared_lm_weight", target: "lm_head", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "final_norm", target: "lm_head", tag: "W", edgeType: "parameter" },
        ...(config.includeMtp ? [
          { source: "mtp_weight", target: "mtp_head", tag: "Parameter", edgeType: "parameter", dashed: true },
          { source: "final_norm", target: "mtp_head", tag: "MTP", edgeType: "parameter" },
          { source: "mtp_head", target: "logits", tag: "AUX", edgeType: "gradient" },
        ] : []),
        { source: "lm_head", target: "logits", tag: "LOSS", edgeType: "gradient" },
      ],
      trainingEvidence: evidence,
    };
  }

  function currentModel() {
    return modelConfigs[state.model] || modelConfigs.qwen7b;
  }

  function phaseById(id) {
    const base = phaseSteps.find((item) => item.id === id) || phaseSteps[0];
    const patch = currentModel().phasePatch?.[base.id] || {};
    return { ...base, ...patch };
  }

  function renderTokens() {
    const row = $("tokenRow");
    if (!row) return;
    row.innerHTML = "";
    tokens.forEach((token, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tte-token";
      button.textContent = token;
      button.dataset.target = String(index === tokens.length - 1);
      button.classList.toggle("is-selected", index === state.tokenIndex);
      button.addEventListener("click", () => {
        state.tokenIndex = index;
        state.attendIndex = Math.max(0, Math.min(index, state.attendIndex));
        setPhase(index < 2 ? "tokens" : "embedding");
        updateTokenLens();
        renderAttention();
      });
      row.appendChild(button);
    });
    updateTokenLens();
  }

  function updateTokenLens() {
    if ($("tokenFocus")) $("tokenFocus").textContent = tokens[state.tokenIndex] || tokens[0];
    if ($("tokenNote")) $("tokenNote").textContent = `${tokens[state.tokenIndex]} 的 token id 通过 Embedding Weight 查表，输出 hidden states 后进入 decoder layer。`;
    document.querySelectorAll(".tte-token").forEach((button, index) => {
      button.classList.toggle("is-selected", index === state.tokenIndex);
    });
  }

  function attentionWeight(row, col) {
    if (col > row) return 0;
    const distance = row - col;
    const anchor = col === Math.max(0, row - 1) ? 0.34 : 0;
    const self = row === col ? 0.22 : 0;
    const recency = Math.max(0.03, 0.26 - distance * 0.045);
    return Math.min(0.96, recency + anchor + self);
  }

  function renderAttention() {
    const grid = $("attentionGrid");
    if (!grid) return;
    grid.innerHTML = "";
    tokens.forEach((rowToken, row) => {
      tokens.forEach((colToken, col) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "tte-attn-cell";
        const masked = col > row;
        const weight = attentionWeight(row, col);
        cell.style.setProperty("--weight", masked ? 0 : weight.toFixed(2));
        cell.classList.toggle("is-masked", masked);
        cell.classList.toggle("is-selected", row === state.tokenIndex && col === state.attendIndex);
        cell.setAttribute("aria-label", masked ? `${rowToken} cannot attend ${colToken}` : `${rowToken} attends ${colToken}`);
        if (!masked) {
          cell.addEventListener("click", () => {
            state.tokenIndex = row;
            state.attendIndex = col;
            setPhase("attention");
            renderAttention();
            renderTokens();
          });
        }
        grid.appendChild(cell);
      });
    });
    const left = tokens[state.attendIndex] || tokens[0];
    const right = tokens[state.tokenIndex] || tokens[0];
    if ($("attentionFocus")) $("attentionFocus").textContent = `${right} → ${left}`;
    if ($("attentionNote")) $("attentionNote").textContent = `${right} 当前更关注 ${left}；这会映射到 QKV Linear、RoPE、KV Cache 和 Scaled Attention。`;
  }

  function softmax(items, temperature) {
    const scaled = items.map((item) => ({ ...item, value: item.logit / temperature }));
    const max = Math.max(...scaled.map((item) => item.value));
    const exp = scaled.map((item) => Math.exp(item.value - max));
    const sum = exp.reduce((acc, item) => acc + item, 0);
    return scaled.map((item, index) => ({ ...item, prob: exp[index] / sum }));
  }

  function applyTopP(items, topP) {
    let cumulative = 0;
    return items.map((item) => {
      if (cumulative >= topP) return { ...item, prob: 0 };
      cumulative += item.prob;
      return item;
    });
  }

  function renderLogits() {
    if (!$("temperature") || !$("topK") || !$("topP") || !$("logitList")) return;
    const temp = Number($("temperature").value);
    const topK = Number($("topK").value);
    const topP = Number($("topP").value);
    $("tempLabel").textContent = temp.toFixed(1);
    $("topKLabel").textContent = String(topK);
    $("topPLabel").textContent = topP.toFixed(2).replace(/0$/, "");
    let items = softmax(baseLogits, temp)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, topK);
    items = applyTopP(items, topP);
    const sum = items.reduce((acc, item) => acc + item.prob, 0) || 1;
    items = items.map((item) => ({ ...item, prob: item.prob / sum }));
    const list = $("logitList");
    list.innerHTML = "";
    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "tte-logit";
      row.style.setProperty("--prob", item.prob.toFixed(3));
      row.innerHTML = `<span>${item.token}</span><span class="tte-logit-meter"><i></i></span><strong>${Math.round(item.prob * 100)}%</strong>`;
      row.addEventListener("click", () => {
        if ($("nextToken")) $("nextToken").textContent = item.token;
        setPhase("logits");
      });
      if (index === 0 && $("nextToken")) $("nextToken").textContent = item.token;
      list.appendChild(row);
    });
    $("temperature").addEventListener("input", renderLogits);
    $("topK").addEventListener("input", renderLogits);
    $("topP").addEventListener("input", renderLogits);
  }

  function layerIndex() {
    return Math.max(0, phaseSteps.findIndex((phase) => phase.id === state.phase));
  }

  function layerPoints(phase) {
    const byId = {
      tokens: [
        ["样本", "prompt 被拆成 token ids，训练会把多个样本堆成 micro batch。"],
        ["长度", "SEQ_LENGTH 决定每条样本可看的上下文，也放大 attention 成本。"],
        ["目标", "训练时每个位置都有 next-token 监督信号。"],
      ],
      embedding: [
        ["查表", "token id 读取 Embedding Weight，得到 hidden states。"],
        ["位置", "RoPE 或 position encoding 让序列顺序进入后续 attention。"],
        ["形状", "vocab_size × hidden_size 是输入侧最重要的参数形状。"],
      ],
      attention: [
        ["QKV", "hidden states 先投影成 Query、Key、Value。"],
        ["Mask", "当前 token 不能看未来 token，右上角被屏蔽。"],
        ["状态", "KV/激活状态会显著影响长上下文训练显存。"],
      ],
      mlp: [
        ["扩展", "SwiGLU 把 hidden 扩到 intermediate，再压回 hidden。"],
        ["独立", "MLP 不做 token 间通信，主要考验矩阵乘吞吐。"],
        ["并行", "TP 切分和 kernel fusion 直接影响 MFU。"],
      ],
      logits: [
        ["投影", "LM Head 把 hidden 投影到词表维度。"],
        ["概率", "softmax 把 logits 变成 next-token 分布。"],
        ["训练", "训练不会停在采样，而是继续进入 cross entropy。"],
      ],
      loss: [
        ["监督", "目标 token 与 logits 计算 cross entropy。"],
        ["健康", "loss/val loss 判断训练是否有效学习。"],
        ["尖峰", "loss spike 需要联查数据、梯度和硬件事件。"],
      ],
      backward: [
        ["梯度", "loss 信号沿 LM Head、MLP、Attention 反传。"],
        ["参数", "Parameter tensor 会被 optimizer 更新。"],
        ["稳定", "Norm、残差、重算帮助深层网络稳定训练。"],
      ],
    };
    return byId[phase.id] || byId.tokens;
  }

  function tokenWidgetHtml() {
    return `
      <div class="tte-layer-widget-title"><span>Token Flow</span><strong id="tokenFocus">${tokens[state.tokenIndex]}</strong></div>
      <div class="tte-token-row" id="tokenRow"></div>
      <div class="tte-lens-note" id="tokenNote">Token IDs 进入 Embedding Lookup，随后变成 hidden states。</div>
    `;
  }

  function attentionWidgetHtml() {
    return `
      <div class="tte-layer-widget-title"><span>Attention Map</span><strong id="attentionFocus">${tokens[state.tokenIndex]} → ${tokens[state.attendIndex]}</strong></div>
      <div class="tte-attention-grid" id="attentionGrid"></div>
      <div class="tte-lens-note" id="attentionNote">每一行表示一个 token 对左侧上下文的注意力分布，右上角被 mask。</div>
    `;
  }

  function logitsWidgetHtml() {
    return `
      <div class="tte-layer-widget-title"><span>Output Distribution</span><strong id="nextToken">开发</strong></div>
      <div class="tte-logit-list" id="logitList"></div>
      <div class="tte-sampling-panel">
        <label>Temperature <b id="tempLabel">0.8</b><input id="temperature" type="range" min="0.3" max="1.6" step="0.1" value="0.8"></label>
        <label>Top-k <b id="topKLabel">5</b><input id="topK" type="range" min="2" max="8" step="1" value="5"></label>
        <label>Top-p <b id="topPLabel">0.9</b><input id="topP" type="range" min="0.5" max="1" step="0.05" value="0.9"></label>
      </div>
    `;
  }

  function lossWidgetHtml(phaseId) {
    const label = phaseId === "backward" ? "Backward Path" : "Loss Path";
    return `
      <div class="tte-layer-widget-title"><span>${label}</span><strong id="lossFocus">2.16</strong></div>
      <div class="tte-loss-flow">
        <span>logits</span><i></i><span>cross entropy</span><i></i><span>grad</span><i></i><span>optimizer</span>
      </div>
      <div class="tte-lens-note">训练版 layer 会把概率分布继续接到 loss、梯度、参数更新和 MFU 变化。</div>
    `;
  }

  function widgetHtml(phase) {
    if (phase.lens === "attention") return attentionWidgetHtml();
    if (phase.lens === "logits") return logitsWidgetHtml();
    if (phase.lens === "loss") return lossWidgetHtml(phase.id);
    return tokenWidgetHtml();
  }

  function renderActiveWidget() {
    const phase = phaseById(state.phase);
    if (phase.lens === "attention") renderAttention();
    else if (phase.lens === "logits") renderLogits();
    else if (phase.lens === "loss") {
      return;
    } else {
      renderTokens();
    }
  }

  function lessonBodyHtml(phase) {
    const points = layerPoints(phase).map((point, pointIndex) => `
      <div class="tte-lesson-point">
        <span>${String(pointIndex + 1).padStart(2, "0")}</span>
        <div><strong>${point[0]}</strong><small>${point[1]}</small></div>
      </div>
    `).join("");
    return `
      <p>${phase.copy}</p>
      <div class="tte-lesson-points">${points}</div>
      <div class="tte-lesson-linked">
        <span>${currentModel().name}</span>
        <i></i>
        <span>${phase.nodeLabel}</span>
      </div>
    `;
  }

  function renderLesson() {
    const phase = phaseById(state.phase);
    const activeIndex = layerIndex();
    if ($("lessonCounter")) $("lessonCounter").textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(phaseSteps.length).padStart(2, "0")}`;
    if ($("lessonTitle")) $("lessonTitle").textContent = phase.title;
    if ($("lessonBody")) $("lessonBody").innerHTML = lessonBodyHtml(phase);
    if ($("lessonWidget")) $("lessonWidget").innerHTML = widgetHtml(phase);
    if ($("lessonProgressFill")) $("lessonProgressFill").style.width = `${((activeIndex + 1) / phaseSteps.length) * 100}%`;
    ["prevLayer", "lessonPrev"].forEach((id) => $(id)?.toggleAttribute("disabled", activeIndex === 0));
    ["nextLayer", "lessonNext"].forEach((id) => $(id)?.toggleAttribute("disabled", activeIndex === phaseSteps.length - 1));
  }

  function renderPhaseRail() {
    const rail = $("phaseRail");
    rail.innerHTML = "";
    phaseSteps.forEach((phase, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tte-phase-step";
      button.dataset.phase = phase.id;
      button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${phase.label}</strong>`;
      button.addEventListener("click", () => setPhase(phase.id));
      rail.appendChild(button);
    });
  }

  function renderModelTabs() {
    document.querySelectorAll("[data-model]").forEach((button) => {
      button.addEventListener("click", () => {
        state.model = button.dataset.model;
        renderModel();
      });
    });
  }

  function setPhase(id) {
    state.phase = id;
    const phase = phaseById(id);
    $("phaseTitle").textContent = phase.title;
    $("phaseCopy").textContent = phase.copy;
    $("nodeLabel").textContent = phase.nodeLabel;
    $("trainMeaning").textContent = phase.meaning;
    $("operatorAction").textContent = phase.action;
    document.querySelectorAll(".tte-phase-step").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.phase === id);
    });
    document.body.dataset.phase = state.phase;
    renderGraph();
    updateGraphPhase();
    renderLesson();
    renderActiveWidget();
  }

  function updateGraphPhase() {
    const phase = phaseById(state.phase);
    graphController?.setPhase?.({
      nodeId: phase.nodeId,
      relatedNodeIds: phase.relatedNodeIds || [],
    });
    syncDecoderFlip();
  }

  function parseSvgTransform(svg) {
    const transform = svg?.style?.transform || "";
    const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
    if (!match) return { tx: 0, ty: 0, zoom: 1 };
    return {
      tx: Number(match[1]) || 0,
      ty: Number(match[2]) || 0,
      zoom: Number(match[3]) || 1,
    };
  }

  function decoderCluster() {
    const graph = renderedGraphData;
    if (!graph?.clusters) return null;
    return graph.clusters.find((cluster) => cluster.id === "decoder_layer")
      || graph.clusters.find((cluster) => /decoder/i.test(cluster.id) || /decoder/i.test(cluster.label || ""));
  }

  function syncDecoderFlip() {
    const overlay = $("decoderFlip");
    const cluster = decoderCluster();
    const svg = graphController?.svg;
    if (!overlay || !cluster || !svg) {
      overlay?.classList.remove("is-ready");
      return;
    }
    const { tx, ty, zoom } = parseSvgTransform(svg);
    overlay.style.left = `${tx + cluster.x * zoom}px`;
    overlay.style.top = `${ty + cluster.y * zoom}px`;
    overlay.style.width = `${cluster.width * zoom}px`;
    overlay.style.height = `${cluster.height * zoom}px`;
    overlay.classList.add("is-ready");
  }

  function updateDecoderPage() {
    const model = currentModel();
    const total = model.layerCount || 1;
    const current = Math.max(0, Math.min(state.blockIndex, total - 1));
    const remaining = Math.max(0, total - current - 1);
    if ($("decoderPageKicker")) $("decoderPageKicker").textContent = "Decoder Block";
    if ($("decoderPageLabel")) $("decoderPageLabel").textContent = `${String(current + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    if ($("decoderPageNote")) $("decoderPageNote").textContent = remaining > 0
      ? `${remaining} more identical blocks`
      : "final decoder block";
  }

  function animateDecoderFlip(direction) {
    const overlay = $("decoderFlip");
    if (!overlay) return;
    syncDecoderFlip();
    overlay.classList.remove("is-flipping-forward", "is-flipping-backward");
    void overlay.offsetWidth;
    overlay.classList.add(direction > 0 ? "is-flipping-forward" : "is-flipping-backward");
    window.clearTimeout(decoderFlipTimer);
    decoderFlipTimer = window.setTimeout(() => {
      overlay.classList.remove("is-flipping-forward", "is-flipping-backward");
    }, 560);
  }

  function renderGraph(force = false) {
    const stage = $("trainingGraphStage");
    if (!window.PtoModelTrainingGraphvizPattern || !stage) return;
    if (!force && graphController && renderedModel === state.model) return;
    if (graphController?.destroy) graphController.destroy();
    const phase = phaseById(state.phase);
    renderedGraphData = currentModel().graph();
    graphController = window.PtoModelTrainingGraphvizPattern.render(stage, renderedGraphData, {
      ariaLabel: `${currentModel().name} training transformer explainer graph`,
      activeNodeId: phase.nodeId,
      activeRelatedNodeIds: phase.relatedNodeIds || [],
      viewportPadding: 22,
      minReadableZoom: 0.62,
    });
    renderedModel = state.model;
    requestAnimationFrame(() => {
      syncDecoderFlip();
      updateDecoderPage();
    });
  }

  function renderModel() {
    const model = currentModel();
    document.body.dataset.model = state.model;
    state.blockIndex = Math.max(0, Math.min(state.blockIndex, model.layerCount - 1));
    $("metaSeq").textContent = model.seq;
    $("metaParallel").textContent = model.parallel;
    $("metaBatch").textContent = model.batch;
    document.querySelectorAll("[data-model]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.model === state.model);
    });
    renderBlockControl();
    setPhase(state.phase);
  }

  function renderBlockControl() {
    const model = currentModel();
    const total = model.layerCount || 1;
    const current = Math.max(0, Math.min(state.blockIndex, total - 1));
    state.blockIndex = current;
    if ($("blockLabel")) $("blockLabel").textContent = `${String(current + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
    $("prevBlock")?.toggleAttribute("disabled", current === 0);
    $("nextBlock")?.toggleAttribute("disabled", current === total - 1);
    document.body.style.setProperty("--tte-block-progress", `${((current + 1) / total) * 100}%`);
    updateDecoderPage();
    syncDecoderFlip();
  }

  function stepBlock(direction) {
    const total = currentModel().layerCount || 1;
    const next = Math.max(0, Math.min(total - 1, state.blockIndex + direction));
    if (next === state.blockIndex) return;
    state.blockIndex = next;
    renderBlockControl();
    animateDecoderFlip(direction);
  }

  function stepLayer(direction) {
    const index = layerIndex();
    const nextIndex = Math.max(0, Math.min(phaseSteps.length - 1, index + direction));
    if (nextIndex === index) return;
    setPhase(phaseSteps[nextIndex].id);
  }

  function bindPager() {
    const pager = $("graphViewport");
    if (!pager) return;
    pager.addEventListener("wheel", (event) => {
      if (event.ctrlKey || event.metaKey) return;
      if (Math.abs(event.deltaY) < 18) return;
      event.preventDefault();
      const now = Date.now();
      if (now < wheelLockUntil) return;
      wheelLockUntil = now + 420;
      stepLayer(event.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    pager.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        stepLayer(1);
      }
      if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        stepLayer(-1);
      }
    });
    $("prevLayer")?.addEventListener("click", () => stepLayer(-1));
    $("nextLayer")?.addEventListener("click", () => stepLayer(1));
    $("lessonPrev")?.addEventListener("click", () => stepLayer(-1));
    $("lessonNext")?.addEventListener("click", () => stepLayer(1));
    $("prevBlock")?.addEventListener("click", () => stepBlock(-1));
    $("nextBlock")?.addEventListener("click", () => stepBlock(1));
    $("lessonProgress")?.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const index = Math.max(0, Math.min(phaseSteps.length - 1, Math.floor(ratio * phaseSteps.length)));
      setPhase(phaseSteps[index].id);
    });
  }

  function init() {
    renderModelTabs();
    renderPhaseRail();
    bindPager();
    window.addEventListener("resize", () => requestAnimationFrame(syncDecoderFlip));
    renderModel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
