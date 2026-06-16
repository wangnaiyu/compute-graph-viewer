# TrainScope 用研输入作用分析

## 核心判断

这套 user research 知识库在这次优化里起到的不是“直接生成设计方案”，而是三件更关键的事：校准问题、发现漏项、约束优先级。它把 TrainScope 从一个“事故复盘 demo”推向了“实时训练透视工具”。

## 具体作用

<table>
  <thead>
    <tr>
      <th>作用</th>
      <th>研究库提供了什么</th>
      <th>设计上发生了什么</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1. 验证核心命题</td>
      <td>用研反复指向“工具割裂、根因不可见、迁移漂移、人工搬上下文”这条主痛点链：<a href="/Users/yin/cann-user-research-cc/design-brief-昇腾CANN.md:14">design-brief-昇腾CANN.md</a></td>
      <td>before 已有“五层证据一屏闭环”雏形：<a href="/Users/yin/pto/pangu-moe-trainviz/SPEC-archive.md:32">SPEC-archive.md</a>；after 把它升级成“统一 step/phase + 双轴对上号”的实时工具：<a href="/Users/yin/pto/pangu-moe-trainviz/SPEC.md:4">SPEC.md</a></td>
    </tr>
    <tr>
      <td>2. 发现 scope 级漏项</td>
      <td>跨硬件 <code>NVIDIA↔Ascend</code> 精度对齐被研究定为 <code>P0</code> 横切：<a href="/Users/yin/cann-user-research-cc/design-brief-昇腾CANN.md:34">design-brief-昇腾CANN.md</a></td>
      <td>after 明确补上 <code>C6</code>“跨硬件精度对齐”，并放到二期最高优先：<a href="/Users/yin/pto/pangu-moe-trainviz/PRD-训练透视.md:106">PRD-训练透视.md</a></td>
    </tr>
    <tr>
      <td>3. 推动 demo → 产品化</td>
      <td>INSIGHT 明确指出旧版是单一已烘焙事故，缺真实数据、自动诊断、任意 run 接入：<a href="/Users/yin/Downloads/INSIGHT-ANALYSIS.md:76">INSIGHT-ANALYSIS.md</a></td>
      <td>after 从“展览馆”改成“监护仪”：实时偏差、根因、调整建议、数据接入层：<a href="/Users/yin/pto/pangu-moe-trainviz/PRD-训练透视.md:17">PRD-训练透视.md</a></td>
    </tr>
    <tr>
      <td>4. 把痛点翻译成功能</td>
      <td>用研诉求是统一观测、根因直出、自动诊断、跨硬件比对：<a href="/Users/yin/cann-user-research-cc/design-brief-昇腾CANN.md:84">design-brief-昇腾CANN.md</a></td>
      <td>after 变成 <code>C1</code> 偏差雷达、<code>C2</code> 双轴追溯、<code>C3</code> 根因直出、<code>C4</code> 调整建议、<code>C5</code> 统一 step 轴、<code>C6</code> 跨硬件精度：<a href="/Users/yin/pto/pangu-moe-trainviz/PRD-训练透视.md:95">PRD-训练透视.md</a></td>
    </tr>
    <tr>
      <td>5. 帮你重排优先级</td>
      <td>INSIGHT 认为显存维度依据弱，跨硬件迁移依据最强：<a href="/Users/yin/Downloads/INSIGHT-ANALYSIS.md:140">INSIGHT-ANALYSIS.md</a></td>
      <td>after 明确“跨硬件迁移提到最前、显存往后挪”：<a href="/Users/yin/pto/pangu-moe-trainviz/PRD-训练透视.md:196">PRD-训练透视.md</a></td>
    </tr>
    <tr>
      <td>6. 限定边界</td>
      <td>研究同时暴露很多生态痛点，但 INSIGHT 判断不该由这个工具兜底：<a href="/Users/yin/Downloads/INSIGHT-ANALYSIS.md:15">INSIGHT-ANALYSIS.md</a></td>
      <td>after 明确不做 profiler、文档、IDE、社区、算子转写：<a href="/Users/yin/pto/pangu-moe-trainviz/SPEC.md:34">SPEC.md</a></td>
    </tr>
    <tr>
      <td>7. 建立证据诚实</td>
      <td>brief 明确 13 条 insight 都是 <code>unverified</code>：<a href="/Users/yin/cann-user-research-cc/design-brief-昇腾CANN.md:8">design-brief-昇腾CANN.md</a></td>
      <td>after 在 PRD/SPEC 里保留证据风险、真实数据缺口、自采/合成边界：<a href="/Users/yin/pto/pangu-moe-trainviz/SPEC.md:341">SPEC.md</a></td>
    </tr>
  </tbody>
</table>

## 哪些是主观设计输入

worklog 里能看出，很多关键 UX 语义不是 research 直接给的，而是设计判断把研究痛点“落成可用形态”：

- “双轴 + 一座桥”是产品/设计抽象，不是 research 原文。研究只说工具割裂、跨节点不可见；你把它翻译成计算轴、物理轴、关系层：[PRD-训练透视.md](</Users/yin/pto/pangu-moe-trainviz/PRD-训练透视.md:74>)。
- “不要跨轴连线，用 hover 联动高亮”是设计语义校正。它避免把运行时映射误画成静态架构边，后来进了 SPEC：[SPEC.md](/Users/yin/pto/pangu-moe-trainviz/SPEC.md:119)。
- `rank != card`、`EP` 不是独立乘数、`TP/PP/CP/DP/EP` 是 lens，这些是领域建模判断，不是用研结论：[SPEC.md](/Users/yin/pto/pangu-moe-trainviz/SPEC.md:135)。
- openPangu 718B、910B 物理轴、32 runtime EP buckets、真实逻辑轴数据源等，是你把“真实化/产品化”要求转成工程规格：[SPEC.md](/Users/yin/pto/pangu-moe-trainviz/SPEC.md:64)。

## 未来怎么在 UX Spec 层面稳定调用

建议把 user research 变成 UX spec 的“强制前置输入”，但不要让它直接决定 UI。

1. `Research Snapshot`
   输入哪些 brief / insight / analysis，覆盖哪些用户、场景、时间段，以及 `unverified / human-checked / validated` 证据等级。
2. `Research Trace Matrix`
   每个能力都写清楚：用户事实来自哪条 insight、设计响应是什么、阶段是 `MVP / P1 / out of scope`、证据等级是什么、明确不做什么以及为什么。
3. `主观判断单独标注`
   在 spec 中给每条关键判断打标签：`[R] research fact`、`[D] designer hypothesis`、`[L] leadership requirement`、`[E] engineering constraint`。
4. `两轮调用机制`
   第一轮 `wide scan` 找 `P0` 漏项和横切痛点；第二轮 `focused retrieval` 只围绕当前产品边界拉相关 insight，避免把文档、IDE、社区问题塞进训练透视。
5. `Spec Review Gate`
   每版 `PRD/SPEC` 提交前跑一次研究对照：有没有 `P0` 用户痛点没覆盖，有没有功能没有用户事实或明确设计假设支撑，有没有把 `unverified` 当成硬指标，有没有把应当 `out of scope` 的生态痛点误塞进来，roadmap 是否因研究证据重新排序。

## 一句话

这套知识库最稳定的用法，是让它做“问题事实层 + 优先级校准器 + scope 守门员”；具体交互、视觉、信息架构，仍然由设计判断负责，但必须在 spec 里显式标注它是 `[D]`，不能伪装成 `[R]`。
