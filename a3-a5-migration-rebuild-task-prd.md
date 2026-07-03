# A3/A5 算子迁移工作台重建任务 PRD

## 1. 任务背景

上一版 `a3-a5-migration-taxonomy` 页面不满足预期，主要问题不是单点样式，而是内容深度和任务执行流程都不够：

- 内容像“9 类差异清单”，没有达到 `/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html` 那种指导型教程深度。
- 页面初版没有先严格执行 PTO design-system skill 的 `SKILL.md`，导致外层 shell 起初没有使用 `ide-frame` pattern。
- Memory Architecture 被当成右侧基础图使用，但中间内容没有和真实算子开发路径、迁移决策、profiling 闭环建立足够强的关系。

本 PRD 用于删除旧输出后重新跑一版新项目。新项目必须从内容信息架构、PTO design-system 执行流程、交互结构三个层面重新开始。

## 2. 输入资料

### 2.1 必读本地资料

- 原始需求 PRD：`/Users/yin/pto/ascend-950-workbench-demo/FEATURE_TAXONOMY_PRD.md`
- 内容质量参考：`/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html`
- 950 课件抽取源：`/Users/yin/CANNvisual/950 ppt/导出md/`
- PTO design system：`/Users/yin/pto-design-system` 或当前 PTO vendor/design-system 映射目录
- Memory architecture pattern：`/Users/yin/pto-design-system/patterns/memory-architecture`

### 2.2 必读 skill

实现前必须打开并执行以下 `SKILL.md`，不能凭记忆或只复用局部 CSS：

- `/Users/yin/.codex/skills/pto-new-module-design-system/SKILL.md`
- `/Users/yin/.codex/skills/pto-mem-architecture-diagram/SKILL.md`

执行者需要在实现前输出或记录：

- 已读取的 skill 文件。
- UI pieces 到 design-system pattern 的映射。
- 是否命中 `ide-frame`、`memory-architecture`、`aic-core-object`、`aiv-core-object` 等 pattern。
- 是否有任何新视觉模式需要 preview gate。

## 3. 产品目标

做一个面向 A3/910B/910C 到 A5/Ascend 950 算子迁移的指导型工作台，而不是静态差异百科。

用户进入页面后应能回答：

1. 我手上的算子属于哪类迁移场景？
2. 这个迁移问题对应哪条 950 数据通路、内存层级或执行模型变化？
3. 我应该先读哪些课件页、看哪些术语、做哪些 profiling 验证？
4. 我应该选择 Ascend C、模板库、PyPTO/PTO、Triton-Ascend、TileLang 还是继续用高阶 API？
5. 如果要从 910B/A3 迁移到 950/A5，第一轮功能迁移、第二轮性能迁移、第三轮极致优化分别做什么？

## 4. 内容基准

新页面的内容深度以 `/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html` 为基准，必须吸收它的组织方式，但不要复制它的视觉风格。

必须保留这些内容结构能力：

- 一句话结论：先告诉用户“950 不是 910B 的算力增强版”，重点在数据通路、片上内存、低比特、SIMD/SIMT、RegBase、通算融合、CCU 和 profiling 闭环。
- 建议先读哪些课件：按 P0/P1/P2 给课件、页码、适合角色、阅读目的。
- 重点差异解读：围绕架构形态与存储子系统、Cube/Vector 协同、RegBase + SIMT/SIMD、低比特格式、通信硬化执行。
- 面向角色的路径：新手、已有 910B 经验的 Ascend C 开发者、Cube/GEMM、Vector/SIMT/RegBase、融合算子、通信/分布式、低比特/量化、工具链 profiling、PTO/ISA/编译器。
- 核心术语速查：CANN、Ascend C、Tiling、TPipe/TQue/TBuf、GM/UB/L1/L0、SIMD、SIMT、RegBase、NDDMA、HiF8、MXFP8/MXFP4、HCCL、CCU、CATLASS、ATVOSS、PTO ISA、msProf。
- 分层学习路线：架构地图、语言抽象层、Ascend C 核内流水、按角色深入、profiling 闭环。
- 面向实战的练习：Vector 基础、Matmul 基线与优化、RmsNormQuant 融合边界、Attention/FIA 数据流、ReduceScatter/AllGatherMatMul。
- 常见误区：把 950 当 910B 算力增强版、过早进入 PTO、只优化 Compute、不优化 Copy、把低比特当 dtype 替换、只看总耗时、忽略 API 层级兼容差异。

## 5. 信息架构

### 5.1 顶层工作台结构

页面必须是三栏工作台：

- 左侧：导航与过滤。
- 中间：主内容阅读与决策流。
- 右侧：Memory Architecture 架构证据图，并支持 Diff 小卡片叠加。

外层必须使用 PTO design system 的 `ide-frame` pattern：

- 根节点声明 `data-ide-frame`。
- 主 split 声明 `data-ide-split`。
- 左中右分别声明 `data-ide-pane`，建议命名为 explorer / editor-preview / inspector。
- 支持分栏拖拽和工作台式滚动区域。

