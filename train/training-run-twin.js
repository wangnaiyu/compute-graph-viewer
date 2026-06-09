(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const themeParam = new URLSearchParams(window.location.search).get("theme");
  let currentTheme = themeParam === "dark" || themeParam === "light"
    ? themeParam
    : document.documentElement.dataset.theme === "light" ? "light" : "dark";
  let graphController = null;

  const models = {
    qwen3: {
      name: "Qwen3-8B",
      title: "Qwen3-8B 架构解释",
      meta: "Dense decoder · 36 layers · hidden 4096 · TP2 PP1",
      run: "run qwen3-8b-r12",
      graphKind: "dense",
      trainingGraph: makeQwen3TrainingGraph(),
      phaseMap: {
        tokens: { nodeId: "input_tokens", nodeLabel: "Token IDs" },
        embedding: { nodeId: "token_embedding", nodeLabel: "Embedding Lookup", relatedNodeIds: ["token_embedding_weight"] },
        attention: { nodeId: "scaled_attention", nodeLabel: "Scaled Attention", relatedNodeIds: ["hidden_states", "attn_norm_gamma", "qkv_weight", "qkv_linear", "rope_cache", "kv_cache", "rotary_apply", "attn_out_weight", "attn_output_linear"] },
        mlp: { nodeId: "silu_multiply", nodeLabel: "SwiGLU MLP", relatedNodeIds: ["mlp_norm_gamma", "mlp_gate_linear", "gate_weight", "mlp_up_linear", "up_weight", "down_weight", "mlp_output_linear"] },
        norm: { nodeId: "final_norm", nodeLabel: "Final RMSNorm", relatedNodeIds: ["final_norm_gamma"] },
        logits: { nodeId: "lm_head", nodeLabel: "LM Head Linear", relatedNodeIds: ["shared_lm_weight", "logits"] },
      },
      seq: "4096",
      parallel: "TP2 · PP1",
      batch: "MBS1 · GBS128",
      params: 8e9,
      target: 8e10,
      summary: "Token IDs 进入 Embedding，经过 36 个 Dense Decoder Layer，Attention 和 SwiGLU MLP 交替加工，最后由 LM Head 输出 logits。",
      snippet: [
        'MODEL_ARGS="--num-layers 36 --hidden-size 4096 --num-attention-heads 32"',
        'TRAIN_ARGS="--seq-length 4096 --tensor-model-parallel-size 2 --pipeline-model-parallel-size 1"',
        'DATA_ARGS="--tokenizer-name-or-path ${TOKENIZER_PATH} --data-path ${DATA_PATH}"',
      ].join("\n"),
      decision: {
        title: "当前配置可进入短跑验证",
        body: "建议先运行 200 step，观察 loss 是否下降、HBM 是否稳定、通信等待是否超过 20%。",
      },
      checks: [
        ["ok", "TOKENIZER_PATH 已配置", "tokenizer 与 Qwen3 权重路径一致。"],
        ["ok", "DATA_PATH 前缀完整", "数据前缀指向 mmap/bin 索引文件。"],
        ["warn", "TP2 需要匹配权重转换", "如果从 HF 权重启动，需要确认转换目标并行度。"],
      ],
      graph: [
        ["input", "Token IDs", "input", 300, 42, 180, 58],
        ["embed", "Embedding", "vocab -> hidden", 300, 128, 220, 68],
        ["attn", "Attention", "32 heads", 155, 236, 220, 68],
        ["mlp", "SwiGLU MLP", "intermediate 22016", 445, 236, 240, 68],
        ["norm", "RMSNorm", "pre + final", 300, 344, 210, 62],
        ["head", "LM Head", "logits", 300, 430, 210, 62],
      ],
      edges: [["input", "embed"], ["embed", "attn"], ["embed", "mlp"], ["attn", "norm"], ["mlp", "norm"], ["norm", "head"]],
      paramLinks: {
        seq: { nodes: ["input", "embed", "attn"], note: "SEQ_LENGTH 决定 Token IDs 的长度，最直接放大 Attention 的计算量和 KV/激活显存。" },
        parallel: { nodes: ["attn", "mlp", "norm"], note: "TP/PP 把 Attention、MLP 和 Decoder 层拆到多卡；切分方式必须和脚本、权重转换一致。" },
        batch: { nodes: ["input", "embed", "head"], note: "MBS/GBS 决定每次进入模型的样本规模和梯度累积，影响吞吐、显存和收敛折中。" },
      },
    },
    qwen7b: {
      name: "Qwen7B",
      title: "Qwen7B 本地源码闭环",
      meta: "Dense decoder · 32 layers · hidden 4096 · source verified",
      run: "run qwen7b-source-r03",
      graphKind: "dense",
      trainingGraph: makeQwen7BTrainingGraph(),
      phaseMap: {
        tokens: { nodeId: "input_tokens", nodeLabel: "Token IDs" },
        embedding: { nodeId: "token_embedding", nodeLabel: "Embedding Lookup", relatedNodeIds: ["token_embedding_weight"] },
        attention: { nodeId: "scaled_attention", nodeLabel: "Scaled Attention", relatedNodeIds: ["hidden_states", "attn_norm_gamma", "qkv_weight", "qkv_linear", "rope_cache", "kv_cache", "rotary_apply", "attn_out_weight", "attn_output_linear"] },
        mlp: { nodeId: "silu_multiply", nodeLabel: "SwiGLU MLP", relatedNodeIds: ["mlp_norm_gamma", "mlp_gate_linear", "gate_weight", "mlp_up_linear", "up_weight", "down_weight", "mlp_output_linear"] },
        norm: { nodeId: "final_norm", nodeLabel: "Final RMSNorm", relatedNodeIds: ["final_norm_gamma"] },
        logits: { nodeId: "lm_head", nodeLabel: "LM Head Linear", relatedNodeIds: ["shared_lm_weight", "logits"] },
      },
      seq: "8192",
      parallel: "TP1 · PP1",
      batch: "MBS1 · GBS64",
      params: 7e9,
      target: 5e10,
      summary: "Qwen7B 适合建立 README、config.json、modeling_qwen.py、generation_config 和 safetensors index 之间的对应关系。",
      snippet: [
        '"num_hidden_layers": 32, "hidden_size": 4096, "num_attention_heads": 32',
        '"seq_length": 8192, "vocab_size": 151936, "intermediate_size": 22016',
        '"top_p": 0.8, "top_k": 0, "max_new_tokens": 512',
      ].join("\n"),
      decision: {
        title: "适合做第一张模型地图",
        body: "建议用它校准源码、config、权重索引和推理配置，再进入 Qwen3 Ascend 训练链路。",
      },
      checks: [
        ["ok", "config.json 可映射架构图", "层数、hidden、head、词表和上下文长度都有本地证据。"],
        ["ok", "safetensors index 可定位权重 shard", "适合解释权重不是单个大文件。"],
        ["warn", "不是本机全量训练对象", "作为学习闭环更合适，训练需转向可控脚本。"],
      ],
      graph: [
        ["readme", "README", "source", 84, 84, 160, 58],
        ["config", "config.json", "params", 84, 188, 180, 58],
        ["code", "modeling_qwen.py", "modules", 84, 316, 210, 58],
        ["embed", "Embedding", "151936 x 4096", 430, 84, 240, 68],
        ["attn", "Attention", "32 heads", 350, 208, 210, 68],
        ["mlp", "SwiGLU MLP", "22016", 580, 208, 210, 68],
        ["norm", "RMSNorm", "pre + final", 465, 326, 210, 62],
        ["head", "LM Head", "top_p / eos", 465, 430, 210, 62],
      ],
      edges: [["readme", "config"], ["config", "embed"], ["code", "attn"], ["code", "mlp"], ["embed", "attn"], ["embed", "mlp"], ["attn", "norm"], ["mlp", "norm"], ["norm", "head"]],
      paramLinks: {
        seq: { nodes: ["config", "embed", "attn"], note: "Qwen7B 的 seq_length 来自 config，本质上影响输入序列进入 Embedding 后的 Attention 范围。" },
        parallel: { nodes: ["config", "attn", "mlp"], note: "Qwen7B 学习页主要用 TP/PP 建立概念，真实训练还要匹配权重切分和脚本启动方式。" },
        batch: { nodes: ["config", "head"], note: "Batch 不改变模型结构，但会改变一次前后向覆盖多少 token，最终反映到 logits/loss 的统计稳定性。" },
      },
    },
    qwenmoe: {
      name: "Qwen3-MoE",
      title: "Qwen3-MoE 专家路由解释",
      meta: "MoE decoder · router topk · expert parallel",
      run: "run qwen3-moe-a3b-r06",
      graphKind: "moe",
      trainingGraph: makeQwenMoeTrainingGraph(),
      phaseMap: {
        tokens: { nodeId: "input_tokens", nodeLabel: "Token IDs" },
        embedding: { nodeId: "token_embedding", nodeLabel: "Embedding Lookup", relatedNodeIds: ["token_embedding_weight"] },
        attention: { nodeId: "scaled_attention", nodeLabel: "Dense Attention", relatedNodeIds: ["qkv_weight", "qkv_linear", "kv_cache"] },
        mlp: { nodeId: "expert_combine", nodeLabel: "Expert Combine", relatedNodeIds: ["router_weight", "router", "topk_expert_select", "expert_dispatch_buffer", "expert_dispatch", "routed_expert_weight", "routed_experts", "shared_expert_weight"] },
        norm: { nodeId: "final_norm", nodeLabel: "Final RMSNorm", relatedNodeIds: ["final_norm_gamma"] },
        logits: { nodeId: "lm_head", nodeLabel: "LM Head Linear", relatedNodeIds: ["lm_head_weight", "logits"] },
      },
      seq: "4096 / 16384",
      parallel: "TP2 · PP4 · EP8",
      batch: "MBS1 · GBS128",
      params: 30e9,
      target: 1.5e11,
      summary: "MoE 的重点不是参数更多，而是 token 先经过 router，再按 TopK 选择专家，EP 和 all-to-all 会直接影响通信。",
      snippet: [
        'MOE_ARGS="--num-experts 128 --moe-router-topk 8 --expert-model-parallel-size 8"',
        'TRAIN_ARGS="--seq-length 4096 --tensor-model-parallel-size 2 --pipeline-model-parallel-size 4"',
        'DPO_ARGS="--global-batch-size 128 --recompute-granularity full"',
      ].join("\n"),
      decision: {
        title: "进入进阶训练解释",
        body: "建议同时观察 expert 负载、all-to-all 通信、recompute 和长上下文 HBM 压力。",
      },
      checks: [
        ["ok", "EP 与 num_experts 已绑定", "专家并行需要和 world size 一起解释。"],
        ["warn", "all-to-all 通信风险", "router topk 增大后通信和负载均衡都会变化。"],
        ["ok", "DPO 数据格式可检查", "chosen/rejected 数据需要进入体检项。"],
      ],
      graph: [
        ["input", "Token IDs", "input", 300, 42, 180, 58],
        ["embed", "Embedding", "hidden", 300, 128, 220, 68],
        ["router", "Router", "topk experts", 300, 226, 220, 68],
        ["expertA", "Expert Group A", "EP shard", 150, 336, 220, 62],
        ["expertB", "Expert Group B", "EP shard", 450, 336, 220, 62],
        ["merge", "Combine", "weighted sum", 300, 430, 220, 62],
      ],
      edges: [["input", "embed"], ["embed", "router"], ["router", "expertA"], ["router", "expertB"], ["expertA", "merge"], ["expertB", "merge"]],
      paramLinks: {
        seq: { nodes: ["input", "embed", "router"], note: "长上下文先扩大 token 序列，再让更多 token 进入 router，增加路由和专家通信压力。" },
        parallel: { nodes: ["router", "expertA", "expertB"], note: "EP 与专家组强绑定；router 的 TopK 选择会决定 all-to-all 通信和负载均衡风险。" },
        batch: { nodes: ["input", "router", "merge"], note: "Batch 增大后，router 和专家合并阶段同时承压，吞吐收益和通信风险要一起看。" },
      },
    },
    deepseek: {
      name: "DeepSeek V3.2",
      title: "DeepSeek V3.2 工程复杂度解释",
      meta: "671B MoE · MLA · DSA · MTP · TP/PP/EP/CP",
      run: "run deepseek-v32-r02",
      graphKind: "moe",
      trainingGraph: makeDeepSeekTrainingGraph(),
      phaseMap: {
        tokens: { nodeId: "input_tokens", nodeLabel: "Token IDs" },
        embedding: { nodeId: "token_embedding", nodeLabel: "Parallel Embedding", relatedNodeIds: ["token_embedding_weight"] },
        attention: { nodeId: "mla_attention", nodeLabel: "MLA + DSA Attention", relatedNodeIds: ["query_weight", "kv_weight", "kv_cache", "dsa_sparse_index", "query_projection", "kv_projection", "dsa_indexer", "sparse_attention"] },
        mlp: { nodeId: "moe_combine", nodeLabel: "MoE Combine", relatedNodeIds: ["router_weight", "router", "topk_expert_select", "routed_expert_weight", "routed_experts", "shared_expert_weight", "shared_expert"] },
        norm: { nodeId: "final_norm", nodeLabel: "Final RMSNorm", relatedNodeIds: ["final_norm_gamma"] },
        logits: { nodeId: "lm_head", nodeLabel: "LM Head + MTP", relatedNodeIds: ["lm_head_weight", "mtp_weight", "mtp_head", "logits"] },
      },
      seq: "16384+",
      parallel: "TP4 · PP8 · EP64 · CP2",
      batch: "MBS1 · GBS256",
      params: 671e9,
      target: 3e12,
      summary: "DeepSeek V3.2 把 MLA、Sparse Indexer、MoE、MTP、长上下文和多维并行放到同一条解释链里。",
      snippet: [
        'MODEL_ARGS="--num-experts 256 --moe-router-topk 8 --enable-dsa-indexer"',
        'PARALLEL_ARGS="--tensor-model-parallel-size 4 --pipeline-model-parallel-size 8 --expert-model-parallel-size 64"',
        'ATTN_ARGS="--use-sparse-flash-attn --context-parallel-size 2"',
      ].join("\n"),
      decision: {
        title: "建议作为专家模式样例",
        body: "先不要让初学者直接照抄脚本，应该用它解释 MLA、DSA、EP、CP 和 profiling 归因。",
      },
      checks: [
        ["warn", "多维并行需整体校验", "TP/PP/EP/CP 与节点数、rank 和权重切分强相关。"],
        ["warn", "DSA 与 sparse attention 需成对解释", "索引器、稀疏注意力和长上下文不能孤立看。"],
        ["danger", "必须采集 profiling 摘要", "没有通信/显存证据时，很难定位瓶颈。"],
      ],
      graph: [
        ["input", "Token IDs", "long context", 300, 36, 190, 58],
        ["mla", "MLA", "compressed KV", 170, 128, 220, 68],
        ["dsa", "DSA Indexer", "sparse select", 430, 128, 230, 68],
        ["router", "MoE Router", "topk 8", 300, 238, 220, 68],
        ["experts", "256 Experts", "EP64", 170, 350, 220, 62],
        ["mtp", "MTP", "multi-token", 430, 350, 220, 62],
        ["head", "LM Head", "logits", 300, 438, 220, 62],
      ],
      edges: [["input", "mla"], ["input", "dsa"], ["mla", "router"], ["dsa", "router"], ["router", "experts"], ["router", "mtp"], ["experts", "head"], ["mtp", "head"]],
      paramLinks: {
        seq: { nodes: ["input", "mla", "dsa"], note: "DeepSeek 的长上下文会同时牵动 MLA、DSA Indexer 和 Sparse Attention 路径。" },
        parallel: { nodes: ["router", "experts", "mtp"], note: "TP/PP/EP/CP 同时出现时，router、experts 和 MTP 的通信域必须一起校验。" },
        batch: { nodes: ["input", "router", "head"], note: "Batch 放大 token 流量，风险会从输入、MoE 路由一路传导到 logits/loss。" },
      },
    },
  };

  function evidenceItem(priority, dimension, metric, what, evidence, action, relatedNodeIds = [], sources = []) {
    return { priority, dimension, metric, what, evidence, action, relatedNodeIds, sources };
  }

  function makeDenseTrainingGraph(config) {
    const mainX = 560;
    const leftX = 190;
    const rightX = 930;
    const nodes = [
      { id: "input_tokens", label: "Token IDs", typeLabel: "Input", kind: "tensor", x: mainX, y: 48, width: 176, height: 48, colorKey: "io:input" },
      { id: "token_embedding_weight", label: "Embedding Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 150, width: 232, height: 52, colorKey: "io:parameter" },
      { id: "token_embedding", label: "Embedding Lookup", typeLabel: "Op", kind: "op", x: mainX, y: 150, width: 246, height: 56, colorKey: "sem:embedding" },
      { id: "hidden_states", label: "Hidden States", typeLabel: "Tensor", kind: "tensor", x: mainX, y: 224, width: 210, height: 48, colorKey: "io:activation" },
      { id: "attn_norm_gamma", label: "Attn Norm Gamma", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 304, width: 204, height: 52, colorKey: "io:parameter" },
      { id: "attn_norm", label: "Attention RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 304, width: 232, height: 54, colorKey: "sem:norm" },
      { id: "qkv_weight", label: "QKV Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 384, width: 188, height: 52, colorKey: "io:parameter" },
      { id: "qkv_linear", label: "QKV Linear", typeLabel: "Op", kind: "op", x: mainX, y: 384, width: 204, height: 54, colorKey: "sem:linear" },
      { id: "rope_cache", label: "RoPE Cache", typeLabel: "State", kind: "tensor", x: leftX, y: 464, width: 176, height: 52, colorKey: "io:state" },
      { id: "rotary_apply", label: "Apply RoPE", typeLabel: "Op", kind: "op", x: mainX, y: 464, width: 204, height: 54, colorKey: "sem:position" },
      { id: "kv_cache", label: "KV Cache", typeLabel: "State", kind: "tensor", x: leftX, y: 544, width: 164, height: 52, colorKey: "io:state" },
      { id: "scaled_attention", label: "Scaled Attention", typeLabel: "Op", kind: "op", x: mainX, y: 544, width: 224, height: 54, colorKey: "sem:attention" },
      { id: "attn_out_weight", label: "O-Proj Weight", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 624, width: 194, height: 52, colorKey: "io:parameter" },
      { id: "attn_output_linear", label: "Attention Output", typeLabel: "Op", kind: "op", x: mainX, y: 624, width: 230, height: 54, colorKey: "sem:linear" },
      { id: "mlp_norm_gamma", label: "MLP Norm Gamma", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 704, width: 204, height: 52, colorKey: "io:parameter" },
      { id: "mlp_norm", label: "MLP RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 704, width: 214, height: 54, colorKey: "sem:norm" },
      { id: "gate_weight", label: "Gate Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 794, width: 180, height: 52, colorKey: "io:parameter" },
      { id: "mlp_gate_linear", label: "Gate Linear", typeLabel: "Op", kind: "op", x: mainX - 126, y: 794, width: 190, height: 54, colorKey: "sem:mlp" },
      { id: "up_weight", label: "Up Weight", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 794, width: 164, height: 52, colorKey: "io:parameter" },
      { id: "mlp_up_linear", label: "Up Linear", typeLabel: "Op", kind: "op", x: mainX + 126, y: 794, width: 190, height: 54, colorKey: "sem:mlp" },
      { id: "silu_multiply", label: "SiLU Multiply", typeLabel: "Op", kind: "op", x: mainX, y: 874, width: 214, height: 54, colorKey: "sem:mlp" },
      { id: "down_weight", label: "Down Weight", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 954, width: 184, height: 52, colorKey: "io:parameter" },
      { id: "mlp_output_linear", label: "MLP Output", typeLabel: "Op", kind: "op", x: mainX, y: 954, width: 214, height: 54, colorKey: "sem:linear" },
      { id: "decoder_output", label: "Layer Output", typeLabel: "Tensor", kind: "tensor", x: mainX, y: 1034, width: 204, height: 48, colorKey: "io:activation" },
      { id: "final_norm_gamma", label: "Final Norm Gamma", typeLabel: "Parameter", kind: "tensor", x: rightX, y: 1120, width: 206, height: 52, colorKey: "io:parameter" },
      { id: "final_norm", label: "Final RMSNorm", typeLabel: "Op", kind: "op", x: mainX, y: 1120, width: 214, height: 54, colorKey: "sem:norm" },
      { id: "shared_lm_weight", label: "Shared LM Weight", typeLabel: "Parameter", kind: "tensor", x: leftX, y: 1208, width: 224, height: 52, colorKey: "io:parameter" },
      { id: "lm_head", label: "LM Head Linear", typeLabel: "Op", kind: "op", x: mainX, y: 1208, width: 224, height: 54, colorKey: "sem:head" },
      { id: "logits", label: "Logits", typeLabel: "Output", kind: "tensor", x: mainX, y: 1292, width: 176, height: 48, colorKey: "io:output" },
    ];

    const edges = [
      { source: "input_tokens", target: "token_embedding", tag: "ACT", edgeType: "activation" },
      { source: "token_embedding_weight", target: "token_embedding", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "token_embedding", target: "hidden_states", tag: "H", edgeType: "activation" },
      { source: "hidden_states", target: "attn_norm", tag: "ACT", edgeType: "activation" },
      { source: "attn_norm_gamma", target: "attn_norm", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "qkv_weight", target: "qkv_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "attn_norm", target: "qkv_linear", tag: "QKV", edgeType: "parameter" },
      { source: "rope_cache", target: "rotary_apply", tag: "State", edgeType: "state", dashed: true },
      { source: "qkv_linear", target: "rotary_apply", tag: "ROPE", edgeType: "state" },
      { source: "kv_cache", target: "scaled_attention", tag: "State", edgeType: "cache", dashed: true },
      { source: "rotary_apply", target: "scaled_attention", tag: "KV", edgeType: "cache" },
      { source: "scaled_attention", target: "attn_output_linear", tag: "ACT", edgeType: "activation" },
      { source: "attn_out_weight", target: "attn_output_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "attn_output_linear", target: "mlp_norm", tag: "RES", edgeType: "activation" },
      { source: "mlp_norm_gamma", target: "mlp_norm", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "gate_weight", target: "mlp_gate_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "mlp_norm", target: "mlp_gate_linear", tag: "W1", edgeType: "parameter" },
      { source: "up_weight", target: "mlp_up_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "mlp_norm", target: "mlp_up_linear", tag: "W2", edgeType: "parameter" },
      { source: "mlp_gate_linear", target: "silu_multiply", tag: "GATE", edgeType: "activation" },
      { source: "mlp_up_linear", target: "silu_multiply", tag: "UP", edgeType: "activation" },
      { source: "silu_multiply", target: "mlp_output_linear", tag: "W", edgeType: "parameter" },
      { source: "down_weight", target: "mlp_output_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "mlp_output_linear", target: "decoder_output", tag: "ACT", edgeType: "activation" },
      { source: "decoder_output", target: "final_norm", tag: "ACT", edgeType: "activation" },
      { source: "final_norm_gamma", target: "final_norm", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "shared_lm_weight", target: "lm_head", tag: "Parameter", edgeType: "parameter", dashed: true },
      { source: "final_norm", target: "lm_head", tag: "W", edgeType: "parameter" },
      { source: "lm_head", target: "logits", tag: "LOSS", edgeType: "gradient" },
    ];

    const evidence = {
      input_tokens: evidenceItem("P2", "data", `SEQ_LENGTH ${config.seq}`, "训练样本首先被切成 token ids；序列长度决定后续每层要处理的 token 数。", [
        `${config.seq} 是单样本上下文长度，直接影响激活显存和 attention 计算量。`,
        "微批次 MBS 与 GBS 决定一次前后向覆盖多少 token。",
      ], "如果首轮就 OOM，优先缩短 SEQ_LENGTH 或开启重算。", ["token_embedding"]),
      token_embedding: evidenceItem("P2", "source / parameter", `hidden ${config.hidden}`, "Embedding 把 token id 映射到 hidden states，是模型数据流的入口。", [
        `hidden size=${config.hidden} 会沿着 Attention、MLP、RMSNorm 和 LM Head 传播。`,
        "词表维度影响 embedding 与最终 vocab projection 的权重规模。",
      ], "检查 tokenizer 路径、词表大小和权重转换是否一致。", ["input_tokens", "token_embedding_weight", "attn_norm"]),
      token_embedding_weight: evidenceItem(null, "parameter tensor", "embedding.weight", "Embedding Weight 是 token id 查表时读取的参数张量，不是 config 或 README 文件。", [
        "config.json 提供 vocab_size、hidden_size 这类形状证据；safetensors index 提供权重 shard 证据。",
      ], "在图里把它作为 Parameter 输入接到 Embedding Lookup。", ["token_embedding"], ["config.json", "safetensors.index"]),
      hidden_states: evidenceItem("P2", "tensor", `hidden ${config.hidden}`, "Hidden States 是 embedding 之后真正进入 decoder layer 的激活张量。", [
        "它不是源码文件，而是训练中每一层反复读写、保存或重算的激活。",
      ], "讲训练链路时，优先沿着 tensor 流向解释，而不是沿着文件名解释。", ["token_embedding", "attn_norm"]),
      scaled_attention: evidenceItem("P1", "compute / memory", "Attention", "Attention 让当前 token 读取上下文重点，是序列长度最敏感的训练节点。", [
        `${config.layers} layers、${config.heads} heads、${config.parallel} 共同决定 attention 的切分和通信域。`,
        "长上下文会放大 QK^T、softmax、KV cache/激活保存和重算压力。",
      ], "观察 MFU、HBM 与通信等待；若 MFU 低且 HBM 高，优先看重算和 TP 切分。", ["qkv_weight", "qkv_linear", "rope_cache", "kv_cache", "rotary_apply", "attn_output_linear"]),
      qkv_weight: evidenceItem(null, "parameter tensor", "q_proj/k_proj/v_proj", "QKV Weight 是 Attention 线性投影读取的权重输入。", [
        "modeling_qwen.py 证明 Q/K/V 投影的源码路径；config.json 给出 head 和 hidden 的形状约束。",
      ], "排查 attention 显存或通信时，把 QKV 权重和 QKV 激活分开看。", ["qkv_linear"], ["modeling_qwen.py", "config.json"]),
      rope_cache: evidenceItem(null, "state tensor", "RoPE cache", "RoPE Cache 是位置编码状态，用于把位置信息注入 Q/K。", [
        "它来自模型实现和序列长度约束，不是独立源码文件节点。",
      ], "长上下文异常时，联查 RoPE 形状、seq_length 和 attention kernel。", ["rotary_apply"], ["modeling_qwen.py"]),
      kv_cache: evidenceItem(null, "state tensor", "KV cache / activation", "训练图中 KV Cache 表示 attention 路径上需要保存或重算的 K/V 状态。", [
        "它帮助解释长上下文为什么会放大 HBM 和重算压力。",
      ], "用 profiling 区分 KV/激活压力和参数权重读取压力。", ["scaled_attention"], ["profiling summary"]),
      silu_multiply: evidenceItem("P2", "compute", `intermediate ${config.intermediate}`, "SwiGLU MLP 执行 Gate/Up 投影和 SiLU 乘法，是 Dense decoder 的主要算力消耗之一。", [
        `intermediate size=${config.intermediate} 解释了 MLP 为什么比 hidden size 宽很多。`,
        "MLP 对矩阵乘吞吐敏感，和 tensor parallel 的切分策略强相关。",
      ], "如果 attention 正常但 MFU 偏低，检查 MLP fusion、TP 切分和重算粒度。", ["mlp_norm_gamma", "gate_weight", "up_weight", "mlp_gate_linear", "mlp_up_linear", "down_weight", "mlp_output_linear"]),
      gate_weight: evidenceItem(null, "parameter tensor", "mlp.w1 / gate_proj", "Gate Weight 是 SwiGLU 门控分支的参数输入。", [
        `intermediate size=${config.intermediate} 主要体现在 Gate/Up/Down 三组 MLP 权重上。`,
      ], "把 MLP 算力问题映射到 Gate/Up/Down 三条参数输入。", ["mlp_gate_linear"], ["modeling_qwen.py", "safetensors.index"]),
      up_weight: evidenceItem(null, "parameter tensor", "mlp.w2 / up_proj", "Up Weight 是 SwiGLU 上投影分支的参数输入。", [
        "它和 Gate Weight 一起决定 SiLU Multiply 前的宽激活。",
      ], "若 MLP kernel 利用率低，优先看这两条上投影是否被正确切分。", ["mlp_up_linear"], ["modeling_qwen.py", "safetensors.index"]),
      down_weight: evidenceItem(null, "parameter tensor", "mlp.c_proj / down_proj", "Down Weight 把 intermediate 激活投回 hidden size。", [
        "它是 MLP 分支回到主干 hidden states 的参数边界。",
      ], "检查 TP 切分和输出投影融合是否匹配脚本配置。", ["mlp_output_linear"], ["modeling_qwen.py", "safetensors.index"]),
      decoder_output: evidenceItem("P2", "tensor", "layer output", "Layer Output 表示一个 decoder layer 结束后的 hidden states，会进入下一层或最终 RMSNorm。", [
        "训练时它通常对应残差后的激活保存、重算和梯度回传边界。",
      ], "解释收敛或显存问题时，把它当作层间张量边界来看。", ["mlp_output_linear", "final_norm"]),
      lm_head: evidenceItem("P2", "loss / backward", "logits", "LM Head 把 hidden states 投影到词表 logits，随后进入 loss、反向传播和优化器更新。", [
        "词表越大，logits、cross entropy 和梯度路径越容易变成显存压力点。",
        `${config.batch} 会改变 logits/loss 的统计稳定性和梯度累积节奏。`,
      ], "遇到 loss spike 时同时看 logits、梯度范数和最后投影的通信/显存。", ["shared_lm_weight", "logits", "final_norm"]),
      shared_lm_weight: evidenceItem(null, "parameter tensor", "lm_head.weight", "Shared LM Weight 是输出词表投影读取的参数张量。", [
        "generation_config 只解释采样侧 top_p/eos；训练前向里真正输入 LM Head 的是权重 tensor。",
      ], "不要把 generation_config 画成 logits 的输入节点。", ["lm_head", "logits"], ["generation_config.json", "safetensors.index"]),
    };

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
      edges,
      trainingEvidence: evidence,
    };
  }

  function makeQwen3TrainingGraph() {
    return makeDenseTrainingGraph({
      name: "Qwen3-8B",
      layers: 36,
      hidden: 4096,
      heads: "32 attention heads / GQA",
      intermediate: 22016,
      seq: 4096,
      parallel: "TP2 / PP1",
      batch: "MBS1 / GBS128",
    });
  }

  function makeQwen7BTrainingGraph() {
    return makeDenseTrainingGraph({
      name: "Qwen7B",
      layers: 32,
      hidden: 4096,
      heads: "32 attention heads",
      intermediate: 22016,
      seq: 8192,
      parallel: "TP1 / PP1",
      batch: "MBS1 / GBS64",
    });
  }

  function makeQwenMoeTrainingGraph() {
    return {
      width: 1040,
      height: 1240,
      clusters: [
        { id: "transformer", label: "Qwen3-MoE Transformer", x: 132, y: 92, width: 596, height: 1030, colorKey: "module:transformer" },
        { id: "decoder_layer", label: "MoE Decoder Layer", x: 164, y: 282, width: 532, height: 720, repeat: 48, colorKey: "module:decoder" },
        { id: "attention_box", label: "Attention", x: 196, y: 344, width: 468, height: 164, colorKey: "module:attention" },
        { id: "moe_box", label: "Router + Experts", x: 184, y: 568, width: 492, height: 354, colorKey: "module:moe" },
      ],
      nodes: [
        { id: "input_tokens", label: "Token IDs", typeLabel: "Input", kind: "tensor", x: 430, y: 48, width: 176, height: 48, colorKey: "io:input" },
        { id: "token_embedding_weight", label: "Embedding Weight", typeLabel: "Parameter", kind: "tensor", x: 88, y: 150, width: 232, height: 52, colorKey: "io:parameter" },
        { id: "token_embedding", label: "Embedding Lookup", typeLabel: "Op", kind: "op", x: 430, y: 150, width: 246, height: 56, colorKey: "sem:embedding" },
        { id: "hidden_states", label: "Hidden States", typeLabel: "Tensor", kind: "tensor", x: 430, y: 224, width: 210, height: 48, colorKey: "io:activation" },
        { id: "attn_norm", label: "Attention RMSNorm", typeLabel: "Op", kind: "op", x: 430, y: 304, width: 232, height: 54, colorKey: "sem:norm" },
        { id: "qkv_weight", label: "QKV Weight", typeLabel: "Parameter", kind: "tensor", x: 88, y: 392, width: 188, height: 52, colorKey: "io:parameter" },
        { id: "qkv_linear", label: "QKV Linear", typeLabel: "Op", kind: "op", x: 300, y: 392, width: 190, height: 54, colorKey: "sem:linear" },
        { id: "kv_cache", label: "KV Cache", typeLabel: "State", kind: "tensor", x: 836, y: 392, width: 164, height: 52, colorKey: "io:state" },
        { id: "scaled_attention", label: "Dense Attention", typeLabel: "Op", kind: "op", x: 560, y: 392, width: 214, height: 54, colorKey: "sem:attention" },
        { id: "ffn_norm", label: "FFN RMSNorm", typeLabel: "Op", kind: "op", x: 430, y: 520, width: 214, height: 54, colorKey: "sem:norm" },
        { id: "router_weight", label: "Router Weight", typeLabel: "Parameter", kind: "tensor", x: 88, y: 604, width: 196, height: 52, colorKey: "io:parameter" },
        { id: "router", label: "Router Linear", typeLabel: "Op", kind: "op", x: 430, y: 604, width: 214, height: 54, colorKey: "sem:router" },
        { id: "expert_dispatch_buffer", label: "Dispatch Buffer", typeLabel: "State", kind: "tensor", x: 836, y: 684, width: 210, height: 52, colorKey: "io:state" },
        { id: "topk_expert_select", label: "TopK Expert Select", typeLabel: "Op", kind: "op", x: 430, y: 684, width: 238, height: 54, colorKey: "sem:router" },
        { id: "expert_dispatch", label: "All-to-All Dispatch", typeLabel: "Comm", kind: "op", x: 214, y: 774, width: 206, height: 54, colorKey: "sem:communication" },
        { id: "routed_expert_weight", label: "Routed Expert Weight", typeLabel: "Parameter", kind: "tensor", x: 88, y: 844, width: 242, height: 52, colorKey: "io:parameter" },
        { id: "routed_experts", label: "Routed Experts", typeLabel: "Expert", kind: "op", x: 430, y: 774, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "shared_expert_weight", label: "Shared Expert Weight", typeLabel: "Parameter", kind: "tensor", x: 836, y: 844, width: 246, height: 52, colorKey: "io:parameter" },
        { id: "shared_expert", label: "Shared Expert", typeLabel: "Expert", kind: "op", x: 610, y: 774, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "expert_combine", label: "Expert Combine", typeLabel: "Op", kind: "op", x: 430, y: 866, width: 214, height: 54, colorKey: "sem:combine" },
        { id: "decoder_output", label: "Layer Output", typeLabel: "Tensor", kind: "tensor", x: 430, y: 952, width: 204, height: 48, colorKey: "io:activation" },
        { id: "final_norm_gamma", label: "Final Norm Gamma", typeLabel: "Parameter", kind: "tensor", x: 836, y: 1036, width: 206, height: 52, colorKey: "io:parameter" },
        { id: "final_norm", label: "Final RMSNorm", typeLabel: "Op", kind: "op", x: 430, y: 1036, width: 214, height: 54, colorKey: "sem:norm" },
        { id: "lm_head_weight", label: "LM Head Weight", typeLabel: "Parameter", kind: "tensor", x: 88, y: 1122, width: 210, height: 52, colorKey: "io:parameter" },
        { id: "lm_head", label: "LM Head Linear", typeLabel: "Op", kind: "op", x: 430, y: 1122, width: 224, height: 54, colorKey: "sem:head" },
        { id: "logits", label: "Logits", typeLabel: "Output", kind: "tensor", x: 430, y: 1192, width: 176, height: 48, colorKey: "io:output" },
      ],
      edges: [
        { source: "input_tokens", target: "token_embedding", tag: "ACT", edgeType: "activation" },
        { source: "token_embedding_weight", target: "token_embedding", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "token_embedding", target: "hidden_states", tag: "H", edgeType: "activation" },
        { source: "hidden_states", target: "attn_norm", tag: "ACT", edgeType: "activation" },
        { source: "qkv_weight", target: "qkv_linear", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "attn_norm", target: "qkv_linear", tag: "QKV", edgeType: "parameter" },
        { source: "kv_cache", target: "scaled_attention", tag: "State", edgeType: "cache", dashed: true },
        { source: "qkv_linear", target: "scaled_attention", tag: "ATTN", edgeType: "activation" },
        { source: "scaled_attention", target: "ffn_norm", tag: "RES", edgeType: "activation" },
        { source: "router_weight", target: "router", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "ffn_norm", target: "router", tag: "ROUTE", edgeType: "activation" },
        { source: "router", target: "topk_expert_select", tag: "TOPK", edgeType: "parameter" },
        { source: "expert_dispatch_buffer", target: "expert_dispatch", tag: "State", edgeType: "state", dashed: true },
        { source: "topk_expert_select", target: "expert_dispatch", tag: "A2A", edgeType: "communication" },
        { source: "expert_dispatch", target: "routed_experts", tag: "EP", edgeType: "communication" },
        { source: "topk_expert_select", target: "shared_expert", tag: "SHARED", edgeType: "activation" },
        { source: "routed_expert_weight", target: "routed_experts", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "shared_expert_weight", target: "shared_expert", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "routed_experts", target: "expert_combine", tag: "WEIGHT", edgeType: "activation" },
        { source: "shared_expert", target: "expert_combine", tag: "SUM", edgeType: "activation" },
        { source: "expert_combine", target: "decoder_output", tag: "ACT", edgeType: "activation" },
        { source: "decoder_output", target: "final_norm", tag: "ACT", edgeType: "activation" },
        { source: "final_norm_gamma", target: "final_norm", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "lm_head_weight", target: "lm_head", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "final_norm", target: "lm_head", tag: "W", edgeType: "parameter" },
        { source: "lm_head", target: "logits", tag: "LOSS", edgeType: "gradient" },
      ],
      trainingEvidence: {
        token_embedding_weight: evidenceItem(null, "parameter tensor", "embedding.weight", "Embedding Weight 是 MoE 主干的参数输入，token ids 通过它变成 hidden states。", [
          "它由 config 形状和权重 shard 共同校准，不是源码文件节点。",
        ], "先确认 vocab/hidden，再看 router 和 expert。", ["token_embedding"], ["config.json", "safetensors.index"]),
        hidden_states: evidenceItem("P2", "tensor", "hidden states", "Hidden States 是 MoE decoder 进入 attention 和 router 之前的激活张量。", [
          "MoE 不是把输入 tensor 变成专家文件，而是在 hidden states 上做 router 选择。",
        ], "先沿 tensor 流解释，再解释 router 和 expert 并行。", ["token_embedding", "attn_norm", "router"]),
        router_weight: evidenceItem(null, "parameter tensor", "router.weight", "Router Weight 是 token 到专家打分的参数输入。", [
          "TopK 选择发生在 router logits 上，和 expert 权重不是一回事。",
        ], "解释负载不均时，把 router 权重、TopK 和 dispatch buffer 分开看。", ["router", "topk_expert_select"], ["MoE config"]),
        expert_dispatch_buffer: evidenceItem(null, "state tensor", "dispatch buffer", "Dispatch Buffer 是 token 按专家分组后跨 rank 发送的运行态状态。", [
          "all-to-all 等待升高时，瓶颈往往出现在这里，而不是单个专家 matmul。",
        ], "结合硬件利用率查看 straggler rank。", ["expert_dispatch"], ["profiling communication trace"]),
        router: evidenceItem("P1", "MoE routing", "topk 8", "Router 为每个 token 选择专家，训练风险从算力转向负载均衡和通信。", [
          "MOE_ARGS 里的 num_experts、moe-router-topk 和 expert-model-parallel-size 必须一起解释。",
          "TopK 增大后，专家通信量和负载不均风险都会上升。",
        ], "监控 expert load、token drop、all-to-all 等待和 straggler rank。", ["router_weight", "topk_expert_select", "expert_dispatch_buffer", "expert_dispatch"]),
        expert_dispatch: evidenceItem("P1", "communication", "EP / all-to-all", "Expert parallel 会把 token 按专家路由到不同 rank，all-to-all 是 MoE 训练的关键通信面。", [
          "EP8 表示专家并行把专家组拆到多卡。",
          "all-to-all 等待升高时，MFU 可能下降但单卡算子并不慢。",
        ], "低 MFU 同时看 all-to-all overlap、expert load 和 rank 间 token 分布。", ["expert_dispatch_buffer", "router", "routed_experts"]),
        expert_combine: evidenceItem("P2", "MoE output", "weighted sum", "专家输出按路由权重合并回 hidden states，再进入后续 norm 和 LM Head。", [
          "Combine 是 MoE 分支回到 dense 流水线的同步点。",
        ], "如果 combine 附近等待高，优先判断是专家负载不均还是通信拓扑问题。", ["routed_expert_weight", "routed_experts", "shared_expert_weight", "shared_expert", "final_norm"]),
        decoder_output: evidenceItem("P2", "tensor", "layer output", "Layer Output 是专家合并后回到主干的数据边界。", [
          "它让 MoE 图重新回到普通 decoder 的后续 Norm、LM Head 和 loss 路径。",
        ], "定位 MoE 训练问题时，把 router/expert 分支和主干输出边界分开看。", ["expert_combine", "final_norm"]),
      },
    };
  }

  function makeDeepSeekTrainingGraph() {
    return {
      width: 1160,
      height: 1360,
      clusters: [
        { id: "transformer", label: "DeepSeek V3.2 Transformer", x: 124, y: 92, width: 682, height: 1120, colorKey: "module:transformer" },
        { id: "decoder_layer", label: "Decoder Layer × 61", x: 158, y: 282, width: 614, height: 852, repeat: 61, colorKey: "module:decoder" },
        { id: "mla_box", label: "MLA + DSA", x: 190, y: 342, width: 550, height: 292, colorKey: "module:mla" },
        { id: "moe_box", label: "MoE FFN", x: 190, y: 704, width: 550, height: 342, colorKey: "module:moe" },
      ],
      nodes: [
        { id: "input_tokens", label: "Token IDs", typeLabel: "Input", kind: "tensor", x: 465, y: 48, width: 176, height: 48, colorKey: "io:input" },
        { id: "token_embedding_weight", label: "Embedding Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 150, width: 232, height: 52, colorKey: "io:parameter" },
        { id: "token_embedding", label: "Parallel Embedding", typeLabel: "Op", kind: "op", x: 465, y: 150, width: 260, height: 56, colorKey: "sem:embedding" },
        { id: "hidden_states", label: "Hidden States", typeLabel: "Tensor", kind: "tensor", x: 465, y: 224, width: 210, height: 48, colorKey: "io:activation" },
        { id: "attention_norm", label: "Attention RMSNorm", typeLabel: "Op", kind: "op", x: 465, y: 304, width: 232, height: 54, colorKey: "sem:norm" },
        { id: "query_weight", label: "Query Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 398, width: 188, height: 52, colorKey: "io:parameter" },
        { id: "query_projection", label: "Query Projection", typeLabel: "Op", kind: "op", x: 300, y: 398, width: 220, height: 54, colorKey: "sem:linear" },
        { id: "kv_weight", label: "KV Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 480, width: 164, height: 52, colorKey: "io:parameter" },
        { id: "kv_projection", label: "KV Projection", typeLabel: "Op", kind: "op", x: 465, y: 398, width: 204, height: 54, colorKey: "sem:linear" },
        { id: "dsa_sparse_index", label: "DSA Sparse Index", typeLabel: "State", kind: "tensor", x: 910, y: 398, width: 222, height: 52, colorKey: "io:state" },
        { id: "dsa_indexer", label: "DSA Indexer", typeLabel: "Module", kind: "op", x: 630, y: 398, width: 204, height: 54, colorKey: "sem:indexer" },
        { id: "sparse_attention", label: "Sparse Attention", typeLabel: "Op", kind: "op", x: 370, y: 498, width: 224, height: 54, colorKey: "sem:attention" },
        { id: "kv_cache", label: "KV Cache", typeLabel: "State", kind: "tensor", x: 910, y: 498, width: 164, height: 52, colorKey: "io:state" },
        { id: "mla_attention", label: "MLA Attention", typeLabel: "Module", kind: "op", x: 560, y: 498, width: 224, height: 54, colorKey: "sem:attention" },
        { id: "attention_output", label: "Attention Output", typeLabel: "Op", kind: "op", x: 465, y: 604, width: 230, height: 54, colorKey: "sem:linear" },
        { id: "ffn_norm", label: "FFN RMSNorm", typeLabel: "Op", kind: "op", x: 465, y: 704, width: 214, height: 54, colorKey: "sem:norm" },
        { id: "router_weight", label: "Router Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 788, width: 196, height: 52, colorKey: "io:parameter" },
        { id: "router", label: "Router Linear", typeLabel: "Op", kind: "op", x: 465, y: 788, width: 214, height: 54, colorKey: "sem:router" },
        { id: "topk_expert_select", label: "TopK Expert Select", typeLabel: "Op", kind: "op", x: 465, y: 868, width: 238, height: 54, colorKey: "sem:router" },
        { id: "routed_expert_weight", label: "Routed Expert Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 950, width: 242, height: 52, colorKey: "io:parameter" },
        { id: "routed_experts", label: "Routed Experts", typeLabel: "Expert", kind: "op", x: 310, y: 950, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "shared_expert_weight", label: "Shared Expert Weight", typeLabel: "Parameter", kind: "tensor", x: 910, y: 950, width: 246, height: 52, colorKey: "io:parameter" },
        { id: "shared_expert", label: "Shared Expert", typeLabel: "Expert", kind: "op", x: 620, y: 950, width: 204, height: 54, colorKey: "sem:expert" },
        { id: "moe_combine", label: "Expert Combine", typeLabel: "Op", kind: "op", x: 465, y: 1034, width: 214, height: 54, colorKey: "sem:combine" },
        { id: "decoder_output", label: "Layer Output", typeLabel: "Tensor", kind: "tensor", x: 465, y: 1114, width: 204, height: 48, colorKey: "io:activation" },
        { id: "final_norm_gamma", label: "Final Norm Gamma", typeLabel: "Parameter", kind: "tensor", x: 910, y: 1194, width: 206, height: 52, colorKey: "io:parameter" },
        { id: "final_norm", label: "Final RMSNorm", typeLabel: "Op", kind: "op", x: 465, y: 1194, width: 214, height: 54, colorKey: "sem:norm" },
        { id: "lm_head_weight", label: "LM Head Weight", typeLabel: "Parameter", kind: "tensor", x: 74, y: 1274, width: 210, height: 52, colorKey: "io:parameter" },
        { id: "lm_head", label: "LM Head Linear", typeLabel: "Op", kind: "op", x: 348, y: 1274, width: 224, height: 54, colorKey: "sem:head" },
        { id: "mtp_weight", label: "MTP Weight", typeLabel: "Parameter", kind: "tensor", x: 910, y: 1274, width: 172, height: 52, colorKey: "io:parameter" },
        { id: "mtp_head", label: "MTP Head", typeLabel: "Aux", kind: "op", x: 582, y: 1274, width: 196, height: 54, colorKey: "sem:mtp" },
        { id: "logits", label: "Logits", typeLabel: "Output", kind: "tensor", x: 465, y: 1328, width: 176, height: 48, colorKey: "io:output" },
      ],
      edges: [
        { source: "input_tokens", target: "token_embedding", tag: "ACT", edgeType: "activation" },
        { source: "token_embedding_weight", target: "token_embedding", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "token_embedding", target: "hidden_states", tag: "H", edgeType: "activation" },
        { source: "hidden_states", target: "attention_norm", tag: "ACT", edgeType: "activation" },
        { source: "query_weight", target: "query_projection", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "attention_norm", target: "query_projection", tag: "Q", edgeType: "parameter" },
        { source: "kv_weight", target: "kv_projection", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "attention_norm", target: "kv_projection", tag: "KV", edgeType: "parameter" },
        { source: "dsa_sparse_index", target: "dsa_indexer", tag: "State", edgeType: "state", dashed: true },
        { source: "attention_norm", target: "dsa_indexer", tag: "IDX", edgeType: "state" },
        { source: "query_projection", target: "sparse_attention", tag: "Q", edgeType: "activation" },
        { source: "kv_cache", target: "mla_attention", tag: "State", edgeType: "cache", dashed: true },
        { source: "kv_projection", target: "mla_attention", tag: "KV", edgeType: "cache" },
        { source: "dsa_indexer", target: "sparse_attention", tag: "TOPK", edgeType: "state" },
        { source: "sparse_attention", target: "attention_output", tag: "ACT", edgeType: "activation" },
        { source: "mla_attention", target: "attention_output", tag: "LATENT", edgeType: "activation" },
        { source: "attention_output", target: "ffn_norm", tag: "RES", edgeType: "activation" },
        { source: "router_weight", target: "router", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "ffn_norm", target: "router", tag: "ROUTE", edgeType: "activation" },
        { source: "router", target: "topk_expert_select", tag: "TOPK", edgeType: "parameter" },
        { source: "topk_expert_select", target: "routed_experts", tag: "EP64", edgeType: "communication" },
        { source: "topk_expert_select", target: "shared_expert", tag: "SHARED", edgeType: "activation" },
        { source: "routed_expert_weight", target: "routed_experts", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "shared_expert_weight", target: "shared_expert", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "routed_experts", target: "moe_combine", tag: "WEIGHT", edgeType: "activation" },
        { source: "shared_expert", target: "moe_combine", tag: "SUM", edgeType: "activation" },
        { source: "moe_combine", target: "decoder_output", tag: "ACT", edgeType: "activation" },
        { source: "decoder_output", target: "final_norm", tag: "ACT", edgeType: "activation" },
        { source: "final_norm_gamma", target: "final_norm", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "lm_head_weight", target: "lm_head", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "final_norm", target: "lm_head", tag: "W", edgeType: "parameter" },
        { source: "mtp_weight", target: "mtp_head", tag: "Parameter", edgeType: "parameter", dashed: true },
        { source: "final_norm", target: "mtp_head", tag: "MTP", edgeType: "parameter" },
        { source: "lm_head", target: "logits", tag: "LOSS", edgeType: "gradient" },
        { source: "mtp_head", target: "logits", tag: "AUX", edgeType: "gradient" },
      ],
      trainingEvidence: {
        token_embedding_weight: evidenceItem(null, "parameter tensor", "embedding.weight", "Parallel Embedding Weight 是 DeepSeek 输入侧的参数张量。", [
          "它让 token ids 进入隐藏空间，后续 MLA/DSA/MoE 都沿这个 hidden-state 主线展开。",
        ], "不要把模型 README 或 config 文件当作输入节点。", ["token_embedding"], ["config.json", "safetensors.index"]),
        hidden_states: evidenceItem("P2", "tensor", "hidden states", "Hidden States 是 DeepSeek V3.2 中进入 MLA、DSA 和 MoE 的主干激活。", [
          "MLA/DSA/MoE 是在同一条 hidden-state 数据流上分支加工，不是输入文件流。",
        ], "解释复杂模型时先固定 tensor 主线，再讲 MLA、DSA、router 和 MTP。", ["attention_norm", "router"]),
        query_weight: evidenceItem(null, "parameter tensor", "q_proj.weight", "Query Weight 是 MLA/DSA attention 查询侧投影的参数输入。", [
          "它和 KV Weight 一起决定 attention 投影的形状与 TP 切分。",
        ], "低 MFU 时区分投影 matmul、稀疏索引和 attention kernel。", ["query_projection"], ["model code", "config"]),
        kv_weight: evidenceItem(null, "parameter tensor", "kv_proj.weight", "KV Weight 是 MLA 压缩 KV 路径的参数输入。", [
          "DeepSeek 的 KV 路径和普通 dense attention 不同，后续还会进入 latent/cache 结构。",
        ], "把 KV 投影权重、KV cache 和 MLA attention 分开观察。", ["kv_projection", "mla_attention"], ["model code", "config"]),
        dsa_sparse_index: evidenceItem(null, "state tensor", "sparse index", "DSA Sparse Index 是稀疏 attention 选择出的运行态索引。", [
          "它不是模型参数，而是长上下文 attention 阶段的状态对象。",
        ], "索引构建耗时高时，联查 sparse attention 命中率和 HBM。", ["dsa_indexer", "sparse_attention"], ["profiling trace"]),
        kv_cache: evidenceItem(null, "state tensor", "KV cache", "KV Cache 表示 MLA 压缩 KV 路径中保留或重算的状态。", [
          "长上下文成本会从这里传导到 attention 输出和后续 MoE。",
        ], "定位长上下文瓶颈时，把 cache/state 压力和参数读取分开看。", ["mla_attention"], ["profiling trace"]),
        dsa_indexer: evidenceItem("P1", "sparse attention", "DSA", "DSA Indexer 把长上下文注意力变成可索引的稀疏选择问题。", [
          "DeepSeek V3.2 的长上下文不只是 SEQ_LENGTH 变大，还需要 MLA、Sparse Indexer 和 sparse attention 配合。",
          "索引器异常会把问题传导到 attention 输出和后续 MoE。",
        ], "观察 sparse attention 命中率、索引构建耗时和 HBM 压力。", ["dsa_sparse_index", "query_projection", "sparse_attention"]),
        mla_attention: evidenceItem("P1", "attention", "MLA", "MLA 压缩 KV 路径以降低长上下文 KV 压力，是 DeepSeek 图中区别于普通 dense attention 的核心。", [
          "kv latent、rope dim 和 cache 写入会影响解码和长上下文训练成本。",
        ], "若 attention 阶段 MFU 低，先分辨是稀疏索引、KV path 还是输出投影的问题。", ["kv_weight", "kv_cache", "kv_projection", "sparse_attention", "attention_output"]),
        router_weight: evidenceItem(null, "parameter tensor", "router.weight", "Router Weight 决定 token 到专家的打分投影。", [
          "它和 EP64、topk 8 共同影响专家负载，而不是普通 FFN 权重。",
        ], "专家负载不均时，从 router logits 到 TopK 分布一路看。", ["router", "topk_expert_select"], ["MoE config"]),
        router: evidenceItem("P1", "MoE routing", "topk 8 / 256 experts", "Router 决定 token 进入哪些专家，和 EP64、all-to-all、负载均衡直接绑定。", [
          "MODEL_ARGS 中 num-experts=256、topk=8 与 EP64 必须作为同一个训练面解释。",
        ], "低利用率通常先看 expert load 和 all-to-all overlap，不要只看单算子耗时。", ["router_weight", "topk_expert_select", "routed_experts"]),
        moe_combine: evidenceItem("P2", "MoE output", "weighted sum", "Expert Combine 是 MoE 分支回到主干 hidden states 的同步点。", [
          "专家输出合并前后的等待能暴露通信、负载和 pipeline bubble。",
        ], "combine 周边等待高时，联查 EP 拆分、router topk 和 rank 拓扑。", ["routed_expert_weight", "routed_experts", "shared_expert_weight", "shared_expert", "final_norm"]),
        decoder_output: evidenceItem("P2", "tensor", "layer output", "Layer Output 是 DeepSeek decoder 层输出张量，后续进入 Final RMSNorm、LM Head 和 MTP。", [
          "它把复杂的 MLA/DSA/MoE 分支重新收敛到训练 loss 路径。",
        ], "排查梯度或 loss 时，把主 LM Head 与 MTP 辅助头从这个张量边界往后看。", ["final_norm", "lm_head", "mtp_head"]),
        mtp_head: evidenceItem("P2", "auxiliary objective", "MTP", "MTP 是额外的多 token 预测头，训练时会增加输出侧 loss 和梯度路径。", [
          "MTP 不能和主 LM Head 混成一个普通输出节点，它是 DeepSeek 工程复杂度的一部分。",
        ], "解释 loss 曲线时区分主 logits 与 auxiliary loss 对梯度的贡献。", ["mtp_weight", "lm_head", "logits"]),
      },
    };
  }

  const hardwareProfiles = {
    single8: { label: "8 × Ascend 910B · 1 节点", devices: 64, world: 8, cols: 16, unit: "AI Core 槽位", unitHint: "单节点细粒度视图" },
    cluster64: { label: "64 × Ascend 910B · 8 节点", devices: 64, world: 64, cols: 16, unit: "NPU 卡槽", unitHint: "集群聚合视图" },
    cluster512: { label: "512 × Ascend NPU · 64 节点", devices: 512, world: 512, cols: 32, unit: "NPU 卡槽", unitHint: "集群聚合视图" },
  };

  const phaseSteps = [
    { id: "tokens", label: "Tokens", nodeId: "input_tokens", nodeLabel: "Token IDs", summary: "当前 micro batch 已切成 token ids，准备进入 embedding 查表。" },
    { id: "embedding", label: "Embedding", nodeId: "token_embedding", nodeLabel: "Embedding", summary: "Token IDs 正在映射为 hidden states，词表维度会影响 embedding 和 LM Head。" },
    { id: "attention", label: "Attention", nodeId: "scaled_attention", nodeLabel: "Scaled Attention", summary: "当前层在计算上下文依赖，序列长度会直接放大 attention 计算和 KV 压力。" },
    { id: "mlp", label: "SwiGLU", nodeId: "silu_multiply", nodeLabel: "SwiGLU MLP", summary: "MLP 分支执行 Gate/Up 投影和 SiLU Multiply，是 Dense decoder 的主要算力消耗之一。" },
    { id: "norm", label: "Norm", nodeId: "final_norm", nodeLabel: "Final RMSNorm", summary: "Decoder 输出进入最终 RMSNorm，准备投影到词表 logits。" },
    { id: "logits", label: "Logits", nodeId: "lm_head", nodeLabel: "LM Head", summary: "LM Head 生成 logits，随后进入 loss、反向传播和优化器更新。" },
  ];

  const state = {
    model: "qwen7b",
    task: "pretrain",
    hardware: "cluster512",
    step: 48230,
    totalSteps: 120000,
    loss: 2.182,
    lossEMA: 2.182,
    val: 2.246,
    mfu: 0.512,
    gn: 0.84,
    seen: 3.3e10,
    spike: 0,
    riskHist: 0.08,
    phase: "embedding",
    manualPhaseUntil: 0,
    hist: { loss: [], val: [], mfu: [], gn: [] },
    devices: [],
  };

  const TP_VALUES = [1, 2, 4, 8];
  const PP_VALUES = [1, 2, 4, 8, 16];
  const MB_VALUES = [1, 2, 4, 8];
  const GA_VALUES = [1, 2, 4, 8, 16, 64];
  const baseline = { mfu: 0.512, tokps: 0, eta: 0 };

  function fmtBig(n) {
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return Math.round(n).toString();
  }

  function fmtTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const mins = Math.floor((safeSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function pathFor(data, width, height, pad = 5) {
    let min = Math.min(...data);
    let max = Math.max(...data);
    if (max - min < 1e-6) max = min + 1;
    return data.map((value, index) => {
      const x = pad + ((width - 2 * pad) * index) / (data.length - 1);
      const y = height - pad - ((height - 2 * pad) * (value - min)) / (max - min);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }

  function drawChart(svg, series) {
    const [, , width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
    const base = `<line class="twin-chart-baseline" x1="0" y1="${height - 5}" x2="${width}" y2="${height - 5}"></line>`;
    const body = series.map((item) => {
      const path = pathFor(item.data, width, height);
      const area = item.area ? `<path class="${item.area}" d="${path} L${width - 5} ${height - 5} L5 ${height - 5} Z"></path>` : "";
      return `${area}<path class="twin-chart-line ${item.className}" d="${path}"></path>`;
    }).join("");
    svg.innerHTML = `${base}${body}`;
  }

  function seedHistory() {
    state.hist = { loss: [], val: [], mfu: [], gn: [] };
    for (let index = 0; index < 96; index += 1) {
      const t = index / 96;
      const loss = 2.55 - 0.42 * t + (Math.random() - 0.5) * 0.04;
      state.hist.loss.push(loss);
      state.hist.val.push(loss + 0.06 + (Math.random() - 0.5) * 0.02);
      state.hist.mfu.push(51 + (Math.random() - 0.5) * 5);
      state.hist.gn.push(0.8 + (Math.random() - 0.5) * 0.25);
    }
    state.loss = state.hist.loss[state.hist.loss.length - 1];
    state.lossEMA = state.loss;
  }

  function resetDevices() {
    const profile = hardwareProfiles[state.hardware];
    state.devices = [];
    for (let index = 0; index < profile.devices; index += 1) {
      let util = rand(0.72, 0.94);
      if (Math.random() < 0.08) util = rand(0.48, 0.68);
      if (Math.random() < 0.12) util = rand(0.94, 0.99);
      state.devices.push({
        util,
        temp: rand(57, 68) + util * 8,
        mem: rand(0.68, 0.86),
        bad: false,
      });
    }
    if (state.devices[37]) {
      state.devices[37].temp = 83;
      state.devices[37].bad = "straggler";
      state.devices[37].util = 0.52;
    }
    if (state.devices[201]) state.devices[201].util = 0.58;
    if (state.devices[330]) state.devices[330].temp = 84;
    renderHeatShell();
  }

  function renderHeatShell() {
    const heat = $("heat");
    const profile = hardwareProfiles[state.hardware];
    heat.style.gridTemplateColumns = `repeat(${profile.cols}, minmax(0, 1fr))`;
    heat.innerHTML = "";
    state.devices.forEach((_, index) => {
      const cell = document.createElement("div");
      cell.className = "twin-heat-cell";
      cell.dataset.index = String(index);
      heat.appendChild(cell);
    });
  }

  function renderHeat() {
    const cells = $("heat").children;
    const profile = hardwareProfiles[state.hardware];
    let peak = 0;
    let thermalRisk = 0;
    let lowUtil = 0;
    let total = 0;
    let totalUtil = 0;
    state.devices.forEach((device, index) => {
      const targetTemp = 54 + device.util * 23 + (device.bad ? 8 : 0);
      device.temp = clamp(device.temp * 0.86 + (targetTemp + rand(-2.2, 2.2)) * 0.14, 50, 92);
      device.util = clamp(device.util + (Math.random() - 0.5) * 0.025, 0.45, 1);
      peak = Math.max(peak, device.temp);
      total += device.temp;
      totalUtil += device.util;
      if (device.temp > 82 || device.bad) thermalRisk += 1;
      if (device.util < 0.7) lowUtil += 1;
      const cell = cells[index];
      if (!cell) return;
      cell.className = "twin-heat-cell";
      if (device.util < 0.7) cell.classList.add("is-util-low");
      else if (device.util > 0.92) cell.classList.add("is-util-high");
      else cell.classList.add("is-util-mid");
      if (device.temp > 82 || device.bad) cell.classList.add("is-thermal-risk");
      if (device.bad) cell.classList.add("is-straggler");
      const tip = [
        `${profile.unit} ${index}`,
        `node-${Math.floor(index / 8)} / rank-${index}`,
        `算力占用率 ${(device.util * 100).toFixed(0)}%`,
        `温度 ${device.temp.toFixed(0)}°C`,
        `HBM ${(device.mem * 100).toFixed(0)}%`,
        profile.unitHint,
        device.bad ? `风险 ${device.bad}` : "",
      ].filter(Boolean).join("\n");
      cell.dataset.tip = tip;
    });
    const avgUtil = totalUtil / state.devices.length;
    $("heatStat").textContent = `util ${(avgUtil * 100).toFixed(0)}% · peak ${peak.toFixed(0)}°C · low ${lowUtil} · risk ${thermalRisk}`;
    $("hwUtil").textContent = `${(avgUtil * 100).toFixed(0)}%`;
    $("hwLow").textContent = `${lowUtil}`;
    $("hwThermal").textContent = `${thermalRisk}`;
    $("hwAction").textContent = lowUtil > state.devices.length * 0.05
      ? "查低利用 rank"
      : thermalRisk > 0
        ? "查降频/散热"
        : "继续观察";
  }

  function renderArchitecture() {
    const model = models[state.model];
    $("architectureTitle").textContent = model.title;
    $("architectureMeta").textContent = model.meta;
    $("runId").textContent = model.run;
    $("scriptChecks").innerHTML = model.checks.map(([stateValue, title, body]) => (
      `<div class="twin-check" data-state="${stateValue}"><div><strong>${title}</strong><small>${body}</small></div></div>`
    )).join("");
    const stage = $("modelGraphStage");
    if (!stage || !window.PtoModelTrainingGraphvizPattern) return;
    if (graphController && typeof graphController.destroy === "function") {
      graphController.destroy();
    }
    const phase = resolvePhaseInfo(currentPhase());
    graphController = window.PtoModelTrainingGraphvizPattern.render(stage, model.trainingGraph, {
      ariaLabel: `${model.name} training architecture graph`,
      activeNodeId: phase.nodeId,
      activeRelatedNodeIds: phase.relatedNodeIds,
      viewportPadding: 18,
    });
  }

  function applyTheme(theme, options = {}) {
    currentTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = currentTheme;
    document.body.dataset.theme = currentTheme;
    const themeToggle = $("themeToggle");
    const themeToggleLabel = $("themeToggleLabel");
    const nextMode = currentTheme === "light" ? "深色模式" : "浅色模式";
    if (themeToggle) {
      themeToggle.setAttribute("aria-pressed", String(currentTheme === "light"));
      themeToggle.setAttribute("title", `切换${nextMode}`);
    }
    if (themeToggleLabel) {
      themeToggleLabel.textContent = nextMode;
    }
    if (!options.skipRender) renderArchitecture();
  }

  function toggleTheme() {
    applyTheme(currentTheme === "light" ? "dark" : "light");
  }

  function currentPhase() {
    return phaseSteps.find((phase) => phase.id === state.phase) || phaseSteps[0];
  }

  function resolvePhaseInfo(phase) {
    const model = models[state.model];
    const mapped = model.phaseMap?.[phase.id] || {};
    return {
      ...phase,
      ...mapped,
      nodeId: mapped.nodeId || phase.nodeId,
      nodeLabel: mapped.nodeLabel || phase.nodeLabel,
      summary: mapped.summary || phase.summary,
      relatedNodeIds: mapped.relatedNodeIds || phase.relatedNodeIds || [],
    };
  }

  function focusGraphNode(nodeId, relatedNodeIds = []) {
    if (!graphController || !nodeId) return;
    graphController.setPhase({ nodeId, relatedNodeIds });
  }

  function renderPhaseRail() {
    const rail = $("phaseRail");
    rail.innerHTML = "";
    phaseSteps.forEach((phase, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "twin-phase-step";
      button.dataset.phase = phase.id;
      button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong>${phase.label}</strong>`;
      button.addEventListener("click", () => {
        state.manualPhaseUntil = Date.now() + 8000;
        applyPhase(phase.id, { force: true });
      });
      rail.appendChild(button);
    });
  }

  function applyPhase(phaseId, options = {}) {
    if (!options.force && state.phase === phaseId) return;
    state.phase = phaseId;
    const phase = currentPhase();
    const resolvedPhase = resolvePhaseInfo(phase);
    $("phaseSummary").textContent = resolvedPhase.summary;
    $("phaseNode").textContent = resolvedPhase.nodeLabel;
    document.querySelectorAll("[data-phase]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.phase === phase.id);
    });
    focusGraphNode(resolvedPhase.nodeId, resolvedPhase.relatedNodeIds);
  }

  function syncPhaseFromStep() {
    if (Date.now() < state.manualPhaseUntil) return;
    const phase = phaseSteps[Math.floor(state.step / 8) % phaseSteps.length];
    applyPhase(phase.id);
  }

  function currentTokps() {
    const model = models[state.model];
    const profile = hardwareProfiles[state.hardware];
    return Math.max(300, (state.mfu * profile.world * 312e12) / (6 * model.params));
  }

  function renderVitals() {
    const model = models[state.model];
    const tokps = currentTokps();
    const eta = (model.target - state.seen) / tokps;
    $("vStep").textContent = state.step.toLocaleString();
    $("vStepSub").textContent = `/ ${state.totalSteps.toLocaleString()} · ${(state.step / state.totalSteps * 100).toFixed(1)}%`;
    $("vLoss").textContent = state.loss.toFixed(3);
    $("vLossSub").textContent = `val ${state.val.toFixed(3)} · ema ${state.lossEMA.toFixed(3)}`;
    $("vMfu").textContent = `${(state.mfu * 100).toFixed(1)}%`;
    $("vEta").textContent = fmtTime(eta);
    $("lossNow").textContent = state.loss.toFixed(3);
    $("mfuNow").textContent = `${(state.mfu * 100).toFixed(1)}%`;
    $("gnNow").textContent = state.gn.toFixed(2);
    $("syncLag").textContent = `sync ${Math.floor(rand(8, 22))}ms`;
  }

  function renderCharts() {
    drawChart($("lossChart"), [
      { data: state.hist.val, className: "twin-chart-val" },
      { data: state.hist.loss, className: "twin-chart-loss", area: "twin-chart-area-loss" },
    ]);
    drawChart($("mfuChart"), [
      { data: state.hist.mfu, className: "twin-chart-mfu", area: "twin-chart-area-mfu" },
    ]);
    drawChart($("gnChart"), [
      { data: state.hist.gn, className: "twin-chart-grad" },
    ]);
  }

  function computeRisk() {
    let peak = 0;
    let bad = 0;
    let warm = 0;
    state.devices.forEach((device) => {
      peak = Math.max(peak, device.temp);
      if (device.bad) bad += 1;
      if (device.temp > 78) warm += 1;
    });
    const thermal = clamp((peak - 72) / 18, 0, 1);
    const straggler = clamp(bad * 0.35, 0, 1);
    const spike = clamp(state.spike, 0, 1);
    const hbm = clamp(warm / Math.max(8, state.devices.length * 0.03), 0, 1);
    const risk = clamp(0.05 + 0.42 * thermal + 0.28 * straggler + 0.26 * spike + 0.12 * hbm, 0.02, 0.95);
    state.riskHist = state.riskHist * 0.6 + risk * 0.4;
    return {
      risk: state.riskHist,
      factors: [
        ["热/降频", thermal],
        ["Straggler", straggler],
        ["Loss spike", spike],
        ["HBM 压力", hbm],
      ],
    };
  }

  function renderRisk() {
    const { risk, factors } = computeRisk();
    const pct = Math.round(risk * 100);
    const label = risk > 0.5 ? "高 · 建议 checkpoint" : risk > 0.22 ? "中 · 持续观察" : "低 · 稳定";
    $("riskNum").textContent = `${pct}%`;
    $("riskLabel").textContent = label;
    const factorsNode = $("factors");
    factorsNode.innerHTML = "";
    factors.forEach(([name, value]) => {
      const row = document.createElement("div");
      const nameNode = document.createElement("span");
      const track = document.createElement("div");
      const fill = document.createElement("div");
      const percent = document.createElement("strong");
      row.className = "twin-factor";
      nameNode.textContent = name;
      track.className = "twin-factor-track";
      fill.className = "twin-factor-fill";
      fill.style.width = `${Math.round(value * 100)}%`;
      percent.textContent = `${Math.round(value * 100)}%`;
      track.appendChild(fill);
      row.append(nameNode, track, percent);
      factorsNode.appendChild(row);
    });
  }

  const eventPool = [
    ["ok", "checkpoint 写入完成 · step {s} · 用时 41s"],
    ["ok", "loss EMA 持续下降 · 收敛正常"],
    ["info", "梯度同步耗时 11.2ms · overlap 92%"],
    ["warn", "node-{r} device{g} 结温 84°C · 触发降频预警"],
    ["warn", "straggler 检测 · node-37 落后 1.8x"],
    ["info", "数据分片 shard-{r} 预取完成"],
  ];

  function clock() {
    return new Date().toTimeString().slice(0, 8);
  }

  function pushEvent(sev, text) {
    const feed = $("feed");
    const el = document.createElement("div");
    el.className = "twin-event";
    el.dataset.sev = sev;
    el.innerHTML = `<time>${clock()}</time><i></i><span>${text}</span>`;
    feed.insertBefore(el, feed.firstChild);
    while (feed.children.length > 24) feed.removeChild(feed.lastChild);
  }

  function seedEvents() {
    $("feed").innerHTML = "";
    for (let index = 0; index < 5; index += 1) {
      const event = eventPool[Math.floor(rand(0, eventPool.length))];
      pushEvent(event[0], event[1].replace("{s}", state.step - index * 40).replace("{r}", Math.floor(rand(0, 64))).replace("{g}", Math.floor(rand(0, 8))));
    }
  }

  function modelMFU(config) {
    let mfu = 0.58;
    mfu -= (config.TP - 1) * 0.012;
    const bubble = (config.PP - 1) / (config.GA + config.PP - 1);
    mfu *= 1 - bubble * 0.6;
    if (config.MB < 2) mfu *= 0.9;
    return { mfu: clamp(mfu, 0.12, 0.62), bubble };
  }

  function renderWhatIf() {
    const config = {
      TP: TP_VALUES[Number($("rTP").value)],
      PP: PP_VALUES[Number($("rPP").value)],
      MB: MB_VALUES[Number($("rMB").value)],
      GA: GA_VALUES[Number($("rGA").value)],
    };
    $("lTP").textContent = config.TP;
    $("lPP").textContent = config.PP;
    $("lMB").textContent = config.MB;
    $("lGA").textContent = config.GA;
    const model = models[state.model];
    const profile = hardwareProfiles[state.hardware];
    const { mfu, bubble } = modelMFU(config);
    const tokps = Math.max(300, (profile.world * 312e12 * mfu) / (6 * model.params));
    const eta = (model.target - state.seen) / tokps;
    $("oMfu").textContent = `${(mfu * 100).toFixed(1)}%`;
    $("oTok").textContent = fmtBig(tokps);
    $("oEta").textContent = fmtTime(eta);
    $("oBub").textContent = `${(bubble * 100).toFixed(0)}%`;
    $("dMfu").textContent = `${((mfu - baseline.mfu) / baseline.mfu * 100).toFixed(0)}% vs 当前`;
    $("dTok").textContent = `${((tokps - baseline.tokps) / baseline.tokps * 100).toFixed(0)}% vs 当前`;
    $("dEta").textContent = `${((eta - baseline.eta) / baseline.eta * 100).toFixed(0)}% vs 当前`;
  }

  function tick() {
    state.step += 2;
    if (Math.random() < 0.025 && state.spike < 0.2) {
      state.spike = rand(0.45, 0.95);
      pushEvent("crit", `loss spike 检测 · ${(state.loss + rand(0.1, 0.28)).toFixed(3)} · 建议检查数据和梯度`);
    }
    const target = Math.max(1.55, state.lossEMA - 0.0008);
    state.loss = target + (Math.random() - 0.5) * 0.03 + state.spike * rand(0.05, 0.18);
    state.lossEMA = state.lossEMA * 0.98 + state.loss * 0.02;
    state.spike *= 0.78;
    state.val = state.lossEMA + 0.06 + (Math.random() - 0.5) * 0.015;
    state.mfu = clamp(0.512 + (Math.random() - 0.5) * 0.04 - state.spike * 0.05, 0.3, 0.62);
    state.gn = clamp(0.82 + (Math.random() - 0.5) * 0.3 + state.spike * 1.5, 0.2, 4);
    state.seen += currentTokps();
    state.hist.loss.push(state.loss);
    state.hist.val.push(state.val);
    state.hist.mfu.push(state.mfu * 100);
    state.hist.gn.push(state.gn);
    Object.values(state.hist).forEach((series) => {
      while (series.length > 96) series.shift();
    });
    if (Math.random() < 0.45) {
      const event = eventPool[Math.floor(rand(0, eventPool.length))];
      pushEvent(event[0], event[1].replace("{s}", state.step).replace("{r}", Math.floor(rand(0, 64))).replace("{g}", Math.floor(rand(0, 8))));
    }
    syncPhaseFromStep();
    renderAll();
  }

  function renderAll() {
    renderVitals();
    renderCharts();
    renderHeat();
    renderRisk();
    renderWhatIf();
  }

  function applyModel(modelKey) {
    state.model = modelKey;
    document.body.dataset.model = modelKey;
    document.querySelectorAll("[data-model-option]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.modelOption === modelKey);
    });
    state.seen = models[modelKey].target * 0.42;
    renderArchitecture();
    applyPhase(state.phase, { force: true });
    renderAll();
  }

  function applyTask(taskKey) {
    state.task = taskKey;
    document.body.dataset.task = taskKey;
    document.querySelectorAll("[data-task-option]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.taskOption === taskKey);
    });
  }

  function applyHardware(profileKey) {
    state.hardware = profileKey;
    document.body.dataset.hardware = profileKey;
    document.querySelectorAll("[data-hardware-option]").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.hardwareOption === profileKey);
    });
    $("hardwareSummary").textContent = `${hardwareProfiles[profileKey].label}，每格为${hardwareProfiles[profileKey].unit}，底色表示算力占用率，角标表示温度/异常风险。`;
    resetDevices();
    baseline.tokps = currentTokps();
    baseline.eta = (models[state.model].target - state.seen) / baseline.tokps;
    renderAll();
  }

  function bindControls() {
    document.querySelectorAll("[data-model-option]").forEach((button) => {
      button.addEventListener("click", () => applyModel(button.dataset.modelOption));
    });
    document.querySelectorAll("[data-task-option]").forEach((button) => {
      button.addEventListener("click", () => applyTask(button.dataset.taskOption));
    });
    document.querySelectorAll("[data-hardware-option]").forEach((button) => {
      button.addEventListener("click", () => applyHardware(button.dataset.hardwareOption));
    });
    $("themeToggle")?.addEventListener("click", toggleTheme);
    ["rTP", "rPP", "rMB", "rGA"].forEach((id) => {
      $(id).addEventListener("input", renderWhatIf);
    });
  }

  function boot() {
    bindControls();
    applyTheme(currentTheme, { skipRender: true });
    renderPhaseRail();
    seedHistory();
    state.seen = models[state.model].target * 0.42;
    renderArchitecture();
    $("hardwareSummary").textContent = `${hardwareProfiles[state.hardware].label}，每格为${hardwareProfiles[state.hardware].unit}，底色表示算力占用率，角标表示温度/异常风险。`;
    resetDevices();
    seedEvents();
    baseline.tokps = currentTokps();
    baseline.eta = (models[state.model].target - state.seen) / baseline.tokps;
    applyPhase(state.phase, { force: true });
    renderAll();
    setInterval(tick, 1200);
  }

  boot();
})();
