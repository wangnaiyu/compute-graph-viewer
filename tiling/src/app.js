(() => {
  'use strict';

  const FIXTURES = [
    { id: 'sample.add_tpipe_tque', path: 'data/fixtures/add_tpipe_tque.trace.json' },
    { id: 'sample.matmul_cube', path: 'data/fixtures/matmul.trace.json' },
    { id: 'sample.matmul_leakyrelu_fusion', path: 'data/fixtures/matmul_leakyrelu_fusion.trace.json' },
  ];

  const TENSOR_TONES = {
    default: { fill: 'rgba(116, 128, 142, 0.24)', stroke: 'rgba(220, 230, 240, 0.16)' },
    input: { fill: 'rgba(77, 151, 255, 0.72)', stroke: 'rgba(184, 218, 255, 0.88)' },
    output: { fill: 'rgba(41, 199, 166, 0.72)', stroke: 'rgba(188, 255, 239, 0.9)' },
    compute: { fill: 'rgba(255, 207, 89, 0.74)', stroke: 'rgba(255, 237, 178, 0.9)' },
    reduction: { fill: 'rgba(255, 154, 84, 0.72)', stroke: 'rgba(255, 214, 184, 0.88)' },
    fusion: { fill: 'rgba(184, 146, 255, 0.72)', stroke: 'rgba(229, 216, 255, 0.9)' },
    avoided: { fill: 'rgba(164, 176, 189, 0.20)', stroke: 'rgba(164, 176, 189, 0.42)' },
  };

  const ARCH_PRESET = 'ascend950b';

  const CPP_KEYWORDS = new Set([
    'alignas', 'auto', 'break', 'case', 'class', 'const', 'constexpr', 'continue', 'default', 'defined', 'do',
    'else', 'false', 'for', 'if', 'inline', 'int', 'namespace', 'new', 'nullptr', 'operator', 'private', 'public',
    'return', 'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'true', 'typedef', 'typename', 'using',
    'void', 'volatile', 'while', '__aicore__', '__global__', '__cube__', '__vector__', '__mix__', '__gm__', '__ubuf__',
    'ASCEND_IS_AIC', 'ASCEND_IS_AIV',
  ]);

  const CPP_TYPES = new Set([
    'bool', 'char', 'double', 'float', 'half', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
    'size_t', 'GM_ADDR', 'AscendC', 'GlobalTensor', 'LocalTensor', 'TPipe', 'TQue', 'TBuf', 'TPosition',
    'DataCopyParams', 'DataCopyPadParams', 'Nd2NzParams', 'LoadData2DParams', 'LoadData2DParamsV2', 'MmadParams',
    'FixpipeParamsV220', 'QuantMode_t', 'HardEvent', 'PIPE_FIX', 'PIPE_V', 'PIPE_M', 'PIPE_MTE1', 'PIPE_MTE2',
    'PIPE_MTE3', 'PIPE_ALL',
  ]);

  const TEXT_ZH = {
    'Host prepares input, launches the vector kernel, and collects output.': 'Host 准备输入、启动 vector kernel，并回收输出。',
    'Derive per-block and per-tile lengths, then initialize GM views and queue buffers.': '计算每个 block 和每个 tile 的长度，然后初始化 GM 视图和队列 buffer。',
    'Allocate local x/y tensors and copy one tile from GM to VECIN queues.': '分配 x/y 的 LocalTensor，并把一个 tile 从 GM 拷入 VECIN 队列。',
    'Deque x/y local tensors, add them, enqueue z, and free input buffers.': '从队列取出 x/y 本地 tensor，执行 Add，写入 z 队列并释放输入 buffer。',
    'Deque z local tensor and copy the tile back to GM.': '从队列取出 zLocal，并把当前 tile 拷回 GM。',
    'Host copies x/y to device, launches 8 vector blocks, waits, and copies z back.': 'Host 将 x/y 拷到 device，启动 8 个 vector block，等待完成后拷回 z。',
    'blockLength=2048; blockIdx 0 owns GM[0:2048]. tileLength=128.': 'blockLength=2048；blockIdx 0 负责 GM[0:2048]；tileLength=128。',
    'Copy x/y GM[0:128] into VECIN queue slots.': '把 x/y 的 GM[0:128] 拷入 VECIN 队列槽位。',
    'Deque x/y, allocate zLocal, run Add over 128 fp32 values.': '取出 x/y，分配 zLocal，对 128 个 fp32 元素执行 Add。',
    'Copy zLocal back to zGm[0:128].': '把 zLocal 拷回 zGm[0:128]。',
    'For blockIdx=3, progress=2 starts at 3*2048 + 2*128 = 6400.': 'blockIdx=3 且 progress=2 时，起始偏移为 3*2048 + 2*128 = 6400。',
    'blockIdx=7, progress=15 writes the final tile GM:z[16256:16384].': 'blockIdx=7 且 progress=15 写回最后一个 tile：GM:z[16256:16384]。',

    'Map one Cube block to one singleCoreM x singleCoreN output partition.': '把一个 Cube block 映射到一个 singleCoreM x singleCoreN 的输出分区。',
    'Copy a baseM x baseK tile from A GM to A1.': '把 A 的 baseM x baseK tile 从 GM 拷到 A1。',
    'Copy a baseK x baseN tile from B GM to B1.': '把 B 的 baseK x baseN tile 从 GM 拷到 B1。',
    'Move A1/B1 tiles into L0A/L0B. 2201 and 3510 use different params.': '把 A1/B1 tile 搬到 L0A/L0B；2201 和 3510 使用不同参数。',
    'Accumulate A2 x B2 into CO1.': '将 A2 x B2 的结果累加到 CO1。',
    'Write CO1 to GM C with Nz->ND and fp32->half conversion.': '把 CO1 写回 GM C，并执行 Nz->ND 与 fp32->half 转换。',
    'mIterIdx=0, nIterIdx=0. GM offsets A=0, B=0, C=0.': 'mIterIdx=0，nIterIdx=0；GM 偏移 A=0、B=0、C=0。',
    'mIterIdx=0, nIterIdx=1. GM C offset=512.': 'mIterIdx=0，nIterIdx=1；GM C 偏移为 512。',
    'Copy A[M 0:128, K 0:64] from GM into A1.': '把 A[M 0:128, K 0:64] 从 GM 拷入 A1。',
    'Copy B[K 0:64, N 0:256] from GM into B1.': '把 B[K 0:64, N 0:256] 从 GM 拷入 B1。',
    'A1/B1 are moved to A2/B2; B is prepared with transpose semantics for Mmad.': 'A1/B1 被搬到 A2/B2；B 会按 Mmad 需要的转置语义准备。',
    'kIndex=0 sets cmatrixInitVal=true, initializing CO1 with first partial result.': 'kIndex=0 时 cmatrixInitVal=true，用第一段部分结果初始化 CO1。',
    'kIndex=7 adds the last baseK slice into CO1.': 'kIndex=7 将最后一段 baseK slice 累加进 CO1。',
    'CO1 is written to GM C[M 0:128, N 0:256] with conversion to half ND layout.': 'CO1 被写回 GM C[M 0:128, N 0:256]，并转换成 half ND layout。',

    'Launches a fused AIC/AIV kernel with one Cube producer for two Vector consumers.': '启动一个融合 AIC/AIV kernel：1 个 Cube 生产者对应 2 个 Vector 消费者。',
    'AIC computes each baseM x baseN C tile and writes it to GM.': 'AIC 计算每个 baseM x baseN 的 C tile，并写到 GM。',
    'AIC notifies the paired AIV blocks that the Matmul result is ready.': 'AIC 通知成对的 AIV block：Matmul 结果已经 ready。',
    'Each AIV block reads half of the AIC result tile, applies LeakyRelu, and writes it back.': '每个 AIV block 读取 AIC 结果 tile 的一半，执行 LeakyRelu 后写回。',
    'The kernel creates a Cube:Vector execution relationship of 1:2.': '该 kernel 建立 1:2 的 Cube:Vector 执行关系。',
    'AIC block 0 starts the Matmul pipeline for C[M 0:256, N 0:512].': 'AIC block 0 为 C[M 0:256, N 0:512] 启动 Matmul 流水。',
    'AIC0 accumulates through K and writes the Matmul output tile to GM C.': 'AIC0 沿 K 维累加，并把 Matmul 输出 tile 写到 GM C。',
    'CrossCoreSetFlag releases AIV block 0 and AIV block 1.': 'CrossCoreSetFlag 放行 AIV block 0 和 AIV block 1。',
    'AIV0 cannot read GM C until the Cube producer has set the flag.': 'Cube 生产者置 flag 之前，AIV0 不能读取 GM C。',
    'AIV0 reads the upper baseM/2 x baseN half tile, applies LeakyRelu, and writes it back.': 'AIV0 读取上半个 baseM/2 x baseN tile，执行 LeakyRelu 后写回。',
    'AIV1 uses GetBlockIdx()%2=1, so its GM offset jumps by baseM/2*N.': 'AIV1 使用 GetBlockIdx()%2=1，因此 GM 偏移会跳过 baseM/2*N。',

    'Host prepares and launches': 'Host 准备并启动',
    'blockIdx 0 maps GM partition': 'blockIdx 0 映射 GM 分区',
    'progress 0 CopyIn': 'progress 0 执行 CopyIn',
    'progress 0 Compute': 'progress 0 执行 Compute',
    'progress 0 CopyOut': 'progress 0 执行 CopyOut',
    'block 3 progress 2 CopyIn': 'block 3 / progress 2 执行 CopyIn',
    'last block last CopyOut': '最后一个 block 写回最后一个 tile',
    'blockIdx 0 selects top-left C partition': 'blockIdx 0 选择左上 C 分区',
    'blockIdx 2 selects top-right C partition': 'blockIdx 2 选择右上 C 分区',
    'kIndex 0 CopyIn A': 'kIndex 0 拷入 A',
    'kIndex 0 CopyIn B': 'kIndex 0 拷入 B',
    'LoadData to L0': 'LoadData 搬入 L0',
    'Mmad initializes CO1': 'Mmad 初始化 CO1',
    'Mmad final K accumulation': 'Mmad 完成最后一段 K 累加',
    'Fixpipe writes C tile': 'Fixpipe 写回 C tile',
    '__mix__(1,2) launch': '__mix__(1,2) 启动',
    'AIC0 copies A/B tiles': 'AIC0 拷入 A/B tile',
    'AIC0 Mmad + Fixpipe': 'AIC0 执行 Mmad + Fixpipe',
    'AIC0 signals AIV pair': 'AIC0 通知 AIV pair',
    'AIV0 waits for AIC0': 'AIV0 等待 AIC0',
    'AIV0 activates upper half': 'AIV0 激活上半 tile',
    'AIV1 activates lower half': 'AIV1 激活下半 tile',
  };

  const state = {
    traces: [],
    sampleId: null,
    stepIndex: 0,
    evidence: false,
    playing: false,
    timer: null,
    playback: null,
    webglAvailable: null,
    inspectorOpen: false,
    selectedObject: null,
    tensorView: {
      scale: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      startX: 0,
      startY: 0,
      startPanX: 0,
      startPanY: 0,
      moved: false,
    },
    architecture: {
      mounted: false,
      overlay: null,
      hover: null,
      viewport: null,
      pathFocus: null,
    },
    resizeObserver: null,
    playbackIds: {
      shell: 'avz-floating-shell',
      toggle: 'avz-floating-toggle',
      collapsedButton: 'avz-floating-collapsed-btn',
      collapsedIcon: 'avz-floating-collapsed-icon',
      controls: 'avz-controls-row',
      stepBack: 'avz-step-back-btn',
      play: 'avz-play-btn',
      stepForward: 'avz-step-fwd-btn',
      replay: 'avz-replay-btn',
      scrubber: 'avz-scrubber',
      scrubberLabel: 'avz-scrubber-label',
      scrubberOpname: 'avz-scrubber-opname',
      scrubberHover: 'avz-scrubber-hover',
    },
  };

  const byId = (id) => document.getElementById(id);

  const els = {
    operatorMeta: byId('operatorMeta'),
    archReadout: byId('archReadout'),
    evidenceToggle: byId('evidenceToggle'),
    sampleList: byId('sampleList'),
    sourceMeta: byId('sourceMeta'),
    sourceLines: byId('sourceLines'),
    visualTitle: byId('visualTitle'),
    stepMeta: byId('stepMeta'),
    prevStep: byId('prevStep'),
    nextStep: byId('nextStep'),
    tensorStage: byId('tensorStage'),
    tensorCanvas: byId('tensorCanvas'),
    tensorFallback: byId('tensorFallback'),
    zoomOut: byId('zoomOut'),
    zoomIn: byId('zoomIn'),
    fitView: byId('fitView'),
    viewportInfo: byId('viewportInfo'),
    tileLens: byId('tileLens'),
    architectureKicker: byId('architectureKicker'),
    architectureViewportRoot: byId('architectureViewportRoot'),
    architectureViewport: byId('architectureViewport'),
    architectureMap: byId('architectureMap'),
    architectureBlocks: byId('architectureBlocks'),
    architectureDetailToggle: byId('architectureDetailToggle'),
    archZoomOut: byId('archZoomOut'),
    archZoomIn: byId('archZoomIn'),
    archFitView: byId('archFitView'),
    archZoomReadout: byId('archZoomReadout'),
    timelineKicker: byId('timelineKicker'),
    timelineCanvas: byId('timelineCanvas'),
    inspectorDrawer: byId('inspectorDrawer'),
    inspectorMeta: byId('inspectorMeta'),
    closeInspector: byId('closeInspector'),
    inspector: byId('inspector'),
    statusText: byId('statusText'),
    playbackMount: byId('playbackMount'),
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentTrace() {
    return state.traces.find((trace) => trace.operator.id === state.sampleId) || state.traces[0];
  }

  function currentStep(trace = currentTrace()) {
    return trace?.steps?.[state.stepIndex] || trace?.steps?.[0] || null;
  }

  async function loadTraces() {
    const traces = await Promise.all(FIXTURES.map(async (fixture) => {
      const response = await fetch(fixture.path);
      if (!response.ok) throw new Error(`Failed to load ${fixture.path}: ${response.status}`);
      return response.json();
    }));
    await Promise.all(traces.map(loadTraceSource));
    state.traces = traces;
    state.sampleId = traces[0]?.operator?.id || null;
  }

  async function loadTraceSource(trace) {
    if (!trace?.source) return;
    trace.source.keyLines = trace.source.lines || [];
    for (const url of sourceUrlCandidates(trace)) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const text = await response.text();
        trace.source.fullLines = normalizeSourceLines(text);
        trace.source.sourceUrl = url;
        trace.source.partial = false;
        return;
      } catch {
        // Try the next static source candidate.
      }
    }
    trace.source.fullLines = trace.source.keyLines;
    trace.source.partial = true;
  }

  function sourceUrlCandidates(trace) {
    const path = trace.source?.path || '';
    const candidates = [];
    if (path) candidates.push(`data/sources/${encodeURIComponent(path)}`);
    const sourcePath = trace.operator?.sourcePath || '';
    const marker = '/asc-devkit-master/';
    const markerIndex = sourcePath.indexOf(marker);
    if (markerIndex >= 0) {
      candidates.push(`/gitcode/asc-devkit-master/${sourcePath.slice(markerIndex + marker.length)}`);
    }
    if (sourcePath.startsWith('/Users/yin/')) {
      candidates.push(`/${sourcePath.slice('/Users/yin/'.length)}`);
    }
    return [...new Set(candidates)];
  }

  function normalizeSourceLines(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n').map((line, index) => ({
      line: index + 1,
      text: line,
    }));
  }

  function initButtons() {
    els.prevStep?.addEventListener('click', () => selectStep(state.stepIndex - 1));
    els.nextStep?.addEventListener('click', () => selectStep(state.stepIndex + 1));
    els.evidenceToggle?.addEventListener('click', () => {
      state.evidence = !state.evidence;
      els.evidenceToggle.setAttribute('aria-pressed', state.evidence ? 'true' : 'false');
      els.evidenceToggle.classList.toggle('is-selected', state.evidence);
      renderInspector();
    });
    els.zoomOut?.addEventListener('click', () => zoomTensorView(0.86));
    els.zoomIn?.addEventListener('click', () => zoomTensorView(1.16));
    els.fitView?.addEventListener('click', resetTensorView);
    els.viewportInfo?.addEventListener('click', () => openInspector('tensor'));
    els.closeInspector?.addEventListener('click', () => {
      state.inspectorOpen = false;
      renderInspector();
    });
    initTensorViewportInteractions();
  }

  function initTensorViewportInteractions() {
    const canvas = els.tensorCanvas;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', (event) => {
      state.tensorView.dragging = true;
      state.tensorView.startX = event.clientX;
      state.tensorView.startY = event.clientY;
      state.tensorView.startPanX = state.tensorView.panX;
      state.tensorView.startPanY = state.tensorView.panY;
      state.tensorView.moved = false;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!state.tensorView.dragging) return;
      const dx = event.clientX - state.tensorView.startX;
      const dy = event.clientY - state.tensorView.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) state.tensorView.moved = true;
      state.tensorView.panX = state.tensorView.startPanX + dx;
      state.tensorView.panY = state.tensorView.startPanY + dy;
      renderTensorViewport(currentTrace());
    });
    canvas.addEventListener('pointerup', (event) => {
      canvas.releasePointerCapture?.(event.pointerId);
      const moved = state.tensorView.moved;
      state.tensorView.dragging = false;
      if (!moved) openInspector('tensor');
    });
    canvas.addEventListener('pointercancel', () => {
      state.tensorView.dragging = false;
    });
  }

  function zoomTensorView(multiplier) {
    state.tensorView.scale = Math.max(0.55, Math.min(2.4, state.tensorView.scale * multiplier));
    renderTensorViewport(currentTrace());
  }

  function resetTensorView() {
    state.tensorView.scale = 1;
    state.tensorView.panX = 0;
    state.tensorView.panY = 0;
    renderTensorViewport(currentTrace());
  }

  function openInspector(type, payload = {}) {
    state.selectedObject = { type, ...payload };
    state.inspectorOpen = true;
    renderInspector();
  }

  function initPlayback() {
    const helper = window.PtoFloatingPlaybackControl;
    if (!helper?.createControl) return;
    els.playbackMount.innerHTML = '';
    const control = helper.createControl({
      ids: state.playbackIds,
      className: 'pto-floating-playback--tiling',
      showTimeline: false,
    });
    els.playbackMount.appendChild(control);
    state.playback = helper.init({
      root: control,
      isPlaying: () => state.playing,
    });
    byId(state.playbackIds.stepBack)?.addEventListener('click', () => selectStep(state.stepIndex - 1));
    byId(state.playbackIds.stepForward)?.addEventListener('click', () => selectStep(state.stepIndex + 1));
    byId(state.playbackIds.replay)?.addEventListener('click', () => selectStep(0));
    byId(state.playbackIds.play)?.addEventListener('click', togglePlay);
    byId(state.playbackIds.scrubber)?.addEventListener('input', (event) => {
      stopPlayback();
      selectStep(Number(event.target.value) || 0);
    });
  }

  function stopPlayback() {
    state.playing = false;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    syncPlayback();
  }

  function togglePlay() {
    state.playing = !state.playing;
    if (state.playing) {
      state.timer = window.setInterval(() => {
        const trace = currentTrace();
        const max = Math.max(0, (trace?.steps?.length || 1) - 1);
        if (state.stepIndex >= max) {
          selectStep(0, { keepPlaying: true });
          return;
        }
        selectStep(state.stepIndex + 1, { keepPlaying: true });
      }, 900);
    } else if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    syncPlayback();
  }

  function selectSample(sampleId) {
    stopPlayback();
    state.sampleId = sampleId;
    state.stepIndex = 0;
    render();
  }

  function selectStep(index, options = {}) {
    const trace = currentTrace();
    const max = Math.max(0, (trace?.steps?.length || 1) - 1);
    state.stepIndex = Math.max(0, Math.min(max, index));
    if (!options.keepPlaying) stopPlayback();
    render();
  }

  function syncPlayback() {
    const trace = currentTrace();
    const steps = trace?.steps || [];
    const scrubber = byId(state.playbackIds.scrubber);
    const label = byId(state.playbackIds.scrubberLabel);
    const opname = byId(state.playbackIds.scrubberOpname);
    const play = byId(state.playbackIds.play);
    const helper = window.PtoFloatingPlaybackControl;
    if (scrubber) {
      scrubber.max = String(Math.max(0, steps.length - 1));
      scrubber.value = String(state.stepIndex);
    }
    if (label) label.textContent = `${state.stepIndex} / ${Math.max(0, steps.length - 1)}`;
    if (opname) opname.textContent = currentStep(trace)?.label || '-';
    if (play && helper?.iconLabel) {
      play.innerHTML = state.playing ? helper.iconLabel('pause', 'Pause') : helper.iconLabel('play', 'Play');
    }
    state.playback?.sync?.({ playing: state.playing });
  }

  function render() {
    const trace = currentTrace();
    if (!trace) return;
    state.stepIndex = Math.max(0, Math.min(state.stepIndex, trace.steps.length - 1));
    renderChrome(trace);
    renderSamples(trace);
    renderSource(trace);
    renderTensorViewport(trace);
    renderTileLens(trace);
    renderArchitectureFocus(trace);
    renderTimeline(trace);
    renderInspector(trace);
    syncPlayback();
  }

  function renderChrome(trace) {
    const step = currentStep(trace);
    const sourceLines = sourceLinesForTrace(trace);
    if (els.operatorMeta) els.operatorMeta.textContent = '';
    if (els.archReadout) els.archReadout.textContent = '';
    if (els.sourceMeta) {
      const suffix = trace.source?.partial ? '关键行' : `${sourceLines.length} 行`;
      els.sourceMeta.textContent = `${trace.source?.path || 'source'} · ${suffix}`;
    }
    if (els.visualTitle) els.visualTitle.textContent = 'Trace Visual';
    if (els.stepMeta) els.stepMeta.textContent = step ? `${state.stepIndex + 1}/${trace.steps.length}` : '';
    if (els.inspectorMeta) els.inspectorMeta.textContent = inspectorTypeLabel(state.selectedObject?.type) || '选中对象';
    if (els.timelineKicker) els.timelineKicker.textContent = step?.stageId || '';
    if (els.statusText) els.statusText.textContent = '';
  }

  function renderSamples(trace) {
    els.sampleList.innerHTML = state.traces.map((item) => {
      const active = item.operator.id === trace.operator.id;
      return `
        <button class="avz-sample-card ${active ? 'is-active' : ''}" type="button" data-sample="${escapeHtml(item.operator.id)}">
          <p class="avz-card-title">${escapeHtml(sampleShortName(item))}</p>
        </button>
      `;
    }).join('');
    els.sampleList.querySelectorAll('[data-sample]').forEach((button) => {
      button.addEventListener('click', () => {
        state.inspectorOpen = false;
        state.selectedObject = null;
        selectSample(button.dataset.sample);
      });
    });
  }

  function sampleShortName(trace) {
    if (trace.operator.kind === 'cube') return 'Cube Matmul';
    if (trace.operator.kind === 'fusion') return 'Fusion';
    return 'Vector Add';
  }

  function zh(value) {
    return TEXT_ZH[String(value ?? '')] || String(value ?? '');
  }

  function renderSource(trace) {
    const lines = sourceLinesForTrace(trace);
    const activeLines = new Set(currentStep(trace)?.sourceLines || []);
    const keyLines = new Set((trace.source?.keyLines || trace.source?.lines || []).map((line) => line.line));
    trace.steps.forEach((step) => (step.sourceLines || []).forEach((line) => keyLines.add(line)));
    els.sourceLines.innerHTML = lines.map((line) => {
      const stage = sourceStageForLine(trace, line.line);
      const isKey = keyLines.has(line.line) || activeLines.has(line.line);
      const isActive = activeLines.has(line.line);
      const kind = stageKind(stage);
      const tag = isKey ? `<span class="avz-source-line__tag ${kind ? `is-${kind}` : ''}">${escapeHtml(sourceLineTag(stage))}</span>` : '<span></span>';
      const element = isKey ? 'button' : 'div';
      const attrs = isKey ? `type="button" data-line="${line.line}" role="option" aria-selected="${isActive ? 'true' : 'false'}"` : '';
      return `
        <${element} class="avz-source-line ${isKey ? 'is-key' : ''} ${kind ? `is-${kind}` : ''} ${isActive ? 'is-active' : ''}" ${attrs}>
          <span class="avz-source-line__number">${line.line}</span>
          <span class="avz-source-line__text">${highlightAscendC(line.text)}</span>
          ${tag}
        </${element}>
      `;
    }).join('');
    els.sourceLines.querySelectorAll('[data-line]').forEach((button) => {
      button.addEventListener('click', () => {
        const line = Number(button.dataset.line);
        const nextIndex = trace.steps.findIndex((step) => step.sourceLines?.includes(line));
        if (nextIndex >= 0) {
          state.selectedObject = { type: 'source', line };
          state.inspectorOpen = true;
          selectStep(nextIndex);
        }
      });
    });
    const active = els.sourceLines.querySelector('.is-active');
    if (active) {
      window.requestAnimationFrame(() => {
        active.scrollIntoView({ block: 'center', inline: 'nearest' });
      });
    }
  }

  function sourceLinesForTrace(trace) {
    return trace?.source?.fullLines?.length ? trace.source.fullLines : trace?.source?.lines || [];
  }

  function sourceStageForLine(trace, lineNo) {
    const current = currentStep(trace);
    if (current?.sourceLines?.includes(lineNo)) return trace.stages.find((stage) => stage.id === current.stageId) || null;
    const step = trace.steps.find((item) => item.sourceLines?.includes(lineNo));
    return trace.stages.find((stage) => stage.id === step?.stageId) || null;
  }

  function stageKind(stage) {
    const id = String(stage?.id || '').toLowerCase();
    const label = String(stage?.label || '').toLowerCase();
    if (id.includes('sync') || label.includes('sync') || id.includes('init') || id.includes('launch')) return 'control';
    if (id.includes('copy') || id.includes('load') || id.includes('fixpipe')) return 'memory';
    if (id.includes('compute') || id.includes('mmad') || id.includes('matmul') || id.includes('leakyrelu')) return 'compute';
    return '';
  }

  function sourceLineTag(stage) {
    if (!stage) return 'trace';
    const map = {
      'host-launch': '启动',
      init: 'block 切分',
      'copy-in': 'GM -> UB',
      compute: 'Vector 计算',
      'copy-out': 'UB -> GM',
      'load-data': 'L1 -> L0',
      mmad: 'Mmad',
      fixpipe: 'Fixpipe',
      'mix-launch': '__mix__',
      'aic-matmul': 'AIC',
      'cross-core-sync': '同步',
      'aiv-leakyrelu': 'AIV',
    };
    return map[stage.id] || stage.semanticLabel || stage.label || 'trace';
  }

  function highlightAscendC(code) {
    const escaped = escapeHtml(code);
    const re = /(\/\/.*$)|(\/\*.*?\*\/)|(&quot;(?:\\.|[^&])*?&quot;)|(&#39;(?:\\.|[^&])*?&#39;)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(escaped)) !== null) {
      if (match.index > last) out += escaped.slice(last, match.index);
      if (match[1] || match[2]) out += `<span class="tk-comment">${match[0]}</span>`;
      else if (match[3] || match[4]) out += `<span class="tk-string">${match[0]}</span>`;
      else if (match[5]) out += `<span class="tk-number">${match[5]}</span>`;
      else if (match[6]) {
        const id = match[6];
        const next = escaped[re.lastIndex];
        if (CPP_KEYWORDS.has(id)) out += `<span class="tk-keyword">${id}</span>`;
        else if (CPP_TYPES.has(id)) out += `<span class="tk-type">${id}</span>`;
        else if (next === '(') out += `<span class="tk-fn">${id}</span>`;
        else out += id;
      }
      last = re.lastIndex;
    }
    if (last < escaped.length) out += escaped.slice(last);
    return out;
  }

  function visualStateForStep(trace, step) {
    const derived = deriveVisualState(trace, step);
    const explicit = step?.visualState || {};
    return {
      tensorViewport: {
        ...derived.tensorViewport,
        ...(explicit.tensorViewport || {}),
      },
      onChipLens: {
        ...derived.onChipLens,
        ...(explicit.onChipLens || {}),
      },
      architectureFocus: {
        ...derived.architectureFocus,
        ...(explicit.architectureFocus || {}),
        bufferBlocks: explicit.architectureFocus?.bufferBlocks || derived.architectureFocus.bufferBlocks,
      },
    };
  }

  function deriveVisualState(trace, step) {
    if (trace.operator.kind === 'cube') return deriveCubeVisualState(step);
    if (trace.operator.kind === 'fusion') return deriveFusionVisualState(step);
    return deriveVectorVisualState(step);
  }

  function deriveVectorVisualState(step) {
    const blockIdx = Number(step?.blockIdx || 0);
    const progress = Number(step?.loop?.progress || 0);
    const stage = step?.stageId || '';
    const isCopyOut = stage.includes('copy-out');
    const isCompute = stage.includes('compute');
    const tone = isCopyOut ? 'output' : isCompute ? 'compute' : 'input';
    const blocks = vectorBufferBlocks(stage, blockIdx, progress);
    return {
      tensorViewport: {
        kind: 'vector',
        axisLabels: ['element', 'progress', 'blockIdx'],
        bounds: { x: 16, y: 16, z: 8 },
        title: 'x/y/z folded as [element, progress, blockIdx]',
        tiles: [{
          label: `${step?.label || 'tile'} · block ${blockIdx} progress ${progress}`,
          range: { x: [0, 15], y: [progress, progress], z: [blockIdx, blockIdx] },
          tone,
          state: isCopyOut ? 'committed' : isCompute ? 'computing' : 'loaded',
        }],
        operationChips: ['DataCopy', 'TQue', isCompute ? 'Add' : isCopyOut ? 'CopyOut' : 'CopyIn'],
      },
      onChipLens: { blocks },
      architectureFocus: {
        selectors: vectorSelectors(stage),
        routes: vectorRoutes(stage),
        bufferBlocks: blocks,
      },
    };
  }

  function deriveCubeVisualState(step) {
    const kIndex = Number(step?.loop?.kIndex || 0);
    const blockIdx = Number(step?.blockIdx || 0);
    const nTile = blockIdx >= 2 ? 4 : 0;
    const mTile = blockIdx % 2 === 1 ? 2 : 0;
    const stage = step?.stageId || '';
    const blocks = cubeBufferBlocks(stage, kIndex);
    const tone = stage === 'mmad' ? 'reduction' : stage === 'fixpipe' ? 'output' : 'input';
    return {
      tensorViewport: {
        kind: 'matmul',
        axisLabels: ['N tile', 'M tile', 'K accumulation'],
        bounds: { x: 8, y: 4, z: 8 },
        title: 'A[M,K], B[K,N], C[M,N] logical tile space',
        tiles: [{
          label: `C block ${blockIdx} · k ${kIndex}`,
          range: { x: [nTile, Math.min(7, nTile + 3)], y: [mTile, Math.min(3, mTile + 1)], z: [kIndex, kIndex] },
          tone,
          state: stage === 'mmad' ? 'accumulating' : 'selected',
        }],
        operationChips: cubeOps(stage),
      },
      onChipLens: { blocks },
      architectureFocus: {
        selectors: cubeSelectors(stage),
        routes: cubeRoutes(stage),
        bufferBlocks: blocks,
      },
    };
  }

  function deriveFusionVisualState(step) {
    const aivHalf = Number(step?.blockIdx || 0) % 2;
    const stage = step?.stageId || '';
    const blocks = fusionBufferBlocks(stage, aivHalf);
    const tone = stage.includes('aiv') ? 'fusion' : stage.includes('sync') ? 'compute' : 'reduction';
    return {
      tensorViewport: {
        kind: 'fusion',
        axisLabels: ['N tile', 'M half', 'AIC/AIV handoff'],
        bounds: { x: 8, y: 4, z: 3 },
        title: 'Matmul output split across paired AIV consumers',
        tiles: [{
          label: step?.label || 'fusion tile',
          range: { x: [0, 3], y: [aivHalf * 2, aivHalf * 2 + 1], z: [stage.includes('aiv') ? 2 : 1, stage.includes('aiv') ? 2 : 1] },
          tone,
          state: stage.includes('sync') ? 'waiting' : 'active',
        }],
        operationChips: ['Mmad', 'Fixpipe', 'CrossCoreFlag', 'LeakyRelu'],
      },
      onChipLens: { blocks },
      architectureFocus: {
        selectors: fusionSelectors(stage),
        routes: fusionRoutes(stage),
        bufferBlocks: blocks,
      },
    };
  }

  function vectorBufferBlocks(stage, blockIdx, progress) {
    const sourceBase = `block${blockIdx},progress${progress}`;
    if (stage.includes('copy-out')) {
      return [{ core: 'mem950-aiv1', buffer: 'UB', label: 'zLocal', state: 'committed', tone: 'output', cellRange: [38, 53], sourceTile: `z[${sourceBase},:]`, operation: 'CopyOut' }];
    }
    if (stage.includes('compute')) {
      return [
        { core: 'mem950-aiv1', buffer: 'UB', label: 'xLocal', state: 'dequeued', tone: 'input', cellRange: [0, 15], sourceTile: `x[${sourceBase},:]`, operation: 'DeQue' },
        { core: 'mem950-aiv1', buffer: 'UB', label: 'yLocal', state: 'dequeued', tone: 'input', cellRange: [19, 34], sourceTile: `y[${sourceBase},:]`, operation: 'DeQue' },
        { core: 'mem950-aiv1', buffer: 'UB', label: 'zLocal', state: 'enqueued', tone: 'output', cellRange: [38, 53], sourceTile: `z[${sourceBase},:]`, operation: 'Add' },
      ];
    }
    if (stage.includes('copy-in')) {
      return [
        { core: 'mem950-aiv1', buffer: 'UB', label: 'xLocal', state: 'enqueued', tone: 'input', cellRange: [0, 15], sourceTile: `x[${sourceBase},:]`, operation: 'CopyIn' },
        { core: 'mem950-aiv1', buffer: 'UB', label: 'yLocal', state: 'enqueued', tone: 'input', cellRange: [19, 34], sourceTile: `y[${sourceBase},:]`, operation: 'CopyIn' },
      ];
    }
    return [];
  }

  function cubeBufferBlocks(stage, kIndex) {
    if (stage.includes('copy-in-a')) {
      return [
        { core: 'mem950-aic', buffer: 'L1', label: 'A1 tile', state: 'loaded', tone: 'input', cellRange: [0, 19], sourceTile: `A[m0,k${kIndex}]`, operation: 'DataCopy' },
        { core: 'mem950-aic', buffer: 'L0A', label: 'A2 reserve', state: 'allocated', tone: 'input', cellRange: [0, 9], sourceTile: `A[m0,k${kIndex}]` },
      ];
    }
    if (stage.includes('copy-in-b')) {
      return [
        { core: 'mem950-aic', buffer: 'L1', label: 'B1 tile', state: 'loaded', tone: 'input', cellRange: [30, 49], sourceTile: `B[k${kIndex},n0]`, operation: 'DataCopy' },
        { core: 'mem950-aic', buffer: 'L0B', label: 'B2 reserve', state: 'allocated', tone: 'input', cellRange: [0, 9], sourceTile: `B[k${kIndex},n0]` },
      ];
    }
    if (stage.includes('load-data')) {
      return [
        { core: 'mem950-aic', buffer: 'L0A', label: 'A2 tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: `A2[k${kIndex}]`, operation: 'LoadDataA' },
        { core: 'mem950-aic', buffer: 'L0B', label: 'B2 tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: `B2[k${kIndex}]`, operation: 'LoadDataB' },
      ];
    }
    if (stage.includes('mmad')) {
      return [
        { core: 'mem950-aic', buffer: 'L0A', label: 'A2 tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: `A2[k${kIndex}]`, operation: 'Mmad' },
        { core: 'mem950-aic', buffer: 'L0B', label: 'B2 tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: `B2[k${kIndex}]`, operation: 'Mmad' },
        { core: 'mem950-aic', buffer: 'L0C', label: 'C partial', state: 'accumulating', tone: 'accumulator', cellRange: [20, 43], sourceTile: `C[m0,n0,k${kIndex}]`, operation: 'Mmad' },
      ];
    }
    if (stage.includes('fixpipe')) {
      return [{ core: 'mem950-aic', buffer: 'L0C', label: 'C output', state: 'committed', tone: 'output', cellRange: [20, 43], sourceTile: 'C[m0,n0]', operation: 'Fixpipe' }];
    }
    return [];
  }

  function fusionBufferBlocks(stage, aivHalf) {
    if (stage.includes('aic-matmul')) {
      return [
        { core: 'mem950-aic', buffer: 'L0A', label: 'A tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: 'A[m0,k*]' },
        { core: 'mem950-aic', buffer: 'L0B', label: 'B tile', state: 'loaded', tone: 'input', cellRange: [0, 15], sourceTile: 'B[k*,n0]' },
        { core: 'mem950-aic', buffer: 'L0C', label: 'C partial', state: 'accumulating', tone: 'accumulator', cellRange: [20, 43], sourceTile: 'C[m0,n0]' },
      ];
    }
    if (stage.includes('sync')) {
      return [{ core: 'mem950-aic', buffer: 'L0C', label: 'C ready', state: 'committed', tone: 'output', cellRange: [20, 43], sourceTile: 'C[m0,n0]', operation: 'CrossCoreSetFlag' }];
    }
    if (stage.includes('aiv-leakyrelu')) {
      return [
        { core: `mem950-aiv${aivHalf + 1}`, buffer: 'UB', label: 'epilogue tile', state: 'enqueued', tone: 'output', cellRange: [0, 31], sourceTile: `C half ${aivHalf}`, operation: 'LeakyRelu' },
        { core: 'mem950-aic', buffer: 'L0C', label: 'direct C-V source', state: 'committed', tone: 'output', cellRange: [20, 43], sourceTile: 'C[m0,n0]' },
      ];
    }
    return [];
  }

  function vectorSelectors(stage) {
    if (stage.includes('copy-out')) return ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '[data-mem950-node="rail:GM"]'];
    if (stage.includes('compute')) return ['#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="exec:SIMD"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]'];
    if (stage.includes('copy-in')) return ['[data-mem950-node="rail:GM"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]'];
    return [];
  }

  function vectorRoutes(stage) {
    if (stage.includes('copy-out')) return ['aiv1-ub-to-gm'];
    if (stage.includes('copy-in')) return ['gm-to-aiv1-ub'];
    return [];
  }

  function cubeSelectors(stage) {
    if (stage.includes('copy-in') || stage.includes('load-data')) {
      return ['[data-mem950-node="rail:GM"]', '#mem950-aic [data-aic-node="buffer:L1"]', '#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]'];
    }
    if (stage.includes('mmad')) {
      return ['#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]', '#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]'];
    }
    if (stage.includes('fixpipe')) return ['#mem950-aic [data-aic-node="buffer:L0C"]', '[data-mem950-node="rail:GM"]'];
    return [];
  }

  function cubeRoutes(stage) {
    if (stage.includes('copy-in') || stage.includes('load-data')) return ['gm-to-aic-l0a', 'gm-to-aic-l0b'];
    return [];
  }

  function fusionSelectors(stage) {
    if (stage.includes('aiv-leakyrelu')) {
      return ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv2 [data-aiv-node="buffer:UB"]', '#mem950-aiv1 [data-aiv-node="vector:Vector"]', '#mem950-aiv2 [data-aiv-node="vector:Vector"]'];
    }
    if (stage.includes('sync')) {
      return ['#mem950-aic [data-aic-node="buffer:L0C"]', '#mem950-aiv1 [data-aiv-node="buffer:UB"]', '#mem950-aiv2 [data-aiv-node="buffer:UB"]'];
    }
    if (stage.includes('aic-matmul')) {
      return ['#mem950-aic [data-aic-node="buffer:L0A"]', '#mem950-aic [data-aic-node="buffer:L0B"]', '#mem950-aic [data-aic-node="cube:CUBE"]', '#mem950-aic [data-aic-node="buffer:L0C"]'];
    }
    return [];
  }

  function fusionRoutes(stage) {
    if (stage.includes('aiv-leakyrelu') || stage.includes('sync')) return ['aic-to-aiv1', 'aiv2-to-aic'];
    return [];
  }

  function cubeOps(stage) {
    if (stage.includes('copy-in')) return ['DataCopy', 'ND->NZ'];
    if (stage.includes('load-data')) return ['LoadData', 'L1->L0'];
    if (stage.includes('mmad')) return ['Mmad', 'K accumulate'];
    if (stage.includes('fixpipe')) return ['Fixpipe', 'CopyOut'];
    return ['GetBlockIdx', 'GM offset'];
  }

  function renderTensorViewport(trace) {
    if (!trace || !els.tensorCanvas) return;
    const step = currentStep(trace);
    const visual = visualStateForStep(trace, step).tensorViewport;
    const canvas = els.tensorCanvas;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(520, Math.floor(rect.width || canvas.clientWidth || 760));
    const height = Math.max(360, Math.floor(rect.height || canvas.clientHeight || 480));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTensorScene(ctx, width, height, visual);
    const tip = tensorViewportTip(visual);
    els.tensorStage.title = tip;
    els.viewportInfo.title = tip;
    syncWebglFallback();
  }

  function tensorViewportTip(visual) {
    const axes = visual.axisLabels || [];
    const parts = [
      `View: ${visual.kind || 'logical'}`,
      ...axes.map((axis, index) => `${String.fromCharCode(88 + index)}: ${axis}`),
      'GM is flat; this is a logical access space',
    ];
    if ((visual.operationChips || []).length) parts.push(`Ops: ${visual.operationChips.join(', ')}`);
    return parts.join('\n');
  }

  function syncWebglFallback() {
    if (state.webglAvailable == null) {
      try {
        const test = document.createElement('canvas');
        state.webglAvailable = Boolean(test.getContext('webgl') || test.getContext('experimental-webgl'));
      } catch (error) {
        state.webglAvailable = false;
      }
    }
    els.tensorFallback.hidden = state.webglAvailable;
  }

  function drawTensorScene(ctx, width, height, visual) {
    const bounds = visual.bounds || { x: 8, y: 8, z: 4 };
    const tileRanges = visual.tiles || [];
    const viewportScale = state.tensorView.scale || 1;
    const reservedBottom = Math.min(190, Math.max(132, height * 0.24));
    const fitWidth = width / ((bounds.x + bounds.y) * 0.92 + 8);
    const fitHeight = (height - reservedBottom) / ((bounds.x + bounds.y) * 0.42 + bounds.z * 0.84 + 4);
    const cell = Math.max(7, Math.min(20, Math.floor(Math.min(fitWidth, fitHeight)))) * viewportScale;
    const leftExtent = -Math.max(0, bounds.y - 1) * cell * 0.88 - cell;
    const rightExtent = Math.max(0, bounds.x - 1) * cell * 0.88 + cell;
    const topExtent = Math.max(1, bounds.z) * cell * 0.78 + cell;
    const bottomExtent = Math.max(1, bounds.x + bounds.y - 2) * cell * 0.42 + cell;
    const contentCenterY = (32 + Math.max(120, height - reservedBottom)) / 2;
    const origin = {
      x: (width / 2) - ((leftExtent + rightExtent) / 2) + (state.tensorView.panX || 0),
      y: contentCenterY - ((bottomExtent - topExtent) / 2) + (state.tensorView.panY || 0),
    };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getCss('--surface-2') || '#15191f';
    ctx.fillRect(0, 0, width, height);
    drawTensorBackdrop(ctx, width, height);

    const highlighted = new Map();
    tileRanges.forEach((tile, tileIndex) => {
      cellsForRange(tile.range, bounds).forEach((key) => highlighted.set(key, { tile, tileIndex }));
    });

    for (let z = 0; z < bounds.z; z += 1) {
      for (let y = bounds.y - 1; y >= 0; y -= 1) {
        for (let x = 0; x < bounds.x; x += 1) {
          const key = `${x}:${y}:${z}`;
          const active = highlighted.get(key);
          const isShell = active || x === 0 || y === 0 || z === 0 || x === bounds.x - 1 || y === bounds.y - 1 || z === bounds.z - 1;
          if (!isShell) continue;
          const tone = TENSOR_TONES[active?.tile?.tone || 'default'] || TENSOR_TONES.default;
          drawVoxel(ctx, projectIso(origin, cell, x, y, z), cell, tone, active ? 1 : 0.42);
        }
      }
    }

    drawAxes(ctx, origin, cell, bounds, visual.axisLabels || []);
    drawTileLabels(ctx, width, tileRanges);
  }

  function drawTensorBackdrop(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function projectIso(origin, cell, x, y, z) {
    return {
      x: origin.x + (x - y) * cell * 0.88,
      y: origin.y + (x + y) * cell * 0.42 - z * cell * 0.78,
    };
  }

  function drawVoxel(ctx, point, cell, tone, alpha) {
    const w = cell * 0.88;
    const h = cell * 0.42;
    const z = cell * 0.72;
    const top = [
      [point.x, point.y - z],
      [point.x + w, point.y - z + h],
      [point.x, point.y - z + h * 2],
      [point.x - w, point.y - z + h],
    ];
    const right = [
      [point.x + w, point.y - z + h],
      [point.x, point.y - z + h * 2],
      [point.x, point.y + h * 2],
      [point.x + w, point.y + h],
    ];
    const left = [
      [point.x - w, point.y - z + h],
      [point.x, point.y - z + h * 2],
      [point.x, point.y + h * 2],
      [point.x - w, point.y + h],
    ];
    drawPoly(ctx, left, tone.fill, tone.stroke, alpha * 0.72);
    drawPoly(ctx, right, tone.fill, tone.stroke, alpha * 0.84);
    drawPoly(ctx, top, tone.fill, tone.stroke, alpha);
  }

  function drawPoly(ctx, points, fill, stroke, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawAxes(ctx, origin, cell, bounds, labels = []) {
    const axes = [
      { name: labels[0] || 'X', end: projectIso(origin, cell, bounds.x + 1, 0, 0), color: TENSOR_TONES.input.stroke },
      { name: labels[1] || 'Y', end: projectIso(origin, cell, 0, bounds.y + 1, 0), color: TENSOR_TONES.output.stroke },
      { name: labels[2] || 'Z', end: projectIso(origin, cell, 0, 0, bounds.z + 1), color: TENSOR_TONES.compute.stroke },
    ];
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    axes.forEach((axis) => {
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(axis.end.x, axis.end.y);
      ctx.strokeStyle = axis.color;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = axis.color;
      ctx.fillText(axis.name, axis.end.x + 8, axis.end.y);
    });
  }

  function drawTileLabels(ctx, width, tiles) {
    ctx.font = '600 11px Inter, sans-serif';
    tiles.slice(0, 3).forEach((tile, index) => {
      const tone = TENSOR_TONES[tile.tone || 'default'] || TENSOR_TONES.default;
      const y = 28 + index * 24;
      ctx.fillStyle = tone.fill;
      ctx.fillRect(width - 280, y - 12, 10, 10);
      ctx.strokeStyle = tone.stroke;
      ctx.strokeRect(width - 280, y - 12, 10, 10);
      ctx.fillStyle = getCss('--foreground-secondary') || '#d8dde5';
      ctx.fillText(tile.label || `tile ${index + 1}`, width - 264, y - 3);
    });
  }

  function cellsForRange(range, bounds) {
    if (!range) return [];
    const xs = clampRange(range.x || [0, bounds.x - 1], bounds.x);
    const ys = clampRange(range.y || [0, bounds.y - 1], bounds.y);
    const zs = clampRange(range.z || [0, bounds.z - 1], bounds.z);
    const cells = [];
    for (let z = zs[0]; z <= zs[1]; z += 1) {
      for (let y = ys[0]; y <= ys[1]; y += 1) {
        for (let x = xs[0]; x <= xs[1]; x += 1) cells.push(`${x}:${y}:${z}`);
      }
    }
    return cells;
  }

  function clampRange(range, max) {
    const start = Math.max(0, Math.min(max - 1, Number(range[0] || 0)));
    const end = Math.max(start, Math.min(max - 1, Number(range[1] ?? start)));
    return [start, end];
  }

  function renderTensorLegend(visual) {
    const axes = visual.axisLabels || [];
    return [
      `View: ${visual.kind || 'logical'}`,
      ...axes.map((axis, index) => `${String.fromCharCode(88 + index)}: ${axis}`),
      'GM is flat; this is a logical access space',
    ].join('\n');
  }

  function renderTileLens(trace) {
    const visual = visualStateForStep(trace, currentStep(trace));
    const blocks = visual.onChipLens?.blocks || visual.architectureFocus?.bufferBlocks || [];
    if (!blocks.length) {
      els.tileLens.innerHTML = '';
      return;
    }
    els.tileLens.innerHTML = blocks.slice(0, 3).map((block, index) => `
      <button class="avz-lens-card" type="button" data-block-index="${index}" title="${escapeHtml(block.state || 'loaded')} · ${escapeHtml(block.sourceTile || '')}">
        <header class="avz-lens-card__head">
          <span>${escapeHtml(block.label || block.buffer)}</span>
          <span>${escapeHtml(block.core || 'core')} · ${escapeHtml(block.buffer || 'buffer')}</span>
        </header>
        <div class="avz-lens-grid">${renderLensCells(block)}</div>
        <div class="avz-card-meta">${escapeHtml(block.state || 'loaded')} · ${escapeHtml(block.sourceTile || '')}</div>
      </button>
    `).join('');
    els.tileLens.querySelectorAll('[data-block-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const block = blocks[Number(button.dataset.blockIndex) || 0];
        openInspector('buffer', { block });
      });
    });
  }

  function renderLensCells(block) {
    const active = new Set(cellRange(block, 32));
    return Array.from({ length: 32 }, (_, index) => (
      `<span class="${active.has(index) ? `is-active is-${escapeHtml(block.tone || 'input')}` : ''}"></span>`
    )).join('');
  }

  function cellRange(block, count) {
    if (Array.isArray(block.cellRange)) {
      const start = Math.max(0, Math.min(count - 1, Number(block.cellRange[0] || 0)));
      const end = Math.max(start, Math.min(count - 1, Number(block.cellRange[1] ?? start)));
      return Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
    }
    return [];
  }

  function ensureArchitectureMounted() {
    const helper = window.PtoMemoryArchitecturePattern;
    if (!helper?.renderArchitecture || !els.architectureMap) return false;
    if (state.architecture.mounted) return true;
    helper.renderArchitecture(els.architectureMap, ARCH_PRESET);
    state.architecture.overlay = helper.createRouteOverlay?.(els.architectureMap, ARCH_PRESET);
    const viewportHelper = window.PtoHardwareArchitectureViewport;
    state.architecture.viewport = viewportHelper?.mount?.(els.architectureViewportRoot, {
      mode: 'inline',
      viewport: '#architectureViewport',
      scaleEl: '#architectureMap',
      detailToggle: '#architectureDetailToggle',
      zoomOut: '#archZoomOut',
      zoomIn: '#archZoomIn',
      fit: '#archFitView',
      readout: '#archZoomReadout',
      zoomLevels: [0.35, 0.4, 0.5, 0.6, 0.7, 0.85, 1, 1.1],
      defaultScale: 0.5,
      frameSize: { width: 3200, height: 900 },
      detailsVisible: false,
      fitOnMount: false,
      inlineHost: '#architectureMap',
      onScaleChange: (scale) => {
        state.architecture.hover?.setViewportScale?.(scale);
        state.architecture.overlay?.render?.();
      },
      onPanChange: () => state.architecture.overlay?.render?.(),
      onDetailChange: () => state.architecture.overlay?.render?.(),
    });
    state.architecture.hover = helper.attachHoverInteractions?.(els.architectureMap, ARCH_PRESET, {
      viewportScale: state.architecture.viewport?.state?.scale || 0.5,
    });
    helper.setDetailVisibility?.(els.architectureMap, false);
    state.architecture.overlay?.render?.();
    state.architecture.mounted = true;
    return true;
  }

  function renderArchitectureFocus(trace) {
    const mounted = ensureArchitectureMounted();
    const helper = window.PtoMemoryArchitecturePattern;
    const visual = visualStateForStep(trace, currentStep(trace)).architectureFocus || {};
    const blocks = visual.bufferBlocks || [];
    if (els.architectureKicker) els.architectureKicker.textContent = '';
    if (mounted && helper) {
      helper.clearPathFocus?.(els.architectureMap);
      helper.clearBufferBlocks?.(els.architectureMap);
      if ((visual.selectors || []).length || (visual.routes || []).length) {
        helper.setPathFocus?.(els.architectureMap, ARCH_PRESET, visual);
      }
      helper.setBufferBlocks?.(els.architectureMap, blocks);
      state.architecture.overlay?.render?.();
    }
    els.architectureBlocks.innerHTML = blocks.length
      ? blocks.map((block, index) => `<button class="avz-chip avz-chip-button" type="button" data-architecture-block="${index}">${escapeHtml(block.core || 'core')} · ${escapeHtml(block.buffer || 'buffer')} · ${escapeHtml(block.label || '')}</button>`).join('')
      : '<span class="avz-chip">当前步骤没有本地 buffer 占用</span>';
    els.architectureBlocks.querySelectorAll('[data-architecture-block]').forEach((button) => {
      button.addEventListener('click', () => {
        const block = blocks[Number(button.dataset.architectureBlock) || 0];
        openInspector('architecture buffer', { block });
      });
    });
  }

  function renderTimeline(trace) {
    if (!trace || !els.timelineCanvas) return;
    const canvas = els.timelineCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 640));
    const height = 92;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getCss('--surface-2');
    ctx.fillRect(0, 0, width, height);

    const helper = window.PtoSwimlaneTaskPattern;
    const palette = helper?.createTaskColormap?.() || null;
    const gap = 8;
    const left = 10;
    const top = 28;
    const barHeight = 30;
    const stepCount = trace.steps.length;
    const barWidth = Math.max(42, (width - left * 2 - gap * (stepCount - 1)) / stepCount);

    ctx.fillStyle = getCss('--foreground-muted');
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillText('Step trace', left, 17);

    trace.steps.forEach((step, index) => {
      const stage = trace.stages.find((item) => item.id === step.stageId);
      const x = left + index * (barWidth + gap);
      const color = palette?.colorForLaneKind?.(step.unit) || helper?.colorFromColormap?.(stage?.label || step.stageId) || '#5b8def';
      if (helper?.drawTaskBar) {
        helper.drawTaskBar(ctx, {
          x,
          y: top,
          width: barWidth,
          height: barHeight,
          radius: 5,
          baseColor: color,
          isSelected: index === state.stepIndex,
          task: {
            label: stage?.label || step.stageId,
            displayName: step.label,
            inputRawMagic: step.memoryRegions || [],
            outputRawMagic: step.queueEvents || step.syncEvents || [],
            laneKind: step.unit,
          },
          fontFamily: 'Inter, Source Han Sans SC, sans-serif',
        });
      } else {
        ctx.fillStyle = index === state.stepIndex ? getCss('--primary') : color;
        ctx.fillRect(x, top, barWidth, barHeight);
      }
      ctx.fillStyle = getCss('--foreground-muted');
      ctx.font = '600 9px ui-monospace, monospace';
      ctx.fillText(String(index + 1), x + 2, top + barHeight + 14);
    });

    canvas.onclick = (event) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const index = Math.floor((x - left) / (barWidth + gap));
      if (index >= 0 && index < trace.steps.length) {
        state.selectedObject = { type: 'timeline step', stepIndex: index };
        state.inspectorOpen = true;
        selectStep(index);
      }
    };
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderInspector(trace = currentTrace()) {
    if (els.inspectorDrawer) els.inspectorDrawer.hidden = !state.inspectorOpen;
    if (!state.inspectorOpen) return;
    const step = currentStep(trace);
    const stage = trace.stages.find((item) => item.id === step?.stageId);
    if (!step || !stage) return;
    const visual = visualStateForStep(trace, step);
    const selected = selectedObjectNarrative(trace, step, stage, visual);
    els.inspectorMeta.textContent = selected.meta;
    const metrics = (step.metrics || []).map((metric) => (
      `${metric.label}=${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`
    ));
    const events = [...(step.queueEvents || []), ...(step.syncEvents || [])];
    const regions = step.memoryRegions || [];
    const blocks = visual.architectureFocus?.bufferBlocks || [];
    const axes = visual.tensorViewport?.axisLabels || [];

    els.inspector.innerHTML = `
      <section class="inspector-section avz-inspector-hero">
        <p class="avz-inspector-eyebrow">${escapeHtml(selected.meta)}</p>
        <h3>${escapeHtml(selected.title)}</h3>
        <p>${escapeHtml(selected.body)}</p>
      </section>

      <section class="inspector-section">
        <header class="inspector-section-head">
          <span class="inspector-section-title">当前步骤</span>
        </header>
        <p class="avz-inspector-copy">${escapeHtml(stepNarrative(trace, step, stage))}</p>
      </section>

      <section class="inspector-section">
        <header class="inspector-section-head">
          <span class="inspector-section-title">怎么看图</span>
        </header>
        <p class="avz-inspector-copy">${escapeHtml(visualNarrative(visual, axes, blocks))}</p>
      </section>

      ${regions.length ? `
        <section class="inspector-section">
          <header class="inspector-section-head">
            <span class="inspector-section-title">数据位置</span>
          </header>
          <p class="avz-inspector-copy">${escapeHtml(memoryNarrative(regions, blocks))}</p>
        </section>
      ` : ''}

      ${events.length ? `
        <section class="inspector-section">
          <header class="inspector-section-head">
            <span class="inspector-section-title">队列和同步</span>
          </header>
          <p class="avz-inspector-copy">${escapeHtml(`这一帧会触发 ${formatListCn(events)}。这些事件用于表达 LocalTensor 入队/出队、buffer 释放，或者 AIC 与 AIV 之间的 flag 同步关系。`)}</p>
        </section>
      ` : ''}

      ${metrics.length ? `
        <section class="inspector-section">
          <header class="inspector-section-head">
            <span class="inspector-section-title">关键参数</span>
          </header>
          <dl class="avz-inspector-facts">
            ${(step.metrics || []).map((metric) => `
              <div>
                <dt>${escapeHtml(metric.label)}</dt>
                <dd>${escapeHtml(metric.value)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ''}</dd>
              </div>
            `).join('')}
          </dl>
        </section>
      ` : ''}
    `;
  }

  function selectedObjectNarrative(trace, step, stage, visual) {
    const selected = state.selectedObject;
    if (selected.block) {
      const block = selected.block;
      return {
        title: block.label || block.buffer || '本地数据块',
        meta: 'Architecture Buffer',
        body: `${block.core || '当前 core'} 的 ${block.buffer || 'buffer'} 正在承载 ${block.sourceTile || '当前 tile'}。状态是 ${block.state || 'unknown'}，对应操作是 ${block.operation || stage.label}。这个对象只表示片上 buffer 中的一小块驻留数据，不代表完整 logical tensor。`,
      };
    }
    if (selected.type === 'source') {
      return {
        title: `源码第 ${selected.line} 行`,
        meta: 'Source Line',
        body: `这一行源码被 trace 映射到当前执行步骤。选中它时，左侧代码、中央逻辑 tensor、右侧硬件链路和底部时间线会同步到同一帧，帮助你从代码语句追到实际搬运或计算的数据范围。`,
      };
    }
    if (selected.type === 'timeline step') {
      return {
        title: `时间线步骤 ${Number(selected.stepIndex || 0) + 1}`,
        meta: 'Execution Step',
        body: `这是执行序列中的一个可播放切片。时间线负责表达阶段顺序和当前帧位置；播放按钮只控制上一步、下一步、播放和重播，不改变 trace 本身。`,
      };
    }
    if (selected?.type === 'tensor') {
      return {
        title: 'Logical Tensor 3D Viewport',
        meta: 'Tensor View',
        body: `中央 3D 视图展示的是逻辑访问空间，不是 GM 里的物理连续三维存储。当前坐标含义是 ${formatListCn(visual.tensorViewport?.axisLabels || [])}；拖动画布可以观察 tile 相对位置，缩放按钮用于调整视图大小。`,
      };
    }
    return {
      title: zh(step.label),
      meta: unitLabel(step.unit || stage.unit) || 'Trace Step',
      body: zh(step.summary),
    };
  }

  function stepNarrative(trace, step, stage) {
    const sourceLines = (step.sourceLines || []).length ? `源码行 ${step.sourceLines.join(', ')}` : '当前源码片段';
    const opText = (stage.operations || []).length ? `涉及 ${formatListCn(stage.operations)}。` : '';
    return `${sourceLines} 对应 ${zh(stage.label)} 阶段。${zh(stage.description)} ${opText}${zh(step.summary)}`;
  }

  function visualNarrative(visual, axes, blocks) {
    const axisText = axes.length ? `3D 视口的三个轴当前表示 ${formatListCn(axes)}。` : '';
    const blockText = blocks.length
      ? `右侧架构图会把 ${blocks.length} 个片上本地数据块标在对应 buffer grid 上，例如 ${formatListCn(blocks.map((block) => `${block.buffer}:${block.label}`))}。`
      : '当前步骤没有片上 buffer data block 需要单独标出。';
    return `${axisText}中央视图负责表达完整 logical tensor 的选中范围；Memory Architecture 负责表达硬件链路、core、buffer 和局部驻留数据。${blockText}`;
  }

  function memoryNarrative(regions, blocks) {
    const local = blocks.length
      ? `片上驻留点是 ${formatListCn(blocks.map((block) => `${block.core || 'core'} ${block.buffer || 'buffer'} 中的 ${block.label || 'tile'}`))}。`
      : '';
    return `这一步读写的数据区域包括 ${formatListCn(regions)}。${local}`;
  }

  function formatListCn(items) {
    const values = (items || []).filter(Boolean).map(String);
    if (values.length <= 1) return values[0] || '无';
    if (values.length === 2) return `${values[0]} 和 ${values[1]}`;
    return `${values.slice(0, -1).join('、')} 和 ${values[values.length - 1]}`;
  }

  function inspectorTypeLabel(type) {
    const labels = {
      tensor: '逻辑 Tensor 视口',
      buffer: '片上数据块',
      'architecture buffer': '架构图数据块',
      source: '源码行',
      'timeline step': '时间线步骤',
    };
    return labels[type] || type || '';
  }

  function unitLabel(unit) {
    const labels = {
      host: 'Host',
      vector: 'Vector',
      cube: 'Cube',
      aic: 'AIC',
      aiv: 'AIV',
      sync: '同步',
      mixed: '混合',
    };
    return labels[unit] || unit || '';
  }

  async function init() {
    initButtons();
    try {
      await loadTraces();
      window.PtoIdeFrame?.initAll?.();
      initPlayback();
      render();
      initResizeObservers();
      window.addEventListener('resize', () => {
        const trace = currentTrace();
        renderTensorViewport(trace);
        renderTimeline(trace);
        state.architecture.overlay?.render?.();
      });
    } catch (error) {
      if (els.statusText) els.statusText.textContent = error.message;
      if (els.inspector) els.inspector.innerHTML = `<div class="inspector-soft-card is-danger">${escapeHtml(error.message)}</div>`;
    }
  }

  function initResizeObservers() {
    if (state.resizeObserver || typeof ResizeObserver !== 'function') return;
    state.resizeObserver = new ResizeObserver(() => {
      const trace = currentTrace();
      renderTensorViewport(trace);
      renderTimeline(trace);
      state.architecture.overlay?.render?.();
    });
    [els.tensorStage, els.timelineCanvas, els.architectureViewport].forEach((target) => {
      if (target) state.resizeObserver.observe(target);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
