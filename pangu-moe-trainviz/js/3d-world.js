(function initTrainScope3DWorld() {
  'use strict';

  const ASCEND_LOGO = '../hpc-topology-viewer-main/src/assets/ascend-logo.svg';
  const MODEL = {
    id: 'openPangu-Ultra-MoE-718B',
    blocks: 61,
    denseBlocks: 3,
    routedExperts: 256,
    expertsPerToken: 8,
  };
  const PARALLEL = { dp: 32, pp: 16, cp: 1, tp: 8, ep: 32 };
  const WINDOW = { dp: [2, 3], pp: [5, 6] };
  const WORLD = { width: 900, height: 570 };
  const NODE = { w: 300, h: 190 };
  const RANK = { w: 78, h: 43 };
  const DEFAULT_RANK = 299;
  const TOTAL_STEPS = 32;
  const BASE_STEP = 1992;

  const state = {
    selectedRankId: DEFAULT_RANK,
    hoveredLinkId: null,
    yaw: -36,
    pitch: 58,
    zoom: 96,
    playing: false,
    step: 6,
    overlays: { tp: true, dp: true, pp: true, ep: true, runtime: true },
  };

  const els = {
    body: document.body,
    root: document.documentElement,
    worldCamera: document.getElementById('worldCamera'),
    worldPlane: document.getElementById('worldPlane'),
    worldLinks: document.getElementById('worldLinks'),
    nodeLayer: document.getElementById('nodeLayer'),
    rankLayer: document.getElementById('rankLayer'),
    blockLattice: document.getElementById('blockLattice'),
    zStack: document.getElementById('zStack'),
    frontView: document.getElementById('frontView'),
    rightView: document.getElementById('rightView'),
    inspectorBody: document.getElementById('inspectorBody'),
    placementSummary: document.getElementById('placementSummary'),
    tip: document.getElementById('tip'),
    tipTitle: document.getElementById('tipTitle'),
    tipBody: document.getElementById('tipBody'),
    infoPanel: document.getElementById('infoPanel'),
    settingsPanel: document.getElementById('settingsPanel'),
    playbackMount: document.getElementById('playbackMount'),
    yawSlider: document.getElementById('yawSlider'),
    pitchSlider: document.getElementById('pitchSlider'),
    zoomSlider: document.getElementById('zoomSlider'),
  };

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function stageBlockRange(pp) {
    const base = Math.floor(MODEL.blocks / PARALLEL.pp);
    const remainder = MODEL.blocks % PARALLEL.pp;
    const count = base + (pp < remainder ? 1 : 0);
    let start = 0;
    for (let i = 0; i < pp; i += 1) start += base + (i < remainder ? 1 : 0);
    return { start, end: start + count - 1, count };
  }

  function ppForBlock(blockId) {
    for (let pp = 0; pp < PARALLEL.pp; pp += 1) {
      const range = stageBlockRange(pp);
      if (blockId >= range.start && blockId <= range.end) return pp;
    }
    return PARALLEL.pp - 1;
  }

  function rankIdFor({ dp, pp, cp = 0, tp }) {
    return ((dp * PARALLEL.pp + pp) * PARALLEL.cp + cp) * PARALLEL.tp + tp;
  }

  function epFor({ pp, tp }) {
    return ((pp - WINDOW.pp[0]) * PARALLEL.tp + tp + 16) % PARALLEL.ep;
  }

  function expertBucket(ep) {
    const perBucket = MODEL.routedExperts / PARALLEL.ep;
    const start = ep * perBucket;
    return { start, end: start + perBucket - 1, count: perBucket };
  }

  function sampleShard(dp) {
    const perDp = 1024 / PARALLEL.dp;
    const start = dp * perDp;
    return { start, end: start + perDp - 1, count: perDp };
  }

  const nodes = [
    { id: 'n0', label: 'DP2 · PP5', dp: 2, pp: 5, x: 120, y: 82 },
    { id: 'n1', label: 'DP2 · PP6', dp: 2, pp: 6, x: 500, y: 82 },
    { id: 'n2', label: 'DP3 · PP5', dp: 3, pp: 5, x: 120, y: 330 },
    { id: 'n3', label: 'DP3 · PP6', dp: 3, pp: 6, x: 500, y: 330 },
  ].map((node) => {
    const range = stageBlockRange(node.pp);
    return {
      ...node,
      w: NODE.w,
      h: NODE.h,
      cx: node.x + NODE.w / 2,
      cy: node.y + NODE.h / 2,
      blockRange: range,
    };
  });

  const ranks = nodes.flatMap((node) => Array.from({ length: PARALLEL.tp }, (_, tp) => {
    const col = tp % 2;
    const row = Math.floor(tp / 2);
    const x = node.x + 48 + col * 114;
    const y = node.y + 54 + row * 30;
    const rankId = rankIdFor({ dp: node.dp, pp: node.pp, tp });
    const ep = epFor({ pp: node.pp, tp });
    const bucket = expertBucket(ep);
    return {
      id: rankId,
      nodeId: node.id,
      nodeLabel: node.label,
      dp: node.dp,
      pp: node.pp,
      cp: 0,
      tp,
      ep,
      x,
      y,
      cx: x + RANK.w / 2,
      cy: y + RANK.h / 2,
      blockRange: node.blockRange,
      expertRange: bucket,
      sampleShard: sampleShard(node.dp),
    };
  }));

  const rankById = new Map(ranks.map((rank) => [rank.id, rank]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let linkRecords = [];
  let playbackApi = null;
  let playbackTimer = null;

  const runtimeFrames = [
    {
      phase: 'forward',
      label: 'Forward activation',
      detail: 'activation 沿 PP stage 从 PP5 推到 PP6；这是动态 tensor 流，不改变 weight ownership。',
    },
    {
      phase: 'moe_dispatch',
      label: 'MoE dispatch · All-to-All',
      detail: 'Router Top-8 后，token 被发送到承载 EP bucket 的 rank。线宽/热度代表 synthetic token bytes。',
    },
    {
      phase: 'expert_compute',
      label: 'Expert compute',
      detail: '目标 rank 在 blocks 20-23 的 MoE 层执行 routed experts E152-E159 与 shared expert。',
    },
    {
      phase: 'backward',
      label: 'Backward gradient',
      detail: 'gradient 从后续 PP stage 回传，参数更新仍落在 owning rank 的 weight shard 上。',
    },
    {
      phase: 'dp_sync',
      label: 'DP gradient sync',
      detail: '同一 PP/TP/EP 坐标跨 DP replica 做梯度同步；这里聚合为 node-layer DP 边。',
    },
    {
      phase: 'tp_sync',
      label: 'TP shard sync',
      detail: '同一 node 内 TP0-7 协同完成矩阵 shard 的 all-reduce / all-gather。',
    },
  ];

  function selectedRank() {
    return rankById.get(state.selectedRankId) || rankById.get(DEFAULT_RANK) || ranks[0];
  }

  function renderWorld() {
    els.nodeLayer.innerHTML = nodes.map((node) => `
      <div class="ts3d-node" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px"
        data-tip-title="Node slab · ${escapeHtml(node.label)}"
        data-tip-body="Node slab 聚合跨节点 DP/PP/Fabric 逻辑通信。该 node 包含 rank ${rankIdFor({ dp: node.dp, pp: node.pp, tp: 0 })}-${rankIdFor({ dp: node.dp, pp: node.pp, tp: 7 })}，覆盖 blocks ${node.blockRange.start}-${node.blockRange.end}。">
        <div class="ts3d-node-label">
          <strong>${escapeHtml(node.id.toUpperCase())}</strong>
          <span>${escapeHtml(node.label)} · B${node.blockRange.start}-${node.blockRange.end}</span>
        </div>
      </div>
    `).join('');

    els.rankLayer.innerHTML = ranks.map((rank) => {
      const bucket = `E${rank.expertRange.start}-${rank.expertRange.end}`;
      return `
        <button class="ts3d-rank" type="button" data-rank-id="${rank.id}" style="left:${rank.x}px;top:${rank.y}px"
          data-tip-title="rank_${rank.id} · DP${rank.dp} / PP${rank.pp} / TP${rank.tp} / EP${rank.ep}"
          data-tip-body="运行在 device 910B_${rank.id}；覆盖 blocks ${rank.blockRange.start}-${rank.blockRange.end}；持有 TP${rank.tp} weight shard；MoE bucket ${bucket}。">
          <img class="ts3d-rank-logo" src="${ASCEND_LOGO}" alt="">
          <span class="ts3d-rank-main"><span>r${rank.id}</span><i class="ts3d-ep-badge">E${rank.ep}</i></span>
        </button>
      `;
    }).join('');

    els.zStack.innerHTML = Array.from({ length: MODEL.blocks }, (_, blockId) => `
      <span class="ts3d-z-segment ${blockId < MODEL.denseBlocks ? 'is-dense' : ''}" data-block-id="${blockId}"
        data-tip-title="Block ${blockId} · ${blockId < MODEL.denseBlocks ? 'Dense' : 'MoE'}"
        data-tip-body="Block ${blockId} 属于 PP${ppForBlock(blockId)}；${blockId < MODEL.denseBlocks ? 'Dense block 不做专家路由。' : 'MoE block 含 Router、256 routed experts、1 shared expert。'}"></span>
    `).join('');

    renderBlockLattice();
    renderLinks();
    renderProjections();
    syncSelection(false);
  }

  function renderBlockLattice() {
    els.blockLattice.innerHTML = Array.from({ length: MODEL.blocks }, (_, blockId) => `
      <button class="ts3d-block-cell ${blockId < MODEL.denseBlocks ? 'is-dense' : 'is-moe'}" type="button" data-block-id="${blockId}"
        aria-label="Block ${blockId}"
        data-tip-title="Block ${blockId} · ${blockId < MODEL.denseBlocks ? 'Dense' : 'MoE'}"
        data-tip-body="Block ${blockId} 映射到 PP${ppForBlock(blockId)}。点击后会选中当前窗口内对应 PP stage 的 rank。"></button>
    `).join('');
  }

  function addLink(svgParts, record) {
    const commonAttrs = `data-link-id="${record.id}" data-tip-title="${escapeHtml(record.tipTitle)}" data-tip-body="${escapeHtml(record.tipBody)}"`;
    const visibleClasses = [
      'ts3d-link',
      `ts3d-link-${record.kind}`,
      record.node ? 'is-node' : '',
      record.fabric ? 'is-fabric' : '',
      record.runtime ? 'is-runtime' : '',
    ].filter(Boolean).join(' ');
    svgParts.push(`<path class="${visibleClasses}" data-visible-link-id="${record.id}" d="${record.d}"></path>`);
    svgParts.push(`<path class="ts3d-link-hit" ${commonAttrs} d="${record.d}"></path>`);
    linkRecords.push(record);
  }

  function linePath(a, b) {
    return `M ${a.cx.toFixed(1)} ${a.cy.toFixed(1)} L ${b.cx.toFixed(1)} ${b.cy.toFixed(1)}`;
  }

  function curvePath(a, b, lift = -82) {
    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2 + lift;
    return `M ${a.cx.toFixed(1)} ${a.cy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.cx.toFixed(1)} ${b.cy.toFixed(1)}`;
  }

  function renderLinks() {
    linkRecords = [];
    const svgParts = [
      '<defs>',
      '<marker id="ts3d-arrow-pp" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--ts3d-pp)"></path></marker>',
      '<marker id="ts3d-arrow-runtime" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--ts3d-runtime)"></path></marker>',
      '</defs>',
    ];

    nodes.forEach((node) => {
      const group = ranks.filter((rank) => rank.nodeId === node.id);
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const a = group[i];
          const b = group[j];
          addLink(svgParts, {
            id: `tp-${a.id}-${b.id}`,
            kind: 'tp',
            sourceRank: a.id,
            targetRank: b.id,
            sourceNode: node.id,
            targetNode: node.id,
            d: linePath(a, b),
            tipTitle: `TP link · rank_${a.id} ↔ rank_${b.id}`,
            tipBody: `同一 node 内 TP${a.tp} ↔ TP${b.tp}。用于同一 PP stage 内矩阵/attention shard 的 all-reduce / all-gather。`,
          });
        }
      }
    });

    const pairNodes = (predicate) => {
      const out = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          if (predicate(nodes[i], nodes[j])) out.push([nodes[i], nodes[j]]);
        }
      }
      return out;
    };

    pairNodes((a, b) => a.pp === b.pp).forEach(([a, b]) => {
      addLink(svgParts, {
        id: `dp-${a.id}-${b.id}`,
        kind: 'dp',
        node: true,
        sourceNode: a.id,
        targetNode: b.id,
        d: linePath(a, b),
        tipTitle: `DP node link · ${a.label} ↔ ${b.label}`,
        tipBody: `保持 PP${a.pp} 不变，跨 DP replica 做梯度同步。该 node edge 聚合 ${PARALLEL.tp} 条同 TP rank lane。`,
      });
    });

    pairNodes((a, b) => a.dp === b.dp).forEach(([a, b]) => {
      addLink(svgParts, {
        id: `pp-${a.id}-${b.id}`,
        kind: 'pp',
        node: true,
        sourceNode: a.id,
        targetNode: b.id,
        d: linePath(a, b),
        tipTitle: `PP node link · ${a.label} ↔ ${b.label}`,
        tipBody: `保持 DP${a.dp} 不变，跨 PP stage 传递 activation / gradient。该 node edge 聚合 ${PARALLEL.tp} 条同 TP rank lane。`,
      });
    });

    pairNodes(() => true).forEach(([a, b]) => {
      addLink(svgParts, {
        id: `fabric-${a.id}-${b.id}`,
        kind: 'fabric',
        node: true,
        fabric: true,
        sourceNode: a.id,
        targetNode: b.id,
        d: linePath(a, b),
        tipTitle: `Fabric reachability · ${a.id.toUpperCase()} ↔ ${b.id.toUpperCase()}`,
        tipBody: 'Fabric edge 表达 node 间基础可达性，不等同于某个训练并行组。',
      });
    });

    const rank = selectedRank();
    const sameDpNextP = ranks.filter((item) => item.dp === rank.dp && item.pp === Math.min(PARALLEL.pp - 1, rank.pp + 1));
    const targetRanks = sameDpNextP.length ? sameDpNextP.filter((item) => item.tp === rank.tp || item.ep === rank.ep) : [rank];
    targetRanks.forEach((target, index) => {
      addLink(svgParts, {
        id: `runtime-${rank.id}-${target.id}-${index}`,
        kind: 'runtime',
        runtime: true,
        sourceRank: rank.id,
        targetRank: target.id,
        sourceNode: rank.nodeId,
        targetNode: target.nodeId,
        d: curvePath(rank, target, index % 2 === 0 ? -72 : 72),
        tipTitle: `Runtime trace · rank_${rank.id} → rank_${target.id}`,
        tipBody: 'Synthetic runtime edge：表示当前 step 中 activation / MoE dispatch / gradient 等动态流。静态 rank placement 不随播放改变。',
      });
    });

    els.worldLinks.innerHTML = svgParts.join('');
    applyRuntimeFrame();
  }

  function renderProjections() {
    renderFrontView();
    renderRightView();
  }

  function renderFrontView() {
    const margin = { left: 54, top: 18, right: 18, bottom: 28 };
    const w = 520 - margin.left - margin.right;
    const h = 210 - margin.top - margin.bottom;
    const cellW = w / PARALLEL.tp;
    const rowH = h / PARALLEL.pp;
    const parts = [
      `<line class="ts3d-proj-axis" x1="${margin.left}" y1="${margin.top + h}" x2="${margin.left + w}" y2="${margin.top + h}"></line>`,
      `<line class="ts3d-proj-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + h}"></line>`,
      `<text class="ts3d-proj-label" x="${margin.left + w - 48}" y="${margin.top + h + 22}">X = TP</text>`,
      `<text class="ts3d-proj-label" x="10" y="${margin.top + 12}">Z = PP</text>`,
    ];
    for (let pp = 0; pp < PARALLEL.pp; pp += 1) {
      const y = margin.top + h - (pp + 1) * rowH;
      const range = stageBlockRange(pp);
      if (pp % 2 === 0 || pp === selectedRank().pp) parts.push(`<text class="ts3d-proj-label" x="12" y="${y + rowH * 0.72}">P${pp}</text>`);
      for (let tp = 0; tp < PARALLEL.tp; tp += 1) {
        parts.push(`<rect class="ts3d-proj-cell" data-proj-pp="${pp}" data-proj-tp="${tp}" x="${margin.left + tp * cellW + 1}" y="${y + 1}" width="${Math.max(2, cellW - 2)}" height="${Math.max(2, rowH - 2)}"
          data-tip-title="Front cell · PP${pp} / TP${tp}"
          data-tip-body="X/Z 视图：TP${tp} 在 PP${pp} 的 blocks ${range.start}-${range.end} 上持有对应 shard。"></rect>`);
      }
    }
    els.frontView.innerHTML = parts.join('');
  }

  function renderRightView() {
    const margin = { left: 54, top: 18, right: 18, bottom: 28 };
    const w = 520 - margin.left - margin.right;
    const h = 210 - margin.top - margin.bottom;
    const cellW = w / PARALLEL.dp;
    const rowH = h / PARALLEL.pp;
    const parts = [
      `<line class="ts3d-proj-axis" x1="${margin.left}" y1="${margin.top + h}" x2="${margin.left + w}" y2="${margin.top + h}"></line>`,
      `<line class="ts3d-proj-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + h}"></line>`,
      `<text class="ts3d-proj-label" x="${margin.left + w - 50}" y="${margin.top + h + 22}">Y = DP</text>`,
      `<text class="ts3d-proj-label" x="10" y="${margin.top + 12}">Z = PP</text>`,
    ];
    for (let pp = 0; pp < PARALLEL.pp; pp += 1) {
      const y = margin.top + h - (pp + 1) * rowH;
      const range = stageBlockRange(pp);
      if (pp % 2 === 0) parts.push(`<text class="ts3d-proj-label" x="12" y="${y + rowH * 0.72}">P${pp}</text>`);
      for (let dp = 0; dp < PARALLEL.dp; dp += 1) {
        parts.push(`<rect class="ts3d-proj-cell" data-proj-pp="${pp}" data-proj-dp="${dp}" x="${margin.left + dp * cellW + 0.5}" y="${y + 1}" width="${Math.max(2, cellW - 1)}" height="${Math.max(2, rowH - 2)}"
          data-tip-title="Right cell · DP${dp} / PP${pp}"
          data-tip-body="Y/Z 视图：DP${dp} replica 在 PP${pp} 的 blocks ${range.start}-${range.end} 上拥有同构 placement。"></rect>`);
      }
    }
    els.rightView.innerHTML = parts.join('');
  }

  function syncSelection(shouldRenderLinks = true) {
    const rank = selectedRank();
    state.selectedRankId = rank.id;
    const range = rank.blockRange;

    document.querySelectorAll('.ts3d-rank').forEach((el) => {
      const item = rankById.get(Number(el.dataset.rankId));
      const selected = item?.id === rank.id;
      const related = item && (item.nodeId === rank.nodeId || (item.pp === rank.pp && item.tp === rank.tp));
      el.classList.toggle('is-selected', selected);
      el.classList.toggle('is-related', !!related && !selected);
    });

    document.querySelectorAll('.ts3d-node').forEach((el) => {
      const node = nodeById.get(el.dataset.nodeId);
      el.classList.toggle('is-selected', node?.id === rank.nodeId);
    });

    document.querySelectorAll('[data-block-id]').forEach((el) => {
      const blockId = Number(el.dataset.blockId);
      el.classList.toggle('is-selected', blockId >= range.start && blockId <= range.end);
    });

    document.querySelectorAll('.ts3d-proj-cell').forEach((el) => {
      const pp = Number(el.dataset.projPp);
      const tp = Number(el.dataset.projTp);
      const dp = Number(el.dataset.projDp);
      const frontSelected = Number.isFinite(tp) && pp === rank.pp && tp === rank.tp;
      const rightSelected = Number.isFinite(dp) && pp === rank.pp && dp === rank.dp;
      el.classList.toggle('is-selected', frontSelected || rightSelected);
    });

    renderPlacementSummary(rank);
    renderInspector(rank);
    if (shouldRenderLinks) renderLinks();
    applyRuntimeFrame();
  }

  function renderPlacementSummary(rank) {
    const bucket = rank.expertRange;
    els.placementSummary.innerHTML = `
      <div class="ts3d-section-kicker">placement map</div>
      <h2>rank_${rank.id}</h2>
      <p>DP${rank.dp} / PP${rank.pp} / TP${rank.tp} / CP${rank.cp} / EP${rank.ep}</p>
      <dl>
        <div><dt>PP stage</dt><dd>Blocks ${rank.blockRange.start}-${rank.blockRange.end}</dd></div>
        <div><dt>TP shard</dt><dd>${rank.tp + 1} / ${PARALLEL.tp}</dd></div>
        <div><dt>EP bucket</dt><dd>E${bucket.start}-E${bucket.end}</dd></div>
      </dl>
    `;
  }

  function renderInspector(rank) {
    const bucket = rank.expertRange;
    const frame = runtimeFrames[state.step % runtimeFrames.length];
    els.inspectorBody.innerHTML = `
      <section class="ts3d-inspector-section">
        <h2>rank_${rank.id}</h2>
        <div class="ts3d-badge-row">
          <span class="ts3d-badge dp">DP${rank.dp}</span>
          <span class="ts3d-badge pp">PP${rank.pp}</span>
          <span class="ts3d-badge tp">TP${rank.tp}</span>
          <span class="ts3d-badge ep">EP${rank.ep}</span>
        </div>
        <dl>
          <div><dt>Device</dt><dd>910B_${rank.id}</dd></div>
          <div><dt>Node</dt><dd>${rank.nodeLabel}</dd></div>
          <div><dt>Rank formula</dt><dd>((d×16+p)×1+c)×8+t</dd></div>
          <div><dt>Batch shard</dt><dd>samples ${rank.sampleShard.start}-${rank.sampleShard.end}</dd></div>
        </dl>
      </section>
      <section class="ts3d-inspector-section">
        <h2>Model ownership</h2>
        <dl>
          <div><dt>Blocks</dt><dd>${rank.blockRange.start}-${rank.blockRange.end}</dd></div>
          <div><dt>Block type</dt><dd>${rank.blockRange.start < MODEL.denseBlocks ? 'Dense + MoE boundary' : 'MoE decode blocks'}</dd></div>
          <div><dt>Weight shard</dt><dd>MLA / MoE projection TP${rank.tp}</dd></div>
          <div><dt>Expert bucket</dt><dd>E${bucket.start}-E${bucket.end}</dd></div>
          <div><dt>Params</dt><dd>blocks.${rank.blockRange.start}-${rank.blockRange.end}.moe.experts.${bucket.start}-${bucket.end}</dd></div>
        </dl>
      </section>
      <section class="ts3d-inspector-section">
        <h2>Runtime frame</h2>
        <div class="ts3d-runtime-card">
          <strong>${escapeHtml(frame.label)} · step ${BASE_STEP + state.step}</strong>
          <span>${escapeHtml(frame.detail)}</span>
        </div>
      </section>
    `;
  }

  function currentFrame() {
    return runtimeFrames[state.step % runtimeFrames.length];
  }

  function applyRuntimeFrame() {
    const rank = selectedRank();
    const frame = currentFrame();
    els.body.dataset.phase = frame.phase;

    document.querySelectorAll('.ts3d-link').forEach((el) => el.classList.remove('is-active', 'is-hovered'));
    document.querySelectorAll('.ts3d-rank').forEach((el) => el.classList.remove('is-hot'));
    document.querySelectorAll('.ts3d-block-cell, .ts3d-z-segment, .ts3d-proj-cell').forEach((el) => el.classList.remove('is-hot'));

    const hotRanks = new Set([rank.id]);
    const activeLinkIds = new Set();

    linkRecords.forEach((link) => {
      if (frame.phase === 'forward' && link.kind === 'pp' && touchesNodePair(link, rank.dp, rank.pp, rank.pp + 1)) activeLinkIds.add(link.id);
      if (frame.phase === 'backward' && link.kind === 'pp' && touchesNodePair(link, rank.dp, rank.pp, rank.pp + 1)) activeLinkIds.add(link.id);
      if (frame.phase === 'dp_sync' && link.kind === 'dp' && touchesDpPair(link, rank.pp)) activeLinkIds.add(link.id);
      if (frame.phase === 'tp_sync' && link.kind === 'tp' && link.sourceNode === rank.nodeId) activeLinkIds.add(link.id);
      if (frame.phase === 'moe_dispatch' && link.runtime) activeLinkIds.add(link.id);
    });

    if (frame.phase === 'forward' || frame.phase === 'backward') {
      ranks.filter((item) => item.dp === rank.dp && (item.pp === rank.pp || item.pp === rank.pp + 1)).forEach((item) => hotRanks.add(item.id));
    }
    if (frame.phase === 'dp_sync') {
      ranks.filter((item) => item.pp === rank.pp && item.tp === rank.tp).forEach((item) => hotRanks.add(item.id));
    }
    if (frame.phase === 'tp_sync') {
      ranks.filter((item) => item.nodeId === rank.nodeId).forEach((item) => hotRanks.add(item.id));
    }
    if (frame.phase === 'moe_dispatch') {
      ranks.filter((item) => item.dp === rank.dp && item.pp === rank.pp + 1 && (item.tp === rank.tp || item.ep === rank.ep)).forEach((item) => hotRanks.add(item.id));
    }

    activeLinkIds.forEach((id) => {
      const link = els.worldLinks.querySelector(`[data-visible-link-id="${CSS.escape(id)}"]`);
      if (link) link.classList.add('is-active');
    });

    hotRanks.forEach((id) => {
      const el = document.querySelector(`.ts3d-rank[data-rank-id="${id}"]`);
      if (el) el.classList.add('is-hot');
    });

    for (let blockId = rank.blockRange.start; blockId <= rank.blockRange.end; blockId += 1) {
      document.querySelectorAll(`[data-block-id="${blockId}"]`).forEach((el) => el.classList.add('is-hot'));
    }
    document.querySelectorAll(`.ts3d-proj-cell[data-proj-pp="${rank.pp}"]`).forEach((el) => el.classList.add('is-hot'));

    renderInspector(rank);
    syncPlaybackChrome();
  }

  function touchesNodePair(link, dp, ppA, ppB) {
    const a = nodeById.get(link.sourceNode);
    const b = nodeById.get(link.targetNode);
    if (!a || !b) return false;
    return a.dp === dp && b.dp === dp && new Set([a.pp, b.pp]).has(ppA) && new Set([a.pp, b.pp]).has(ppB);
  }

  function touchesDpPair(link, pp) {
    const a = nodeById.get(link.sourceNode);
    const b = nodeById.get(link.targetNode);
    return !!a && !!b && a.pp === pp && b.pp === pp;
  }

  function syncPlaybackChrome() {
    const helper = window.PtoFloatingPlaybackControl;
    if (!helper || !playbackApi) return;
    const frame = currentFrame();
    const playBtn = document.getElementById('play-btn');
    const scrubber = document.getElementById('scrubber');
    const label = document.getElementById('scrubber-label');
    const opname = document.getElementById('scrubber-opname');
    if (scrubber) {
      scrubber.max = String(TOTAL_STEPS - 1);
      scrubber.value = String(state.step);
    }
    if (label) label.textContent = `${BASE_STEP + state.step} / ${BASE_STEP + TOTAL_STEPS - 1}`;
    if (opname) opname.textContent = frame.label;
    if (playBtn) playBtn.innerHTML = state.playing ? helper.iconLabel('pause', 'Pause') : helper.iconLabel('play', 'Play');
    playbackApi.sync({ playing: state.playing });
  }

  function initPlayback() {
    const helper = window.PtoFloatingPlaybackControl;
    if (!helper || !els.playbackMount) return;
    const control = helper.createControl();
    els.playbackMount.appendChild(control);
    playbackApi = helper.init({ root: control, isPlaying: () => state.playing });
    helper.initScrubberHover({
      root: control,
      totalSteps: TOTAL_STEPS,
      getLabelForStep: (step) => `${BASE_STEP + step} · ${runtimeFrames[step % runtimeFrames.length].label}`,
    });

    const playBtn = document.getElementById('play-btn');
    const backBtn = document.getElementById('step-back-btn');
    const forwardBtn = document.getElementById('step-fwd-btn');
    const replayBtn = document.getElementById('replay-btn');
    const scrubber = document.getElementById('scrubber');

    playBtn?.addEventListener('click', () => {
      state.playing = !state.playing;
      if (state.playing) startTimer();
      else stopTimer();
      applyRuntimeFrame();
    });
    backBtn?.addEventListener('click', () => {
      state.playing = false;
      stopTimer();
      state.step = (state.step + TOTAL_STEPS - 1) % TOTAL_STEPS;
      applyRuntimeFrame();
    });
    forwardBtn?.addEventListener('click', () => {
      state.playing = false;
      stopTimer();
      state.step = (state.step + 1) % TOTAL_STEPS;
      applyRuntimeFrame();
    });
    replayBtn?.addEventListener('click', () => {
      state.playing = false;
      stopTimer();
      state.step = 0;
      applyRuntimeFrame();
    });
    scrubber?.addEventListener('input', () => {
      state.playing = false;
      stopTimer();
      state.step = Number(scrubber.value) || 0;
      applyRuntimeFrame();
    });
    syncPlaybackChrome();
  }

  function startTimer() {
    stopTimer();
    playbackTimer = window.setInterval(() => {
      state.step = (state.step + 1) % TOTAL_STEPS;
      applyRuntimeFrame();
    }, 1050);
  }

  function stopTimer() {
    if (playbackTimer) window.clearInterval(playbackTimer);
    playbackTimer = null;
  }

  function setCamera({ yaw = state.yaw, pitch = state.pitch, zoom = state.zoom } = {}) {
    state.yaw = Math.max(-100, Math.min(20, yaw));
    state.pitch = Math.max(0, Math.min(76, pitch));
    state.zoom = Math.max(64, Math.min(132, zoom));
    els.root.style.setProperty('--ts3d-yaw', `${state.yaw}deg`);
    els.root.style.setProperty('--ts3d-pitch', `${state.pitch}deg`);
    els.root.style.setProperty('--ts3d-zoom', `${state.zoom / 100}`);
    if (els.yawSlider) els.yawSlider.value = String(Math.round(state.yaw));
    if (els.pitchSlider) els.pitchSlider.value = String(Math.round(state.pitch));
    if (els.zoomSlider) els.zoomSlider.value = String(Math.round(state.zoom));
  }

  function initCameraDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startYaw = state.yaw;
    let startPitch = state.pitch;

    els.worldCamera.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button, a, input')) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startYaw = state.yaw;
      startPitch = state.pitch;
      els.worldCamera.classList.add('is-dragging');
      els.worldCamera.setPointerCapture(event.pointerId);
    });

    els.worldCamera.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      setCamera({ yaw: startYaw + dx * 0.16, pitch: startPitch - dy * 0.08 });
    });

    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      els.worldCamera.classList.remove('is-dragging');
      if (els.worldCamera.hasPointerCapture(event.pointerId)) els.worldCamera.releasePointerCapture(event.pointerId);
    };
    els.worldCamera.addEventListener('pointerup', endDrag);
    els.worldCamera.addEventListener('pointercancel', endDrag);
  }

  function showTip(target, event) {
    const title = target?.dataset?.tipTitle;
    const body = target?.dataset?.tipBody;
    if (!title || !body) return;
    els.tipTitle.textContent = title;
    els.tipBody.textContent = body;
    els.tip.classList.add('is-visible');
    moveTip(event);
  }

  function moveTip(event) {
    if (!els.tip.classList.contains('is-visible')) return;
    const pad = 14;
    const rect = els.tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    els.tip.style.left = `${Math.max(8, x)}px`;
    els.tip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTip() {
    els.tip.classList.remove('is-visible');
  }

  function initEvents() {
    document.addEventListener('pointermove', (event) => {
      const target = event.target.closest?.('[data-tip-title]');
      if (target) showTip(target, event);
      else hideTip();
    });
    document.addEventListener('pointerleave', hideTip);

    els.rankLayer.addEventListener('click', (event) => {
      const rankEl = event.target.closest('.ts3d-rank');
      if (!rankEl) return;
      state.selectedRankId = Number(rankEl.dataset.rankId);
      syncSelection(true);
    });

    els.blockLattice.addEventListener('click', (event) => {
      const blockEl = event.target.closest('[data-block-id]');
      if (!blockEl) return;
      const pp = ppForBlock(Number(blockEl.dataset.blockId));
      const current = selectedRank();
      const replacement = ranks.find((rank) => rank.dp === current.dp && rank.pp === pp && rank.tp === current.tp)
        || ranks.find((rank) => rank.pp === pp)
        || current;
      state.selectedRankId = replacement.id;
      syncSelection(true);
    });

    els.zStack.addEventListener('click', (event) => {
      const blockEl = event.target.closest('[data-block-id]');
      if (!blockEl) return;
      const pp = ppForBlock(Number(blockEl.dataset.blockId));
      const replacement = ranks.find((rank) => rank.pp === pp && rank.tp === selectedRank().tp);
      if (replacement) {
        state.selectedRankId = replacement.id;
        syncSelection(true);
      }
    });

    els.worldLinks.addEventListener('pointerover', (event) => {
      const hit = event.target.closest('[data-link-id]');
      if (!hit) return;
      state.hoveredLinkId = hit.dataset.linkId;
      const link = els.worldLinks.querySelector(`[data-visible-link-id="${CSS.escape(state.hoveredLinkId)}"]`);
      if (link) link.classList.add('is-hovered');
    });
    els.worldLinks.addEventListener('pointerout', (event) => {
      const hit = event.target.closest('[data-link-id]');
      if (!hit) return;
      const link = els.worldLinks.querySelector(`[data-visible-link-id="${CSS.escape(hit.dataset.linkId)}"]`);
      if (link) link.classList.remove('is-hovered');
      state.hoveredLinkId = null;
    });

    document.querySelectorAll('[data-overlay]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.overlay;
        state.overlays[key] = !state.overlays[key];
        button.classList.toggle('is-selected', state.overlays[key]);
        els.body.dataset[`overlay${key[0].toUpperCase()}${key.slice(1)}`] = state.overlays[key] ? 'on' : 'off';
      });
    });

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-selected', item === button));
        const view = button.dataset.view;
        els.body.dataset.focusView = view;
        if (view === 'world') setCamera({ yaw: -36, pitch: 58, zoom: 96 });
        if (view === 'top') setCamera({ yaw: 0, pitch: 0, zoom: 92 });
        if (view === 'front') setCamera({ yaw: 0, pitch: 72, zoom: 94 });
        if (view === 'right') setCamera({ yaw: -90, pitch: 72, zoom: 94 });
      });
    });

    document.getElementById('themeBtn')?.addEventListener('click', () => {
      const next = els.root.dataset.theme === 'dark' ? 'light' : 'dark';
      els.root.dataset.theme = next;
      try { window.localStorage.setItem('trainscope-3d-world-theme', next); } catch (_error) {}
    });

    document.getElementById('closeInspector')?.addEventListener('click', () => {
      els.body.dataset.inspector = 'closed';
    });
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      if (els.body.dataset.inspector === 'closed') {
        els.body.dataset.inspector = 'open';
        els.settingsPanel.hidden = true;
        els.infoPanel.hidden = true;
        return;
      }
      els.settingsPanel.hidden = !els.settingsPanel.hidden;
      els.infoPanel.hidden = true;
    });
    document.getElementById('infoBtn')?.addEventListener('click', () => {
      els.infoPanel.hidden = !els.infoPanel.hidden;
      els.settingsPanel.hidden = true;
    });
    document.querySelectorAll('[data-close-panel]').forEach((button) => {
      button.addEventListener('click', () => {
        const panel = document.getElementById(button.dataset.closePanel);
        if (panel) panel.hidden = true;
      });
    });
    els.yawSlider?.addEventListener('input', () => setCamera({ yaw: Number(els.yawSlider.value) }));
    els.pitchSlider?.addEventListener('input', () => setCamera({ pitch: Number(els.pitchSlider.value) }));
    els.zoomSlider?.addEventListener('input', () => setCamera({ zoom: Number(els.zoomSlider.value) }));
    document.getElementById('resetCameraBtn')?.addEventListener('click', () => setCamera({ yaw: -36, pitch: 58, zoom: 96 }));

    window.addEventListener('beforeunload', stopTimer);
  }

  renderWorld();
  setCamera();
  initEvents();
  initCameraDrag();
  initPlayback();
})();
