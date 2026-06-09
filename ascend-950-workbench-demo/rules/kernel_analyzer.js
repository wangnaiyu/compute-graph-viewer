/**
 * Kernel Analyzer —— 把一段核源码自动转成 workbench 的 kernel 对象
 * ---------------------------------------------------------------------------
 * 依赖：rules/ascend_migration_rules.js（window.WB_RULES）
 * 产物：与 kernels/*.js 同构的 { id, name, sourceLines, annotations, ... }
 *       可直接喂给现有渲染器 / registerWorkbenchKernel。
 *
 * 三步：
 *   1) 轻量数据流：扫描变量声明，建「变量名 → 内存层级」表（GM/L1/L0A/L0B/L0C/UB/Reg）。
 *   2) 逐行识别：intrinsic 分类 + 关键字迁移规则 + 数据流上下文规则（L1→GM、GM→L0）。
 *   3) 组装 annotations（关键行出卡片，其余出 tagOnly 标签）。
 */
(function () {
  'use strict';

  const RULES = (typeof window !== 'undefined' && window.WB_RULES) || null;

  // 硬件图节点锚点 → 真实 CSS 选择器
  // AIV 节点挂在 #mem950-aiv1；AIC 节点挂在 #mem950-aic（vendor 子模块未初始化时为推定值）；
  // 内存轨 rail:* 为全局节点。
  function anchorToSelector(anchor) {
    if (anchor.startsWith('rail:')) return `[data-mem950-node="${anchor}"]`;
    const aivNodes = ['buffer:UB', 'exec:SIMD', 'exec:SIMT', 'vector:Vector', 'scalar:Scalar'];
    if (aivNodes.includes(anchor)) return `#mem950-aiv1 [data-aiv-node="${anchor}"]`;
    // 其余（cube:CUBE / buffer:L0A|L0B|L0C|L1|FP / scheduler:Dispatch）视为 AIC
    return `#mem950-aic [data-aic-node="${anchor}"]`;
  }

  // ── 1) 数据流：变量 → 内存层级 ──────────────────────────────────────────
  const TIER = { GM: 'GM', L1: 'L1', L0A: 'L0A', L0B: 'L0B', L0C: 'L0C', UB: 'UB', REG: 'Reg' };

  // ASC 地址空间修饰符 → 层级。变量名取「修饰符之后、首个 ; [ = , ) 之前的最后一个标识符」，
  // 以跳过中间的类型 token（如 __gm__ float* zGm → zGm，而非 float）。
  const MODIFIER_TIERS = [
    { mod: '__gm__', tier: TIER.GM },
    { mod: '__ubuf__', tier: TIER.UB },
    { mod: '__cbuf__', tier: TIER.L1 },
    { mod: '__cc__', tier: TIER.L0C },
  ];
  // 模板类张量声明（捕获组即变量名）
  const TENSOR_DECLS = [
    { re: /GlobalTensor<[^>]*>\s+([A-Za-z_]\w*)/g, tier: TIER.GM },
  ];

  // 通过变量名启发式兜底（仅当声明未捕获时）
  function tierByName(name) {
    const n = name.toLowerCase();
    if (/gm$|^gm|global|_gm/.test(n)) return TIER.GM;
    if (/l0c|cc$|_co1|acc/.test(n)) return TIER.L0C;
    if (/l0a|^a1|_a1/.test(n)) return TIER.L0A;
    if (/l0b|^b1|_b1/.test(n)) return TIER.L0B;
    if (/l1$|^l1|cbuf|^a1buf|^b1buf/.test(n)) return TIER.L1;
    if (/local$|ub$|_ub|ubuf|vecin|vecout/.test(n)) return TIER.UB;
    return null;
  }

  function buildVarTiers(sourceText) {
    const tiers = Object.create(null);
    // 修饰符声明：从修饰符位置截到分隔符，取最后一个标识符为变量名
    for (const { mod, tier } of MODIFIER_TIERS) {
      let from = 0;
      let pos;
      while ((pos = sourceText.indexOf(mod, from)) !== -1) {
        from = pos + mod.length;
        const tail = sourceText.slice(from, from + 120);
        const seg = tail.split(/[;[=,)\n{]/)[0]; // 到首个分隔符
        const ids = seg.match(/[A-Za-z_]\w*/g);
        const name = ids && ids[ids.length - 1];
        if (name && !(name in tiers)) tiers[name] = tier;
      }
    }
    for (const { re, tier } of TENSOR_DECLS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sourceText)) !== null) {
        const name = m[1];
        if (name && !(name in tiers)) tiers[name] = tier;
      }
    }
    // 指针/别名传播：  __gm__ float* xGm = x + ...;  →  xGm 继承 x 的层级（若已知）
    const assignRe = /\b([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\b/g;
    let a;
    while ((a = assignRe.exec(sourceText)) !== null) {
      const [, lhs, rhs] = a;
      if (!(lhs in tiers) && tiers[rhs]) tiers[lhs] = tiers[rhs];
    }
    return tiers;
  }

  // 去掉 C 风格强转/取地址，取首个标识符： (__ubuf__ void*)xLocal  → xLocal
  function firstIdent(expr) {
    const cleaned = String(expr)
      .replace(/\([^()]*\)/g, ' ') // 去强转括号
      .replace(/[&*]/g, ' ');
    const m = cleaned.match(/[A-Za-z_]\w*/);
    return m ? m[0] : null;
  }

  // 取 callName(...) 的顶层逗号分隔实参
  function callArgs(line, callName) {
    const idx = line.indexOf(callName + '(');
    if (idx < 0) return null;
    let i = idx + callName.length;
    let depth = 0; const args = []; let cur = '';
    for (; i < line.length; i++) {
      const ch = line[i];
      if (ch === '(') { depth++; if (depth === 1) continue; }
      if (ch === ')') { depth--; if (depth === 0) { args.push(cur); break; } }
      if (ch === ',' && depth === 1) { args.push(cur); cur = ''; continue; }
      cur += ch;
    }
    return args.map((s) => s.trim()).filter(Boolean);
  }

  function tierOf(expr, varTiers) {
    const id = firstIdent(expr);
    if (!id) return null;
    return varTiers[id] || tierByName(id) || null;
  }

  // 解析一行里的搬运源/目的层级（DataCopy(dst, src, ...) 约定第1=dst，第2=src）
  function copyTiers(line, varTiers) {
    for (const fn of ['DataCopy', 'DumpTensor']) {
      const args = callArgs(line, fn);
      if (args && args.length >= 2) {
        return { fn, dst: tierOf(args[0], varTiers), src: tierOf(args[1], varTiers) };
      }
    }
    // LoadData(dst, src, ...) → 关注 GM→L0 直达
    const ld = callArgs(line, 'LoadData');
    if (ld && ld.length >= 2) {
      return { fn: 'LoadData', dst: tierOf(ld[0], varTiers), src: tierOf(ld[1], varTiers) };
    }
    return null;
  }

  // 数据流上下文迁移规则
  function contextualFindings(line, varTiers) {
    const out = [];
    const ct = copyTiers(line, varTiers);
    if (!ct) return out;
    const isL0 = (t) => t === TIER.L0A || t === TIER.L0B;
    if ((ct.fn === 'DataCopy' || ct.fn === 'DumpTensor') && ct.src === TIER.L1 && ct.dst === TIER.GM) {
      const r = RULES.ruleById('l1-to-gm-removed');
      if (r) out.push(r);
    }
    if (ct.fn === 'LoadData' && ct.src === TIER.GM && isL0(ct.dst)) {
      const r = RULES.ruleById('gm-to-l0-removed');
      if (r) out.push(r);
    }
    return out;
  }

  // ── 2) 源码切词：高亮关键字（复用现有 token class）──────────────────────
  const KEYWORDS = /\b(?:if|else|for|while|return|void|const|constexpr|struct|class|template|typename|inline|static|auto|using|namespace|public|private)\b/g;
  const TYPES = /\b(?:uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|int4b_t|float|double|half|bool|size_t|vector|std)\b/g;

  function highlight(code) {
    let h = code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 注释整行
    if (/^\s*(\/\/|\*|\/\*)/.test(code)) return `<span class="tk-comment">${h}</span>`;
    h = h.replace(/"[^"]*"/g, (s) => `<span class="tk-string">${s}</span>`);
    h = h.replace(/\b\d+(?:\.\d+)?[fFuUlL]?\b/g, (s) => `<span class="tk-number">${s}</span>`);
    h = h.replace(TYPES, (s) => `<span class="tk-type">${s}</span>`);
    h = h.replace(KEYWORDS, (s) => `<span class="tk-keyword">${s}</span>`);
    return h;
  }

  // ── 3) 组装 annotations ────────────────────────────────────────────────
  function severityRank(s) { return s === 'high' ? 0 : s === 'medium' ? 1 : 2; }

  function analyze(sourceText, opts) {
    opts = opts || {};
    if (!RULES) throw new Error('WB_RULES 未加载：请先引入 rules/ascend_migration_rules.js');
    const rawLines = String(sourceText).replace(/\r\n/g, '\n').split('\n');
    const varTiers = buildVarTiers(sourceText);
    const id = opts.id || 'uploaded_kernel';
    const annotations = [];
    let keyCount = 0;
    let firstKeyId = null;
    const severityTally = { high: 0, medium: 0, info: 0 };

    rawLines.forEach((code, i) => {
      const lineNo = i + 1;
      const trimmed = code.trim();
      if (!trimmed) return;

      const cls = RULES.classifyLine(code);
      const kwFindings = RULES.migrationFindings(code);
      const ctxFindings = contextualFindings(code, varTiers);
      // 合并迁移规则并按 id 去重
      const findMap = new Map();
      [...ctxFindings, ...kwFindings].forEach((r) => { if (!findMap.has(r.id)) findMap.set(r.id, r); });
      const findings = [...findMap.values()].sort((x, y) => severityRank(x.severity) - severityRank(y.severity));

      const isCompute = cls && (cls.category === 'compute' || cls.category === 'memory');
      const isKey = isCompute || findings.length > 0;

      if (!isKey) {
        if (cls) {
          annotations.push({ id: `l${lineNo}-tag`, line: lineNo, kind: cls.category, tag: cls.tag, tagOnly: true });
        }
        return;
      }

      keyCount++;
      const annId = `l${lineNo}`;
      if (!firstKeyId) firstKeyId = annId;
      const top = findings[0];
      if (top) severityTally[top.severity] = (severityTally[top.severity] || 0) + 1;

      // selectors：优先 intrinsic 的硬件锚点
      const selectors = (cls?.hwNodes || []).map(anchorToSelector);

      // reasons：迁移规则的 verdict + 理由
      const reasons = [];
      if (cls) reasons.push(cls.unit);
      findings.slice(0, 3).forEach((r) => reasons.push(r.title));

      // explanation / rewrite：取最高 severity 的规则
      const explanation = top
        ? `${top.reason} 迁移建议：${top.action}`
        : (cls?.note || '');
      const rewrite = top?.rewriteHint || code.trim();

      annotations.push({
        id: annId,
        line: lineNo,
        kind: cls ? cls.category : 'control',
        tag: cls ? cls.tag : (top ? top.title : '迁移点'),
        code: trimmed,
        short: cls?.note || (top ? top.reason : ''),
        selectors,
        routes: [],
        path: cls ? cls.unit : '',
        verdict: top ? `${top.severity.toUpperCase()} · ${top.title}` : (cls?.unit || ''),
        reasons,
        explanation,
        rewrite,
        // 来源可回溯
        sources: [cls?.source, ...findings.map((r) => r.source)].filter(Boolean),
        findings: findings.map((r) => ({ id: r.id, severity: r.severity, verdict910: r.verdict910, verdict950: r.verdict950 })),
        metrics: {
          confidence: cls ? '识别' : '弱',
          cycles: top ? top.severity : '—',
          pressure: cls ? cls.category : '—'
        }
      });
    });

    const verdict = severityTally.high > 0
      ? `需改 ${severityTally.high} 处`
      : severityTally.medium > 0 ? `需调整 ${severityTally.medium} 处` : '可平滑迁移';

    return {
      id,
      name: opts.name || `${id}.asc`,
      label: opts.label || id,
      path: opts.path || '(uploaded)',
      summary: opts.summary || '用户上传核 · 规则集自动识别',
      target: 'Ascend 950',
      analysis: '规则集静态识别 + 910B 迁移检查',
      verdict,
      defaultTier: 't1',
      selectedId: firstKeyId,
      sourceLines: rawLines,
      annotations,
      // 元信息（调试/汇总用）
      _meta: { varTiers, keyCount, severityTally }
    };
  }

  window.WB_ANALYZER = { analyze, buildVarTiers, anchorToSelector, highlight };
})();
