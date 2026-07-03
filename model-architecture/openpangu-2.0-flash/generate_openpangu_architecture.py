#!/usr/bin/env python3
"""Generate OpenPangu 2.0 Flash architecture artifacts."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUTS = ROOT / "outputs"
SOURCES = Path("/Users/yin/pto/model-architecture/sources")
FLASH = SOURCES / "openPangu-2.0-Flash"
INFER = SOURCES / "openPangu-2.0-Infer"
MODEL_IMPL = INFER / "components/omni-npu/src/omni_npu/v1/models/pangu/pangu_v2_moe.py"
MTP_IMPL = INFER / "components/omni-npu/src/omni_npu/v1/models/pangu/pangu_v2_moe_mtp.py"
ATTN_IMPL = INFER / "components/omni-npu/src/omni_npu/v1/layers/attention/npu_pangu.py"
MOE_IMPL = INFER / "components/omni-npu/src/omni_npu/layers/fused_moe/layer.py"


def prov(source: str, line: int | None, fact: str, confidence: str = "confirmed") -> list[dict]:
    item = {"source": source, "fact": fact, "confidence": confidence}
    if line is not None:
        item["line"] = line
    return [item]


def edge(edge_id: str, source: str, target: str, name: str, shape: str, dtype: str, constraints=None, source_id="model_impl", line=None):
    tensor = {"name": name, "shape": shape, "dtype": dtype}
    if constraints:
        tensor["constraints"] = constraints
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "tensor": tensor,
        "provenance": prov(source_id, line, f"{source} feeds {target} with {name}"),
    }


def build_schema() -> dict:
    config = json.loads((FLASH / "config.json").read_text(encoding="utf-8"))
    main_layers = config["num_hidden_layers"]
    mtp_layers = config["num_nextn_predict_layers"]
    dsa_layers = [i for i in config["dsa_layers"] if 0 <= i < main_layers]
    swa_layers = [i for i in config["swa_layers"] if 0 <= i < main_layers]
    mtp_layer_ids = [i for i in config["swa_layers"] if main_layers <= i < main_layers + mtp_layers]

    nodes = [
        {
            "id": "input_tokens",
            "kind": "input",
            "label": "Token IDs",
            "role": "external token ids",
            "provenance": prov("model_impl", 2243, "OpenPanguV2ForCausalLM.forward accepts input_ids"),
        },
        {
            "id": "positions",
            "kind": "input",
            "label": "Position IDs",
            "role": "token positions for RoPE lookup",
            "provenance": prov("model_impl", 2243, "OpenPanguV2ForCausalLM.forward accepts positions"),
        },
        {
            "id": "causal_lm",
            "kind": "module",
            "label": "OpenPangu V2 For Causal LM",
            "module_type": "causal_lm",
            "attrs": {"architecture": config["architectures"][0]},
            "provenance": prov("runtime_config", 2, "architectures contains OpenPanguV2ForCausalLM"),
        },
        {
            "id": "decoder_model",
            "kind": "module",
            "label": "OpenPangu V2 Model",
            "module_type": "decoder_only_transformer",
            "attrs": {"use_mhc": True, "mhc_num_stream": config["mhc_num_stream"]},
            "provenance": prov("model_impl", 1970, "class OpenPanguV2Model"),
        },
        {
            "id": "token_embedding",
            "kind": "op",
            "label": "Vocab Parallel Embedding",
            "op_type": "Embedding",
            "attrs": {"vocab_size_symbol": "V", "hidden_size_symbol": "H"},
            "provenance": prov("model_impl", 1990, "OpenPanguV2Model creates NPUVocabParallelEmbedding on first PP rank"),
        },
        {
            "id": "decoder_layer",
            "kind": "module",
            "label": "Decoder Layer Template",
            "module_type": "decoder_layer_template",
            "attrs": {"layer_count_symbol": "L"},
            "provenance": prov("model_impl", 1263, "class OpenPanguV2DecoderLayer"),
        },
        {
            "id": "mhc_attention",
            "kind": "module",
            "label": "mHC Attention Branch",
            "module_type": "mhc_branch",
            "attrs": {"streams_symbol": "S_mhc", "recurrent_norm": config["mhc_recur_norm"]},
            "provenance": prov("model_impl", 1310, "Decoder layer creates attention-side NPUmHC when use_mhc is enabled"),
        },
        {
            "id": "input_layernorm",
            "kind": "op",
            "label": "Input RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("model_impl", 1372, "Decoder layer creates input_layernorm"),
        },
        {
            "id": "sparse_mla_attention",
            "kind": "module",
            "label": "Sparse MLA Attention",
            "module_type": "mla_sparse_attention",
            "attrs": {
                "attention_heads_symbol": "N_h",
                "q_lora_rank_symbol": "R_q",
                "kv_lora_rank_symbol": "R_kv",
                "dsa_layer_count": len(dsa_layers),
                "swa_main_layer_count": len(swa_layers),
            },
            "provenance": prov("model_impl", 1326, "Decoder layer creates NPUPanguSparseAttention"),
        },
        {
            "id": "q_a_proj",
            "kind": "op",
            "label": "Q Latent Linear",
            "op_type": "Linear",
            "attrs": {"output_rank_symbol": "R_q"},
            "provenance": prov("attention_impl", 781, "NPUPanguSparseAttention creates q_a_proj"),
        },
        {
            "id": "q_causal_conv",
            "kind": "op",
            "label": "Q Causal Conv1D",
            "op_type": "CausalConv1D",
            "attrs": {"kernel_width_symbol": "W_router", "path": "MoME Q stream"},
            "provenance": prov("attention_impl", 1011, "NPUPanguSparseAttention creates qa_conv for MoME"),
        },
        {
            "id": "q_residual_add",
            "kind": "op",
            "label": "Q Add",
            "op_type": "Add",
            "attrs": {"residual_connection": True},
            "provenance": prov("attention_impl", 1715, "MoME causal conv custom op supports residual_connection"),
        },
        {
            "id": "q_a_norm",
            "kind": "op",
            "label": "Q LayerNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("attention_impl", 797, "NPUPanguSparseAttention creates q_a_layernorm"),
        },
        {
            "id": "q_b_proj",
            "kind": "op",
            "label": "Q Up Linear",
            "op_type": "Linear",
            "attrs": {"qk_head_dim_symbol": "D_qk"},
            "provenance": prov("attention_impl", 801, "NPUPanguSparseAttention creates q_b_proj"),
        },
        {
            "id": "kv_a_proj",
            "kind": "op",
            "label": "KV Latent Linear",
            "op_type": "Linear",
            "attrs": {"output_rank_symbol": "R_kv_plus_rope"},
            "provenance": prov("attention_impl", 789, "NPUPanguSparseAttention creates kv_a_proj_with_mqa"),
        },
        {
            "id": "kv_causal_conv",
            "kind": "op",
            "label": "KV Causal Conv1D",
            "op_type": "CausalConv1D",
            "attrs": {"kernel_width_symbol": "W_router", "path": "MoME KV stream"},
            "provenance": prov("attention_impl", 1017, "NPUPanguSparseAttention creates compresskv_conv for MoME"),
        },
        {
            "id": "kv_residual_add",
            "kind": "op",
            "label": "KV Add",
            "op_type": "Add",
            "attrs": {"residual_connection": True},
            "provenance": prov("attention_impl", 1715, "MoME causal conv custom op supports residual_connection"),
        },
        {
            "id": "kv_a_norm",
            "kind": "op",
            "label": "KV LayerNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("attention_impl", 836, "NPUPanguSparseAttention creates kv_a_layernorm"),
        },
        {
            "id": "kv_b_proj",
            "kind": "op",
            "label": "KV Up Linear",
            "op_type": "Linear",
            "attrs": {"v_head_dim_symbol": "D_v"},
            "provenance": prov("attention_impl", 840, "NPUPanguSparseAttention creates kv_b_proj"),
        },
        {
            "id": "rope_apply",
            "kind": "op",
            "label": "Apply RoPE",
            "op_type": "RotaryEmbedding",
            "attrs": {"rope_theta": config["rope_theta"], "rope_interleave": config["rope_interleave"]},
            "provenance": prov("attention_impl", 859, "NPUPanguSparseAttention initializes rotary embedding"),
        },
        {
            "id": "dsa_indexer",
            "kind": "op",
            "label": "DSA Indexer",
            "op_type": "SparseIndexer",
            "attrs": {"index_topk_symbol": "K_index", "index_heads_symbol": "N_index"},
            "provenance": prov("attention_impl", 127, "class NPUPanguIndexer"),
        },
        {
            "id": "attention_core",
            "kind": "op",
            "label": "Sparse FlashAttention",
            "op_type": "Attention",
            "attrs": {"branches": ["DSA", "SWA"], "use_mome": config["use_mome"]},
            "provenance": prov("attention_impl", 942, "NPUPanguSparseAttention chooses DSAAttention or MLASWAAttention"),
        },
        {
            "id": "o_causal_conv",
            "kind": "op",
            "label": "Output Causal Conv1D",
            "op_type": "CausalConv1D",
            "attrs": {"kernel_width_symbol": "W_router", "path": "MoME output stream"},
            "provenance": prov("attention_impl", 1023, "NPUPanguSparseAttention creates o_conv for MoME"),
        },
        {
            "id": "o_residual_add",
            "kind": "op",
            "label": "Output Add",
            "op_type": "Add",
            "attrs": {"residual_connection": True},
            "provenance": prov("attention_impl", 2144, "Attention output can pass through output-side MoME before projection"),
        },
        {
            "id": "o_proj",
            "kind": "op",
            "label": "Output Projection",
            "op_type": "Linear",
            "attrs": {"hidden_size_symbol": "H"},
            "provenance": prov("attention_impl", 849, "NPUPanguSparseAttention creates o_proj"),
        },
        {
            "id": "post_attention_norm",
            "kind": "op",
            "label": "Post Attention RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("model_impl", 1376, "Decoder layer creates post_attention_layernorm"),
        },
        {
            "id": "mhc_attention_post",
            "kind": "module",
            "label": "mHC Attention Merge",
            "module_type": "mhc_merge",
            "attrs": {"use_gamma": config["mhc_use_gamma"]},
            "provenance": prov("model_impl", 1758, "Decoder forward applies mHC sandwich norm after attention"),
        },
        {
            "id": "pre_mlp_norm",
            "kind": "op",
            "label": "Pre MLP RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("model_impl", 1381, "Decoder layer creates pre_mlp_layernorm"),
        },
        {
            "id": "ffn_choice",
            "kind": "module",
            "label": "Feed Forward Choice",
            "module_type": "conditional_ffn",
            "attrs": {"dense_layers": "0-1", "moe_layers": "2-45"},
            "provenance": prov("model_impl", 1346, "Decoder layer chooses OpenPanguV2MOE after first_k_dense_replace"),
        },
        {
            "id": "dense_mlp",
            "kind": "module",
            "label": "Dense MLP",
            "module_type": "dense_ffn",
            "attrs": {"intermediate_size_symbol": "I_dense"},
            "provenance": prov("model_impl", 132, "class OpenPanguV2MLP"),
        },
        {
            "id": "dense_gate_up",
            "kind": "op",
            "label": "Gate Up Projection",
            "op_type": "MergedLinear",
            "attrs": {"output_multiplier": 2},
            "provenance": prov("model_impl", 151, "OpenPanguV2MLP creates gate_up_proj"),
        },
        {
            "id": "dense_silu",
            "kind": "op",
            "label": "SiLU Multiply",
            "op_type": "ActivationMultiply",
            "attrs": {"activation": config["hidden_act"]},
            "provenance": prov("model_impl", 171, "OpenPanguV2MLP validates SiLU and creates SiluAndMul"),
        },
        {
            "id": "dense_down",
            "kind": "op",
            "label": "Dense Down Projection",
            "op_type": "Linear",
            "attrs": {"output_size_symbol": "H"},
            "provenance": prov("model_impl", 160, "OpenPanguV2MLP creates down_proj"),
        },
        {
            "id": "moe_ffn",
            "kind": "module",
            "label": "MoE FFN",
            "module_type": "mixture_of_experts",
            "attrs": {"routed_experts_symbol": "E", "top_k_symbol": "top_k", "shared_experts_symbol": "E_shared"},
            "provenance": prov("model_impl", 199, "class OpenPanguV2MOE"),
        },
        {
            "id": "router_gate",
            "kind": "op",
            "label": "Router Gate",
            "op_type": "Linear",
            "attrs": {"output_size_symbol": "E"},
            "provenance": prov("model_impl", 234, "OpenPanguV2MOE creates replicated router gate"),
        },
        {
            "id": "route_topk",
            "kind": "op",
            "label": "TopK Router",
            "op_type": "TopK",
            "attrs": {"top_k_symbol": "top_k", "scoring_func": "sigmoid"},
            "provenance": prov("moe_impl", 130, "NPUFusedMoE.select_experts chooses routed tokens"),
        },
        {
            "id": "routed_expert_bank",
            "kind": "op",
            "label": "Routed Expert Bank",
            "op_type": "FusedMoE",
            "attrs": {"expert_intermediate_symbol": "I_moe"},
            "provenance": prov("model_impl", 275, "OpenPanguV2MOE creates NPUSharedFusedMoE"),
        },
        {
            "id": "shared_expert_mlp",
            "kind": "module",
            "label": "Shared Expert MLP",
            "module_type": "shared_expert",
            "attrs": {"shared_experts_symbol": "E_shared"},
            "provenance": prov("model_impl", 250, "OpenPanguV2MOE creates shared_experts with OpenPanguV2MLP"),
        },
        {
            "id": "moe_combine",
            "kind": "op",
            "label": "MoE Combine",
            "op_type": "Combine",
            "attrs": {"routed_scaling_factor": config["routed_scaling_factor"], "renormalize": config["norm_topk_prob"]},
            "provenance": prov("moe_impl", 148, "Fused MoE applies routed and shared expert outputs"),
        },
        {
            "id": "post_mlp_norm",
            "kind": "op",
            "label": "Post MLP RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("model_impl", 1385, "Decoder layer creates post_mlp_layernorm"),
        },
        {
            "id": "block_post_norm",
            "kind": "op",
            "label": "Block Post RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"enabled_layers": config["block_post_layernorm_idx"]},
            "provenance": prov("model_impl", 1390, "Decoder layer optionally creates block_post_layernorm"),
        },
        {
            "id": "final_norm",
            "kind": "op",
            "label": "Final RMSNorm",
            "op_type": "RMSNorm",
            "attrs": {"eps": config["rms_norm_eps"]},
            "provenance": prov("model_impl", 2018, "OpenPanguV2Model creates final norm on last PP rank"),
        },
        {
            "id": "lm_head",
            "kind": "op",
            "label": "LM Head",
            "op_type": "Linear",
            "attrs": {"tie_word_embeddings": config["tie_word_embeddings"], "vocab_size_symbol": "V"},
            "provenance": prov("model_impl", 2195, "OpenPanguV2ForCausalLM creates NPUParallelLMHead"),
        },
        {
            "id": "logits",
            "kind": "output",
            "label": "Logits",
            "role": "language model logits",
            "provenance": prov("model_impl", 2255, "OpenPanguV2ForCausalLM.compute_logits produces logits"),
        },
        {
            "id": "mtp_module",
            "kind": "module",
            "label": "Multi Token Predictor",
            "module_type": "speculative_decoder",
            "attrs": {"next_predict_layers_symbol": "N_mtp"},
            "provenance": prov("mtp_impl", 210, "class OpenPanguV2MTP"),
        },
        {
            "id": "mtp_input_norms",
            "kind": "op",
            "label": "MTP Input Norms",
            "op_type": "RMSNorm",
            "attrs": {"norms": ["enorm", "hnorm"]},
            "provenance": prov("mtp_impl", 77, "MTP layer creates enorm and hnorm"),
        },
        {
            "id": "mtp_eh_proj",
            "kind": "op",
            "label": "MTP EH Projection",
            "op_type": "Linear",
            "attrs": {"input_multiplier": 2, "output_size_symbol": "H"},
            "provenance": prov("mtp_impl", 79, "MTP layer projects concatenated embedding and hidden state"),
        },
        {
            "id": "mtp_decoder_layer",
            "kind": "module",
            "label": "MTP Decoder Layer",
            "module_type": "decoder_layer_template",
            "attrs": {"reuses": "OpenPanguV2DecoderLayer"},
            "provenance": prov("mtp_impl", 91, "MTP layer embeds an OpenPanguV2DecoderLayer"),
        },
        {
            "id": "mtp_shared_head",
            "kind": "module",
            "label": "MTP Shared Head",
            "module_type": "lm_head",
            "attrs": {"vocab_size_symbol": "V"},
            "provenance": prov("mtp_impl", 36, "class SharedHead contains norm and NPUParallelLMHead"),
        },
        {
            "id": "mtp_logits",
            "kind": "output",
            "label": "MTP Logits",
            "role": "speculative output logits",
            "provenance": prov("mtp_impl", 196, "OpenPanguV2MultiTokenPredictor.compute_logits returns logits"),
        },
        {
            "id": "rope_cache",
            "kind": "state",
            "label": "RoPE Cache",
            "state_type": "rotary_embedding_cache",
            "attrs": {"max_position_embeddings_symbol": "S_max"},
            "provenance": prov("model_impl", 2035, "OpenPanguV2Model reads cos_cached and sin_cached from attention rotary_emb"),
        },
        {
            "id": "kv_cache",
            "kind": "state",
            "label": "KV Cache",
            "state_type": "attention_cache",
            "attrs": {"use_cache": config["use_cache"]},
            "provenance": prov("runtime_config", 51, "use_cache=true"),
        },
        {
            "id": "param_sink_state",
            "kind": "state",
            "label": "Parameter Sink",
            "state_type": "attention_sink_state",
            "attrs": {"param_sink_number_symbol": "N_sink"},
            "provenance": prov("attention_impl", 886, "NPUPanguSparseAttention initializes param sink tensors"),
        },
        {
            "id": "mome_state",
            "kind": "state",
            "label": "MoME State",
            "state_type": "router_sliding_state",
            "attrs": {"kernel_width_symbol": "W_router"},
            "provenance": prov("attention_impl", 991, "NPUPanguSparseAttention initializes MomeAttention when use_mome is enabled"),
        },
        {
            "id": "expert_parallel_state",
            "kind": "state",
            "label": "Expert Parallel State",
            "state_type": "parallel_runtime_state",
            "attrs": {"logical_experts_symbol": "E", "local_physical_experts": "runtime_dependent"},
            "provenance": prov("model_impl", 297, "OpenPanguV2MOE derives physical and local expert counts"),
        },
    ]

    edges = [
        edge("e_input_to_embedding", "input_tokens", "token_embedding", "input_ids", "[B,T]", "int64", ["T<=S_max"], "model_impl", 2076),
        edge("e_positions_to_rope_cache", "positions", "rope_cache", "positions", "[B,T]", "int64", ["T<=S_max"], "model_impl", 2096),
        edge("e_embedding_to_decoder", "token_embedding", "decoder_layer", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 2080),
        edge("e_decoder_to_mhc", "decoder_layer", "mhc_attention", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 2099),
        edge("e_mhc_to_norm", "mhc_attention", "input_layernorm", "hidden_states", "[B,T,S_mhc,H]", "bf16", ["S_mhc=4"], "model_impl", 1453),
        edge("e_norm_to_attention", "input_layernorm", "sparse_mla_attention", "normalized_hidden", "[B,T,S_mhc,H]", "bf16", None, "model_impl", 1732),
        edge("e_attention_to_qa", "sparse_mla_attention", "q_a_proj", "hidden_states", "[B,T,H]", "bf16", None, "attention_impl", 781),
        edge("e_qa_to_qconv", "q_a_proj", "q_causal_conv", "q_lora", "[B,T,R_q]", "bf16", None, "attention_impl", 2015),
        edge("e_qa_skip_to_qadd", "q_a_proj", "q_residual_add", "q_lora_residual", "[B,T,R_q]", "bf16", None, "attention_impl", 1715),
        edge("e_qconv_to_qadd", "q_causal_conv", "q_residual_add", "q_local_context", "[B,T,R_q]", "bf16", ["W_router=3"], "attention_impl", 1715),
        edge("e_qadd_to_qnorm", "q_residual_add", "q_a_norm", "q_lora", "[B,T,R_q]", "bf16", None, "attention_impl", 2024),
        edge("e_qnorm_to_qb", "q_a_norm", "q_b_proj", "q_lora_normed", "[B,T,R_q]", "bf16", None, "attention_impl", 2034),
        edge("e_attention_to_kva", "sparse_mla_attention", "kv_a_proj", "hidden_states", "[B,T,H]", "bf16", None, "attention_impl", 789),
        edge("e_kva_to_kvconv", "kv_a_proj", "kv_causal_conv", "kv_lora", "[B,T,R_kv]", "bf16", None, "attention_impl", 2068),
        edge("e_kva_skip_to_kvadd", "kv_a_proj", "kv_residual_add", "kv_lora_residual", "[B,T,R_kv+D_rope]", "bf16", None, "attention_impl", 2082),
        edge("e_kvconv_to_kvadd", "kv_causal_conv", "kv_residual_add", "kv_local_context", "[B,T,R_kv]", "bf16", ["W_router=3"], "attention_impl", 2082),
        edge("e_kvadd_to_kvnorm", "kv_residual_add", "kv_a_norm", "kv_lora_plus_rope", "[B,T,R_kv+D_rope]", "bf16", None, "attention_impl", 2092),
        edge("e_kvnorm_to_kvb", "kv_a_norm", "kv_b_proj", "kv_lora_normed", "[B,T,R_kv]", "bf16", None, "attention_impl", 840),
        edge("e_qb_to_rope", "q_b_proj", "rope_apply", "q_nope_q_rope", "[B,T,N_h,D_qk]", "bf16", None, "attention_impl", 871),
        edge("e_rope_cache_to_rope", "rope_cache", "rope_apply", "cos_sin", "[T,D_rope]", "bf16", ["T<=S_max"], "model_impl", 2096),
        edge("e_rope_to_dsa", "rope_apply", "dsa_indexer", "query_key_rotary", "[B,T,N_h,D_qk]", "bf16", ["K_index<=2048"], "attention_impl", 127),
        edge("e_rope_to_core", "rope_apply", "attention_core", "query", "[B,T,N_h,D_qk]", "bf16", None, "attention_impl", 2034),
        edge("e_kvb_to_core", "kv_b_proj", "attention_core", "compressed_kv", "[B,T,R_kv+D_v]", "bf16", None, "attention_impl", 954),
        edge("e_dsa_to_core", "dsa_indexer", "attention_core", "sparse_indices", "[B,T,K_index]", "int32", ["K_index<=2048"], "attention_impl", 221),
        edge("e_kv_cache_to_core", "kv_cache", "attention_core", "kv_cache", "[B,S_cache,R_kv+D_v]", "bf16/fp8", None, "attention_impl", 214),
        edge("e_param_sink_to_core", "param_sink_state", "attention_core", "sink_kv", "[N_sink,R_kv+D_rope]", "bf16", ["N_sink=128"], "attention_impl", 886),
        edge("e_mome_to_core", "mome_state", "attention_core", "mome_state", "[B,W_router,R_q/R_kv/D_v]", "bf16", ["W_router=3"], "attention_impl", 991),
        edge("e_core_to_oconv", "attention_core", "o_causal_conv", "attn_output", "[B,T,N_h,D_v]", "bf16", None, "attention_impl", 2137),
        edge("e_core_skip_to_oadd", "attention_core", "o_residual_add", "attn_output_residual", "[B,T,N_h,D_v]", "bf16", None, "attention_impl", 2144),
        edge("e_oconv_to_oadd", "o_causal_conv", "o_residual_add", "attn_local_context", "[B,T,N_h,D_v]", "bf16", ["W_router=3"], "attention_impl", 2144),
        edge("e_oadd_to_o", "o_residual_add", "o_proj", "attn_output", "[B,T,N_h,D_v]", "bf16", None, "attention_impl", 849),
        edge("e_o_to_post_attn", "o_proj", "post_attention_norm", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 1758),
        edge("e_post_attn_to_mhc_post", "post_attention_norm", "mhc_attention_post", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 1758),
        edge("e_mhc_post_to_pre_mlp", "mhc_attention_post", "pre_mlp_norm", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 1758),
        edge("e_pre_mlp_to_ffn", "pre_mlp_norm", "ffn_choice", "hidden_states", "[B,T,H]", "bf16/fp32", ["layer_id<2 uses dense", "layer_id>=2 uses moe"], "model_impl", 1346),
        edge("e_ffn_to_dense", "ffn_choice", "dense_mlp", "hidden_states", "[B,T,H]", "bf16", ["layer_id<2"], "model_impl", 1357),
        edge("e_dense_to_gateup", "dense_mlp", "dense_gate_up", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 151),
        edge("e_gateup_to_silu", "dense_gate_up", "dense_silu", "gate_up", "[B,T,2*I_dense]", "bf16", None, "model_impl", 183),
        edge("e_silu_to_dense_down", "dense_silu", "dense_down", "activated", "[B,T,I_dense]", "bf16", None, "model_impl", 184),
        edge("e_dense_down_to_post_mlp", "dense_down", "post_mlp_norm", "dense_output", "[B,T,H]", "bf16", None, "model_impl", 185),
        edge("e_ffn_to_moe", "ffn_choice", "moe_ffn", "hidden_states", "[B,T,H]", "bf16/fp32", ["layer_id>=2"], "model_impl", 1350),
        edge("e_moe_to_router", "moe_ffn", "router_gate", "hidden_states", "[B,T,H]", "bf16/fp32", None, "model_impl", 234),
        edge("e_router_to_topk", "router_gate", "route_topk", "router_logits", "[B,T,E]", "fp32", ["top_k=8"], "moe_impl", 130),
        edge("e_topk_to_expert", "route_topk", "routed_expert_bank", "topk_ids_weights", "[B,T,top_k]", "int32/fp32", ["top_k=8", "expert_id<E"], "moe_impl", 130),
        edge("e_ep_to_expert", "expert_parallel_state", "routed_expert_bank", "expert_map", "[E]", "int32", ["E=256"], "model_impl", 297),
        edge("e_moe_to_shared", "moe_ffn", "shared_expert_mlp", "hidden_states", "[B,T,H]", "bf16", ["E_shared=1"], "model_impl", 252),
        edge("e_expert_to_combine", "routed_expert_bank", "moe_combine", "routed_output", "[B,T,H]", "bf16", None, "moe_impl", 148),
        edge("e_shared_to_combine", "shared_expert_mlp", "moe_combine", "shared_output", "[B,T,H]", "bf16", None, "moe_impl", 154),
        edge("e_moe_combine_to_post_mlp", "moe_combine", "post_mlp_norm", "moe_output", "[B,T,H]", "bf16", None, "model_impl", 1773),
        edge("e_post_mlp_to_block_norm", "post_mlp_norm", "block_post_norm", "hidden_states", "[B,T,H]", "bf16", ["only selected layer ids"], "model_impl", 1390),
        edge("e_block_norm_to_final", "block_post_norm", "final_norm", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 2018),
        edge("e_final_to_head", "final_norm", "lm_head", "hidden_states", "[B,T,H]", "bf16", None, "model_impl", 2255),
        edge("e_head_to_logits", "lm_head", "logits", "logits", "[B,T,V]", "fp32", None, "model_impl", 2255),
        edge("e_final_to_mtp", "final_norm", "mtp_module", "previous_hidden_states", "[B,T,H]", "bf16", ["N_mtp=3"], "mtp_impl", 171),
        edge("e_embedding_to_mtp_norms", "token_embedding", "mtp_input_norms", "inputs_embeds", "[B,T,H]", "bf16", None, "mtp_impl", 112),
        edge("e_mtp_to_norms", "mtp_module", "mtp_input_norms", "input_pair", "[B,T,H]", "bf16", None, "mtp_impl", 77),
        edge("e_norms_to_eh", "mtp_input_norms", "mtp_eh_proj", "concat_embedding_hidden", "[B,T,2*H]", "bf16", None, "mtp_impl", 116),
        edge("e_eh_to_mtp_decoder", "mtp_eh_proj", "mtp_decoder_layer", "hidden_states", "[B,T,H]", "bf16", None, "mtp_impl", 124),
        edge("e_mtp_decoder_to_head", "mtp_decoder_layer", "mtp_shared_head", "hidden_states", "[B,T,H]", "bf16", None, "mtp_impl", 196),
        edge("e_mtp_head_to_logits", "mtp_shared_head", "mtp_logits", "mtp_logits", "[B,T,V]", "fp32", None, "mtp_impl", 203),
    ]

    return {
        "schema_version": "model_architecture.v1",
        "model": {
            "name": "openPangu-2.0-Flash",
            "framework": "pytorch/vllm/ascend-npu",
            "source_root": str(SOURCES),
        },
        "extraction_scope": {
            "kind": "full_source",
            "full_main_layers": main_layers,
            "trace_main_layers": None,
            "notes": [
                "Canonical graph is extracted from config.json plus openPangu-2.0-Infer source.",
                "Weights were not downloaded; local safetensors files are Git LFS pointer files.",
                "swa_layers includes MTP indices; visual branches separate main decoder layers from MTP layers.",
            ],
        },
        "sources": [
            {"id": "runtime_config", "kind": "config", "path": str(FLASH / "config.json"), "role": "source_of_truth"},
            {"id": "hf_config_class", "kind": "source", "path": str(FLASH / "configuration_openpangu_v2.py"), "role": "source_of_truth"},
            {"id": "model_impl", "kind": "source", "path": str(MODEL_IMPL), "role": "source_of_truth"},
            {"id": "attention_impl", "kind": "source", "path": str(ATTN_IMPL), "role": "source_of_truth"},
            {"id": "mtp_impl", "kind": "source", "path": str(MTP_IMPL), "role": "source_of_truth"},
            {"id": "moe_impl", "kind": "source", "path": str(MOE_IMPL), "role": "supporting_evidence"},
            {"id": "model_card", "kind": "model_card", "path": str(FLASH / "README.md"), "role": "supporting_evidence"},
        ],
        "symbol_table": {
            "B": "batch",
            "T": "sequence",
            "H": config["hidden_size"],
            "V": config["vocab_size"],
            "L": main_layers,
            "N_h": config["num_attention_heads"],
            "D_nope": config["qk_nope_head_dim"],
            "D_rope": config["qk_rope_head_dim"],
            "D_qk": config["qk_nope_head_dim"] + config["qk_rope_head_dim"],
            "D_v": config["v_head_dim"],
            "R_q": config["q_lora_rank"],
            "R_kv": config["kv_lora_rank"],
            "R_kv_plus_rope": config["kv_lora_rank"] + config["qk_rope_head_dim"],
            "I_dense": config["intermediate_size"],
            "I_moe": config["moe_intermediate_size"],
            "E": config["n_routed_experts"],
            "E_shared": config["n_shared_experts"],
            "top_k": config["num_experts_per_tok"],
            "K_index": config["index_topk"],
            "N_index": config["index_n_heads"],
            "S_max": config["max_position_embeddings"],
            "S_mhc": config["mhc_num_stream"],
            "N_sink": config["param_sink_number"],
            "W_router": config["router_sliding_window"],
            "N_mtp": mtp_layers,
        },
        "nodes": nodes,
        "edges": edges,
        "repeats": [
            {
                "id": "repeat_main_decoder_layers",
                "template_node": "decoder_layer",
                "range": "0-45",
                "count": main_layers,
                "provenance": prov("runtime_config", 32, "num_hidden_layers=46"),
            },
            {
                "id": "repeat_dense_ffn_layers",
                "template_node": "dense_mlp",
                "range": "0-1",
                "count": config["first_k_dense_replace"],
                "provenance": prov("runtime_config", 13, "first_k_dense_replace=2"),
            },
            {
                "id": "repeat_moe_ffn_layers",
                "template_node": "moe_ffn",
                "range": "2-45",
                "count": main_layers - config["first_k_dense_replace"],
                "provenance": prov("model_impl", 1346, "layers at and after first_k_dense_replace use OpenPanguV2MOE"),
            },
            {
                "id": "repeat_dsa_attention_layers",
                "template_node": "dsa_indexer",
                "range": ",".join(str(i) for i in dsa_layers),
                "count": len(dsa_layers),
                "provenance": prov("runtime_config", 10, "dsa_layers lists sparse global aggregation layers"),
            },
            {
                "id": "repeat_swa_attention_layers",
                "template_node": "attention_core",
                "range": ",".join(str(i) for i in swa_layers),
                "count": len(swa_layers),
                "provenance": prov("runtime_config", 48, "swa_layers lists local window attention layers"),
            },
            {
                "id": "repeat_mtp_layers",
                "template_node": "mtp_decoder_layer",
                "range": ",".join(str(i) for i in mtp_layer_ids) or "46-48",
                "count": mtp_layers,
                "provenance": prov("runtime_config", 33, "num_nextn_predict_layers=3"),
            },
        ],
        "branches": [
            {
                "id": "attention_branch",
                "condition": "layer_id in dsa_layers",
                "true_target": "dsa_indexer",
                "false_target": "attention_core",
                "resolved_ranges": [
                    {"target": "dsa_indexer", "range": ",".join(str(i) for i in dsa_layers)},
                    {"target": "attention_core", "range": ",".join(str(i) for i in swa_layers)},
                ],
                "provenance": prov("runtime_config", 10, "dsa_layers and swa_layers define independent layer classes"),
            },
            {
                "id": "ffn_branch",
                "condition": "layer_id < first_k_dense_replace",
                "true_target": "dense_mlp",
                "false_target": "moe_ffn",
                "resolved_ranges": [
                    {"target": "dense_mlp", "range": "0-1"},
                    {"target": "moe_ffn", "range": "2-45"},
                ],
                "provenance": prov("model_impl", 1346, "Decoder layer selects dense MLP before first_k_dense_replace"),
            },
        ],
        "visual_layout": {
            "direction": "vertical",
            "default_collapse_depth": 2,
            "nodes": {},
            "groups": [
                {
                    "id": "model-core",
                    "label": "Causal LM",
                    "nodes": ["token_embedding", "final_norm", "lm_head", "logits"],
                    "children": ["decoder-stack", "mtp-stack"],
                    "badge": "source checked",
                },
                {
                    "id": "decoder-stack",
                    "label": "Decoder Layer Template",
                    "nodes": ["mhc_attention", "input_layernorm", "post_attention_norm", "mhc_attention_post", "pre_mlp_norm", "post_mlp_norm", "block_post_norm"],
                    "children": ["attention-block", "ffn-block"],
                    "badge": "repeat 0-45, count 46",
                },
                {
                    "id": "attention-block",
                    "label": "Sparse MLA Attention",
                    "nodes": ["q_a_proj", "q_causal_conv", "q_residual_add", "q_a_norm", "q_b_proj", "kv_a_proj", "kv_causal_conv", "kv_residual_add", "kv_a_norm", "kv_b_proj", "rope_apply", "dsa_indexer", "attention_core", "o_causal_conv", "o_residual_add", "o_proj", "rope_cache", "kv_cache", "param_sink_state", "mome_state"],
                    "children": [],
                    "badge": "MLA + MoME local context",
                    "collapsed_by_default": False,
                },
                {
                    "id": "ffn-block",
                    "label": "Dense + MoE FFN",
                    "nodes": ["dense_mlp", "dense_gate_up", "dense_silu", "dense_down", "moe_ffn", "post_mlp_norm"],
                    "children": ["moe-block"],
                    "badge": "dense then MoE",
                    "collapsed_by_default": False,
                },
                {
                    "id": "moe-block",
                    "label": "MoE FFN",
                    "nodes": ["router_gate", "route_topk", "routed_expert_bank", "shared_expert_mlp", "moe_combine", "expert_parallel_state"],
                    "children": [],
                    "badge": "routed + shared",
                    "collapsed_by_default": True,
                },
                {
                    "id": "mtp-stack",
                    "label": "Multi Token Predictor",
                    "nodes": ["mtp_input_norms", "mtp_eh_proj", "mtp_decoder_layer", "mtp_shared_head", "mtp_logits"],
                    "children": [],
                    "badge": "next-token draft branch",
                    "collapsed_by_default": True,
                },
            ],
        },
        "warnings": [
            "The local checkout intentionally skips full safetensors weights.",
            "swa_layers includes indices 46-48, which align with the three MTP layers rather than main decoder layers.",
        ],
    }


NODE_SPEC = {
    "input_tokens": {"w": 170, "h": 48, "colorKey": "io:input"},
    "positions": {"w": 164, "h": 48, "colorKey": "io:input", "lane": 190},
    "token_embedding": {"w": 260, "h": 56, "colorKey": "sem:embedding", "parent": "model-core"},
    "decoder_layer": {"w": 274, "h": 58, "colorKey": "module:decoder", "parent": "model-core"},
    "mhc_attention": {"w": 246, "h": 56, "colorKey": "module:mhc", "parent": "decoder-stack"},
    "input_layernorm": {"w": 204, "h": 54, "colorKey": "sem:norm", "parent": "decoder-stack"},
    "sparse_mla_attention": {"w": 252, "h": 58, "colorKey": "sem:attention", "parent": "decoder-stack"},
    "q_a_proj": {"w": 210, "h": 52, "colorKey": "sem:linear", "parent": "attention-block", "lane": 465},
    "q_causal_conv": {"w": 212, "h": 52, "colorKey": "sem:act", "parent": "attention-block", "lane": 465},
    "q_residual_add": {"w": 102, "h": 46, "colorKey": "sem:comm", "parent": "attention-block", "lane": 465},
    "q_a_norm": {"w": 190, "h": 52, "colorKey": "sem:norm", "parent": "attention-block", "lane": 465},
    "q_b_proj": {"w": 178, "h": 52, "colorKey": "sem:linear", "parent": "attention-block", "lane": 465},
    "kv_a_proj": {"w": 220, "h": 52, "colorKey": "sem:linear", "parent": "attention-block", "lane": 815},
    "kv_causal_conv": {"w": 222, "h": 52, "colorKey": "sem:act", "parent": "attention-block", "lane": 815},
    "kv_residual_add": {"w": 110, "h": 46, "colorKey": "sem:comm", "parent": "attention-block", "lane": 815},
    "kv_a_norm": {"w": 196, "h": 52, "colorKey": "sem:norm", "parent": "attention-block", "lane": 815},
    "kv_b_proj": {"w": 188, "h": 52, "colorKey": "sem:linear", "parent": "attention-block", "lane": 815},
    "rope_apply": {"w": 170, "h": 52, "colorKey": "sem:rope", "parent": "attention-block", "lane": 640},
    "dsa_indexer": {"w": 176, "h": 52, "colorKey": "sem:gate", "parent": "attention-block", "lane": 390},
    "attention_core": {"w": 226, "h": 52, "colorKey": "sem:attention", "parent": "attention-block", "lane": 640},
    "o_causal_conv": {"w": 238, "h": 52, "colorKey": "sem:act", "parent": "attention-block", "lane": 640},
    "o_residual_add": {"w": 126, "h": 46, "colorKey": "sem:comm", "parent": "attention-block", "lane": 640},
    "o_proj": {"w": 194, "h": 52, "colorKey": "sem:linear", "parent": "attention-block"},
    "post_attention_norm": {"w": 244, "h": 54, "colorKey": "sem:norm", "parent": "decoder-stack"},
    "mhc_attention_post": {"w": 244, "h": 56, "colorKey": "module:mhc", "parent": "decoder-stack"},
    "pre_mlp_norm": {"w": 188, "h": 54, "colorKey": "sem:norm", "parent": "decoder-stack"},
    "ffn_choice": {"w": 248, "h": 58, "colorKey": "module:ffn", "parent": "decoder-stack"},
    "dense_mlp": {"w": 184, "h": 54, "colorKey": "sem:mlp", "parent": "ffn-block", "lane": 520},
    "dense_gate_up": {"w": 198, "h": 52, "colorKey": "sem:linear", "parent": "ffn-block", "lane": 520},
    "dense_silu": {"w": 172, "h": 52, "colorKey": "sem:act", "parent": "ffn-block", "lane": 520},
    "dense_down": {"w": 192, "h": 52, "colorKey": "sem:linear", "parent": "ffn-block", "lane": 520},
    "moe_ffn": {"w": 174, "h": 54, "colorKey": "sem:moe", "parent": "ffn-block", "lane": 765},
    "router_gate": {"w": 170, "h": 52, "colorKey": "sem:gate", "parent": "moe-block", "lane": 765},
    "route_topk": {"w": 164, "h": 52, "colorKey": "sem:gate", "parent": "moe-block", "lane": 765},
    "routed_expert_bank": {"w": 218, "h": 52, "colorKey": "sem:moe", "parent": "moe-block", "lane": 765},
    "shared_expert_mlp": {"w": 208, "h": 52, "colorKey": "sem:mlp", "parent": "moe-block", "lane": 1010},
    "moe_combine": {"w": 170, "h": 52, "colorKey": "sem:comm", "parent": "moe-block", "lane": 885},
    "post_mlp_norm": {"w": 206, "h": 54, "colorKey": "sem:norm", "parent": "decoder-stack"},
    "block_post_norm": {"w": 214, "h": 54, "colorKey": "sem:norm", "parent": "decoder-stack"},
    "final_norm": {"w": 174, "h": 54, "colorKey": "sem:norm", "parent": "model-core"},
    "lm_head": {"w": 168, "h": 54, "colorKey": "sem:head", "parent": "model-core"},
    "logits": {"w": 148, "h": 48, "colorKey": "io:output", "parent": "model-core"},
    "mtp_module": {"w": 250, "h": 58, "colorKey": "module:mtp", "parent": "model-core", "lane": 990},
    "mtp_input_norms": {"w": 204, "h": 52, "colorKey": "sem:norm", "parent": "mtp-stack", "lane": 990},
    "mtp_eh_proj": {"w": 198, "h": 52, "colorKey": "sem:linear", "parent": "mtp-stack", "lane": 990},
    "mtp_decoder_layer": {"w": 226, "h": 54, "colorKey": "module:decoder", "parent": "mtp-stack", "lane": 990},
    "mtp_shared_head": {"w": 204, "h": 52, "colorKey": "sem:head", "parent": "mtp-stack", "lane": 990},
    "mtp_logits": {"w": 160, "h": 48, "colorKey": "io:output", "parent": "mtp-stack", "lane": 990},
    "rope_cache": {"w": 158, "h": 48, "colorKey": "io:state", "parent": "attention-block", "lane": 190},
    "kv_cache": {"w": 144, "h": 48, "colorKey": "io:state", "parent": "attention-block", "lane": 190},
    "param_sink_state": {"w": 176, "h": 48, "colorKey": "io:state", "parent": "attention-block", "lane": 190},
    "mome_state": {"w": 150, "h": 48, "colorKey": "io:state", "parent": "attention-block", "lane": 190},
    "expert_parallel_state": {"w": 214, "h": 48, "colorKey": "io:state", "parent": "moe-block", "lane": 190},
}

GROUPS = [
    {"id": "model-core", "label": "Causal LM", "colorKey": "module:model", "parentCluster": None, "repeat": False},
    {"id": "decoder-stack", "label": "Decoder Layer Template", "colorKey": "module:decoder", "parentCluster": "model-core", "repeat": True},
    {"id": "attention-block", "label": "Sparse MLA Attention", "colorKey": "sem:attention", "parentCluster": "decoder-stack", "repeat": False},
    {"id": "ffn-block", "label": "Dense + MoE FFN", "colorKey": "module:ffn", "parentCluster": "decoder-stack", "repeat": False},
    {"id": "moe-block", "label": "MoE FFN", "colorKey": "sem:moe", "parentCluster": "ffn-block", "repeat": True},
    {"id": "mtp-stack", "label": "Multi Token Predictor", "colorKey": "module:mtp", "parentCluster": "model-core", "repeat": True},
]

MODULE_BY_CLUSTER = {
    "decoder-stack": "decoder_layer",
    "attention-block": "sparse_mla_attention",
    "ffn-block": "ffn_choice",
    "moe-block": "moe_ffn",
    "mtp-stack": "mtp_module",
}

COLLAPSIBLE = {
    "decoder_layer": ["mhc_attention", "input_layernorm", "sparse_mla_attention", "q_a_proj", "q_causal_conv", "q_residual_add", "q_a_norm", "q_b_proj", "kv_a_proj", "kv_causal_conv", "kv_residual_add", "kv_a_norm", "kv_b_proj", "rope_apply", "dsa_indexer", "attention_core", "o_causal_conv", "o_residual_add", "o_proj", "post_attention_norm", "mhc_attention_post", "pre_mlp_norm", "ffn_choice", "dense_mlp", "dense_gate_up", "dense_silu", "dense_down", "moe_ffn", "router_gate", "route_topk", "routed_expert_bank", "shared_expert_mlp", "moe_combine", "post_mlp_norm", "block_post_norm", "rope_cache", "kv_cache", "param_sink_state", "mome_state", "expert_parallel_state"],
    "sparse_mla_attention": ["q_a_proj", "q_causal_conv", "q_residual_add", "q_a_norm", "q_b_proj", "kv_a_proj", "kv_causal_conv", "kv_residual_add", "kv_a_norm", "kv_b_proj", "rope_apply", "dsa_indexer", "attention_core", "o_causal_conv", "o_residual_add", "o_proj", "rope_cache", "kv_cache", "param_sink_state", "mome_state"],
    "ffn_choice": ["dense_mlp", "dense_gate_up", "dense_silu", "dense_down", "moe_ffn", "router_gate", "route_topk", "routed_expert_bank", "shared_expert_mlp", "moe_combine", "expert_parallel_state"],
    "moe_ffn": ["router_gate", "route_topk", "routed_expert_bank", "shared_expert_mlp", "moe_combine", "expert_parallel_state"],
    "mtp_module": ["mtp_input_norms", "mtp_eh_proj", "mtp_decoder_layer", "mtp_shared_head", "mtp_logits"],
}

DEFAULT_COLLAPSED = {"moe_ffn", "mtp_module"}


def build_graph(schema: dict, collapsed: set[str] | None = None) -> dict:
    collapsed = set(DEFAULT_COLLAPSED if collapsed is None else collapsed)
    spec = NODE_SPEC
    col_x = 640
    cluster_margin = 34
    cluster_top_pad = 46
    row_gap = 44

    def hidden_by_ancestor(node_id: str) -> bool:
        return any(node_id != module and node_id in descendants and module in collapsed for module, descendants in COLLAPSIBLE.items())

    def visible_node(node_id: str) -> bool:
        if node_id not in spec:
            return False
        if node_id in COLLAPSIBLE:
            return node_id in collapsed and not hidden_by_ancestor(node_id)
        return not hidden_by_ancestor(node_id)

    rows: list[list[str]] = [["input_tokens"]]
    rows.append(["token_embedding"])
    if "decoder_layer" in collapsed:
        rows.append(["decoder_layer"])
    else:
        rows.extend([["mhc_attention"], ["input_layernorm"]])
        if "sparse_mla_attention" in collapsed:
            rows.append(["sparse_mla_attention"])
        else:
            rows.extend([
                ["q_a_proj", "kv_a_proj"],
                ["q_causal_conv", "kv_causal_conv"],
                ["q_residual_add", "kv_residual_add"],
                ["q_a_norm", "kv_a_norm"],
                ["q_b_proj", "kv_b_proj"],
                ["dsa_indexer", "rope_apply"],
                ["attention_core"],
                ["o_causal_conv"],
                ["o_residual_add"],
                ["o_proj"],
            ])
        rows.extend([["post_attention_norm"], ["mhc_attention_post"], ["pre_mlp_norm"]])
        if "ffn_choice" in collapsed:
            rows.append(["ffn_choice"])
        else:
            rows.append(["dense_mlp", "moe_ffn"] if "moe_ffn" in collapsed else ["dense_gate_up", "router_gate", "shared_expert_mlp"])
            if "moe_ffn" not in collapsed:
                rows.extend([["dense_silu", "route_topk"], ["dense_down", "routed_expert_bank"], ["moe_combine"]])
            else:
                rows.extend([["dense_gate_up"], ["dense_silu"], ["dense_down"]])
        rows.extend([["post_mlp_norm"], ["block_post_norm"]])
    rows.extend([["final_norm"], ["lm_head"], ["logits"]])

    positions: dict[str, dict] = {}
    cursor = 48
    for row in rows:
        row = [node_id for node_id in row if visible_node(node_id)]
        if not row:
            continue
        row_h = max(spec[node_id]["h"] for node_id in row)
        y = cursor + row_h / 2
        for node_id in row:
            positions[node_id] = {"x": spec[node_id].get("lane", col_x), "y": y}
        cursor += row_h + row_gap

    target_attention = next((node_id for node_id in ["attention_core", "sparse_mla_attention", "decoder_layer"] if node_id in positions), None)
    if target_attention:
        base_y = positions[target_attention]["y"]
        for index, state_id in enumerate(["positions", "rope_cache", "kv_cache", "param_sink_state", "mome_state"]):
            if visible_node(state_id):
                positions[state_id] = {"x": spec[state_id].get("lane", 270), "y": base_y - 96 + index * 48}

    target_moe = next((node_id for node_id in ["routed_expert_bank", "moe_ffn", "ffn_choice"] if node_id in positions), None)
    if target_moe and visible_node("expert_parallel_state"):
        positions["expert_parallel_state"] = {"x": spec["expert_parallel_state"]["lane"], "y": positions[target_moe]["y"]}

    final_y = positions.get("final_norm", {"y": cursor / 2})["y"]
    if "mtp_module" in collapsed:
        if visible_node("mtp_module"):
            positions["mtp_module"] = {"x": spec["mtp_module"]["lane"], "y": final_y}
    else:
        mtp_ids = ["mtp_input_norms", "mtp_eh_proj", "mtp_decoder_layer", "mtp_shared_head", "mtp_logits"]
        for index, node_id in enumerate(mtp_ids):
            if visible_node(node_id):
                positions[node_id] = {"x": spec[node_id]["lane"], "y": final_y - 104 + index * 66}

    def graph_node(node: dict) -> dict | None:
        node_id = node["id"]
        if not visible_node(node_id) or node_id not in positions:
            return None
        node_spec = spec[node_id]
        kind = node["kind"]
        return {
            "id": node_id,
            "label": node["label"],
            "kind": "tensor" if kind in {"input", "output", "state"} else kind,
            "typeLabel": {"input": "Input", "output": "Output", "state": "State", "module": "Module", "op": "Op"}.get(kind, "Node"),
            "x": positions[node_id]["x"],
            "y": positions[node_id]["y"],
            "width": node_spec["w"],
            "height": node_spec["h"],
            "colorKey": node_spec.get("colorKey"),
            "parent": node_spec.get("parent"),
            "collapsed": node_id in collapsed and node_id in COLLAPSIBLE,
        }

    graph_nodes = [node for raw in schema["nodes"] if (node := graph_node(raw))]
    visible_ids = {node["id"] for node in graph_nodes}

    group_children: dict[str, list[str]] = {}
    for node_id, node_spec in spec.items():
        parent = node_spec.get("parent")
        if parent:
            group_children.setdefault(parent, []).append(node_id)
    group_child_groups: dict[str, list[str]] = {}
    for group in GROUPS:
        parent = group.get("parentCluster")
        if parent:
            group_child_groups.setdefault(parent, []).append(group["id"])

    def group_active(group_id: str) -> bool:
        module_id = MODULE_BY_CLUSTER.get(group_id)
        if not module_id:
            return True
        return module_id not in collapsed and not hidden_by_ancestor(module_id)

    def node_rect(node_id: str) -> dict | None:
        if node_id not in visible_ids or node_id not in positions:
            return None
        node_spec = spec[node_id]
        pos = positions[node_id]
        return {
            "left": pos["x"] - node_spec["w"] / 2,
            "right": pos["x"] + node_spec["w"] / 2,
            "top": pos["y"] - node_spec["h"] / 2,
            "bottom": pos["y"] + node_spec["h"] / 2,
        }

    def cluster_box(group_id: str) -> dict | None:
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")
        for node_id in group_children.get(group_id, []):
            rect = node_rect(node_id)
            if not rect:
                continue
            min_x = min(min_x, rect["left"])
            min_y = min(min_y, rect["top"])
            max_x = max(max_x, rect["right"])
            max_y = max(max_y, rect["bottom"])
        for child_id in group_child_groups.get(group_id, []):
            if not group_active(child_id):
                continue
            box = cluster_box(child_id)
            if not box:
                continue
            min_x = min(min_x, box["x"])
            min_y = min(min_y, box["y"])
            max_x = max(max_x, box["x"] + box["width"])
            max_y = max(max_y, box["y"] + box["height"])
        if min_x == float("inf"):
            return None
        x = min_x - cluster_margin
        y = min_y - cluster_top_pad
        return {"x": x, "y": y, "width": max_x + cluster_margin - x, "height": max_y + cluster_margin - y}

    clusters = []
    for group in GROUPS:
        if not group_active(group["id"]):
            continue
        box = cluster_box(group["id"])
        if box:
            clusters.append({**group, **box})

    def add_edge(items: list[dict], source: str, target: str, dashed=False):
        if source in visible_ids and target in visible_ids and not any(e["source"] == source and e["target"] == target for e in items):
            items.append({"source": source, "target": target, "dashed": dashed})

    display_edges: list[dict] = []
    add_edge(display_edges, "input_tokens", "token_embedding")
    add_edge(display_edges, "positions", "rope_cache", True)
    if "decoder_layer" in collapsed:
        add_edge(display_edges, "token_embedding", "decoder_layer")
        add_edge(display_edges, "decoder_layer", "final_norm")
        add_edge(display_edges, "positions", "decoder_layer", True)
        add_edge(display_edges, "rope_cache", "decoder_layer", True)
        add_edge(display_edges, "kv_cache", "decoder_layer", True)
    else:
        add_edge(display_edges, "token_embedding", "mhc_attention")
        add_edge(display_edges, "mhc_attention", "input_layernorm")
        if "sparse_mla_attention" in collapsed:
            add_edge(display_edges, "input_layernorm", "sparse_mla_attention")
            add_edge(display_edges, "positions", "sparse_mla_attention", True)
            add_edge(display_edges, "rope_cache", "sparse_mla_attention", True)
            add_edge(display_edges, "kv_cache", "sparse_mla_attention", True)
            add_edge(display_edges, "sparse_mla_attention", "post_attention_norm")
        else:
            add_edge(display_edges, "input_layernorm", "q_a_proj")
            add_edge(display_edges, "input_layernorm", "kv_a_proj")
            add_edge(display_edges, "q_a_proj", "q_causal_conv")
            add_edge(display_edges, "q_a_proj", "q_residual_add", True)
            add_edge(display_edges, "q_causal_conv", "q_residual_add")
            add_edge(display_edges, "q_residual_add", "q_a_norm")
            add_edge(display_edges, "q_a_norm", "q_b_proj")
            add_edge(display_edges, "kv_a_proj", "kv_causal_conv")
            add_edge(display_edges, "kv_a_proj", "kv_residual_add", True)
            add_edge(display_edges, "kv_causal_conv", "kv_residual_add")
            add_edge(display_edges, "kv_residual_add", "kv_a_norm")
            add_edge(display_edges, "kv_a_norm", "kv_b_proj")
            add_edge(display_edges, "q_b_proj", "rope_apply")
            add_edge(display_edges, "rope_cache", "rope_apply", True)
            add_edge(display_edges, "rope_apply", "dsa_indexer")
            add_edge(display_edges, "rope_apply", "attention_core")
            add_edge(display_edges, "dsa_indexer", "attention_core")
            add_edge(display_edges, "kv_b_proj", "attention_core")
            add_edge(display_edges, "kv_cache", "attention_core", True)
            add_edge(display_edges, "param_sink_state", "attention_core", True)
            add_edge(display_edges, "mome_state", "attention_core", True)
            add_edge(display_edges, "attention_core", "o_causal_conv")
            add_edge(display_edges, "attention_core", "o_residual_add", True)
            add_edge(display_edges, "o_causal_conv", "o_residual_add")
            add_edge(display_edges, "o_residual_add", "o_proj")
            add_edge(display_edges, "o_proj", "post_attention_norm")
        add_edge(display_edges, "post_attention_norm", "mhc_attention_post")
        add_edge(display_edges, "mhc_attention_post", "pre_mlp_norm")
        if "ffn_choice" in collapsed:
            add_edge(display_edges, "pre_mlp_norm", "ffn_choice")
            add_edge(display_edges, "ffn_choice", "post_mlp_norm")
        else:
            add_edge(display_edges, "pre_mlp_norm", "dense_mlp")
            add_edge(display_edges, "dense_mlp", "dense_gate_up")
            add_edge(display_edges, "dense_gate_up", "dense_silu")
            add_edge(display_edges, "dense_silu", "dense_down")
            add_edge(display_edges, "dense_down", "post_mlp_norm")
            if "moe_ffn" in collapsed:
                add_edge(display_edges, "pre_mlp_norm", "moe_ffn")
                add_edge(display_edges, "moe_ffn", "post_mlp_norm")
            else:
                add_edge(display_edges, "pre_mlp_norm", "router_gate")
                add_edge(display_edges, "router_gate", "route_topk")
                add_edge(display_edges, "route_topk", "routed_expert_bank")
                add_edge(display_edges, "expert_parallel_state", "routed_expert_bank", True)
                add_edge(display_edges, "pre_mlp_norm", "shared_expert_mlp")
                add_edge(display_edges, "routed_expert_bank", "moe_combine")
                add_edge(display_edges, "shared_expert_mlp", "moe_combine")
                add_edge(display_edges, "moe_combine", "post_mlp_norm")
        add_edge(display_edges, "post_mlp_norm", "block_post_norm")
        add_edge(display_edges, "block_post_norm", "final_norm")
    add_edge(display_edges, "final_norm", "lm_head")
    add_edge(display_edges, "lm_head", "logits")
    if "mtp_module" in collapsed:
        add_edge(display_edges, "final_norm", "mtp_module", True)
    else:
        add_edge(display_edges, "token_embedding", "mtp_input_norms", True)
        add_edge(display_edges, "final_norm", "mtp_input_norms", True)
        add_edge(display_edges, "mtp_input_norms", "mtp_eh_proj")
        add_edge(display_edges, "mtp_eh_proj", "mtp_decoder_layer")
        add_edge(display_edges, "mtp_decoder_layer", "mtp_shared_head")
        add_edge(display_edges, "mtp_shared_head", "mtp_logits")

    max_bottom = max([n["y"] + n["height"] / 2 for n in graph_nodes] + [900])
    max_right = max([n["x"] + n["width"] / 2 for n in graph_nodes] + [1180])
    return {
        "width": int(max(1280, max_right + 90)),
        "height": int(max_bottom + 80),
        "clusters": clusters,
        "nodes": graph_nodes,
        "edges": display_edges,
    }


def validation_markdown(schema: dict) -> str:
    st = schema["symbol_table"]
    return f"""# openPangu-2.0-Flash Architecture Validation