### 5.2 左侧导航

左侧不只是 9 类差异列表，应包含两组导航：

- `迁移场景`
  - A3/A5 通用
  - A5 原生开发
  - A3-A5 迁移
  - 950 学习/选型
  - Profiling 验证
- `内容路径`
  - 一句话结论
  - 重点差异
  - 角色路径
  - 术语速查
  - 实战练习
  - 常见误区

左侧选择应联动中间内容与右侧架构高亮。

### 5.3 中间主内容

中间内容要从“表格清单”升级为“指导型迁移手册”。建议主内容按以下段落组织：

1. `结论 / Why it matters`
   - 950/A5 的变化核心。
   - 对已有 A3/910B 算子开发者意味着什么。
2. `A3/A5 差异总览`
   - 不是只列 9 类差异，而是按影响面分组：
     - 数据搬运与片上内存
     - Cube/Vector 协同
     - Vector 执行模型
     - 低比特与 scale
     - 通信与 CCU
     - 工具链与 profiling
3. `角色化迁移路径`
   - 每个角色包含：目标、先读资料、重点问题、输出物、不要一开始读什么。
4. `算子迁移检查清单`
   - 功能迁移检查。
   - 性能迁移检查。
   - 精度/低比特检查。
   - Profiling 检查。
5. `实战练习`
   - 每个练习包含适合角色、任务要求、架构图关注点、profiling 验收。
6. `误区与反例`
   - 用短句说明错误心智和正确做法。

每个内容段落必须尽量给出“对算子开发的影响”与“下一步动作”，避免只解释概念。

## 6. 右侧 Memory Architecture 与 Diff 叠加

右侧必须使用 `memory-architecture` pattern，不允许手写架构图 DOM。

默认显示 Ascend 950/950B 的 memory architecture：

- GM / L2
- AIC
- AIV
- L1 / L0A / L0B / L0C / UB
- Vector / SIMT / Scalar / DCache / ICache
- 关键路线：L0C -> UB、UB -> L1、L2 -> AIC/AIV、AIC/AIV 协同路径

Diff 按钮不是切换视图，而是在架构图上叠加小卡片。卡片应锚定到对应硬件区域，并能随中间内容选择而强调或淡化。

必须包含的 Diff 卡片：

- `UB Bank Topology`
  - A3：16 group * 3 bank * 4KB = 192KB
  - A5：8 group * 2 bank * 16KB = 256KB
  - 迁移含义：旧 bank conflict / 地址错位公式必须重查。
- `L0C -> UB`
  - A3：Cube 后处理常绕 GM/UB 或 workspace。
  - A5：新增 C-V 直连，减少中间拷贝。
- `UB -> L1`
  - A3：更多依赖 GM 中转。
  - A5：新增反向融合通路。
- `RegBase`
  - A3：Memory-based LocalTensor/UB。
  - A5：RegTensor、MaskReg、AddrReg、Load/Store。
- `SIMD + SIMT`
  - A3：SIMD 为主。
  - A5：SIMD/SIMT 混合，适合离散访存与复杂控制流。
- `Low-bit / MX / HiF8`
  - A3：低比特路径有限或非原生。
  - A5：MXFP8/MXFP4/HiF8 进入核心 Matmul/量化路径。
- `CCU / Communication`
  - A3：通信更多从 HCCL API 和软件调度看。
  - A5：CCU 硬化通信执行，需看通信 profiling 与片上带宽。
- `Profiling`
  - 从总耗时升级到 Pipe、PC Sampling、Reg、片上带宽、CCU profiling。

## 7. 交互要求

### 7.1 导航联动

- 点击左侧角色或内容段落时，中间内容切换或滚动到对应区域。
- 右侧架构图自动高亮对应节点和路线。
- Diff 开启时，相关卡片强调，无关卡片淡化但仍可见。

### 7.2 内容卡片行为

中间内容中的每个重点差异或角色路径应有：

- 结论。
- 影响对象。
- 推荐阅读资料。
- 迁移检查。
- 右侧架构证据入口。

### 7.3 搜索或快速定位

首版可做轻量搜索或 filter：

- 关键词：RegBase、SIMT、L0C2UB、UB2L1、NDDMA、HiF8、MXFP8、CCU、Profiling。
- 输入关键词后左侧和中间定位到相关条目，右侧高亮相关架构区域。

## 8. 内容映射数据模型

实现时建议用结构化数据驱动，不要把内容散落在 DOM 字符串里。

每个内容单元建议包含：

