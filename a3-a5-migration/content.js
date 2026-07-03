window.A3A5MigrationContent = {
  skillsRead: [
    'pto-new-module-design-system',
    'pto-mem-architecture-diagram'
  ],
  scenarios: [
    { id: 'general', label: 'A3/A5 通用', count: 'baseline' },
    { id: 'a5-native', label: 'A5 原生开发', count: 'new path' },
    { id: 'migration', label: 'A3-A5 迁移', count: 'porting' },
    { id: 'selection', label: '950 学习/选型', count: 'choices' },
    { id: 'profiling', label: 'Profiling 验证', count: 'loop' }
  ],
  paths: [
    { id: 'conclusion', label: '一句话结论' },
    { id: 'differences', label: '重点差异' },
    { id: 'roles', label: '角色路径' },
    { id: 'checklist', label: '迁移检查' },
    { id: 'terms', label: '术语速查' },
    { id: 'exercises', label: '实战练习' },
    { id: 'pitfalls', label: '常见误区' }
  ],
  keywords: ['RegBase', 'SIMT', 'L0C2UB', 'UB2L1', 'NDDMA', 'HiF8', 'MXFP8', 'CCU', 'Profiling'],
  readings: [
    { level: 'P0', title: '面向新一代硬件，CANN技术架构的变与不变', pages: 'Page 2-5, 8-11', audience: '所有人', goal: '建立 950 架构、SIMT/SIMD、RegBase、CCU 总图' },
    { level: 'P0', title: '场景驱动下的算子编程语言选型', pages: 'Page 3-6, 51-52', audience: '所有人', goal: '决定 Ascend C、模板库、PyPTO/PTO、Triton-Ascend、TileLang 的边界' },
    { level: 'P0', title: 'CANN 算子开发全链路体验升级', pages: 'Page 3-13, 19-25', audience: 'Ascend C 开发者、调优者', goal: '理解 NDDMA、CV 直连、兼容迁移、Profiling 新能力' },
    { level: 'P1', title: '探索Ascend 950的性能天花板', pages: 'Page 4-8, 10-15, 17-28, 30-32', audience: '性能优化者', goal: '学习 Matmul、RmsNormQuant、FIA、通信融合的优化手段' },
    { level: 'P1', title: '加速开发，释放生产力的必备利器', pages: 'Page 3, 5-14, 16-26', audience: '工程实现者', goal: '使用 CATLASS、ATVOSS、ASC 直调和仿真工具提升效率' },
    { level: 'P1', title: 'HiFloat8数据格式及其训推应用', pages: 'Page 3-15, 17-31', audience: '低比特/量化开发者', goal: '理解 HiF8 编码、scaling、量化算子、训练/推理实践' },
    { level: 'P1', title: 'HCCL集合通信专用引擎CCU技术介绍', pages: 'Page 2-16', audience: '通信/分布式开发者', goal: '理解 CCU 设计初衷、编程模型、ReduceScatter 示例和硬化资源' },
    { level: 'P2', title: 'PTO ISA教你如何快速上手昇腾950', pages: 'Page 2-6, 23-32, 34-45', audience: '底层/编译/极致性能开发者', goal: '用虚拟指令集理解 Tile、Buffer、调度、Matmul/FA 示例' }
  ],
  diffs: [
    {
      id: 'ub-bank',
      title: 'UB Bank Topology',
      a3: 'A3: 16 group * 3 bank * 4KB = 192KB',
      a5: 'A5: 8 group * 2 bank * 16KB = 256KB',
      implication: '旧 bank conflict / 地址错位公式必须重查。',
      left: '7%',
      top: '50%',
      focus: {
        selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv2 [data-aiv-node="buffer:UB"]'],
        routes: ['l2-to-aiv1', 'l2-to-aiv2']
      }
    },
    {
      id: 'l0c-ub',
      title: 'L0C -> UB',
      a3: 'A3: Cube 后处理常绕 GM/UB 或 workspace。',
      a5: 'A5: 新增 C-V 直连，减少中间拷贝。',
      implication: 'Matmul epilogue、FIA、量化后处理优先检查。',
      left: '48%',
      top: '32%',
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'],
        routes: ['aic-to-aiv1']
      }
    },
    {
      id: 'ub-l1',
      title: 'UB -> L1',
      a3: 'A3: 更多依赖 GM 中转。',
      a5: 'A5: 新增反向融合通路。',
      implication: 'Vector 前处理回喂 Cube 时先看是否能避免 GM 往返。',
      left: '54%',
      top: '58%',
      focus: {
        selectors: ['#mem950-aiv2 [data-aiv-node="buffer:UB"]', '#mem950-aic [data-aic-node="buffer:L1"]'],
        routes: ['aiv2-to-aic']
      }
    },
    {
      id: 'regbase',
      title: 'RegBase',
      a3: 'A3: Memory-based LocalTensor/UB。',
      a5: 'A5: RegTensor、MaskReg、AddrReg、Load/Store。',
      implication: '先判断中间结果能否停留在寄存器。',
      left: '32%',
      top: '18%',
      focus: {
        selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]', '#mem950-aiv1 [data-aiv-node="exec:SIMD"]'],
        routes: ['l2-to-aiv1']
      }
    },
    {
      id: 'simt',
      title: 'SIMD + SIMT',
      a3: 'A3: SIMD 为主。',
      a5: 'A5: SIMD/SIMT 混合，适合离散访存与复杂控制流。',
      implication: 'Gather/Scatter、Hash、Atomic 类算子优先判断 SIMT。',
      left: '34%',
      top: '70%',
      focus: {
        selectors: ['#mem950-aiv1 [data-aiv-node="exec:SIMT"]', '#mem950-aiv1 [data-aiv-node="exec:SIMD"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'],
        routes: ['l2-to-aiv1']
      }
    },
    {
      id: 'low-bit',
      title: 'Low-bit / MX / HiF8',
      a3: 'A3: 低比特路径有限或非原生。',
      a5: 'A5: MXFP8/MXFP4/HiF8 进入核心 Matmul/量化路径。',
      implication: 'scale、cast、layout、量化误差要和搬运一起验证。',
      left: '66%',
      top: '16%',
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]', '#mem950-aic [data-aic-node="cube:CUBE"]'],
        routes: ['l2-to-aic']
      }
    },
    {
      id: 'ccu',
      title: 'CCU / Communication',
      a3: 'A3: 通信更多从 HCCL API 和软件调度看。',
      a5: 'A5: CCU 硬化通信执行，需看通信 profiling 与片上带宽。',
      implication: 'ReduceScatter、AllGatherMatMul、Dispatch/Combine 要看通算重叠。',
      left: '4%',
      top: '18%',
      focus: {
        selectors: ['[data-mem950-node="rail:GM"]', '[data-mem950-node="rail:L2"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1', 'l2-to-aiv2']
      }
    },
    {
      id: 'profiling',
      title: 'Profiling',
      a3: 'A3: 容易只看总耗时。',
      a5: 'A5: Pipe、PC Sampling、Reg、片上带宽、CCU profiling 都要纳入闭环。',
      implication: '每次启用新能力都保留可回退版本和性能/精度记录。',
      left: '68%',
      top: '72%',
      focus: {
        selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="scheduler:Dispatch"]', '#mem950-aiv1 [data-aiv-node="scalar:Scalar"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1']
      }
    }
  ],
  units: [
    {
      id: 'data-path-memory',
      view: 'differences',
      title: '数据搬运与片上内存：先重算数据位置，再谈算力',
      scenario: ['general', 'migration', 'profiling'],
      roles: ['已有 910B 经验的 Ascend C 开发者', '融合算子开发者', '工具链 Profiling'],
      summary: '950/A5 的收益很大一部分来自减少 GM 往返、提升 L2/片上复用、使用 NDDMA 与 C-V 直连。',
      impact: ['Tiling 要重新纳入 L2 命中、Sector Cache、小包/非对齐访问。', '旧 UB bank 错位公式不能直接继承。', '非连续、多维、padding、transpose、broadcast 场景优先排查 NDDMA。'],
      nextActions: ['标注现有算子每个中间结果所在层级。', '查 UB bank 与容量假设。', '用 Pipe 图确认 CopyIn/Compute/CopyOut 是否被掩盖。'],
      sourceRefs: ['CANN 全链路 Page 3-13, 19-25', '面向新一代硬件 Page 2-5'],
      diffIds: ['ub-bank', 'profiling'],
      focus: {
        selectors: ['[data-mem950-node="rail:GM"]', '[data-mem950-node="rail:L2"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aic [data-aic-node="buffer:L1"]'],
        routes: ['l2-to-aiv1', 'l2-to-aic']
      }
    },
    {
      id: 'cube-vector',
      view: 'differences',
      title: 'Cube/Vector 协同：Matmul 后处理不要再默认绕 GM',
      scenario: ['a5-native', 'migration'],
      roles: ['Cube/GEMM', '融合算子', '低比特/量化'],
      summary: 'L0C2UB、UB2L1、DualDest、SSBuf 让 Matmul epilogue、FIA、量化和 Layout 转换有机会贴近硬件通路。',
      impact: ['Cube 开发者要关心 L0C 输出如何进入 Vector 后处理。', 'Vector 开发者要理解 Cube 结果何时以什么布局进入 UB。', '融合算子要先画数据流与同步流。'],
      nextActions: ['检查是否存在 L0C -> GM -> UB。', '评估 UB -> L1 是否能减少前处理回灌开销。', '把右侧 L0C/UB/L1 通路作为设计证据。'],
      sourceRefs: ['探索性能天花板 Page 4-8, 17-21', '加速开发 Page 10-14'],
      diffIds: ['l0c-ub', 'ub-l1'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aic [data-aic-node="buffer:L1"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv2 [data-aiv-node="buffer:UB"]'],
        routes: ['aic-to-aiv1', 'aiv2-to-aic']
      }
    },
    {
      id: 'regbase-simt',
      view: 'differences',
      title: 'Vector 从 Memory-based 走向 RegBase + SIMT/SIMD',
      scenario: ['a5-native', 'migration'],
      roles: ['Vector / SIMT / RegBase', '已有 910B 经验的 Ascend C 开发者'],
      summary: 'A5 让 Vector 编程从 UB LocalTensor 扩展到显式寄存器与线程式执行模型。',
      impact: ['规整表达式和 VF 融合优先看 SIMD/RegBase。', '离散访存、复杂分支、Hash/Atomic 场景优先看 SIMT。', 'GM 仍需先到 UB，再通过显式 Load/Store 到寄存器。'],
      nextActions: ['检查是否能把中间结果停留在寄存器。', '判断核心访问模式是规整还是离散。', 'Profiling 中补看寄存器压力和 PC Stall。'],
      sourceRefs: ['面向新一代硬件 Page 5-9', '场景驱动 Page 10-12', '探索性能天花板 Page 10-15'],
      diffIds: ['regbase', 'simt', 'profiling'],
      focus: {
        selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="exec:SIMT"]', '#mem950-aiv1 [data-aiv-node="exec:SIMD"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'],
        routes: ['l2-to-aiv1']
      }
    },
    {
      id: 'low-bit-scale',
      view: 'differences',
      title: '低比特与 scale：不是 dtype 替换',
      scenario: ['a5-native', 'selection', 'profiling'],
      roles: ['低比特/量化', 'Cube/GEMM', '融合算子'],
      summary: 'FP8、MXFP8、MXFP4、HiF8 会同时影响 Matmul、量化、FIA、训练/推理精度、scale 设计和搬运组织。',
      impact: ['scale 张量布局、缓存、搬运接口会影响性能。', 'Cast/round/saturate 与异常样本要单独验证。', '低比特路径常常牵动 epilogue 和 layout。'],
      nextActions: ['先做单算子量化误差和溢出比例。', '再做局部网络与端到端精度。', '把 scale 搬运和反量化阶段纳入 Profiling。'],
      sourceRefs: ['HiF8 Page 3-15, 17-31', '探索性能天花板 Page 8', '场景驱动 Page 19-23'],
      diffIds: ['low-bit', 'l0c-ub'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]', '#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]'],
        routes: ['l2-to-aic', 'aic-to-aiv1']
      }
    },
    {
      id: 'ccu-communication',
      view: 'differences',
      title: '通信与 CCU：从 HCCL API 下钻到硬化执行',
      scenario: ['a5-native', 'profiling'],
      roles: ['通信/分布式', '工具链 Profiling', 'PTO/ISA'],
      summary: '950 的集合通信不只是 API 调用，CCU 目标是降低内存带宽占用、降低通信时延、释放 AI Core 资源。',
      impact: ['AllGatherMatMul、ReduceScatter、Dispatch/Combine 要看通信与本地计算重叠。', '通信流量可能影响 L2/片上带宽。', '端到端耗时不足以定位 CCU 和 AI Core 的竞争。'],
      nextActions: ['标出通信域、Endpoint、Loop、Memory Slice、channel。', '确认本地块计算是否能提前。', '使用 CCU profiling 和片上带宽指标闭环。'],
      sourceRefs: ['HCCL/CCU Page 2-16', '面向新一代硬件 Page 11-15', '探索性能天花板 Page 23-28'],
      diffIds: ['ccu', 'profiling'],
      focus: {
        selectors: ['[data-mem950-node="rail:GM"]', '[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="scheduler:Dispatch"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1', 'l2-to-aiv2']
      }
    },
    {
      id: 'toolchain-profiling',
      view: 'differences',
      title: '工具链与 Profiling：每次优化都要回到数据',
      scenario: ['profiling', 'migration'],
      roles: ['工具链 Profiling', '所有迁移开发者'],
      summary: '950 调优从模型级、算子级扩展到 Pipe、PC Sampling、SIMT 寄存器分析、CCU profiling 和片上带宽分析。',
      impact: ['总耗时只能说明慢，不能说明哪里慢。', '启用 NDDMA、CV 直连、RegBase、低比特、CCU 后要分别验证。', '功能迁移、性能迁移、极致优化需要分轮做。'],
      nextActions: ['先建立 910B Profiling 基线。', '950 上功能跑通后逐项打开新能力。', '每次记录性能、精度、兼容性和可回退版本。'],
      sourceRefs: ['CANN 全链路 Page 19-25', '探索性能天花板 Page 30-32'],
      diffIds: ['profiling', 'ub-bank'],
      focus: {
        selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="scheduler:Dispatch"]', '#mem950-aiv1 [data-aiv-node="scalar:Scalar"]', '#mem950-aiv1 [data-aiv-node="exec:SIMT"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1']
      }
    }
  ],
  roles: [
    {
      id: 'role-newcomer',
      view: 'roles',
      title: '新手：先建立工程化闭环，不要一上来读 PTO',
      scenario: ['selection', 'general'],
      summary: '目标是知道 CANN、Ascend C、算子工程、Tiling、CopyIn/Compute/CopyOut 是什么。',
      read: ['场景驱动 Page 3-6', '加速开发 Page 3', 'CANN 全链路 Page 19'],
      output: ['能描述 Host/Kernel 分工。', '能把一个算子标成 CopyIn -> Compute -> CopyOut。', '能用 msProf 看基础指标。'],
      avoid: ['PTO ISA 全文', 'HCCL/CCU Page 10 以后的编程模型', 'HiF8 训练曲线细节'],
      diffIds: ['profiling'],
      focus: {
        selectors: ['[data-mem950-node="rail:GM"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'],
        routes: ['l2-to-aiv1']
      }
    },
    {
      id: 'role-ascendc-910b',
      view: 'roles',
      title: '已有 910B 经验：先排硬件假设，再启用 A5 能力',
      scenario: ['migration'],
      summary: '重点看哪些 API、数据通路、同步、兼容策略会影响现有算子。',
      read: ['面向新一代硬件 Page 3-5, 8-11', 'CANN 全链路 Page 3-13', '场景驱动 Page 45-46'],
      output: ['现有算子的硬件假设清单。', 'ISASI/底层接口排查结果。', '功能迁移与性能迁移分轮计划。'],
      avoid: ['未建立基线前直接改低比特或 RegBase。'],
      diffIds: ['ub-bank', 'l0c-ub', 'ub-l1', 'regbase'],
      focus: {
        selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="buffer:L1"]', '#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'],
        routes: ['l2-to-aic', 'aic-to-aiv1']
      }
    },
    {
      id: 'role-cube',
      view: 'roles',
      title: 'Cube/GEMM：从 Matmul 主体扩展到 epilogue 和 scale',
      scenario: ['a5-native', 'migration'],
      summary: '围绕矩阵乘、低比特矩阵计算、L2 命中、多核负载均衡和 C-V 后处理建立路线。',
      read: ['探索性能天花板 Page 4-8', '加速开发 Page 5-14', 'PTO ISA Page 34-41'],
      output: ['BasicMatmul baseline。', 'Double Buffer / Swizzle / SWAT 对比数据。', 'scale 搬运和 epilogue profiling。'],
      avoid: ['只优化 MMAD 主循环，不看 L0C/UB 后处理。'],
      diffIds: ['l0c-ub', 'low-bit', 'profiling'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]', '#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]'],
        routes: ['l2-to-aic', 'aic-to-aiv1']
      }
    },
    {
      id: 'role-vector',
      view: 'roles',
      title: 'Vector/SIMT/RegBase：判断规整表达还是离散控制流',
      scenario: ['a5-native', 'migration'],
      summary: '从 910B Memory-based Vector 迁移到 SIMD/SIMT 与 RegBase，避免把所有问题都写成 LocalTensor 往返。',
      read: ['面向新一代硬件 Page 5-9', '场景驱动 Page 10-12', '探索性能天花板 Page 10-15'],
      output: ['SIMD/SIMT 判定表。', 'RegTensor/MaskReg/AddrReg 试验。', '寄存器压力与 PC Stall 记录。'],
      avoid: ['不看寄存器压力就做 VF 融合。'],
      diffIds: ['regbase', 'simt', 'profiling'],
      focus: {
        selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="exec:SIMT"]', '#mem950-aiv1 [data-aiv-node="exec:SIMD"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'],
        routes: ['l2-to-aiv1']
      }
    },
    {
      id: 'role-fusion',
      view: 'roles',
      title: '融合算子：先画数据流、计算流、同步流',
      scenario: ['a5-native', 'migration'],
      summary: 'FIA、RmsNormQuant、Matmul+Epilogue 需要把 Cube、Vector、DataCopy、Layout、低比特和同步当成整体。',
      read: ['探索性能天花板 Page 10-21, 34-37', '场景驱动 Page 24-31', 'CANN 全链路 Page 7-10'],
      output: ['GM/L2/L1/L0/UB/Reg 数据流图。', 'CV 通路与同步点标注。', 'Pipe bubble 与片上带宽验证。'],
      avoid: ['先写两个独立 kernel 再试图拼起来。'],
      diffIds: ['l0c-ub', 'ub-l1', 'low-bit'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aic [data-aic-node="buffer:L1"]'],
        routes: ['aic-to-aiv1', 'aiv2-to-aic']
      }
    },
    {
      id: 'role-communication',
      view: 'roles',
      title: '通信/分布式：把 HCCL 语义映射到 CCU 资源',
      scenario: ['a5-native', 'profiling'],
      summary: 'ReduceScatter、AllGatherMatMul、Dispatch/Combine 要同时看通信域、片上带宽和本地计算重叠。',
      read: ['HCCL/CCU Page 2-16', '面向新一代硬件 Page 11-15', '探索性能天花板 Page 23-28'],
      output: ['Endpoint/Loop/Memory Slice/channel 标注。', '通信与计算重叠时间线。', 'CCU profiling 结论。'],
      avoid: ['只把通信看成 HCCL API 调用。'],
      diffIds: ['ccu', 'profiling'],
      focus: {
        selectors: ['[data-mem950-node="rail:GM"]', '[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="scheduler:Dispatch"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1', 'l2-to-aiv2']
      }
    },
    {
      id: 'role-low-bit',
      view: 'roles',
      title: '低比特/量化：scale、误差、搬运一起验',
      scenario: ['a5-native', 'profiling'],
      summary: 'HiF8、FP8、MXFP8/MXFP4 会改变精度、scale 数据流、Matmul 搬运与部署策略。',
      read: ['HiF8 Page 3-15, 17-31', '探索性能天花板 Page 8', '场景驱动 Page 19-23'],
      output: ['单算子误差与溢出记录。', '局部网络和端到端精度记录。', 'scale 缓存和搬运 profiling。'],
      avoid: ['只比较平均精度，不看异常样本和二次量化成本。'],
      diffIds: ['low-bit', 'profiling'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]'],
        routes: ['l2-to-aic']
      }
    }
  ],
  checklist: [
    {
      id: 'function-port',
      view: 'checklist',
      title: '第一轮：功能迁移',
      scenario: ['migration'],
      summary: '先让算子在 950/A5 上功能正确，不急着启用所有新能力。',
      items: ['确认 CMake/SoC 注册包含目标架构。', '排查 ISASI、被删除的 Cube ISA、调试 API 和旧分形假设。', '把 subnormal、int4、稀疏、L1 边界绕回等差异列为风险。', '保留 910B 可回退分支。'],
      diffIds: ['ub-bank'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L1"]', '#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]'],
        routes: ['l2-to-aic']
      }
    },
    {
      id: 'performance-port',
      view: 'checklist',
      title: '第二轮：性能迁移',
      scenario: ['migration', 'profiling'],
      summary: '在功能正确后逐项启用 NDDMA、CV 直连、RegBase、低比特或 CCU。',
      items: ['从 910B Profiling 基线开始。', '检查 CopyIn/Compute/CopyOut bubble。', '用 L0C2UB/UB2L1 减少 GM 中转。', '对非连续/多维访存尝试 NDDMA。', '每启用一项能力都记录性能与精度。'],
      diffIds: ['l0c-ub', 'ub-l1', 'profiling'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aic [data-aic-node="buffer:L1"]', '[data-mem950-node="rail:L2"]'],
        routes: ['aic-to-aiv1', 'aiv2-to-aic', 'l2-to-aic']
      }
    },
    {
      id: 'accuracy-low-bit',
      view: 'checklist',
      title: '第三轮：精度/低比特检查',
      scenario: ['a5-native', 'profiling'],
      summary: '低比特不是 dtype 替换，要让 scale、cast、量化误差和部署指标闭环。',
      items: ['记录量化前后误差、溢出比例、scale 分布。', '分层验证 RMSNorm、Attention、MLP、MOE。', '验证长序列、极端 activation 和异常样本。', '检查 scale 搬运是否成为瓶颈。'],
      diffIds: ['low-bit', 'profiling'],
      focus: {
        selectors: ['#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'],
        routes: ['l2-to-aic', 'aic-to-aiv1']
      }
    },
    {
      id: 'profiling-loop',
      view: 'checklist',
      title: '第四轮：Profiling 闭环',
      scenario: ['profiling'],
      summary: '慢要定位到模型调度、Tiling、Pipe、PC Stall、寄存器、片上带宽或 CCU。',
      items: ['模型级看 shape、调度、融合决策。', '算子级看 block 切分、尾块拖尾、多核负载。', 'Pipe 级看 Copy 与 Compute 是否互相掩盖。', '指令级看 PC Stall 与寄存器压力。', '通信级看 CCU 和片上带宽竞争。'],
      diffIds: ['profiling', 'ccu'],
      focus: {
        selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="scheduler:Dispatch"]', '#mem950-aiv1 [data-aiv-node="scalar:Scalar"]', '#mem950-aiv1 [data-aiv-node="exec:SIMT"]'],
        routes: ['l2-to-aic', 'l2-to-aiv1', 'l2-to-aiv2']
      }
    }
  ],
  exercises: [
    { id: 'exercise-vector', view: 'exercises', title: 'Add/Abs 类 Vector 算子跑通', scenario: ['general'], summary: '用工程化算子或 ASC 直调完成编译运行，标注 CopyIn -> Compute -> CopyOut，开启 Double Buffer 前后对比 Pipe 图。', read: ['加速开发 Page 23-26', 'CANN 全链路 Page 19-25'], diffIds: ['profiling'], focus: { selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'], routes: ['l2-to-aiv1'] } },
    { id: 'exercise-matmul', view: 'exercises', title: 'Matmul 基线与两轮优化', scenario: ['a5-native', 'migration'], summary: '用 CATLASS 或 Ascend C Matmul 写 baseline，加入 Double Buffer 或 Swizzle，观察 L2 命中、带宽供应、尾块拖尾。', read: ['探索性能天花板 Page 4-8', 'PTO ISA Page 34-41'], diffIds: ['l0c-ub', 'low-bit'], focus: { selectors: ['#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]'], routes: ['l2-to-aic', 'aic-to-aiv1'] } },
    { id: 'exercise-rmsnorm', view: 'exercises', title: 'RmsNormQuant 融合边界', scenario: ['a5-native', 'profiling'], summary: '分解 RMS 计算、归一化、量化、搬入/搬出，判断 VF 融合与小包/非对齐/尾块的边界。', read: ['探索性能天花板 Page 10-15', 'HiF8 Page 9-15'], diffIds: ['regbase', 'low-bit', 'profiling'], focus: { selectors: ['#mem950-aiv1 [data-aiv-node="exec:SIMD"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'], routes: ['l2-to-aiv1'] } },
    { id: 'exercise-fia', view: 'exercises', title: 'Attention/FIA 数据流', scenario: ['a5-native'], summary: '标注 Q/K/V、Softmax、Cast、Transdata、Matmul 的数据位置，判断 CV 共享通道、VF 融合、负载均衡各自解决什么瓶颈。', read: ['探索性能天花板 Page 17-21, 34-37', '场景驱动 Page 24-31'], diffIds: ['l0c-ub', 'ub-l1'], focus: { selectors: ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aic [data-aic-node="buffer:L1"]'], routes: ['aic-to-aiv1', 'aiv2-to-aic'] } },
    { id: 'exercise-ccu', view: 'exercises', title: 'ReduceScatter / AllGatherMatMul 拆解', scenario: ['profiling', 'a5-native'], summary: '从 HCCL 语义写输入输出和通信域，再从 CCU 角度标出 Endpoint、Loop、Memory Slice、channel。', read: ['HCCL/CCU Page 10-16', '探索性能天花板 Page 23-28'], diffIds: ['ccu', 'profiling'], focus: { selectors: ['[data-mem950-node="rail:GM"]', '[data-mem950-node="rail:L2"]'], routes: ['l2-to-aic', 'l2-to-aiv1', 'l2-to-aiv2'] } }
  ],
  pitfalls: [
    { id: 'pitfall-compute-only', view: 'pitfalls', title: '把 950 当成 910B 的算力增强版', scenario: ['general', 'migration'], summary: '正确做法：先看数据通路、片上内存、低比特、RegBase、CCU 和 Profiling 闭环。', diffIds: ['ub-bank', 'l0c-ub', 'regbase'], focus: { selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'], routes: ['l2-to-aic', 'aic-to-aiv1'] } },
    { id: 'pitfall-pto-early', view: 'pitfalls', title: '过早进入 PTO', scenario: ['selection'], summary: '正确做法：大多数业务算子先掌握工程化 Ascend C、模板库和 Profiling，再进入 PTO/ISA。', diffIds: ['profiling'], focus: { selectors: ['#mem950-aic [data-aic-node="scheduler:Dispatch"]', '#mem950-aiv1 [data-aiv-node="scalar:Scalar"]'], routes: ['l2-to-aic', 'l2-to-aiv1'] } },
    { id: 'pitfall-copy', view: 'pitfalls', title: '只优化 Compute，不优化 Copy', scenario: ['migration', 'profiling'], summary: '正确做法：NDDMA、Layout、L2、UB bank、L0C2UB、UB2L1 都纳入优化空间。', diffIds: ['ub-bank', 'l0c-ub', 'ub-l1'], focus: { selectors: ['#mem950-aic [data-aic-node="buffer:L1"]', '#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'], routes: ['l2-to-aic', 'aic-to-aiv1', 'aiv2-to-aic'] } },
    { id: 'pitfall-low-bit', view: 'pitfalls', title: '把低比特当 dtype 替换', scenario: ['a5-native'], summary: '正确做法：scale、cast、校准、端到端精度和性能联动验证。', diffIds: ['low-bit'], focus: { selectors: ['#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0A"]'], routes: ['l2-to-aic'] } },
    { id: 'pitfall-total-time', view: 'pitfalls', title: '只看总耗时', scenario: ['profiling'], summary: '正确做法：同时看 Pipe、PC、寄存器、片上带宽和 CCU profiling。', diffIds: ['profiling', 'ccu'], focus: { selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aiv1 [data-aiv-node="exec:SIMT"]'], routes: ['l2-to-aiv1'] } },
    { id: 'pitfall-api-level', view: 'pitfalls', title: '忽略 API 层级兼容差异', scenario: ['migration'], summary: '正确做法：高阶 API 和模板库优先保兼容，ISASI 和硬件相关底层接口单独审查。', diffIds: ['regbase', 'ub-bank'], focus: { selectors: ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'], routes: ['l2-to-aiv1'] } }
  ],
  terms: [
    { term: 'CANN', body: '昇腾面向 AI 场景的异构计算架构，连接上层框架与 AI 处理器、编程、运行时、算子库、通信库。', read: '官方 CANN 是什么' },
    { term: 'Ascend C', body: 'CANN 针对算子开发推出的 C/C++ 编程语言和 API 体系。', read: '官方 Ascend C' },
    { term: 'Tiling', body: 'Host 侧根据 shape、硬件资源、数据类型生成切分参数；950 上要重新审视 L2、C-V 通路、低比特 scale、CCU。', read: '工程化算子开发' },
    { term: 'TPipe / TQue / TBuf', body: 'TPipe 管理 Device 端内存和事件，TQue 做流水任务通信同步，TBuf 管理临时变量内存。', read: 'TPipe/TQue 编程' },
    { term: 'GM / UB / L1 / L0', body: '常见内存层级。950 学习重点是减少 GM 往返、提升片上复用、理解 UB2L1/L0C2UB。', read: '课件 + Ascend C 编程模型' },
    { term: 'SIMD', body: '单指令多数据。950 上与 RegBase/VF 结合后，更强调寄存器级中间结果复用。', read: 'Reg 矢量计算' },
    { term: 'SIMT', body: '单指令多线程，Warp 内 32 个 Lane，适合离散访存、复杂分支等场景。', read: 'SIMT API' },
    { term: 'RegBase / RegTensor', body: '显式操作 Vector 计算寄存器；RegTensor 是 Reg 矢量计算基本单元。', read: 'Reg 矢量计算' },
    { term: 'NDDMA', body: '多层循环搬运能力，支持多维非连续访存、自动补 PAD 等。', read: 'CANN 全链路 + DataCopy' },
    { term: 'HiF8', body: 'hifloat8_t，兼顾精度与动态范围，需要结合 scaling 与量化路径验证。', read: 'HiF8 课件' },
    { term: 'MXFP8 / MXFP4', body: '带 scale 的低比特矩阵格式，重点是 scale 张量布局、搬运、缓存和矩阵计算接口。', read: '低比特课件' },
    { term: 'HCCL / CCU', body: 'HCCL 提供通信接口；CCU 是 950 集合通信专用引擎，用于硬化通信流程。', read: 'HCCL/CCU 课件' },
    { term: 'CATLASS / ATVOSS', body: 'CATLASS 面向 GEMM/Cube 模板化，ATVOSS 面向 Vector 融合与表达式简化。', read: '加速开发课件' },
    { term: 'PTO ISA', body: '昇腾芯片虚拟指令集，用 Tile、Buffer、块指令抽象硬件，适合底层/编译/极致性能学习。', read: 'PTO ISA 课件' },
    { term: 'msProf', body: 'CANN 算子调优工具，用于采集分析性能指标，定位软硬件瓶颈。', read: 'msProf 文档' }
  ],
  defaultFocus: {
    selectors: ['[data-mem950-node="rail:L2"]', '#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'],
    routes: ['l2-to-aic', 'aic-to-aiv1']
  }
};