## Scope

- Scope kind: `{schema["extraction_scope"]["kind"]}`
- Main decoder layers: `{schema["extraction_scope"]["full_main_layers"]}`
- Profiling trace: not used.
- Full 92B weights: not downloaded. The local model checkout keeps Git LFS pointer files only.

## Source Roots

- Runtime config: `{FLASH / "config.json"}`
- Main model source: `{MODEL_IMPL}`
- Attention source: `{ATTN_IMPL}`
- MTP source: `{MTP_IMPL}`
- MoE support source: `{MOE_IMPL}`

## Confirmed Runtime Facts

- Hidden size `H={st["H"]}`
- Vocabulary `V={st["V"]}`
- Attention heads `N_h={st["N_h"]}`
- Main layers `L={st["L"]}`
- Main context limit `S_max={st["S_max"]}`
- MLA ranks `R_q={st["R_q"]}`, `R_kv={st["R_kv"]}`
- MoE routed expert symbol `E={st["E"]}`, routing `top_k={st["top_k"]}`, shared expert symbol `E_shared={st["E_shared"]}`
- mHC streams `S_mhc={st["S_mhc"]}`
- MTP layer symbol `N_mtp={st["N_mtp"]}`

## Source Checks

- `OpenPanguV2Model` owns embedding, repeated decoder layers, final norm, and cached RoPE tensors.
- `OpenPanguV2DecoderLayer` owns mHC branches, `NPUPanguSparseAttention`, FFN selection, RMSNorm stack, and optional block post norm.
- `NPUPanguSparseAttention` owns MLA projections, RoPE, param sink state, DSA/SWA attention selection, and MoME state.
- `OpenPanguV2MOE` owns router gate, shared expert MLP, fused routed expert bank, and expert-parallel runtime state.
- `OpenPanguV2MTP` owns the multi-token prediction branch and reuses `OpenPanguV2DecoderLayer`.