```js
{
  id: 'regbase-simt',
  title: 'Vector 从 Memory-based 走向 RegBase + SIMT/SIMD',
  scenario: 'A5 原生开发',
  roles: ['Vector / SIMT / RegBase 开发者', '已有 910B 经验的 Ascend C 开发者'],
  summary: 'A5 让 Vector 编程从 UB LocalTensor 扩展到显式寄存器与线程式执行模型。',
  sourceRefs: [
    { title: '面向新一代硬件，CANN技术架构的变与不变', pages: 'Page 5-9' },
    { title: '场景驱动下的算子编程语言选型', pages: 'Page 10-12' }
  ],
  developerImpact: [
    '检查是否能把中间结果停留在寄存器',
    '判断算子核心是规整表达式还是离散访存/复杂分支'
  ],
  checklist: [
    '是否使用 RegTensor / MaskReg / AddrReg',
    '是否存在 GM -> UB -> Reg 的显式搬运',
    '是否需要 SIMT/SIMD 混合'
  ],
  architectureFocus: {
    nodes: ['AIV.Vector', 'AIV.UB', 'AIV.SIMT', 'AIV.DCache'],
    routes: ['L2 -> AIV', 'UB -> Vector']
  }
}
```

## 9. 视觉与设计系统约束

新项目必须遵守 PTO design-system-first：

- 使用 `ide-frame` 作为页面 shell。
- 使用现有 button、tab、badge、pane、split、status strip 等系统组件。
- 使用 `memory-architecture`、`aic-core-object`、`aiv-core-object` pattern。
- 不允许新建私有按钮系统、私有 badge 系统、私有 panel 风格。
- 不允许直接复制 `/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html` 的白色文章视觉。
- 如果发现现有 design system 缺少某个必要组件，必须先做 preview gate，得到用户批准后再进入业务页。

## 10. 交付物

首版应交付：

- 新项目目录，例如 `/Users/yin/pto/a3-a5-operator-migration-workbench/`
- `index.html`
- `README.md`
- 如需结构化内容，可增加 `data.js` 或 `content.js`
- 不要把大量内容硬编码进难维护的单个 render 字符串；可接受单文件静态 HTML，但内容数据必须清晰分区。

不要求首版接后端或构建工具；静态 HTML 能直接打开即可。

## 11. 验收标准

### 11.1 流程验收

- 实现记录中明确列出已读取两个 `SKILL.md`。
- 实现前完成 UI pieces -> pattern 映射。
- 使用了 `ide-frame` shell，而不是自定义三栏 shell。
- 使用了 memory architecture pattern，而不是手写架构图。

### 11.2 内容验收

- 内容深度明显接近 `950-operator-developer-guide.html`：必须包含角色路径、课件页码、术语速查、分层路线、实战练习、常见误区。
- 不能只复述 `FEATURE_TAXONOMY_PRD.md` 的 9 类差异。
- 每个重点差异必须回答：影响谁、读什么、查什么、右侧架构证据是什么。
- 必须体现 950/A5 的核心主线：
  - 数据通路与片上内存
  - Cube/Vector 协同
  - RegBase + SIMT/SIMD
  - 低比特与 scale
  - CCU/通信
  - Profiling 闭环

### 11.3 交互验收

- 左侧导航可切换内容或定位段落。
- 中间内容选择能联动右侧架构 focus。
- Diff 按钮开启后，小卡片叠加在架构图上，不替换架构图。
- UB Bank Topology 小卡片必须存在。

### 11.4 视觉验收

- 页面整体是 PTO 工作台风格，不是白底文章风格。
- 内容密度适合工程师阅读，避免营销页 hero。
- 文本不能溢出按钮、卡片、表格或 pane。
- 不出现新建未审批视觉系统。

### 11.5 静态检查

至少运行：

```bash
rtk rg -n "data-ide-frame|data-ide-split|data-ide-pane|PtoIdeFrame|memory-architecture" /Users/yin/pto/<new-project>/index.html
rtk rg -n "style=|https?://|#[0-9a-fA-F]{3,8}|rgba\\(" /Users/yin/pto/<new-project>/index.html
```

如果有内联脚本，需做 JS parse check。

## 12. 非目标

- 不做新的 CANN 官方文档爬取。
- 不做在线网络依赖。
- 不做 PPT 原图大规模搬运进 PTO 页面；可以引用或总结本地课件信息，但页面主体应是工作台式阅读和决策体验。
- 不做完整后端、搜索索引服务或多页面站点。
- 不复刻 `/Users/yin/CANNvisual/950 ppt/950-operator-developer-guide.html` 的文章站点结构。

## 13. 推荐执行顺序

1. 删除旧输出目录前，保留本 PRD。
2. 读取两个 `SKILL.md`。
3. 读取 design system baseline 与 `ide-frame` pattern。
4. 读取 `FEATURE_TAXONOMY_PRD.md`。
5. 读取 `950-operator-developer-guide.html` 的内容结构和关键段落。
6. 先产出内容数据结构，不先写页面。
7. 映射每个内容单元到右侧架构节点/路线。
8. 用 `ide-frame` 搭三栏 shell。
9. 接入 memory architecture 和 Diff overlay。
10. 填充内容，做导航联动。
11. 静态检查和 Chrome 视觉验证。

