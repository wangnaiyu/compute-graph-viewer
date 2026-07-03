# openPangu 2.0 Flash Architecture Sources

Downloaded for model architecture extraction on 2026-07-02.

## Repositories

- `openPangu-2.0-Flash`
  - Local path: `/Users/yin/pto/model-architecture/sources/openPangu-2.0-Flash`
  - Remote: `https://gitcode.com/ascend-tribe/openPangu-2.0-Flash.git`
  - Commit: `1676856`
  - Role: model config, tokenizer, model card, license, safetensors index and LFS pointer files.
  - Note: `.safetensors` files are Git LFS pointers in this local checkout, not full 92B weights.

- `openPangu-2.0-Infer`
  - Local path: `/Users/yin/pto/model-architecture/sources/openPangu-2.0-Infer`
  - Remote: `https://gitcode.com/ascend-tribe/openPangu-2.0-Infer.git`
  - Commit: `5c79ac6`
  - Role: inference implementation and Ascend/vLLM integration source.

## Source-Of-Truth Files

- `openPangu-2.0-Flash/config.json`
  - Runtime model config for openPangu-2.0-Flash.
  - Key facts: 46 hidden layers, 2560 hidden size, 48 attention heads, MLA dimensions, 256 routed experts, top-8 routing, 3 MTP layers, 512k max context, mHC enabled.

- `openPangu-2.0-Infer/components/omni-npu/src/omni_npu/v1/models/pangu/pangu_v2_moe.py`
  - Main model implementation.
  - Key classes: `OpenPanguV2MLP`, `OpenPanguV2MOE`, `OpenPanguV2DecoderLayer`, `OpenPanguV2Model`, `OpenPanguV2ForCausalLM`.

- `openPangu-2.0-Infer/components/omni-npu/src/omni_npu/v1/models/pangu/pangu_v2_moe_mtp.py`
  - Multi-token prediction implementation.
  - Key classes: `OpenPanguV2MultiTokenPredictorLayer`, `OpenPanguV2MultiTokenPredictor`, `OpenPanguV2MTP`.

- `openPangu-2.0-Flash/configuration_openpangu_v2.py`
  - HuggingFace config class and tensor/pipeline parallel plan.

## Supporting Files

- `openPangu-2.0-Flash/README.md`
  - Model card: 92B MoE, about 6B active parameters per token, 512k context, DSA+SWA, 4-stream mHC, 3-head MTP.

- `openPangu-2.0-Infer/README.md`
  - Deployment notes and `1P1D`/`92B_bf16_open` templates.

- `openPangu-2.0-Infer/tools/ansible/template/omni_infer_server_template_performance1P1D_92B_bf16_open.yml`
  - BF16 92B deployment template.

## Extraction Recommendation

Use `openPangu-2.0-Flash/config.json` as runtime config and `pangu_v2_moe.py` plus `pangu_v2_moe_mtp.py` as source skeleton. Treat README and ansible templates as supporting evidence only.
