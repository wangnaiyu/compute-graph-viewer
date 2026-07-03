# 从图编译到性能诊断：PTO 构建 Ascend/CANN 开发者证据工作台

日期：2026-06-09  
定位：Ascend/CANN 开发者体验与证据工作台设计汇报  
受众：产品、设计、工程、平台工具链相关负责人

---

## 1. 核心结论

PTO 的整体价值，不是做了若干可视化页面，而是围绕 Ascend/CANN 开发链路，建立了一套跨层证据工作台。

Ascend/CANN 的真实开发过程从模型图进入编译开始，经过 GE/ATC/Pass、Ascend C/Tiling、Kernel 与硬件路径、运行时 schedule 与片上内存，最后进入 Profiling 报告和性能调优。PTO 的产品主线，应当严格沿着这条链路展开：

> 图编译证据 -> Tiling 参数证据 -> 硬件路径证据 -> 内存与执行证据 -> Profiling 诊断证据 -> 设计系统与场景外延

这条主线能把现有成果从“页面集合”组织成“开发者证据链”，也能解释每个模块为什么存在、服务哪个开发断点、下一步如何产品化。

---

## 2. Ascend/CANN 开发链路中的断点

### 2.1 图编译断点

开发者能看到 pass 产物，但难以理解某个 pass、某条 PATH、某个 snapshot 如何改变图结构。

PTO 对应能力：Pass-IR、Graphviz overlay、Model Architecture。

### 2.2 参数设计断点

Tiling 能输出 TilingData、blockDim、TilingKey、workspace，但开发者需要理解这些参数如何由 shape、attr 和硬件约束推导。

PTO 对应能力：Tiling 可视化工作台、算子开发辅助页。

### 2.3 硬件路径断点

代码行、intrinsic、SIMD/SIMT/Hybrid 判断与 AI Core 硬件路径之间缺少可验证关系。

PTO 对应能力：Ascend 950 路径迁移工作台、Kernel 指令可视化。

### 2.4 内存与执行断点

运行时 op、task、tensor、buffer、MTE route、Before/After diff 之间缺少统一的定位方式。

PTO 对应能力：Memory Viewer、Swimlane、Execution Overlay、PMU。

### 2.5 Profiling 诊断断点

性能报告能给出结论，但结论需要回到图节点、runtime task、时间线、Inspector 和验证指标。

PTO 对应能力：Graph Evidence Workbench、MindStudioNext、TOP issue 分析。

---

## 3. 官方文档锚点

### 3.1 CANN / GE / ATC 定义图证据边界

官方文档将 GE/ATC 定义为图编译与运行控制中心，承担图优化、图编译、图执行控制以及模型转换职责。

对应设计要求：PTO 的第一层应是图编译证据，而不是直接进入单个算子或 Tiling。Pass、PATH、snapshot、graph diff 是后续所有证据的结构锚点。

### 3.2 Ascend C / Tiling 定义参数证据边界

Host 侧 Tiling 的官方流程是从 shape、输入输出和属性信息出发，计算并输出 TilingData、blockDim、TilingKey、workspace，再由 kernel 侧消费这些参数。

对应设计要求：Tiling 不是孤立的 3D 视觉，而是图编译之后、Kernel 执行之前的参数因果层。

### 3.3 AI Core 架构定义硬件证据边界

官方文档将 AI Core 拆为计算单元、存储单元和搬运单元：Cube/Vector/Scalar，L1/L0A/L0B/L0C/UB/FixPipe Buffer，MTE1/MTE2/MTE3/FixPipe 等。

对应设计要求：硬件路径图、Memory Viewer、MTE route 高亮必须成为主证据，而不是辅助插图。

### 3.4 Profiling 定义诊断证据边界

官方 Profiling 文档强调性能数据采集、落盘、解析与可视化分析。真实调优需要从报告结论回到节点、任务、时间线和验证指标。

对应设计要求：Profiling 页面必须完成从报告结论到图节点、runtime task、修复动作的闭环。

---

## 4. 汇报主线

本次汇报按 Ascend/CANN 开发链路组织，而不是按模块清单组织。

| 顺序 | 链路层级 | PTO 成果 | 解决的核心断点 |
| --- | --- | --- | --- |
| 01 | 图编译证据 | Pass-IR / Graphviz / Model Architecture | 编译过程如何改变图结构 |
| 02 | 参数证据 | Tiling 工作台 | shape/attr 如何推导 Tiling 参数 |
| 03 | 硬件路径证据 | 950 路径迁移工作台 | 代码行如何映射 AI Core 路径 |
| 04 | 片上内存证据 | Memory Viewer | schedule 如何投射到 L1/L0/UB/MTE |
| 05 | 执行时间证据 | Swimlane | task 如何对比、下钻、回到源码 |
| 06 | Profiling 诊断证据 | Graph Evidence / MindStudioNext | 报告结论如何回到图和时间线 |
| 07 | 系统一致性 | PTO Design System | 跨模块证据如何保持连续体验 |
| 08 | 场景外延 | Training Twin | 证据工作台方法如何扩展到训练运行 |

---

## 5. 核心设计策略

### 5.1 图编译证据：Pass-IR 是证据链源头

Pass-IR 的价值不是“看图”，而是把 pass folder、Before/After、PATH、snapshot、loop/unroll 组织为编译时间线。它回答的是：图结构在编译过程中如何变化。

产品意义：为 Tiling、执行、内存和 Profiling 提供统一结构锚点。

### 5.2 参数证据：Tiling 把参数从结果变成因果

Tiling 工作台把 shape/attr 到 TilingData、blockDim、TilingKey、workspace 的关系显性化。3D tensor 视觉用于辅助理解参数推导，而不是替代因果解释。

