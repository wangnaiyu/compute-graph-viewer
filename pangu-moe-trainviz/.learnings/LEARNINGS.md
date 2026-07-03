## [LRN-20260629-001] correction

**Logged**: 2026-06-29T11:02:59+08:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
For model training parallelism facts, search primary papers in addition to public model repos and inference runtimes.

### Details
The user corrected a prior answer that said no public training PP/DP/EP configuration was available for Pangu MoE. That conclusion was too broad: the openPangu/GitCode model repos and Omni-Infer runtime did not disclose training config, but the arXiv paper `2505.21411v1` does disclose `TP=8`, `EP=2`, `PP=5`, `VPP=5`, `CP=1`; `DP` remains not explicitly disclosed and can only be derived approximately from `4K Ascend NPUs`.

### Suggested Action
When asked whether training configuration is public, separately report: repo artifacts, inference scripts, primary paper disclosures, and derived quantities. Do not infer "not public" from repo absence alone.

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/SPEC-op-rank-time-A.md
- Tags: pangu, moe, search-strategy, primary-sources, training-parallelism

---

## [LRN-20260701-001] correction

**Logged**: 2026-07-01T15:19:46+08:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
For PTO page-branch requests, produce the requested planning/spec artifact before proposing implementation or editing pages.

### Details
The user asked for suggestions and then a data spec for an EP expert-parallel page. I prematurely moved toward creating a new page and framed the proposal as a lightweight teaching page, underusing the existing Pangu MoE 72B assets. The correct direction is to reuse current Pangu model data, rank/time resources, and existing visualization objects, allow a 2D side-view simplification, and enrich the data model with all EP/FSDP/TP metrics and objects from the referenced tutorial.

### Suggested Action
When a user asks for "建议" or "数据 spec md", first deliver the spec/recommendation artifact. Do not start implementation unless explicitly requested. Reuse existing module data contracts and call out where source tutorial examples must be adapted to the target model's constants.

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/SPEC-ep-expert-parallel-2d.md
- Tags: pto, pangu, ep, spec-first, user-intent

---

## [LRN-20260701-002] correction

**Logged**: 2026-07-01T16:05:00+08:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
For this Pangu EP page, the local model target is arXiv v2 Pangu Pro MoE 72BA16B, not a separate local 80-expert variant.

### Details
The user clarified that the local model should also be unified to `https://arxiv.org/html/2505.21411v2`. The prior spec kept `op-rank-time.html` constants as a `localDemo` variant, but those constants are legacy values to replace, not a valid second target model. The unified source facts are 48 transformer layers, 2 no-op training slots, 64 routed experts, Top-8, 4 shared experts, and training `TP8/EP2/CP1/PP5/VPP5`.

### Suggested Action
For this module, treat `op-rank-time.html` as layout/interaction reuse only. Do not preserve `openPangu-R-72B-2512`, `50 decoder layers`, `L0-L3 Dense`, `L4-L49 MoE`, or `80 routed experts` as target data unless the user explicitly asks for a historical comparison.

### Metadata
- Source: user_feedback
- Related Files: /Users/yin/pto/pangu-moe-trainviz/SPEC-ep-expert-parallel-2d.md
- Tags: pangu, moe, arxiv-v2, source-of-truth, local-data

---
