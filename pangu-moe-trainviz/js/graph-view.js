/* ② 整网架构图：model-training-graphviz 渲染 Pangu Pro MoE。
   选中→广播 select；监听 select 反向点亮；「追溯梯度流」→ 回溯 Step1997。
   MoE 块 expand/fold：pattern 的 toggle 是静态的，这里 page-side 接通点击。 */
window.GraphView = (function () {
  let controller = null, stageEl = null, selfSelect = false, moeCollapsed = false;
  // 折叠时移除的 MoE 内部算子 + 旁挂权重
  const MOE_INNER = ['gate', 'a2a_dispatch', 'experts', 'a2a_combine', 'w_gate', 'expert_up_weight', 'expert_down_weight'];

  function collapsedGraph() {
    const g = window.PANGU_GRAPH, drop = new Set(MOE_INNER);
    const nodes = g.nodes.filter(n => !drop.has(n.id));
    nodes.push({ id: 'moe_block', label: 'MoE FFN · MoGE', typeLabel: 'Module', kind: 'op', x: 600, y: 736, width: 300, height: 64, colorKey: 'module:moe', collapsed: true });
    const edges = g.edges.filter(e => !drop.has(e.source) && !drop.has(e.target));
    edges.push({ source: 'moe_norm', target: 'moe_block', tag: 'ACT', edgeType: 'activation' });
    edges.push({ source: 'moe_block', target: 'final_norm', tag: 'ACT', edgeType: 'activation' });
    const trainingEvidence = Object.assign({}, g.trainingEvidence);
    MOE_INNER.forEach(id => delete trainingEvidence[id]);
    trainingEvidence.moe_block = {
      dimension: 'MoE 块（已折叠）', metric: '路由 / 通信 / 专家',
      what: '本次路由坍缩故障都在 MoE 块内部。',
      evidence: ['Load Balance Loss 骤降≈0', 'TP Rank2 All-to-All 黑洞'],
      action: '点节点右侧展开钮，看 Gate / All-to-All / 专家详情。', relatedNodeIds: [],
    };
    const clusters = g.clusters.filter(c => c.id !== 'moe');
    return { width: g.width, height: g.height, clusters, nodes, edges, trainingEvidence };
  }

  const currentGraph = () => moeCollapsed ? collapsedGraph() : window.PANGU_GRAPH;
  const defaultSel = () => moeCollapsed ? 'moe_block' : 'gate';
  const emptyController = {
    selectNode() {},
    clearSelection() {},
    fit() {},
  };

  function showGraphError(error) {
    const message = error && error.message ? error.message : String(error || 'unknown error');
    console.error('[TrainScope] Pangu graph render failed:', error);
    stageEl.innerHTML = `
      <div class="graph-load-error">
        <strong>Pangu model graph failed to load.</strong>
        <span>${message}</span>
      </div>
    `;
    controller = emptyController;
  }

  function renderGraph() {
    const sel = defaultSel();
    const renderer = window.PtoModelTrainingGraphvizPattern;
    if (!renderer || typeof renderer.render !== 'function') {
      showGraphError(new Error('model-training-graphviz pattern is not loaded'));
      return;
    }
    try {
      controller = renderer.render(stageEl, currentGraph(), {
        activeNodeId: sel,
        activeRelatedNodeIds: CrossMap.resolve(sel).relatedNodeIds,
        colormap: { saturation: 0.45, lightness: 0.38 },
        fitMode: 'full',
        viewportPadding: 18,
        onSelect: ({ nodeId, source }) => {
          if (source === 'bus') return;
          const m = CrossMap.resolve(nodeId);
          selfSelect = true;
          Bus.emit('select', { objectType: 'node', id: nodeId, relatedNodeIds: m.relatedNodeIds, cols: m.cols, weightKey: m.weightKey, source: 'graph' });
          selfSelect = false;
        },
      });
      if (!controller) throw new Error('model-training-graphviz render returned empty controller');
      wireToggles();
    } catch (error) {
      showGraphError(error);
    }
  }

  function bindToggle(elm, handler) {
    if (!elm) return;
    elm.style.cursor = 'pointer';
    elm.addEventListener('pointerdown', e => e.stopPropagation());
    elm.addEventListener('click', e => { e.stopPropagation(); handler(); });
  }

  function wireToggles() {
    const clusters = stageEl.querySelectorAll('.pto-model-graphviz-cluster');
    if (!moeCollapsed) {
      // transformer(0)/decoder(1) 的 toggle 隐藏；MoE(2) 的 toggle 接折叠
      clusters.forEach((cl, i) => {
        const togs = cl.querySelectorAll('.pto-model-graphviz-toggle, .pto-model-graphviz-toggle-icon');
        if (i < 2) togs.forEach(t => { t.style.display = 'none'; });
        else togs.forEach(t => bindToggle(t, () => setCollapsed(true)));
      });
    } else {
      // 折叠态：簇 toggle 全隐藏；moe_block 折叠节点自带展开钮 → 接展开
      clusters.forEach(cl => cl.querySelectorAll('.pto-model-graphviz-toggle, .pto-model-graphviz-toggle-icon').forEach(t => { t.style.display = 'none'; }));
      const moeNode = Array.from(stageEl.querySelectorAll('.pto-model-graphviz-node')).find(n => n.dataset.nodeId === 'moe_block');
      if (moeNode) moeNode.querySelectorAll('.pto-model-graphviz-toggle, .pto-model-graphviz-toggle-icon').forEach(t => bindToggle(t, () => setCollapsed(false)));
    }
  }

  let foldBtn = null;
  function syncFoldBtn() { if (foldBtn) foldBtn.textContent = moeCollapsed ? '展开 MoE' : '折叠 MoE'; }

  function setCollapsed(v) {
    if (moeCollapsed === v) return;
    moeCollapsed = v;
    renderGraph();
    syncFoldBtn();
    const sel = defaultSel(), m = CrossMap.resolve(sel);
    Bus.emit('select', { objectType: 'node', id: sel, relatedNodeIds: m.relatedNodeIds, cols: m.cols, weightKey: m.weightKey, source: 'graph' });
  }

  function init(stage, traceBtn) {
    stageEl = stage;
    renderGraph();

    foldBtn = document.getElementById('moe-fold-btn');
    if (foldBtn) { foldBtn.addEventListener('click', () => setCollapsed(!moeCollapsed)); syncFoldBtn(); }

    Bus.on('select', p => {
      if (!p || p.source === 'graph' || selfSelect) return;
      if (p.id && moeCollapsed && MOE_INNER.includes(p.id)) setCollapsed(false);
      if (p.id && currentGraph().nodes.some(n => n.id === p.id)) {
        controller.selectNode(p.id, { relatedNodeIds: p.relatedNodeIds, source: 'bus' });
      }
    });

    // 追溯梯度流：定位 Step1997 混合精度写越界（若已折叠，先展开再定位 Gate）
    function trace() {
      const ts = window.TS_DATA;
      if (moeCollapsed) setCollapsed(false);
      Bus.emit('select', { objectType: 'node', id: 'gate', relatedNodeIds: CrossMap.resolve('gate').relatedNodeIds, cols: [2], weightKey: 'gate', source: 'graph' });
      controller.selectNode('gate', { relatedNodeIds: CrossMap.resolve('gate').relatedNodeIds, source: 'bus' });
      Bus.emit('interestWindow', { start: ts.faultStep - 3, end: ts.collapseStep + 8 });
      Bus.emit('stepCursor', ts.faultStep);
      Bus.emit('faultTrace', ts.faultEvent);
    }
    if (traceBtn) traceBtn.addEventListener('click', trace);
    stageEl.addEventListener('contextmenu', e => { e.preventDefault(); trace(); });
  }
  return { init };
})();
