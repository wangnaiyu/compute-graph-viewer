/**
 * Ascend 910B → 950 迁移识别规则集
 * ---------------------------------------------------------------------------
 * 目标：把"读懂一行核代码 → 判定它跑在哪个硬件单元 → 它在 910B/950 上有何差异"
 *       这件事，从 kernels/*.js 里的人工标注，下沉成一份可复用、可检索的规则数据。
 *
 * 两部分：
 *   1) INTRINSICS —— intrinsic / API 关键字 → 硬件单元 + 计算类别（识别器用）
 *   2) MIGRATION  —— 910B → 950 的差异规则（兼容性判定 + 迁移建议，标注卡片用）
 *
 * 来源标注（source 字段）对应仓库内两份权威文档：
 *   - KNOWLEDGE.md  = Profiling_Insight_and_Tool/KNOWLEDGE.md
 *   - PERF_GUIDE    = Profiling_Insight_and_Tool/Issue_PDF_analysis/perf_engineer_guide.html
 * 外部佐证（通用 Ascend C 语义）：hiascend.com / CANN 训练营公开资料。
 *
 * match 语义（两者可组合，组合时取交集）：
 *   { any:  [...] }  代码行包含其中【任意一个】子串即命中
 *   { all:  [...] }  代码行需【同时】包含所有子串才命中
 *   regex 字段可选，作为补充的精确匹配（区分大小写）。
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // 1) 硬件单元 / 计算类别识别表
  //    category: compute | memory | control | scalar
  //    paradigm: simd | simt | cube | null（标量/搬运/控制无范式）
  //    hwNodes:  对应硬件架构图（hardware-frame.html）里的节点选择器锚点，
  //              供后续自动生成 annotation.selectors 时映射。
  // ─────────────────────────────────────────────────────────────────────────
  const INTRINSICS = [
    {
      id: 'mem-gm-ub',
      tag: 'GM↔UB 搬运',
      unit: 'MTE / UB',
      category: 'memory',
      paradigm: null,
      match: { any: ['asc_copy_gm2ub', 'asc_copy_ub2gm', 'CopyIn', 'CopyOut'] },
      hwNodes: ['rail:GM', 'rail:L2', 'buffer:UB'],
      note: 'MTE 数据搬运：Global Memory ↔ Unified Buffer，关注 128B sector 命中与对齐。',
      source: 'KNOWLEDGE.md §3.3 / PERF_GUIDE 访存优化'
    },
    {
      id: 'mem-datacopy',
      tag: '数据搬运',
      unit: 'MTE',
      category: 'memory',
      paradigm: null,
      match: { any: ['DataCopy', 'DumpTensor', 'Nd2Nz', 'Dn2Nz', 'Dm2Nz'] },
      hwNodes: ['rail:GM', 'rail:L2', 'buffer:UB'],
      note: '通用搬运 / 格式转换接口；在 950 上是迁移高发区（见 MIGRATION 规则）。',
      source: 'KNOWLEDGE.md §5.3.5 / §5.7.2'
    },
    {
      id: 'cube-mmad',
      tag: 'Cube / Matmul',
      unit: 'Cube (L0A/L0B→L0C)',
      category: 'compute',
      paradigm: 'cube',
      match: { any: ['Mmad', 'matmul', 'matmul_mx', 'LoadData2D', 'LoadDataWithTranspose', 'pto.matmul'] },
      hwNodes: ['cube:CUBE', 'buffer:L0C'],
      note: '矩阵乘主干，落在 Cube；MMAD 累加在 L0C(CO1)，输出经 Fixpipe。',
      source: 'KNOWLEDGE.md §5.3.6 / §5.4.3 + hiascend Mmad'
    },
    {
      id: 'cube-fixpipe',
      tag: 'Fixpipe 输出',
      unit: 'Cube → Fixpipe',
      category: 'compute',
      paradigm: 'cube',
      match: { any: ['Fixpipe', 'FixpipeParams', 'dualDstCtl', 'C310'] },
      hwNodes: ['buffer:L0C', 'buffer:FP', 'buffer:UB'],
      note: 'L0C 结果定形输出；950 DualDest 可二分割发往 AIV0/AIV1。',
      source: 'KNOWLEDGE.md §5.7.4 DualDest'
    },
    {
      id: 'vec-simd',
      tag: 'SIMD / Vector',
      unit: 'Vector (AIV)',
      category: 'compute',
      paradigm: 'simd',
      match: { any: ['asc_add', 'asc_mul', 'asc_sub', 'asc_div', 'vadd', 'vmul', 'vmuls', 'vdiv', 'Add(', 'Mul(', 'Sub('] },
      hwNodes: ['exec:SIMD', 'vector:Vector', 'buffer:UB'],
      note: '稠密逐元素向量计算，AIV SIMD 通道；VL=256B，64 lane。',
      source: 'KNOWLEDGE.md §3.2 / §5.3.3'
    },
    {
      id: 'vec-reg-vf',
      tag: 'Reg 矢量 / VF',
      unit: 'Vector SIMD Reg',
      category: 'compute',
      paradigm: 'simd',
      match: { any: ['__simd_vf__', 'asc_vf_call', 'RegTensor', 'vector_float', 'vector_bfloat16_t', 'asc_load', 'asc_store'] },
      hwNodes: ['exec:SIMD', 'buffer:UB'],
      note: '950 Regbase 新增：数据流 GM↔UB↔Reg，VF 在独立 SIMD Vector 单元执行。',
      source: 'KNOWLEDGE.md §5.3.3 / §5.7.1'
    },
    {
      id: 'vec-simt',
      tag: 'SIMT / Warp',
      unit: 'Vector SIMT (Warp Scheduler)',
      category: 'compute',
      paradigm: 'simt',
      match: {
        any: ['__launch_bounds__', 'asc_shfl', 'asc_ballot', 'asc_all(', 'asc_any(',
          'asc_reduce_add', 'asc_reduce_max', 'asc_atomic', 'asc_syncthreads',
          'asc_threadfence', 'threadIdx', 'warp_id', 'scheduler_id']
      },
      hwNodes: ['exec:SIMT'],
      note: '950 新增 SIMT 范式：Grid→Block→Warp(32)→Thread；每 AIV 4 个 Warp Scheduler。',
      source: 'KNOWLEDGE.md §5.3.2 / PERF_GUIDE SIMT'
    },
    {
      id: 'cv-sync',
      tag: 'C-V 交接 / 同步',
      unit: 'AIC↔AIV 同步',
      category: 'control',
      paradigm: null,
      match: { any: ['CrossCoreSetFlag', 'CrossCoreWaitFlag', 'set_flag', 'wait_flag', 'asc_sync', 'asc_mem_bar', 'CrossConvWaitParams', 'SSBuf'] },
      hwNodes: ['buffer:L0C', 'buffer:UB'],
      note: '跨核同步原语；950 有 L0C↔UB 直连 + SSBuf 消息通路，910B 需经 GM/L2 staging。',
      source: 'KNOWLEDGE.md §4.3 / §5.7.3'
    },
    {
      id: 'rt-launch',
      tag: 'Kernel Launch',
      unit: 'ACL Runtime',
      category: 'control',
      paradigm: null,
      match: { any: ['<<<', 'aclrtSynchronizeStream', 'mix_kernel'] },
      hwNodes: ['exec:SIMD'],
      note: 'Host 侧 launch / 流同步；block 数与 tile 是迁移 what-if 入口。',
      source: 'KNOWLEDGE.md §5.3.2'
    },
    {
      id: 'rt-acl',
      tag: 'ACL 运行时',
      unit: 'Host / Runtime',
      category: 'control',
      paradigm: null,
      match: { any: ['aclInit', 'aclrtMalloc', 'aclrtMemcpy', 'aclrtSetDevice', 'aclrtCreateStream', 'asc_init', 'aclFinalize'] },
      hwNodes: [],
      note: 'Host 侧资源/设备管理，架构无关。',
      source: '通用 ACL 语义'
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // 2) 910B → 950 迁移规则
  //    severity: high（必改/会编译失败或语义错误）| medium（需调整/性能陷阱）| info（优化机会）
  //    direction: 'to950' 默认（升级到 950 时的注意点）；个别为对称差异说明。
  //    每条规则可直接渲染成一张标注卡片：verdict / reason / action / rewriteHint。
  // ─────────────────────────────────────────────────────────────────────────
  const MIGRATION = [
    // ── 5 大硬不兼容项（KNOWLEDGE.md §5.3.5）──────────────────────────────
    {
      id: 'l1-to-gm-removed',
      title: 'L1Buffer→GM 数据通路删除',
      severity: 'high',
      contextual: true, // 需数据流判定 src=L1 & dst=GM，由 kernel_analyzer 附加
      apis: ['DataCopy', 'DumpTensor'],
      match: { all: ['DataCopy'], any: ['L1', 'cbuf', 'CBUF', 'L1Buffer'] },
      unit: 'MTE',
      verdict910: '原生支持 L1→GM 直搬',
      verdict950: '通路已删除，需改路',
      reason: '950 删除了 L1Buffer→GM 的数据通路，DataCopy/DumpTensor 直接 L1→GM 会失效。',
      action: 'Cube-only 场景：通过 MIX 类型用 Vector 搬运；Mix 场景：改为 L1→UB→GM 两段搬运。',
      rewriteHint: '// 950: DataCopy(ubLocal, l1Local, ...); DataCopy(gmOut, ubLocal, ...);',
      source: 'KNOWLEDGE.md §5.3.5 不兼容项①'
    },
    {
      id: 'gm-to-l0-removed',
      title: 'GM→L0A/L0B 直通删除',
      severity: 'high',
      // InitConstValue 用关键字兜底；LoadData 从 GM 直达 L0 的情况由 kernel_analyzer 按数据流补充
      apis: ['InitConstValue', 'LoadData'],
      match: { any: ['InitConstValue'], all: [] },
      unit: 'MTE / Cube',
      verdict910: '支持 GM→L0A/L0B 直通',
      verdict950: '必须经 L1 中转',
      reason: '950 删除 GM→L0A Buffer→L0B Buffer 的直通路径。',
      action: '通过 LoadData Pipeline 先把数据搬到 L1，再从 L1 到 L0。',
      rewriteHint: '// 950: LoadData(l1, gm, ...); LoadData(l0a, l1, ...);',
      source: 'KNOWLEDGE.md §5.3.5 不兼容项②'
    },
    {
      id: 'cube-no-int4',
      title: 'Cube 不支持 int4b_t',
      severity: 'high',
      apis: ['Mmad', 'LoadData', 'LoadDataWithTranspose'],
      match: { all: ['int4b_t'], any: ['Mmad', 'LoadData', 'matmul'] },
      unit: 'Cube',
      verdict910: 'Cube 原生 int4b_t MMAD',
      verdict950: 'Cube 不支持，需 MIX',
      reason: '950 Cube 计算单元不再支持 int4b_t 类型。',
      action: '算子通过 MIX 使用 Vector Core 实现 int4 路径；或改用 MXFP4（e8m0 共享 scale，32:1）。',
      rewriteHint: '// 950: 走 MIX/Vector，或 matmul_mx(..., dtype=MXFP4)',
      source: 'KNOWLEDGE.md §5.3.5 不兼容项③ / §6.3'
    },
    {
      id: 'l0a-shape-zz-zn',
      title: 'L0A 形状 ZZ→ZN',
      severity: 'medium',
      apis: ['LoadDataWithTranspose', 'Mmad'],
      match: { any: ['LoadDataWithTranspose'], all: [] },
      unit: 'Cube',
      verdict910: 'L0A 布局 ZZ',
      verdict950: 'L0A 布局 ZN',
      reason: '950 L0A 形状由 ZZ 变为 ZN，影响转置加载与 Mmad 的切分。',
      action: 'L0A 切分数量乘以 2 个 L0A Buffer 大小；Stride 保持不变。',
      rewriteHint: '// 950: L0A tile 数 ×2，stride 不变',
      source: 'KNOWLEDGE.md §5.3.5 不兼容项④'
    },
    {
      id: 'cube-no-single-mmad',
      title: 'Cube-only 不支持单 MMAD 语义',
      severity: 'high',
      apis: ['matmul_mx', 'Mmad'],
      match: { any: ['matmul_mx'], all: [] },
      unit: 'Cube',
      verdict910: '单 Cube 即可完成 MMAD',
      verdict950: '需 MIX Core 执行',
      reason: '950 Cube-only 不再支持单个 MMAD 语义（如 matmul_mx 直调）。',
      action: '通过 mix 类型，使用 MIX Core（Cube+Vector 融合通路）执行。',
      rewriteHint: '// 950: 在 MIX kernel 内组织 Cube+Vector 协作',
      source: 'KNOWLEDGE.md §5.3.5 不兼容项⑤'
    },

    // ── 性能模型 / 优化机会类（PERF_GUIDE + §3 + §5.7 + §6）────────────────
    {
      id: 'scalar-to-simt',
      title: 'Scalar 密集 → SIMT 受益',
      severity: 'info',
      apis: [],
      match: { any: ['for (', 'for(', 'while ('], all: [] },
      unit: 'Scalar → Vector SIMT',
      verdict910: 'Scalar 复用 Vector 通道（打折）',
      verdict950: '走独立 Warp Scheduler',
      reason: '910B 上 Scalar 密集算子只能复用 Vector 通道、效率打折；950 的 SIMT 有独立 Warp Scheduler，性能大幅提升，但旧的 Cube/Vector 利用率分析框架对它失效。',
      action: '考虑改写为 SIMT VF（warp 级并行），用 PC Sampling + SIMT GPR/IPC 分析瓶颈；分支放在 Warp 间而非 Warp 内以避免 divergence。',
      rewriteHint: '// 950: __simd_vf__ + asc_vf_call<...>；按 warp_id 分支',
      source: 'PERF_GUIDE 痛点/SIMT + KNOWLEDGE.md §5.3.2'
    },
    {
      id: 'l0c2ub-direct',
      title: 'C-V 交接：L0C↔UB 直连',
      severity: 'info',
      apis: ['DataCopy', 'CrossCoreSetFlag'],
      match: { any: ['CrossCoreSetFlag', 'CrossCoreWaitFlag'], all: [] },
      unit: 'AIC↔AIV',
      verdict910: 'C-V 经 GM/L2 staging 交接',
      verdict950: 'L0C↔UB 直连 + SSBuf',
      reason: '950 新增 L0C→UB 直连通路与 SSBuf 消息通路，减少 Cube→Vector 的 GM 中转延迟；910B 没有直通路，需顺序保护并经 GM/L2 协作。',
      action: '融合算子用 shortcut 版 DataCopy / CreateConvCntl 走直连；迁回 910B 时降级为 L0C→GM→UB。',
      rewriteHint: '// 950: DataCopy L0C→UB 直连（shortcut）',
      source: 'KNOWLEDGE.md §3.3 / §5.7.3'
    },
    {
      id: 'membase-to-regbase',
      title: 'Membase → Regbase 矢量',
      severity: 'info',
      apis: ['asc_add', 'Add', 'Mul'],
      match: { any: ['asc_add', 'asc_mul', 'asc_sub'], all: [] },
      unit: 'Vector',
      verdict910: 'Membase 矢量（GM↔UB）',
      verdict950: '可升级 Regbase（GM↔UB↔Reg）',
      reason: '950 SIMD Vector 新增 Reg 内存层级，Regbase 操作数直接来自寄存器，可大幅降低 Local Buffer 带宽压力（RmsNorm 案例 RegBase 贡献 67.7×）。',
      action: '把热点 elementwise 改写进 __simd_vf__，用 RegTensor<T> / asc_load/store 走 Reg 路径。',
      rewriteHint: '// 950: RegTensor<float> r; asc_load(r, ub); ... asc_store(ub, r);',
      source: 'KNOWLEDGE.md §5.3.3 / §9.2'
    },
    {
      id: 'mx-scale-prestage',
      title: 'MX Scale 需预存 UB',
      severity: 'medium',
      apis: ['matmul_mx', 'LoadData2DMX'],
      match: { any: ['matmul_mx', 'LoadData2DMX', 'MXFP4', 'MXFP8'], all: [] },
      unit: 'Cube',
      verdict910: '无 MX 低比特矩阵路径',
      verdict950: 'MXFP4/8，但 Scale 易成瓶颈',
      reason: '950 MX 系列（e8m0 共享 scale，32:1）是最激进压缩；若 Scale 因子未预加载进 UB，搬运会成为瓶颈。',
      action: '将 MX Scale 预存入 UB（LoadData2DMX 载入 ScaleA/B）；参考 MXFP4 Matmul 案例 2.33× 路线。',
      rewriteHint: '// 950: 预加载 scale 到 UB 后再 matmul_mx(a, sa, b, sb, c)',
      source: 'PERF_GUIDE MXFP4 表 / KNOWLEDGE.md §5.7.2 / §9.1'
    },
    {
      id: 'int8-to-fp8',
      title: '量化精度可升级 FP8/HiF8',
      severity: 'info',
      apis: [],
      // 用词边界，避免 uint8_t（含子串 int8_t）误命中 Host 指针/搬运行
      match: { regex: /\bint8_t\b|\bINT8\b|\bquant\w*\b/ },
      unit: '数据精度',
      verdict910: 'FP16/BF16/INT8',
      verdict950: '+ FP8(E4M3/E5M2)/HiF8/MXFP4',
      reason: '950 原生支持 FP8/HiF8/MXFP4/MXFP8。HiF8 最大值 ~32768（FP8-E4M3 仅 448），LLM 激活值不易溢出；DeepSeek-V3 HiF8 vs BF16 = 1.113×。',
      action: '评估把 INT8 权重/激活换成 HiF8（Per-Channel W + Per-Tensor A/C）或 MXFP4 Linear。',
      rewriteHint: '// 950: npu_dynamic_quant → DT_HF8 / DT_FP8E4M3',
      source: 'KNOWLEDGE.md §6 / PERF_GUIDE 精度表'
    },
    {
      id: 'sector-align-128b',
      title: '访存 128B 对齐',
      severity: 'info',
      apis: ['asc_copy_gm2ub', 'DataCopy'],
      match: { any: ['asc_copy_gm2ub', 'asc_copy_ub2gm', 'DataCopy'], all: [] },
      unit: 'MTE / UB',
      verdict910: 'cache line 对齐',
      verdict950: '128B Sector-cache',
      reason: '950 用 128B Sector-cache；非 128B 对齐访问会浪费 sector，NDDMA 预取可隐藏延迟。',
      action: '搬运长度/地址按 128B（或 32 元素 FP32）对齐；连续 Vector 操作用相同 TileShape 促进图合并。',
      rewriteHint: '// 950: AlignTo(len, 32) * sizeof(float)',
      source: 'PERF_GUIDE 访存优化 / KNOWLEDGE.md §3.3'
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // 3) 轻量识别器（供 step1 直接复用）
  // ─────────────────────────────────────────────────────────────────────────
  function matches(line, m) {
    if (!m) return false;
    const anyOk = !m.any || m.any.length === 0 || m.any.some((s) => line.includes(s));
    const allOk = !m.all || m.all.length === 0 || m.all.every((s) => line.includes(s));
    const reOk = !m.regex || m.regex.test(line);
    return anyOk && allOk && reOk;
  }

  /** 判定一行代码的硬件单元/类别；未命中返回 null。 */
  function classifyLine(codeLine) {
    const line = String(codeLine || '');
    for (const rule of INTRINSICS) {
      if (matches(line, rule.match)) {
        return {
          intrinsicId: rule.id,
          tag: rule.tag,
          unit: rule.unit,
          category: rule.category,
          paradigm: rule.paradigm,
          hwNodes: rule.hwNodes,
          note: rule.note,
          source: rule.source
        };
      }
    }
    return null;
  }

  /**
   * 返回一行代码命中的所有 910B→950 迁移规则（可能多条）。
   * 默认跳过 contextual 规则（需数据流判定，由 kernel_analyzer 附加）；
   * 传 includeContextual=true 可一并用关键字弱匹配。
   */
  function migrationFindings(codeLine, includeContextual) {
    const line = String(codeLine || '');
    return MIGRATION.filter((rule) =>
      (includeContextual || !rule.contextual) && matches(line, rule.match));
  }

  /** 按 id 取规则，供 kernel_analyzer 附加 contextual 结果。 */
  function ruleById(id) {
    return MIGRATION.find((rule) => rule.id === id) || null;
  }

  window.WB_RULES = {
    version: '0.1.0',
    intrinsics: INTRINSICS,
    migration: MIGRATION,
    classifyLine,
    migrationFindings,
    ruleById
  };
})();