产品意义：降低算子开发者理解和调整 Tiling 参数的成本。

### 5.3 硬件路径证据：950 工作台建立建议可信度

950 工作台从代码行出发，同步高亮硬件路径，并通过证据区解释 SIMD/SIMT/Hybrid 判断、指标影响和改写建议。

产品意义：将“系统建议”转化为可验证的硬件路径判断。

### 5.4 内存证据：Memory Viewer 把 schedule 落到片上层级

Memory Viewer 把 operation schedule 映射到计算图节点状态、L1/L0/UB buffer 占用和 MTE 路径高亮。

产品意义：让执行步骤与片上内存层级建立直接证据关系。

### 5.5 执行证据：Swimlane 把 task 变成可下钻对象

Swimlane 把任务时间线、Before/After、Diff、目录导入、Program 绑定和 Source Flow 联动，组织成执行证据层。

产品意义：让一次执行任务能够回到 IR、源码和前后对比。

### 5.6 诊断证据：Graph Evidence 完成 Profiling 闭环

Graph Evidence 把 Profiling 报告中的问题映射到图节点、Inspector、泳道任务和 trace step，形成空间证据与时间证据的统一选中态。

产品意义：让性能报告从静态结论变成可定位、可下钻、可验证的诊断工作台。

### 5.7 系统一致性：设计系统保证证据链连续

设计系统将 workbench、visualization、whitepaper 三类表面拆清楚，并通过 tokens 与 patterns 控制跨模块视觉和交互漂移。

产品意义：降低用户在不同工具之间重新学习界面的成本。

### 5.8 场景外延：Training Twin 扩展证据工作台方法

Training Twin 把训练学习、脚本体检、运行状态解释和 what-if 推演连成从“看懂模型”到“看懂一次 run”的体验。

产品意义：将 PTO 的证据工作台方法扩展到大模型训练开发场景。

---

## 6. PPT 页结构

| 页 | 标题 | 作用 |
| --- | --- | --- |
| 01 | 从图编译到性能诊断：PTO 构建 Ascend/CANN 开发者证据工作台 | 封面定位 |
| 02 | PTO 的主线是把 Ascend/CANN 开发链路逐层证据化 | 建立整体脉络 |
| 03 | 官方文档给 PTO 划出了 5 条证据链 | 官方锚点 |
| 04 | PTO 现有成果覆盖从编译到调优的完整证据矩阵 | 项目能力地图 |
| 05 | 证据工作台的设计策略：工程判断、官方锚点、证据对象、交互机制、复用模式 | 设计治理标准 |
| 06 | 八个核心策略按开发链路展开，而不是按页面集合排列 | 总览矩阵 |
| 07 | Pass-IR 把 pass folder 变成编译时间线 | 图编译证据 |
| 08 | Tiling 从参数结果变成因果解释 | 参数证据 |
| 09 | 950 工作台用代码行建立硬件路径信任链 | 硬件路径证据 |
| 10 | Memory Viewer 把 schedule 映射到片上内存状态 | 内存证据 |
| 11 | Swimlane 让执行任务可以对比、下钻和回到源码 | 执行证据 |
| 12 | Graph Evidence 把 Profiling 报告转成图和时间证据 | 诊断证据 |
| 13 | 设计系统让所有工具像同一条链路 | 系统一致性 |
| 14 | Training Twin 把学习页推进到真实 run 解释 | 场景外延 |
| 15 | 下一阶段从成果矩阵收束成 Evidence Workbench | 产品化路线 |
| 16 | PTO 下一阶段聚焦统一数据、统一联动、统一证据 | 推进建议 |

---

## 7. 下一阶段推进建议

### 7.1 建立统一 evidence schema

将 graph、nodeInfo、problemMap、trace、inspector、coverage 等对象抽象为最小公共模型，降低每个原型继续手写数据结构的成本。

### 7.2 建立统一联动协议

将 selection、filter、step、focus 等状态抽象为跨模块事件协议，使图、泳道、Inspector、硬件路径和源码视图可以稳定联动。

### 7.3 建立核心 pattern 库

优先沉淀 model graph node、swimlane task、memory architecture、hardware route、inspector panel 等高复用图元。

### 7.4 收束为 Evidence Workbench

以 Graph Evidence 的三面板结构为基础，逐步吸收 Pass-IR、Tiling、Hardware Route、Memory Viewer 和 Swimlane 的核心能力，形成统一主工作台。

---

## 8. 参考官方文档

- CANN 是什么：https://www.hiascend.com/document/detail/zh/canncommercial/800/quickstart/quickstart/releasenote_0000.html/
- 什么是 Ascend C：https://www.hiascend.com/document/redirect/CANNCommunityOpdevAscendc
- Host 侧 Tiling 实现：https://www.hiascend.com/document/detail/zh/canncommercial/80RC3/developmentguide/opdevg/Ascendcopdevg/atlas_ascendc_10_0068.html
- Ascend C 基本架构：https://www.hiascend.com/document/detail/zh/CANNCommunityEdition/850alpha002/opdevg/Ascendcopdevg/atlas_ascendc_10_0008.html
- Ascend C TPosition 与物理内存映射：https://www.hiascend.com/document/detail/en/canncommercial/800/apiref/ascendcopapi/atlasascendc_api_07_0004.html
- ATC 工具介绍：https://www.hiascend.com/document/detail/zh/CANNCommunityEdition/850/devaids/atctool/atlasatc_16_0005.html
- Profiling 工具简介：https://www.hiascend.com/document/detail/zh/CANNCommunityEdition/850alpha002/devaids/Profiling