## Notes

- `swa_layers` contains `46,47,48`; these line up with the three MTP layers beyond the main decoder range and are treated separately in the graph.
- Dense FFN applies to layers `0-1`; MoE FFN applies to layers `2-45`.
"""


HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>openPangu-2.0-Flash Model Architecture</title>
  <script>
    (() => {
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme');
      document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    })();
  </script>
  <link rel="stylesheet" href="../../../vendor/pto-design-system/tokens/foundation.css">
  <link rel="stylesheet" href="../../../vendor/pto-design-system/tokens/semantic.css">
  <link rel="stylesheet" href="../../../vendor/pto-design-system/tokens/components.css">
  <link rel="stylesheet" href="../../../vendor/pto-design-system/css/style.css">
  <link rel="stylesheet" href="../../../vendor/pto-design-system/patterns/model-graphviz/pattern.css">
  <style>
    :root {
      --opv-shell-bg: var(--background);
      --opv-panel-bg: color-mix(in srgb, var(--panel-shell-bg) 96%, transparent);
      --opv-panel-soft: color-mix(in srgb, var(--surface-2) 72%, transparent);
      --opv-border: var(--border-subtle);
      --opv-border-strong: var(--border-strong);
      --opv-text: var(--foreground);
      --opv-muted: var(--foreground-secondary);
      --opv-dim: var(--foreground-muted);
      --opv-selected: #fff;
      --opv-accent: var(--highlight-copy-blue-300);
      --model-graphviz-bg: var(--opv-shell-bg);
      --model-graphviz-surface: var(--opv-panel-bg);
      --model-graphviz-surface-soft: var(--opv-panel-soft);
      --model-graphviz-stage-bg: var(--opv-shell-bg);
      --model-graphviz-line: color-mix(in srgb, var(--opv-muted) 88%, transparent);
      --model-graphviz-line-soft: var(--opv-border-strong);
      --model-graphviz-node-label: var(--opv-text);
      --model-graphviz-node-type: var(--opv-muted);
      --model-graphviz-cluster-label: var(--opv-muted);
      --model-graphviz-toggle-bg: color-mix(in srgb, var(--opv-accent) 64%, var(--opv-panel-bg));
      --model-graphviz-toggle-border: color-mix(in srgb, var(--opv-accent) 70%, var(--opv-border-strong));
      --model-graphviz-toggle-icon: var(--opv-text);
      --model-graphviz-tensor-fill: color-mix(in srgb, var(--opv-panel-soft) 70%, var(--opv-accent));
      --model-graphviz-tensor-stroke: var(--opv-border-strong);
      --model-graphviz-report-priority-on-dark: var(--foreground);
      --model-graphviz-report-priority-on-light: var(--background);
      --model-graphviz-node-shadow: none;
      --model-graphviz-parent-shadow: none;
      --model-graphviz-panel-shadow: none;
    }
    :root[data-theme='light'] {
      --opv-panel-bg: color-mix(in srgb, var(--panel-shell-bg) 96%, white);
      --opv-panel-soft: color-mix(in srgb, var(--surface-1) 88%, white);
      --opv-selected: #111;
      --opv-accent: var(--primary);
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      background: var(--opv-shell-bg);
      color: var(--opv-text);
      font-family: var(--font-sans);
      overflow: hidden;
    }
    .opv-app {
      height: 100vh;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      grid-template-rows: 48px minmax(0, 1fr);
      background: var(--opv-shell-bg);
    }
    .opv-topbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: 0 var(--space-4);
      border-bottom: 1px solid var(--opv-border);
      background: color-mix(in srgb, var(--opv-panel-bg) 96%, transparent);
    }
    .opv-title { min-width: 0; display: flex; align-items: baseline; gap: var(--space-3); }
    .opv-title h1 { margin: 0; font: var(--text-title-2); color: var(--opv-text); letter-spacing: 0; }
    .opv-title span { color: var(--opv-muted); font: var(--text-mono); white-space: nowrap; }
    .opv-actions { display: flex; align-items: center; gap: var(--space-2); }
    .opv-file input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; pointer-events: none; }
    .opv-stage {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    .opv-stage.is-panning { cursor: grabbing; }
    .opv-stage svg { display: block; transform-origin: 0 0; will-change: transform; }
    .opv-stage .pto-model-graphviz-node,
    .opv-stage .pto-model-graphviz-cluster { cursor: pointer; }
    .opv-stage [tabindex]:focus,
    .opv-stage [tabindex]:focus-visible { outline: none; }
    .opv-stage .pto-model-graphviz-node.is-selected rect { stroke: var(--opv-selected); stroke-width: 3px; }
    .opv-stage .pto-model-graphviz-cluster.is-selected > rect:first-child { stroke: var(--opv-selected); stroke-width: 2.4px; }
    .opv-stage .pto-model-graphviz-toggle,
    .opv-stage .pto-model-graphviz-toggle-icon { display: none; }
    .opv-overlay-toggle { cursor: pointer; pointer-events: all; }
    .opv-overlay-toggle .opv-toggle-hit {
      fill: transparent;
      stroke: transparent;
      pointer-events: all;
    }
    .opv-overlay-toggle circle {
      fill: var(--model-graphviz-toggle-bg);
      stroke: var(--model-graphviz-toggle-border);
      stroke-width: 1.1px;
    }
    .opv-overlay-toggle text {
      fill: var(--model-graphviz-toggle-icon);
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: var(--font-weight-bold);
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
    }
    .opv-repeat-tag text {
      fill: var(--opv-text);
      font-family: var(--font-sans);
      font-size: 11px;
      font-weight: var(--font-weight-semibold);
      text-anchor: middle;
      dominant-baseline: central;
      pointer-events: none;
    }
    .opv-status {
      position: absolute;
      left: var(--space-4);
      bottom: var(--space-4);
      max-width: min(620px, calc(100% - 32px));
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      color: var(--opv-muted);
      background: color-mix(in srgb, var(--opv-panel-bg) 92%, transparent);
      backdrop-filter: blur(16px);
      font: var(--text-label);
      pointer-events: none;
    }
    .opv-inspector {
      min-width: 0;
      min-height: 0;
      border-left: 1px solid var(--opv-border);
      background: color-mix(in srgb, var(--opv-panel-bg) 98%, transparent);
      display: flex;
      flex-direction: column;
    }
    .opv-inspector-head {
      padding: 14px 16px;
      border-bottom: 1px solid var(--opv-border);
    }
    .opv-inspector-head h2 { margin: 0 0 6px; font: var(--text-title-2); color: var(--opv-text); }
    .opv-inspector-head p { margin: 0; color: var(--opv-muted); font: var(--text-body-sm); }
    .opv-inspector-body { min-height: 0; overflow: auto; padding: 14px 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .opv-section { display: flex; flex-direction: column; gap: 8px; }
    .opv-section-title {
      color: var(--opv-dim);
      font: var(--text-label);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .opv-kv { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 7px 10px; font: var(--text-body-sm); }
    .opv-kv dt { color: var(--opv-dim); }
    .opv-kv dd { margin: 0; color: var(--opv-text); min-width: 0; overflow-wrap: anywhere; }
    .opv-code {
      margin: 0;
      padding: 10px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--surface-1) 86%, black);
      color: var(--opv-muted);
      font: var(--text-mono);
      overflow: auto;
      white-space: pre-wrap;
    }
    .opv-edge-list { display: flex; flex-direction: column; gap: 6px; }
    .opv-edge-row {
      padding: 8px 9px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--surface-2) 78%, transparent);
      color: var(--opv-muted);
      font: var(--text-body-sm);
    }
    .opv-edge-row strong { color: var(--opv-text); font-weight: 600; }
    @media (max-width: 980px) {
      body { overflow: auto; }
      .opv-app { height: auto; min-height: 100vh; grid-template-columns: 1fr; grid-template-rows: auto 900px auto; }
      .opv-inspector { border-left: 0; border-top: 1px solid var(--opv-border); }
    }
  </style>
</head>
<body class="pto-model-graphviz-pattern-page">
  <main class="opv-app">
    <header class="opv-topbar">
      <div class="opv-title">
        <h1>openPangu-2.0-Flash Architecture</h1>
        <span>source checked schema</span>
      </div>
      <div class="opv-actions">
        <button class="btn btn-ghost" type="button" id="themeToggle">Theme</button>
        <button class="btn btn-ghost" type="button" id="zoomOut">-</button>
        <button class="btn btn-ghost" type="button" id="zoomReset">Fit</button>
        <button class="btn btn-ghost" type="button" id="zoomIn">+</button>
        <a class="btn btn-ghost" href="./model_architecture.json">Schema JSON</a>
        <a class="btn btn-ghost" href="./model_architecture_validation.md">Validation</a>
        <label class="btn btn-ghost opv-file">
          <span>Open JSON</span>
          <input id="schemaFileInput" type="file" accept=".json,application/json">
        </label>
      </div>
    </header>
    <section class="opv-stage" id="graphStage" aria-label="openPangu model architecture graph"></section>
    <aside class="opv-inspector">
      <div class="opv-inspector-head">
        <h2 id="inspectorTitle">No selection</h2>
        <p id="inspectorSub">Select a node or cluster.</p>
      </div>
      <div class="opv-inspector-body" id="inspectorBody"></div>
    </aside>
    <div class="opv-status" id="statusText">Loading schema.</div>
  </main>
  <script src="../../../vendor/pto-design-system/patterns/model-graphviz/pattern.js"></script>
  <script>
    const NODE_SPEC = __NODE_SPEC__;
    const GROUPS = __GROUPS__;
    const MODULE_BY_CLUSTER = __MODULE_BY_CLUSTER__;
    const COLLAPSIBLE = __COLLAPSIBLE__;
    const DEFAULT_COLLAPSED = new Set(__DEFAULT_COLLAPSED__);
    const COL_X = 640;
    const CLUSTER_MARGIN = 34;
    const CLUSTER_TOP_PAD = 46;
    const ROW_GAP = 44;
    const ZOOM_MIN = 0.18;
    const ZOOM_MAX = 2.8;

    const state = {
      schema: null,
      graph: null,
      selectedNodeId: null,
      collapsedModules: new Set(DEFAULT_COLLAPSED),
      zoom: 1,
      tx: 0,
      ty: 0,
      svg: null,
      pan: null,
      suppressClick: false,
    };

    function setStatus(message) {
      document.getElementById('statusText').textContent = message;
    }

    function isOpenPanguSchema(schema) {
      return String(schema?.model?.name || '').toLowerCase().includes('openpangu');
    }

    function hiddenByAncestor(nodeId) {
      return Object.entries(COLLAPSIBLE).some(([moduleId, descendants]) => (
        state.collapsedModules.has(moduleId) && nodeId !== moduleId && descendants.includes(nodeId)
      ));
    }

    function visibleNode(nodeId) {
      if (!NODE_SPEC[nodeId]) return false;
      if (COLLAPSIBLE[nodeId]) return state.collapsedModules.has(nodeId) && !hiddenByAncestor(nodeId);
      return !hiddenByAncestor(nodeId);
    }

    function graphKind(kind) {
      if (kind === 'input' || kind === 'output' || kind === 'state') return 'tensor';
      if (kind === 'module') return 'module';
      return 'op';
    }

    function typeLabel(kind) {
      return { input: 'Input', output: 'Output', state: 'State', module: 'Module', op: 'Op' }[kind] || 'Node';
    }

    function fallbackColorKey(node) {
      const text = `${node.id || ''} ${node.label || ''} ${node.op_type || ''} ${node.module_type || ''} ${node.state_type || ''}`.toLowerCase();
      if (node.kind === 'input') return 'io:input';
      if (node.kind === 'output') return 'io:output';
      if (node.kind === 'state') return 'io:state';
      if (text.includes('embedding')) return 'sem:embedding';
      if (text.includes('rope') || text.includes('rotary')) return 'sem:rope';
      if (text.includes('norm')) return 'sem:norm';
      if (text.includes('attention') || text.includes('mla') || text.includes('dsa')) return 'sem:attention';
      if (text.includes('moe')) return 'sem:moe';
      if (text.includes('mlp') || text.includes('silu')) return 'sem:mlp';
      if (text.includes('gate') || text.includes('router')) return 'sem:gate';
      if (text.includes('linear') || text.includes('projection') || text.includes('head')) return 'sem:linear';
      return node.kind === 'module' ? 'module:model' : 'sem:op';
    }

    function openPanguRows() {
      const c = state.collapsedModules;
      const rows = [['input_tokens'], ['token_embedding']];
      if (c.has('decoder_layer')) {
        rows.push(['decoder_layer']);
      } else {
        rows.push(['mhc_attention'], ['input_layernorm']);
        if (c.has('sparse_mla_attention')) {
          rows.push(['sparse_mla_attention']);
        } else {
          rows.push(
            ['q_a_proj', 'kv_a_proj'],
            ['q_causal_conv', 'kv_causal_conv'],
            ['q_residual_add', 'kv_residual_add'],
            ['q_a_norm', 'kv_a_norm'],
            ['q_b_proj', 'kv_b_proj'],
            ['dsa_indexer', 'rope_apply'],
            ['attention_core'],
            ['o_causal_conv'],
            ['o_residual_add'],
            ['o_proj']
          );
        }
        rows.push(['post_attention_norm'], ['mhc_attention_post'], ['pre_mlp_norm']);
        if (c.has('ffn_choice')) {
          rows.push(['ffn_choice']);
        } else {
          rows.push(c.has('moe_ffn') ? ['dense_mlp', 'moe_ffn'] : ['dense_gate_up', 'router_gate', 'shared_expert_mlp']);
          if (c.has('moe_ffn')) {
            rows.push(['dense_gate_up'], ['dense_silu'], ['dense_down']);
          } else {
            rows.push(['dense_silu', 'route_topk'], ['dense_down', 'routed_expert_bank'], ['moe_combine']);
          }
        }
        rows.push(['post_mlp_norm'], ['block_post_norm']);
      }
      rows.push(['final_norm'], ['lm_head'], ['logits']);
      return rows;
    }

    function computeOpenPanguPositions() {
      const positions = {};
      let cursor = 48;
      openPanguRows().forEach((row) => {
        const visible = row.filter(visibleNode);
        if (!visible.length) return;
        const rowHeight = Math.max(...visible.map((id) => NODE_SPEC[id].h));
        const y = cursor + rowHeight / 2;
        visible.forEach((id) => {
          positions[id] = { x: NODE_SPEC[id].lane || COL_X, y };
        });
        cursor += rowHeight + ROW_GAP;
      });
      const attentionTarget = ['attention_core', 'sparse_mla_attention', 'decoder_layer'].find((id) => positions[id]);
      if (attentionTarget) {
        const baseY = positions[attentionTarget].y;
        ['positions', 'rope_cache', 'kv_cache', 'param_sink_state', 'mome_state'].forEach((id, index) => {
          if (visibleNode(id)) positions[id] = { x: NODE_SPEC[id].lane || 270, y: baseY - 96 + index * 48 };
        });
      }
      const moeTarget = ['routed_expert_bank', 'moe_ffn', 'ffn_choice'].find((id) => positions[id]);
      if (moeTarget && visibleNode('expert_parallel_state')) {
        positions.expert_parallel_state = { x: NODE_SPEC.expert_parallel_state.lane, y: positions[moeTarget].y };
      }
      const finalY = positions.final_norm?.y || cursor / 2;
      if (state.collapsedModules.has('mtp_module')) {
        if (visibleNode('mtp_module')) positions.mtp_module = { x: NODE_SPEC.mtp_module.lane, y: finalY };
      } else {
        ['mtp_input_norms', 'mtp_eh_proj', 'mtp_decoder_layer', 'mtp_shared_head', 'mtp_logits'].forEach((id, index) => {
          if (visibleNode(id)) positions[id] = { x: NODE_SPEC[id].lane, y: finalY - 104 + index * 66 };
        });
      }
      return positions;
    }

    function buildOpenPanguGraph(schema) {
      const positions = computeOpenPanguPositions();
      const graphNodes = schema.nodes.map((node) => {
        const spec = NODE_SPEC[node.id];
        const pos = positions[node.id];
        if (!spec || !pos || !visibleNode(node.id)) return null;
        return {
          id: node.id,
          label: node.label || node.id,
          kind: graphKind(node.kind),
          typeLabel: typeLabel(node.kind),
          x: pos.x,
          y: pos.y,
          width: spec.w,
          height: spec.h,
          colorKey: spec.colorKey || fallbackColorKey(node),
          parent: spec.parent,
          collapsed: COLLAPSIBLE[node.id] ? state.collapsedModules.has(node.id) : false,
        };
      }).filter(Boolean);
      const visibleIds = new Set(graphNodes.map((node) => node.id));
      const groupChildren = {};
      Object.entries(NODE_SPEC).forEach(([id, spec]) => {
        if (!spec.parent) return;
        (groupChildren[spec.parent] ||= []).push(id);
      });
      const groupChildGroups = {};
      GROUPS.forEach((group) => {
        if (!group.parentCluster) return;
        (groupChildGroups[group.parentCluster] ||= []).push(group.id);
      });
      function groupActive(groupId) {
        const moduleId = MODULE_BY_CLUSTER[groupId];
        if (!moduleId) return true;
        return !state.collapsedModules.has(moduleId) && !hiddenByAncestor(moduleId);
      }
      function nodeRect(id) {
        const pos = positions[id];
        const spec = NODE_SPEC[id];
        if (!pos || !spec || !visibleIds.has(id)) return null;
        return { left: pos.x - spec.w / 2, right: pos.x + spec.w / 2, top: pos.y - spec.h / 2, bottom: pos.y + spec.h / 2 };
      }
      function clusterBox(groupId) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        (groupChildren[groupId] || []).forEach((id) => {
          const rect = nodeRect(id);
          if (!rect) return;
          minX = Math.min(minX, rect.left); minY = Math.min(minY, rect.top);
          maxX = Math.max(maxX, rect.right); maxY = Math.max(maxY, rect.bottom);
        });
        (groupChildGroups[groupId] || []).forEach((childId) => {
          if (!groupActive(childId)) return;
          const box = clusterBox(childId);
          if (!box) return;
          minX = Math.min(minX, box.x); minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.width); maxY = Math.max(maxY, box.y + box.height);
        });
        if (minX === Infinity) return null;
        const x = minX - CLUSTER_MARGIN;
        const y = minY - CLUSTER_TOP_PAD;
        return { x, y, width: maxX + CLUSTER_MARGIN - x, height: maxY + CLUSTER_MARGIN - y };
      }
      const clusters = GROUPS.map((group) => {
        if (!groupActive(group.id)) return null;
        const box = clusterBox(group.id);
        return box ? { ...group, ...box } : null;
      }).filter(Boolean);
      const edges = [];
      function add(source, target, dashed = false) {
        if (visibleIds.has(source) && visibleIds.has(target) && !edges.some((edge) => edge.source === source && edge.target === target)) {
          edges.push({ source, target, dashed });
        }
      }
      add('input_tokens', 'token_embedding');
      add('positions', 'rope_cache', true);
      if (state.collapsedModules.has('decoder_layer')) {
        add('token_embedding', 'decoder_layer');
        add('decoder_layer', 'final_norm');
        add('positions', 'decoder_layer', true);
        add('rope_cache', 'decoder_layer', true);
        add('kv_cache', 'decoder_layer', true);
      } else {
        add('token_embedding', 'mhc_attention');
        add('mhc_attention', 'input_layernorm');
        if (state.collapsedModules.has('sparse_mla_attention')) {
          add('input_layernorm', 'sparse_mla_attention');
          add('positions', 'sparse_mla_attention', true);
          add('rope_cache', 'sparse_mla_attention', true);
          add('kv_cache', 'sparse_mla_attention', true);
          add('sparse_mla_attention', 'post_attention_norm');
        } else {
          add('input_layernorm', 'q_a_proj'); add('input_layernorm', 'kv_a_proj');
          add('q_a_proj', 'q_causal_conv'); add('q_a_proj', 'q_residual_add', true); add('q_causal_conv', 'q_residual_add'); add('q_residual_add', 'q_a_norm'); add('q_a_norm', 'q_b_proj');
          add('kv_a_proj', 'kv_causal_conv'); add('kv_a_proj', 'kv_residual_add', true); add('kv_causal_conv', 'kv_residual_add'); add('kv_residual_add', 'kv_a_norm'); add('kv_a_norm', 'kv_b_proj');
          add('q_b_proj', 'rope_apply'); add('rope_cache', 'rope_apply', true);
          add('rope_apply', 'dsa_indexer'); add('rope_apply', 'attention_core'); add('dsa_indexer', 'attention_core');
          add('kv_b_proj', 'attention_core'); add('kv_cache', 'attention_core', true);
          add('param_sink_state', 'attention_core', true); add('mome_state', 'attention_core', true);
          add('attention_core', 'o_causal_conv'); add('attention_core', 'o_residual_add', true); add('o_causal_conv', 'o_residual_add'); add('o_residual_add', 'o_proj'); add('o_proj', 'post_attention_norm');
        }
        add('post_attention_norm', 'mhc_attention_post'); add('mhc_attention_post', 'pre_mlp_norm');
        if (state.collapsedModules.has('ffn_choice')) {
          add('pre_mlp_norm', 'ffn_choice'); add('ffn_choice', 'post_mlp_norm');
        } else {
          add('pre_mlp_norm', 'dense_mlp'); add('dense_mlp', 'dense_gate_up'); add('dense_gate_up', 'dense_silu'); add('dense_silu', 'dense_down'); add('dense_down', 'post_mlp_norm');
          if (state.collapsedModules.has('moe_ffn')) {
            add('pre_mlp_norm', 'moe_ffn'); add('moe_ffn', 'post_mlp_norm');
          } else {
            add('pre_mlp_norm', 'router_gate'); add('router_gate', 'route_topk'); add('route_topk', 'routed_expert_bank');
            add('expert_parallel_state', 'routed_expert_bank', true); add('pre_mlp_norm', 'shared_expert_mlp');
            add('routed_expert_bank', 'moe_combine'); add('shared_expert_mlp', 'moe_combine'); add('moe_combine', 'post_mlp_norm');
          }
        }
        add('post_mlp_norm', 'block_post_norm'); add('block_post_norm', 'final_norm');
      }
      add('final_norm', 'lm_head'); add('lm_head', 'logits');
      if (state.collapsedModules.has('mtp_module')) {
        add('final_norm', 'mtp_module', true);
      } else {
        add('token_embedding', 'mtp_input_norms', true); add('final_norm', 'mtp_input_norms', true);
        add('mtp_input_norms', 'mtp_eh_proj'); add('mtp_eh_proj', 'mtp_decoder_layer'); add('mtp_decoder_layer', 'mtp_shared_head'); add('mtp_shared_head', 'mtp_logits');
      }
      const maxBottom = Math.max(900, ...graphNodes.map((node) => node.y + node.height / 2));
      const maxRight = Math.max(1180, ...graphNodes.map((node) => node.x + node.width / 2));
      return { width: Math.round(Math.max(1280, maxRight + 90)), height: Math.round(maxBottom + 80), clusters, nodes: graphNodes, edges };
    }

    function fallbackGraph(schema) {
      const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
      const graphNodes = nodes.map((node, index) => {
        const layout = schema.visual_layout?.nodes?.[node.id] || { x: 220 + (index % 4) * 250, y: 120 + Math.floor(index / 4) * 110 };
        return { id: node.id, label: node.label || node.id, kind: graphKind(node.kind), typeLabel: typeLabel(node.kind), x: layout.x, y: layout.y, width: 210, height: 54, colorKey: fallbackColorKey(node) };
      });
      const ids = new Set(graphNodes.map((node) => node.id));
      return {
        width: 1280,
        height: Math.max(720, Math.ceil(nodes.length / 4) * 118 + 180),
        clusters: [],
        nodes: graphNodes,
        edges: (schema.edges || []).filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ source: edge.source, target: edge.target })),
      };
    }

    function buildGraphFromSchema(schema) {
      return isOpenPanguSchema(schema) ? buildOpenPanguGraph(schema) : fallbackGraph(schema);
    }

    function createSvg(tag, attrs = {}) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.entries(attrs).forEach(([key, value]) => {
        if (value !== undefined && value !== null) element.setAttribute(key, value);
      });
      return element;
    }

    function getNode(id) {
      return (state.schema?.nodes || []).find((node) => node.id === id);
    }

    function setModuleCollapsed(moduleId, collapsed) {
      if (!COLLAPSIBLE[moduleId]) return;
      if (collapsed) state.collapsedModules.add(moduleId);
      else state.collapsedModules.delete(moduleId);
      state.selectedNodeId = moduleId;
      renderAll(`${getNode(moduleId)?.label || moduleId} ${collapsed ? 'collapsed' : 'expanded'}.`, { preserveZoom: true });
    }

    function appendOverlayToggle(svg, x, y, moduleId, collapseAction) {
      const node = getNode(moduleId);
      const group = createSvg('g', {
        class: 'opv-overlay-toggle',
        transform: `translate(${x}, ${y})`,
        role: 'button',
        tabindex: '0',
        'data-module-id': moduleId,
      });
      group.setAttribute('aria-label', `${node?.label || moduleId} ${collapseAction ? 'collapse' : 'expand'}`);
      group.appendChild(createSvg('circle', { class: 'opv-toggle-hit', cx: 0, cy: 0, r: 18 }));
      group.appendChild(createSvg('circle', { cx: 0, cy: 0, r: 7.5 }));
      const icon = createSvg('text', { x: 0, y: 0.2 });
      icon.textContent = collapseAction ? '-' : '+';
      group.appendChild(icon);
      group.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      group.addEventListener('pointerup', (event) => {
        event.stopPropagation();
      });
      group.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setModuleCollapsed(moduleId, collapseAction);
      });
      group.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        setModuleCollapsed(moduleId, collapseAction);
      });
      svg.appendChild(group);
    }

    function appendRepeatTag(svg, x, y, text) {
      const group = createSvg('g', { class: 'opv-repeat-tag', transform: `translate(${x}, ${y})`, 'pointer-events': 'none' });
      const width = Math.max(64, text.length * 7 + 18);
      group.appendChild(createSvg('rect', { x: 0, y: -9, width, height: 18, rx: 9, ry: 9, fill: 'color-mix(in srgb, var(--opv-panel-bg) 84%, var(--opv-accent))', stroke: 'color-mix(in srgb, var(--opv-border-strong) 68%, var(--opv-accent))', 'stroke-width': '0.9px' }));
      const label = createSvg('text', { x: width / 2, y: 0 });
      label.textContent = text;
      group.appendChild(label);
      svg.appendChild(group);
    }

    function appendToggleOverlay() {
      const svg = state.svg;
      if (!svg || !state.graph || !isOpenPanguSchema(state.schema)) return;
      state.graph.clusters.forEach((cluster) => {
        const moduleId = MODULE_BY_CLUSTER[cluster.id];
        if (!moduleId) return;
        appendOverlayToggle(svg, cluster.x + cluster.width - 13, cluster.y + 13, moduleId, true);
      });
      state.graph.nodes.forEach((node) => {
        if (!COLLAPSIBLE[node.id] || !state.collapsedModules.has(node.id)) return;
        appendOverlayToggle(svg, node.x + node.width / 2 - 14, node.y, node.id, false);
      });
      const decoderBox = state.graph.clusters.find((cluster) => cluster.id === 'decoder-stack');
      if (decoderBox) appendRepeatTag(svg, decoderBox.x + 16, decoderBox.y + 42, 'repeat 0-45');
      const attentionBox = state.graph.clusters.find((cluster) => cluster.id === 'attention-block');
      if (attentionBox) appendRepeatTag(svg, attentionBox.x + 16, attentionBox.y + 42, 'MoME local context');
      const ffnBox = state.graph.clusters.find((cluster) => cluster.id === 'ffn-block');
      if (ffnBox) appendRepeatTag(svg, ffnBox.x + 16, ffnBox.y + 42, 'Dense 0-1 / MoE 2-45');
      const moeBox = state.graph.clusters.find((cluster) => cluster.id === 'moe-block');
      if (moeBox) appendRepeatTag(svg, moeBox.x + 16, moeBox.y + 42, 'layers 2-45');
      const moeNode = state.graph.nodes.find((node) => node.id === 'moe_ffn');
      if (moeNode) {
        appendRepeatTag(svg, moeNode.x - moeNode.width / 2, moeNode.y + 44, 'MoE 2-45');
      }
      const mtpBox = state.graph.clusters.find((cluster) => cluster.id === 'mtp-stack');
      if (mtpBox) appendRepeatTag(svg, mtpBox.x + 16, mtpBox.y + 42, 'draft branch');
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    }

    function tensorSummary(edge) {
      const tensor = edge.tensor || {};
      const parts = [];
      if (tensor.name) parts.push(tensor.name);
      if (tensor.shape) parts.push(tensor.shape);
      if (tensor.dtype) parts.push(tensor.dtype);
      if (Array.isArray(tensor.constraints) && tensor.constraints.length) parts.push(tensor.constraints.join(', '));
      return parts.join(' | ') || edge.label || 'tensor';
    }

    function renderInspector() {
      const node = getNode(state.selectedNodeId);
      const title = document.getElementById('inspectorTitle');
      const sub = document.getElementById('inspectorSub');
      const body = document.getElementById('inspectorBody');
      if (!node) {
        title.textContent = 'No selection';
        sub.textContent = 'Select a node or cluster.';
        body.innerHTML = '';
        return;
      }
      title.textContent = node.label || node.id;
      sub.textContent = `${typeLabel(node.kind)} / ${node.module_type || node.op_type || node.state_type || node.role || node.id}`;
      const attrs = node.attrs ? JSON.stringify(node.attrs, null, 2) : '{}';
      const edges = (state.schema.edges || []).filter((edge) => edge.source === node.id || edge.target === node.id);
      const provenance = node.provenance || [];
      body.innerHTML = `
        <section class="opv-section">
          <div class="opv-section-title">Node</div>
          <dl class="opv-kv">
            <dt>ID</dt><dd>${escapeHtml(node.id)}</dd>
            <dt>Kind</dt><dd>${escapeHtml(node.kind)}</dd>
            <dt>Type</dt><dd>${escapeHtml(node.module_type || node.op_type || node.state_type || node.role || '')}</dd>
          </dl>
        </section>
        <section class="opv-section">
          <div class="opv-section-title">Attributes</div>
          <pre class="opv-code">${escapeHtml(attrs)}</pre>
        </section>
        <section class="opv-section">
          <div class="opv-section-title">Edges</div>
          <div class="opv-edge-list">
            ${edges.slice(0, 10).map((edge) => `<div class="opv-edge-row"><strong>${escapeHtml(edge.source)}</strong> to <strong>${escapeHtml(edge.target)}</strong><br>${escapeHtml(tensorSummary(edge))}</div>`).join('') || '<div class="opv-edge-row">No direct tensor edge.</div>'}
          </div>
        </section>
        <section class="opv-section">
          <div class="opv-section-title">Provenance</div>
          <pre class="opv-code">${escapeHtml(JSON.stringify(provenance, null, 2))}</pre>
        </section>
      `;
    }

    function syncSelection() {
      document.querySelectorAll('#graphStage .pto-model-graphviz-node, #graphStage .pto-model-graphviz-cluster').forEach((group) => {
        group.classList.toggle('is-selected', group.dataset.nodeId === state.selectedNodeId);
      });
      renderInspector();
    }

    function selectNode(id) {
      if (!id) return;
      state.selectedNodeId = id;
      syncSelection();
      setStatus(`Selected ${getNode(id)?.label || id}.`);
    }

    function wireGraphSelection() {
      const nodeEls = Array.from(document.querySelectorAll('#graphStage .pto-model-graphviz-node'));
      nodeEls.forEach((group, index) => {
        const graphNode = state.graph.nodes[index];
        if (!graphNode) return;
        group.dataset.nodeId = graphNode.id;
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', graphNode.label);
        group.addEventListener('click', () => selectNode(graphNode.id));
        group.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectNode(graphNode.id);
          }
        });
      });
      const clusterEls = Array.from(document.querySelectorAll('#graphStage .pto-model-graphviz-cluster'));
      clusterEls.forEach((group, index) => {
        const cluster = state.graph.clusters[index];
        const moduleId = MODULE_BY_CLUSTER[cluster?.id];
        if (!cluster || !moduleId) return;
        group.dataset.nodeId = moduleId;
        group.setAttribute('tabindex', '0');
        group.setAttribute('role', 'button');
        group.setAttribute('aria-label', cluster.label);
        group.addEventListener('click', () => selectNode(moduleId));
      });
      syncSelection();
    }

    function clampZoom(value) {
      return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
    }

    function applyTransform() {
      const svg = state.svg || document.querySelector('#graphStage svg');
      if (!svg || !state.graph) return;
      svg.style.width = `${state.graph.width}px`;
      svg.style.height = `${state.graph.height}px`;
      svg.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.zoom})`;
    }

    function computeFitZoom() {
      const stage = document.getElementById('graphStage');
      const availableWidth = Math.max(640, stage.clientWidth - 72);
      const availableHeight = Math.max(640, stage.clientHeight - 72);
      return clampZoom(Math.min(1.05, Math.min(availableWidth / state.graph.width, availableHeight / state.graph.height)));
    }

    function centerView() {
      const stage = document.getElementById('graphStage');
      state.tx = (stage.clientWidth - state.graph.width * state.zoom) / 2;
      state.ty = Math.max(24, (stage.clientHeight - state.graph.height * state.zoom) / 2);
      applyTransform();
    }

    function zoomAtStagePoint(factor, px, py) {
      const z0 = state.zoom;
      const z1 = clampZoom(z0 * factor);
      if (z1 === z0) return;
      state.tx = px - (px - state.tx) * (z1 / z0);
      state.ty = py - (py - state.ty) * (z1 / z0);
      state.zoom = z1;
      applyTransform();
      setStatus(`Zoom ${Math.round(state.zoom * 100)}%.`);
    }

    function renderAll(message = 'Schema loaded.', options = {}) {
      const previous = { zoom: state.zoom, tx: state.tx, ty: state.ty };
      state.graph = buildGraphFromSchema(state.schema);
      const stage = document.getElementById('graphStage');
      state.svg = window.PtoModelGraphvizPattern.render(stage, state.graph, { ariaLabel: 'openPangu architecture graph' });
      appendToggleOverlay();
      wireGraphSelection();
      if (options.preserveZoom) {
        state.zoom = previous.zoom;
        state.tx = previous.tx;
        state.ty = previous.ty;
        applyTransform();
      } else {
        state.zoom = computeFitZoom();
        centerView();
      }
      setStatus(message);
    }

    function initPanZoom() {
      const stage = document.getElementById('graphStage');
      stage.addEventListener('wheel', (event) => {
        event.preventDefault();
        const rect = stage.getBoundingClientRect();
        zoomAtStagePoint(event.deltaY < 0 ? 1.09 : 0.92, event.clientX - rect.left, event.clientY - rect.top);
      }, { passive: false });
      stage.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        state.pan = { startX: event.clientX, startY: event.clientY, tx: state.tx, ty: state.ty, moved: false };
        stage.classList.add('is-panning');
        stage.setPointerCapture(event.pointerId);
      });
      stage.addEventListener('pointermove', (event) => {
        if (!state.pan) return;
        const dx = event.clientX - state.pan.startX;
        const dy = event.clientY - state.pan.startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) state.pan.moved = true;
        state.tx = state.pan.tx + dx;
        state.ty = state.pan.ty + dy;
        applyTransform();
      });
      stage.addEventListener('pointerup', (event) => {
        if (state.pan?.moved) state.suppressClick = true;
        state.pan = null;
        stage.classList.remove('is-panning');
        try { stage.releasePointerCapture(event.pointerId); } catch (_) {}
        window.setTimeout(() => { state.suppressClick = false; }, 0);
      });
    }

    async function loadDefaultSchema() {
      const response = await fetch('./model_architecture.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.schema = await response.json();
      renderAll('Default openPangu schema loaded.');
    }

    document.getElementById('zoomIn').addEventListener('click', () => {
      const stage = document.getElementById('graphStage');
      zoomAtStagePoint(1.14, stage.clientWidth / 2, stage.clientHeight / 2);
    });
    document.getElementById('zoomOut').addEventListener('click', () => {
      const stage = document.getElementById('graphStage');
      zoomAtStagePoint(0.88, stage.clientWidth / 2, stage.clientHeight / 2);
    });
    document.getElementById('zoomReset').addEventListener('click', () => {
      state.zoom = computeFitZoom();
      centerView();
      setStatus(`Fit ${Math.round(state.zoom * 100)}%.`);
    });
    document.getElementById('themeToggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      renderAll(`${next} theme.`, { preserveZoom: true });
    });
    document.getElementById('schemaFileInput').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.schema = JSON.parse(await file.text());
        state.selectedNodeId = null;
        state.collapsedModules = new Set(DEFAULT_COLLAPSED);
        renderAll(`Loaded ${file.name}.`);
      } catch (error) {
        setStatus(`Could not load JSON: ${error.message}`);
      }
    });
    window.addEventListener('resize', () => {
      if (!state.graph) return;
      state.zoom = computeFitZoom();
      centerView();
    });
    initPanZoom();
    loadDefaultSchema().catch((error) => {
      setStatus(`Could not load default schema over fetch: ${error.message}. Use a local server or Open JSON.`);
    });
  </script>
</body>
</html>
"""


def write_outputs(schema: dict) -> None:
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    graph = build_graph(schema)
    (OUTPUTS / "model_architecture.json").write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUTPUTS / "model_architecture_graph.json").write_text(json.dumps(graph, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUTPUTS / "model_architecture_validation.md").write_text(validation_markdown(schema), encoding="utf-8")
    html = HTML
    replacements = {
        "__NODE_SPEC__": json.dumps(NODE_SPEC, ensure_ascii=False),
        "__GROUPS__": json.dumps(GROUPS, ensure_ascii=False),
        "__MODULE_BY_CLUSTER__": json.dumps(MODULE_BY_CLUSTER, ensure_ascii=False),
        "__COLLAPSIBLE__": json.dumps(COLLAPSIBLE, ensure_ascii=False),
        "__DEFAULT_COLLAPSED__": json.dumps(sorted(DEFAULT_COLLAPSED), ensure_ascii=False),
    }
    for token, value in replacements.items():
        html = html.replace(token, value)
    (OUTPUTS / "model_architecture_graphviz.html").write_text(html, encoding="utf-8")


def main() -> None:
    schema = build_schema()
    write_outputs(schema)
    print(f"Wrote artifacts to {OUTPUTS}")


if __name__ == "__main__":
    main()
