/* ② 权重 / Shape Inspector：Weight Diff(normal vs anomaly 直方图) + 路由热图。
   监听 select：按 weightKey 渲染对应权重。 */
window.Inspector = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  let host = null, tipEl = null, currentWeightKey = 'gate';
  const TIPS = {
    shape: 'Shape 表示权重或 dispatch 张量维度；维度变窄说明该 rank 看到的路由/专家分片不完整。',
    stat: 'Stat 是该权重分布的摘要；-inf 或方差塌缩会直接影响 router 打分。',
    dispatch: 'Dispatch shape 是 Gate 将 token 分发到 TP/专家列前的张量形状；Rank2 从 4 列变成 1 列是跨 rank 不一致证据。',
    topology: 'Rank 拓扑总图把 ParallelDemo 的 DP/PP/TP rank 网格放到当前事故里：先看 TP2 在全局并行网格中的位置，再看下方路由热图里的 0 token 证据。',
    heatmap: '路由热图显示专家组 × TP rank 的 token 负载；颜色越亮表示负载越高，斜线空白表示 0 token 未激活。',
  };

  function hist(container, data, colorVar, danger) {
    const W = 200, H = 64, n = data.length, bw = W / n;
    const max = Math.max(...data, 0.001);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'insp-hist', preserveAspectRatio: 'none' });
    const title = svg('title', {});
    title.textContent = danger ? '异常权重分布：最左桶代表 -inf 下溢。' : '正常权重分布：用于和异常 step 对比。';
    s.appendChild(title);
    data.forEach((v, i) => {
      const h = (v / max) * (H - 4);
      const isOver = danger && i === 0;            // 最左桶 = -inf 下溢
      s.appendChild(svg('rect', { x: (i * bw + 0.5).toFixed(1), y: (H - h).toFixed(1), width: (bw - 1).toFixed(1), height: h.toFixed(1),
        fill: isOver ? 'var(--danger)' : `var(${colorVar})`, opacity: isOver ? '0.95' : '0.7' }));
    });
    container.appendChild(s);
  }

  function label(text, className, title) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    if (title) el.title = title;
    return el;
  }

  function heatTitle(row, col, value, anomalyCol) {
    if (col === anomalyCol) {
      return `专家组${row} × TP${col} · 0 token · 未激活：W_gate Rank2 分片 -inf 下溢后，路由分数失效，没有 token 分配到该列。`;
    }
    return `专家组${row} × TP${col} · 负载 ${value.toFixed(2)}：该专家组在此 TP rank 有正常 token 分配。`;
  }

  const TOPOLOGY_STEPS = [
    { id: 'batch', label: 'one step batch', nodeId: 'token_ids', stage: 0, caption: 'global batch 2048 进入 DP 切分。', shard: () => 'batch shard' },
    { id: 'embedding', label: 'Embedding', nodeId: 'embedding', stage: 0, caption: 'Token IDs 查表为 hidden 向量。', shard: (t, cfg) => `Emb ${t + 1}/${cfg.TP}` },
    { id: 'attention', label: 'Attention', nodeId: 'attention', stage: 1, caption: 'QKV / attention heads 按 TP 切分。', shard: (t, cfg) => `Head ${t + 1}/${cfg.TP}` },
    { id: 'moe_norm', label: 'MoE Norm', nodeId: 'moe_norm', stage: 2, caption: '进入 Router 前做 RMSNorm，稳定 hidden 尺度。', shard: () => 'hidden' },
    { id: 'gate', label: 'Gate Router', nodeId: 'gate', stage: 3, caption: 'W_gate 产生专家路由分数；TP2 分片出现 -inf。', anomaly: true, shard: (t, cfg, bad) => bad ? 'W_gate -inf' : `W_gate ${t + 1}/${cfg.TP}` },
    { id: 'dispatch', label: 'All-to-All Dispatch', nodeId: 'a2a_dispatch', stage: 3, caption: '按路由结果把 token 发往专家所在 rank；TP2 变成 0 token。', anomaly: true, shard: (t, cfg, bad) => bad ? '0 token' : 'tokens out' },
    { id: 'experts', label: 'MoGE Experts', nodeId: 'experts', stage: 4, caption: '专家 FFN 处理被路由到本 rank 的 token；TP2 专家列未激活。', anomaly: true, shard: (t, cfg, bad) => bad ? 'experts idle' : 'experts active' },
    { id: 'combine', label: 'All-to-All Combine', nodeId: 'a2a_combine', stage: 5, caption: '专家输出再交换回原 token 位置；TP2 汇聚量同样异常。', anomaly: true, shard: (t, cfg, bad) => bad ? 'no return' : 'tokens back' },
    { id: 'final_norm', label: 'Final Norm', nodeId: 'final_norm', stage: 6, caption: '输出进入 LM Head 前再归一化。', shard: () => 'hidden' },
    { id: 'lm_head', label: 'LM Head', nodeId: 'lm_head', stage: 7, caption: 'hidden 投到词表空间。', shard: (t, cfg) => `vocab ${t + 1}/${cfg.TP}` },
    { id: 'logits', label: 'logits / loss', nodeId: 'logits', stage: 7, caption: '生成 logits 原始得分，计算 loss。', shard: () => 'loss input' },
  ];

  let topologyStepIndex = 0;
  let topologyPlaying = false;
  let topologyTimer = null;
  let topologyUi = null;

  function panguParallelConfig() {
    const cfg = (window.TS_DATA && window.TS_DATA.config) || {};
    return { DP: cfg.DP || 32, PP: cfg.PP || 8, TP: cfg.TP || 4, CP: cfg.CP || 1 };
  }

  function globalRank(dp, pp, tp, cfg) {
    return ((dp * cfg.PP + pp) * cfg.CP) * cfg.TP + tp;
  }

  function topologyStepAt(index) {
    const len = TOPOLOGY_STEPS.length;
    return TOPOLOGY_STEPS[((index % len) + len) % len];
  }

  function emitTopologySelect(step) {
    if (!step || !step.nodeId) return;
    const m = window.CrossMap ? CrossMap.resolve(step.nodeId) : { relatedNodeIds: [], cols: [], weightKey: null };
    Bus.emit('select', {
      objectType: 'node',
      id: step.nodeId,
      relatedNodeIds: m.relatedNodeIds,
      cols: m.cols,
      weightKey: m.weightKey,
      source: 'topology-playback',
    });
  }

  function stopTopologyPlayback() {
    topologyPlaying = false;
    if (topologyTimer) clearInterval(topologyTimer);
    topologyTimer = null;
    if (topologyUi && topologyUi.playBtn) topologyUi.playBtn.textContent = '▶';
  }

  function setTopologyStep(index, broadcast) {
    topologyStepIndex = ((index % TOPOLOGY_STEPS.length) + TOPOLOGY_STEPS.length) % TOPOLOGY_STEPS.length;
    const step = topologyStepAt(topologyStepIndex);
    if (topologyUi) updateTopologyUi(step);
    if (broadcast) emitTopologySelect(step);
  }

  function updateTopologyUi(step) {
    const ui = topologyUi;
    if (!ui || !step) return;
    const cfg = ui.cfg, hm = ui.hm, stage = Math.min(step.stage, cfg.PP - 1);
    ui.range.value = String(topologyStepIndex);
    ui.stepLabel.textContent = step.label;
    ui.stageMeta.textContent = `绘制 PP${stage} × DP0-${ui.visibleDp - 1} × TP0-${cfg.TP - 1}`;
    ui.caption.textContent = step.caption;
    ui.playBtn.textContent = topologyPlaying ? 'Ⅱ' : '▶';
    ui.batch.classList.toggle('is-active', step.id === 'batch');
    ui.logits.classList.toggle('is-active', step.id === 'logits');
    ui.logits.textContent = step.id === 'logits' ? '生成 logits 原始得分，计算 loss' : 'logits / loss';

    ui.stageChips.forEach((chip, i) => {
      chip.classList.toggle('is-active', i === stage);
      chip.classList.toggle('is-flow-active', i === stage && step.id !== 'batch' && step.id !== 'logits');
    });
    ui.flowChips.forEach((chip, i) => chip.classList.toggle('is-active', i === topologyStepIndex));

    ui.cells.forEach(cell => {
      const d = +cell.dataset.d, t = +cell.dataset.t;
      const badCol = t === hm.anomalyCol;
      const activeBad = !!step.anomaly && badCol;
      const r = globalRank(d, stage, t, cfg);
      cell.classList.toggle('is-bad', badCol);
      cell.classList.toggle('is-active', true);
      cell.classList.toggle('is-anomaly-active', activeBad);
      cell.querySelector('b').textContent = 'r' + String(r).padStart(3, '0');
      cell.querySelector('span').textContent = `DP${d} · PP${stage} · TP${t}`;
      cell.querySelector('em').textContent = step.shard ? step.shard(t, cfg, activeBad) : `TP ${t + 1}/${cfg.TP}`;
      const tip =
        `播放步骤：${step.label}。global rank r${r} · DP${d} · PP${stage} · TP${t}。` +
        (activeBad ? '该 TP2 列当前为 0 token 异常路径。' : `该 rank 执行 ${cell.querySelector('em').textContent}。`);
      cell.title = tip;
      cell.dataset.tip = tip;
      cell.setAttribute('aria-label', tip);
    });
  }

  function renderRankTopology(w) {
    const hm = w.routingHeatmap;
    const cfg = panguParallelConfig();
    const total = cfg.DP * cfg.PP * cfg.CP * cfg.TP;
    const visibleDp = Math.min(8, cfg.DP);
    const stageNames = [
      'Embedding / early blocks',
      'Attention blocks',
      'Dense FFN blocks',
      'MoE router stage',
      'MoGE experts',
      'MoE combine',
      'late blocks',
      'Norm / LM head',
    ];

    const block = document.createElement('div');
    block.className = 'insp-block rank-topo-block';
    block.innerHTML =
      `<div class="insp-title">Rank 拓扑总图 <span class="insp-hint" title="${TIPS.topology}">ParallelDemo rank map · 自动播放</span></div>` +
      '<div class="rank-topo-transport">' +
      '<button class="rank-play-btn" type="button" title="播放 / 暂停拓扑流">▶</button>' +
      `<input class="rank-play-range" type="range" min="0" max="${TOPOLOGY_STEPS.length - 1}" step="1" value="${topologyStepIndex}" title="拖动查看 Pangu 算子流步骤">` +
      '<span class="rank-play-step"></span>' +
      '</div>' +
      '<div class="rank-topo-meta">' +
      `<span title="Pangu Pro MoE 全局并行规模">全局 ${cfg.DP}DP × ${cfg.PP}PP × ${cfg.TP}TP = ${total} ranks</span>` +
      `<span class="rank-stage-meta" title="右侧为了可读性绘制当前播放 stage 的代表性诊断窗口">绘制 PP0 × DP0-${visibleDp - 1} × TP0-${cfg.TP - 1}</span>` +
      `<span class="bad" title="异常不是单个 global rank 2，而是 TP rank 2 这一整列">异常 TP${hm.anomalyCol} / Rank2 列</span>` +
      '</div>';

    const batch = document.createElement('div');
    batch.className = 'rank-batch-card';
    batch.textContent = 'one step batch · 2048 训练样本';
    batch.title = '一个训练 step 的 global batch 先被 DP 切成多个数据分片，再进入 pipeline。';
    bindTip(batch, batch.title);
    block.appendChild(batch);

    const stages = document.createElement('div');
    stages.className = 'rank-stage-strip';
    const stageChips = [];
    for (let p = 0; p < cfg.PP; p++) {
      const chip = document.createElement('div');
      chip.className = 'rank-stage-chip';
      chip.innerHTML = `<b>PP${p}</b><span>${stageNames[p] || 'Transformer blocks'}</span>`;
      const tip = `PP${p} · ${stageNames[p] || 'Transformer blocks'}。点击可跳到该 stage 的代表算子。`;
      chip.title = tip;
      bindTip(chip, tip);
      chip.addEventListener('click', () => {
        const idx = TOPOLOGY_STEPS.findIndex(s => Math.min(s.stage, cfg.PP - 1) === p);
        setTopologyStep(idx >= 0 ? idx : 0, true);
      });
      stageChips.push(chip);
      stages.appendChild(chip);
    }
    block.appendChild(stages);

    const flow = document.createElement('div');
    flow.className = 'rank-flow-rail';
    const flowChips = TOPOLOGY_STEPS.map((step, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rank-flow-chip';
      chip.textContent = step.label;
      chip.title = step.caption;
      bindTip(chip, step.caption);
      chip.addEventListener('click', () => setTopologyStep(i, true));
      flow.appendChild(chip);
      return chip;
    });
    block.appendChild(flow);

    const grid = document.createElement('div');
    grid.className = 'rank-topo-grid';
    grid.style.gridTemplateColumns = `34px repeat(${cfg.TP}, minmax(54px, 1fr))`;
    grid.appendChild(label('DP', 'rank-topo-label', '每一行是一个 DP 副本；这里只绘制前 8 个代表性 DP slice。'));
    for (let t = 0; t < cfg.TP; t++) {
      const head = label(`TP${t}`, 'rank-topo-label rank-topo-col' + (t === hm.anomalyCol ? ' is-bad' : ''), `TP rank ${t}` + (t === hm.anomalyCol ? '：异常列，W_gate 第 3/4 分片。' : '：正常参与 Gate 路由。'));
      grid.appendChild(head);
    }
    const cells = [];
    for (let d = 0; d < visibleDp; d++) {
      grid.appendChild(label(`DP${d}`, 'rank-topo-label rank-topo-row', `DP slice ${d}`));
      for (let t = 0; t < cfg.TP; t++) {
        const bad = t === hm.anomalyCol;
        const cell = document.createElement('div');
        cell.className = 'rank-topo-cell' + (bad ? ' is-bad' : '');
        cell.dataset.d = String(d);
        cell.dataset.t = String(t);
        cell.tabIndex = 0;
        cell.innerHTML =
          '<b></b>' +
          '<span></span>' +
          '<em></em>';
        bindTip(cell, '播放拓扑时显示该 rank 的 DP/PP/TP 坐标与当前算子分片。');
        cells.push(cell);
        grid.appendChild(cell);
      }
    }
    block.appendChild(grid);

    const logits = document.createElement('div');
    logits.className = 'rank-logits-card';
    logits.textContent = 'logits / loss';
    logits.title = '最后生成词表 logits 原始得分，进入 loss。';
    bindTip(logits, logits.title);
    block.appendChild(logits);

    const cap = document.createElement('div');
    cap.className = 'rank-topo-caption';
    cap.textContent = '拖动或播放顶部条：右侧拓扑跟着算子流变化，中间 Pangu 架构图同步选中当前算子。';
    block.appendChild(cap);

    const playBtn = block.querySelector('.rank-play-btn');
    const range = block.querySelector('.rank-play-range');
    const stepLabel = block.querySelector('.rank-play-step');
    const stageMeta = block.querySelector('.rank-stage-meta');
    topologyUi = { block, cfg, hm, visibleDp, playBtn, range, stepLabel, stageMeta, batch, logits, caption: cap, stageChips, flowChips, cells };
    playBtn.addEventListener('click', () => {
      topologyPlaying = !topologyPlaying;
      if (topologyPlaying) {
        setTopologyStep(topologyStepIndex, true);
        topologyTimer = setInterval(() => setTopologyStep(topologyStepIndex + 1, true), 950);
      } else {
        stopTopologyPlayback();
      }
      updateTopologyUi(topologyStepAt(topologyStepIndex));
    });
    range.addEventListener('input', () => {
      stopTopologyPlayback();
      setTopologyStep(+range.value, true);
    });
    setTopologyStep(topologyStepIndex, false);
    return block;
  }

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'ts-tooltip';
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function placeTip(event) {
    const tip = ensureTip();
    const pad = 14;
    const x = Math.min(window.innerWidth - tip.offsetWidth - pad, event.clientX + 12);
    const y = Math.min(window.innerHeight - tip.offsetHeight - pad, event.clientY + 12);
    tip.style.left = Math.max(pad, x) + 'px';
    tip.style.top = Math.max(pad, y) + 'px';
  }

  function showTip(text, event) {
    const tip = ensureTip();
    tip.textContent = text;
    tip.classList.add('is-visible');
    placeTip(event);
  }

  function hideTip() {
    if (tipEl) tipEl.classList.remove('is-visible');
  }

  function bindTip(el, text) {
    el.dataset.tip = text;
    el.setAttribute('aria-label', text);
    el.addEventListener('mouseenter', e => showTip(text, e));
    el.addEventListener('mousemove', placeTip);
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', e => {
      const rect = el.getBoundingClientRect();
      showTip(text, { clientX: rect.right, clientY: rect.top });
    });
    el.addEventListener('blur', hideTip);
  }

  function render(weightKey) {
    currentWeightKey = weightKey || 'gate';
    const w = window.WEIGHT_DATA[weightKey] || window.WEIGHT_DATA.gate;
    host.innerHTML = '';

    // Weight Diff
    const diff = document.createElement('div'); diff.className = 'insp-block';
    diff.innerHTML = `<div class="insp-title">${w.title} · Weight Diff</div>`;
    const cols = document.createElement('div'); cols.className = 'insp-diff';
    const normal = document.createElement('div'); normal.className = 'insp-col';
    normal.title = 'Normal：健康 step 的权重形状和统计分布，作为对照基线。';
    normal.innerHTML = `<div class="insp-col-head"><span class="insp-dot ok"></span>normal</div><div class="insp-shape" title="${TIPS.shape} 当前值：${w.normal.shape.join(' × ')}">${w.normal.shape.join(' × ')}</div><div class="insp-stat" title="${TIPS.stat} 当前值：${w.normal.stat}">${w.normal.stat}</div>`;
    const anom = document.createElement('div'); anom.className = 'insp-col';
    anom.title = `Step ${w.anomaly.step}：异常 step 的权重形状和数值分布。`;
    anom.innerHTML = `<div class="insp-col-head"><span class="insp-dot bad"></span>Step ${w.anomaly.step}</div><div class="insp-shape bad" title="${TIPS.shape} 当前值：${w.anomaly.shape.join(' × ')}">${w.anomaly.shape.join(' × ')}</div><div class="insp-stat bad" title="${TIPS.stat} 当前值：${w.anomaly.note}">${w.anomaly.note}</div>`;
    cols.appendChild(normal); cols.appendChild(anom);
    diff.appendChild(cols);
    const charts = document.createElement('div'); charts.className = 'insp-diff';
    const c1 = document.createElement('div'); c1.className = 'insp-col'; const c2 = document.createElement('div'); c2.className = 'insp-col';
    charts.appendChild(c1); charts.appendChild(c2); diff.appendChild(charts);
    host.appendChild(diff);
    hist(c1, w.normal.hist, '--highlight-l0a-violet-source', false);
    hist(c2, w.anomaly.hist, '--highlight-l0a-violet-source', true);

    // dispatch shape
    const ds = document.createElement('div'); ds.className = 'insp-block';
    ds.innerHTML = `<div class="insp-title">Gate dispatch shape</div>
      <div class="insp-kv" title="${TIPS.dispatch} 其余 rank 正常值：${w.dispatch.normal}"><span>其余 rank</span><code>${w.dispatch.normal}</code></div>
      <div class="insp-kv bad" title="${TIPS.dispatch} TP2 / Rank2 异常值：${w.dispatch.anomaly}"><span>TP2 / Rank2</span><code>${w.dispatch.anomaly}</code></div>`;
    host.appendChild(ds);

    // Rank 拓扑总图：把 ParallelDemo 的 rank map 语义放进当前诊断上下文
    host.appendChild(renderRankTopology(w));

    // 路由热图
    const hm = w.routingHeatmap;
    const hb = document.createElement('div'); hb.className = 'insp-block';
    hb.innerHTML = `<div class="insp-title">路由热图 <span class="insp-hint" title="${TIPS.heatmap}">行=专家组 · 列=TP rank</span></div>`;
    const grid = document.createElement('div'); grid.className = 'insp-heat';
    // 格子尺寸用字面值写死在 JS，避免被 app.css 的 --insp-heat-cell 反复改小
    const CELL = 48;
    grid.style.gridTemplateColumns = `36px repeat(${hm.cols}, ${CELL}px)`;
    grid.style.gap = '6px';
    grid.appendChild(label('组', 'insp-heat-label', '每一行是一组 MoGE 专家。'));
    for (let c = 0; c < hm.cols; c++) {
      grid.appendChild(label(`TP${c}`, 'insp-heat-label insp-heat-col', `TP rank ${c}` + (c === hm.anomalyCol ? '：异常空白列。' : '：正常参与路由。')));
    }
    hm.matrix.forEach((row, r) => {
      grid.appendChild(label(`G${r}`, 'insp-heat-label insp-heat-row', `专家组${r}`));
      row.forEach((v, c) => {
        const cell = document.createElement('div'); cell.className = 'insp-heat-cell';
        cell.style.width = cell.style.height = CELL + 'px';
        cell.tabIndex = 0;
        const text = heatTitle(r, c, v, hm.anomalyCol);
        cell.title = text;
        bindTip(cell, text);
        if (c === hm.anomalyCol) { cell.classList.add('blank'); }
        else { cell.style.background = `color-mix(in srgb, var(--highlight-ub-green-source) ${Math.round(v * 100)}%, transparent)`; }
        grid.appendChild(cell);
      });
    });
    hb.appendChild(grid);
    const lg = document.createElement('div'); lg.className = 'insp-heat-legend';
    lg.innerHTML = `<span><i class="sw blank"></i>Rank2 列空白（未激活）</span>`;
    hb.appendChild(lg);
    const cap = document.createElement('div'); cap.className = 'insp-heat-caption';
    cap.textContent = 'Rank2 的 W_gate 分片因 -inf 下溢，路由打分全部失效，没有 token 被分配到 TP2 列，因此整列专家未激活。';
    hb.appendChild(cap);
    host.appendChild(hb);
  }

  function init(el) {
    host = el;
    render('gate');
    Bus.on('select', p => {
      if (!p || !p.weightKey || p.source === 'topology-playback' || p.weightKey === currentWeightKey) return;
      render(p.weightKey);
    });
  }
  return { init };
})();
