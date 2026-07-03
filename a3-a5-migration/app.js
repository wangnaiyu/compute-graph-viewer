(function initA3A5MigrationWorkbench() {
  'use strict';

  const data = window.A3A5MigrationContent;
  const state = {
    view: 'conclusion',
    scenario: 'general',
    query: '',
    activeId: 'conclusion',
    diffOn: false,
    zoom: 0.4,
    panX: 0,
    panY: 0,
    architectureUserPanned: false,
    inspectorOpen: true,
    theme: 'dark',
  };

  let ideFrameInstance = null;
  let memoryOverlay = null;
  let memoryReady = false;
  const ARCH_ZOOM = {
    min: 0.1,
    max: 3,
    step: 0.05,
    default: 0.4,
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function allItems() {
    return [
      ...data.units,
      ...data.roles,
      ...data.checklist,
      ...data.exercises,
      ...data.pitfalls,
    ];
  }

  function currentViewMeta() {
    return data.paths.find((item) => item.id === state.view) || data.paths[0];
  }

  function activeScenarioMeta() {
    return data.scenarios.find((item) => item.id === state.scenario) || data.scenarios[0];
  }

  function itemMatchesScenario(item) {
    return !item.scenario || item.scenario.includes(state.scenario) || state.scenario === 'general';
  }

  function itemMatchesQuery(item) {
    if (!state.query) return true;
    const haystack = [
      item.title,
      item.summary,
      ...(item.roles || []),
      ...(item.impact || []),
      ...(item.nextActions || []),
      ...(item.sourceRefs || []),
      ...(item.read || []),
      ...(item.items || []),
      ...(item.diffIds || []),
    ].join(' ').toLowerCase();
    return haystack.includes(state.query.toLowerCase());
  }

  function viewItems() {
    if (state.query) {
      return allItems().filter(itemMatchesQuery);
    }
    if (state.view === 'differences') return data.units.filter(itemMatchesScenario);
    if (state.view === 'roles') return data.roles.filter(itemMatchesScenario);
    if (state.view === 'checklist') return data.checklist.filter(itemMatchesScenario);
    if (state.view === 'exercises') return data.exercises.filter(itemMatchesScenario);
    if (state.view === 'pitfalls') return data.pitfalls.filter(itemMatchesScenario);
    return [];
  }

  function createEl(tagName, className, textContent) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    if (textContent !== undefined) el.textContent = textContent;
    return el;
  }

  function chip(text, tone) {
    const el = createEl('span', `tag${tone ? ` is-${tone}` : ''}`, text);
    return el;
  }

  function renderNav() {
    const scenarioRoot = qs('#scenario-nav');
    const pathRoot = qs('#path-nav');
    const keywordRoot = qs('#keyword-nav');

    scenarioRoot.replaceChildren(...data.scenarios.map((scenario) => {
      const btn = createEl('button', 'migration-nav-item', '');
      btn.type = 'button';
      btn.classList.toggle('is-active', scenario.id === state.scenario);
      btn.dataset.scenario = scenario.id;
      btn.appendChild(createEl('span', '', scenario.label));
      btn.appendChild(createEl('small', '', scenario.count));
      return btn;
    }));

    pathRoot.replaceChildren(...data.paths.map((path) => {
      const btn = createEl('button', 'migration-nav-item', '');
      btn.type = 'button';
      btn.classList.toggle('is-active', path.id === state.view);
      btn.dataset.view = path.id;
      btn.appendChild(createEl('span', '', path.label));
      return btn;
    }));

    keywordRoot.replaceChildren(...data.keywords.map((keyword) => {
      const btn = createEl('button', 'keyword-chip', '');
      btn.type = 'button';
      btn.dataset.keyword = keyword;
      btn.classList.toggle('is-active', state.query.toLowerCase() === keyword.toLowerCase());
      btn.appendChild(createEl('span', '', keyword));
      return btn;
    }));

    qs('#nav-count').textContent = `${allItems().length} nodes`;
  }

  function renderTabs() {
    const root = qs('#top-tabs');
    root.replaceChildren(...data.paths.map((path) => {
      const btn = createEl('button', 'tab-control-item', path.label);
      btn.type = 'button';
      btn.role = 'tab';
      btn.dataset.view = path.id;
      btn.classList.toggle('is-selected', path.id === state.view);
      btn.setAttribute('aria-selected', String(path.id === state.view));
      return btn;
    }));
  }

  function renderStatus() {
    const meta = currentViewMeta();
    const scenario = activeScenarioMeta();
    qs('#view-title').textContent = state.query ? '搜索结果' : meta.label;
    qs('#view-subtitle').textContent = state.query ? `query: ${state.query}` : scenario.label;
    qs('#status-active').textContent = `active: ${state.activeId}`;

    const status = qs('#view-status');
    status.replaceChildren(
      chip(scenario.label),
      chip(state.query ? `${viewItems().length} matches` : meta.label, 'success')
    );
  }

  function renderConclusion(root) {
    const section = createEl('section', 'summary-band');
    section.id = 'conclusion';

    const title = createEl('h1', '', '950/A5 不是 910B 的算力增强版');
    const summary = createEl('p', '', '这页把 A3/910B/910C 到 A5/Ascend 950 的迁移拆成工作台流程：先判断算子属于哪类迁移场景，再把问题映射到右侧数据通路、内存层级或执行模型，最后用 Profiling 闭环验证。');
    section.append(title, summary);

    const metrics = createEl('div', 'summary-metrics');
    [
      ['功能迁移', '确认 API/ISA/分形/容量假设能在 950 跑通。'],
      ['性能迁移', '逐项启用 NDDMA、CV 直连、RegBase、低比特、CCU。'],
      ['极致优化', '用 Pipe、PC、Reg、片上带宽、CCU profiling 关闭循环。'],
    ].forEach(([head, body]) => {
      const metric = createEl('div', 'metric');
      metric.append(createEl('strong', '', head), createEl('span', '', body));
      metrics.appendChild(metric);
    });
    section.appendChild(metrics);

    const list = createEl('ul');
    [
      '一开始先看数据路径：GM、L2、L1、L0A/B/C、UB、Reg、CCU/MS。',
      '已有 910B 经验时，不要默认旧 Tiling、UB bank、Cube 通路、Vector LocalTensor 心智仍然高效。',
      '选择 Ascend C、CATLASS、ATVOSS、PyPTO/PTO、Triton-Ascend、TileLang 前，先按角色和性能目标分层。',
      '每个差异卡都给出影响对象、推荐阅读、迁移检查和右侧架构证据。'
    ].forEach((item) => list.appendChild(createEl('li', '', item)));
    section.appendChild(list);
    root.appendChild(section);

    renderReadings(root);
  }

  function renderReadings(root) {
    const table = createEl('section', 'reading-table');
    data.readings.forEach((reading) => {
      const row = createEl('div', 'data-row');
      row.append(
        createEl('strong', '', reading.level),
        createEl('span', '', `${reading.title} · ${reading.pages}`),
        createEl('span', '', reading.audience),
        createEl('p', '', reading.goal)
      );
      table.appendChild(row);
    });
    root.appendChild(table);
  }

  function renderItemCard(item) {
    const card = createEl('button', 'unit-card', '');
    card.type = 'button';
    card.id = item.id;
    card.dataset.itemId = item.id;
    card.classList.toggle('is-active', item.id === state.activeId);

    const header = createEl('div', 'unit-card-header');
    header.appendChild(createEl('h2', '', item.title));
    const tags = createEl('div', 'tag-row');
    (item.diffIds || []).slice(0, 3).forEach((id) => tags.appendChild(chip(id)));
    header.appendChild(tags);
    card.appendChild(header);
    card.appendChild(createEl('p', '', item.summary || ''));

    if (item.sourceRefs || item.read) {
      const refs = createEl('div', 'tag-row');
      (item.sourceRefs || item.read || []).forEach((ref) => refs.appendChild(createEl('span', 'source-ref', ref)));
      card.appendChild(refs);
    }

    const details = createEl('div', 'unit-detail-grid');
    if (item.impact) {
      details.appendChild(detailBlock('影响对象', item.impact));
    }
    if (item.nextActions) {
      details.appendChild(detailBlock('下一步动作', item.nextActions));
    }
    if (item.output) {
      details.appendChild(detailBlock('输出物', item.output));
    }
    if (item.avoid) {
      details.appendChild(detailBlock('不要一开始做', item.avoid));
    }
    if (item.items) {
      details.appendChild(detailBlock('检查项', item.items));
    }
    if (details.childElementCount) card.appendChild(details);

    return card;
  }

  function detailBlock(title, lines) {
    const block = createEl('div', 'detail-block');
    block.appendChild(createEl('h3', '', title));
    const list = createEl('ul');
    lines.forEach((line) => list.appendChild(createEl('li', '', line)));
    block.appendChild(list);
    return block;
  }

  function renderCards(root, items) {
    if (!items.length) {
      const empty = createEl('section', 'empty-state');
      empty.append(
        createEl('h2', '', '没有匹配内容'),
        createEl('p', '', '换一个场景或关键词。')
      );
      root.appendChild(empty);
      return;
    }

    const grid = createEl('section', `content-grid${items.length <= 2 ? ' is-single' : ''}`);
    items.forEach((item) => grid.appendChild(renderItemCard(item)));
    root.appendChild(grid);
  }

  function renderTerms(root) {
    const table = createEl('section', 'term-table');
    data.terms.forEach((term) => {
      const row = createEl('div', 'data-row');
      row.append(
        createEl('strong', '', term.term),
        createEl('p', '', term.body),
        createEl('span', '', term.read)
      );
      table.appendChild(row);
    });
    root.appendChild(table);
  }

  function renderContent() {
    const root = qs('#content-root');
    root.replaceChildren();

    if (state.view === 'conclusion' && !state.query) {
      renderConclusion(root);
      setActiveById('conclusion', false);
    } else if (state.view === 'terms' && !state.query) {
      renderTerms(root);
    } else {
      renderCards(root, viewItems());
    }

    renderStatus();
  }

  function renderDiffOverlay() {
    const root = qs('#diff-overlay');
    const active = activeItem();
    const activeDiffs = new Set(active?.diffIds || []);
    root.replaceChildren(...data.diffs.map((diff) => {
      const card = createEl('button', 'diff-card', '');
      card.type = 'button';
      card.dataset.diffId = diff.id;
      card.hidden = !state.diffOn;
      card.style.left = diff.left;
      card.style.top = diff.top;
      card.classList.toggle('is-active', activeDiffs.has(diff.id));
      card.append(
        createEl('strong', '', diff.title),
        createEl('span', '', diff.a3),
        createEl('span', '', diff.a5),
        createEl('p', '', diff.implication)
      );
      return card;
    }));
  }

  function renderEvidence() {
    const item = activeItem();
    const diffIds = item?.diffIds || [];
    const root = qs('#active-evidence');
    const evidence = data.diffs.filter((diff) => diffIds.includes(diff.id));

    root.replaceChildren(...evidence.map((diff) => {
      const el = createEl('div', 'evidence-item');
      el.append(
        createEl('strong', '', diff.title),
        createEl('span', '', diff.implication)
      );
      return el;
    }));
    qs('#active-evidence-count').textContent = `${evidence.length} focus`;
    qs('#architecture-focus').textContent = item?.title || 'Ascend 950B';
  }

  function architectureNaturalSize() {
    const stage = qs('#architecture-stage');
    const content = stage?.querySelector('[data-pto-mem-arch="true"]') || stage;
    const width = Math.max(820, content?.scrollWidth || 0, content?.offsetWidth || 0);
    const height = Math.max(460, content?.scrollHeight || 0, content?.offsetHeight || 0);
    return { width, height };
  }

  function clampArchitectureZoom(value) {
    if (!Number.isFinite(value)) return ARCH_ZOOM.default;
    return Math.max(ARCH_ZOOM.min, Math.min(ARCH_ZOOM.max, value));
  }

  function applyArchitectureTransform() {
    const canvas = qs('#architecture-canvas');
    const readout = qs('#zoom-readout');
    if (!canvas) return;

    state.zoom = clampArchitectureZoom(state.zoom);
    const natural = architectureNaturalSize();
    canvas.style.setProperty('--architecture-zoom', String(state.zoom));
    canvas.style.setProperty('--architecture-pan-x', `${state.panX}px`);
    canvas.style.setProperty('--architecture-pan-y', `${state.panY}px`);
    canvas.style.width = `${natural.width}px`;
    canvas.style.height = `${natural.height}px`;
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    if (readout) readout.textContent = `${Math.round(state.zoom * 100)}%`;
    qs('#status-preview').textContent = `zoom ${Math.round(state.zoom * 100)}%`;

    const zoomOut = qs('#zoom-out');
    const zoomIn = qs('#zoom-in');
    if (zoomOut) zoomOut.disabled = false;
    if (zoomIn) zoomIn.disabled = false;
    memoryOverlay?.render();
  }

  function centerArchitectureView() {
    const viewport = qs('#architecture-viewport');
    if (!viewport) return;
    state.zoom = clampArchitectureZoom(state.zoom);
    const natural = architectureNaturalSize();
    state.panX = Math.round((viewport.clientWidth - natural.width * state.zoom) / 2);
    state.panY = Math.round((viewport.clientHeight - natural.height * state.zoom) / 2);
    applyArchitectureTransform();
  }

  function setArchitectureZoom(nextZoom, options = {}) {
    state.zoom = Math.round(clampArchitectureZoom(nextZoom) * 100) / 100;
    if (options.center) {
      state.architectureUserPanned = false;
      centerArchitectureView();
      return;
    }
    applyArchitectureTransform();
  }

  function zoomArchitectureAt(nextZoom, clientX, clientY) {
    const viewport = qs('#architecture-viewport');
    if (!viewport) {
      setArchitectureZoom(nextZoom);
      return;
    }
    const oldZoom = state.zoom || ARCH_ZOOM.default;
    const zoom = Math.round(clampArchitectureZoom(nextZoom) * 100) / 100;
    if (zoom === oldZoom) return;
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const ratio = zoom / oldZoom;
    state.panX = Math.round(x - (x - state.panX) * ratio);
    state.panY = Math.round(y - (y - state.panY) * ratio);
    state.zoom = zoom;
    state.architectureUserPanned = true;
    applyArchitectureTransform();
  }

  function activeItem() {
    if (state.activeId === 'conclusion') {
      return {
        id: 'conclusion',
        title: 'Ascend 950B',
        diffIds: [],
        focus: {
          selectors: [],
          routes: [],
        },
      };
    }
    return allItems().find((item) => item.id === state.activeId) || viewItems()[0] || null;
  }

  function mergedFocusFor(item) {
    if (!item) return { selectors: [], routes: [] };
    const focus = item.focus || data.defaultFocus;
    const selectors = new Set(focus.selectors || []);
    const routes = new Set(focus.routes || []);
    (item.diffIds || []).forEach((id) => {
      const diff = data.diffs.find((candidate) => candidate.id === id);
      (diff?.focus?.selectors || []).forEach((selector) => selectors.add(selector));
      (diff?.focus?.routes || []).forEach((route) => routes.add(route));
    });
    return {
      selectors: Array.from(selectors),
      routes: Array.from(routes),
    };
  }

  function applyArchitectureFocus() {
    const helper = window.PtoMemoryArchitecturePattern;
    const stage = qs('#architecture-stage');
    if (!helper || !stage || !memoryReady) return;
    const item = activeItem();
    const focus = mergedFocusFor(item);
    helper.setPathFocus(stage, 'ascend950b', focus);
  }

  function setActiveById(id, rerender = true) {
    state.activeId = id;
    if (rerender) {
      qsa('.unit-card').forEach((card) => card.classList.toggle('is-active', card.dataset.itemId === id));
    }
    renderDiffOverlay();
    renderEvidence();
    applyArchitectureFocus();
    qs('#status-active').textContent = `active: ${id}`;
  }

  function initArchitecture() {
    const helper = window.PtoMemoryArchitecturePattern;
    const stage = qs('#architecture-stage');
    if (!helper || !stage) return;
    helper.renderArchitecture(stage, 'ascend950b');
    memoryOverlay = helper.createRouteOverlay(stage, 'ascend950b');
    helper.attachHoverInteractions?.(stage, 'ascend950b');
    helper.attachPathFocusInteractions?.(stage, 'ascend950b');
    memoryOverlay?.render();
    memoryReady = true;
    centerArchitectureView();
    applyArchitectureFocus();

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (state.architectureUserPanned) {
          applyArchitectureTransform();
        } else {
          centerArchitectureView();
        }
      });
      observer.observe(stage);
    }
    window.addEventListener('resize', () => {
      if (state.architectureUserPanned) {
        applyArchitectureTransform();
      } else {
        centerArchitectureView();
      }
    });
  }

  function setView(view) {
    state.view = view;
    state.query = '';
    qs('#global-search').value = '';
    const next = viewItems()[0];
    state.activeId = view === 'conclusion' ? 'conclusion' : (next?.id || state.activeId);
    renderAll();
  }

  function setScenario(scenario) {
    state.scenario = scenario;
    state.query = '';
    qs('#global-search').value = '';
    const next = viewItems()[0];
    state.activeId = state.view === 'conclusion' ? 'conclusion' : (next?.id || state.activeId);
    renderAll();
  }

  function renderAll() {
    renderNav();
    renderTabs();
    renderContent();
    renderDiffOverlay();
    renderEvidence();
    applyArchitectureFocus();
  }

  function syncInspectorToggle() {
    const frame = qs('[data-ide-frame]');
    const button = qs('#toggle-inspector');
    if (!frame || !button) return;
    frame.dataset.inspectorCollapsed = state.inspectorOpen ? 'false' : 'true';
    button.classList.toggle('is-selected', state.inspectorOpen);
    button.setAttribute('aria-pressed', state.inspectorOpen ? 'true' : 'false');
    button.setAttribute('aria-label', state.inspectorOpen ? 'Hide inspector' : 'Show inspector');
    button.title = state.inspectorOpen ? 'Hide inspector' : 'Show inspector';
    window.requestAnimationFrame(() => {
      ideFrameInstance?.refresh?.();
      if (state.architectureUserPanned) {
        applyArchitectureTransform();
      } else {
        centerArchitectureView();
      }
    });
  }

  const THEME_ICONS = {
    light: `
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path>
      <path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path>
      <path d="m19.07 4.93-1.41 1.41"></path>
    `,
    dark: `
      <path d="M12 3a6 6 0 0 0 9 7.2A8 8 0 1 1 12 3Z"></path>
    `,
  };

  function syncThemeToggle() {
    const button = qs('#theme-toggle');
    const icon = qs('#theme-toggle-icon');
    const isLight = state.theme === 'light';
    const frame = qs('[data-ide-frame]');
    document.documentElement.dataset.theme = state.theme;
    button?.classList.toggle('is-selected', isLight);
    button?.setAttribute('aria-pressed', String(isLight));
    button?.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    if (button) button.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    if (icon) icon.innerHTML = isLight ? THEME_ICONS.dark : THEME_ICONS.light;
    if (frame && Number.parseFloat(frame.style.getPropertyValue('--ide-cursor-alpha') || '0') > 0) {
      const intensity = cursorIntensity();
      frame.style.setProperty('--ide-cursor-alpha', intensity.aura);
      frame.style.setProperty('--ide-dot-opacity', intensity.dots);
    }
  }

  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    syncThemeToggle();
    try {
      localStorage.setItem('a3-a5-migration-theme', state.theme);
    } catch (_error) {
      // Theme persistence is optional; the visible state still updates.
    }
    window.requestAnimationFrame(() => {
      memoryOverlay?.render();
      if (state.architectureUserPanned) {
        applyArchitectureTransform();
      } else {
        centerArchitectureView();
      }
    });
  }

  function initTheme() {
    let stored = '';
    try {
      stored = localStorage.getItem('a3-a5-migration-theme') || '';
    } catch (_error) {
      stored = '';
    }
    state.theme = stored === 'light' || stored === 'dark'
      ? stored
      : (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    syncThemeToggle();
  }

  function cursorIntensity() {
    return state.theme === 'light'
      ? { aura: '0.10', dots: '0.20' }
      : { aura: '0.16', dots: '0.18' };
  }

  function initCursorTracking() {
    const frame = qs('[data-ide-frame]');
    if (!frame) return;

    let raf = 0;
    let nextX = 0;
    let nextY = 0;

    const apply = () => {
      raf = 0;
      const intensity = cursorIntensity();
      frame.style.setProperty('--ide-cursor-x', `${Math.round(nextX)}px`);
      frame.style.setProperty('--ide-cursor-y', `${Math.round(nextY)}px`);
      frame.style.setProperty('--ide-cursor-alpha', intensity.aura);
      frame.style.setProperty('--ide-dot-opacity', intensity.dots);
    };

    frame.addEventListener('pointermove', (event) => {
      const rect = frame.getBoundingClientRect();
      nextX = event.clientX - rect.left;
      nextY = event.clientY - rect.top;
      if (!raf) raf = window.requestAnimationFrame(apply);
    });

    frame.addEventListener('pointerleave', () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      frame.style.setProperty('--ide-cursor-alpha', '0');
      frame.style.setProperty('--ide-dot-opacity', '0');
    });
  }

  function initArchitecturePan() {
    const viewport = qs('#architecture-viewport');
    if (!viewport) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;

    viewport.addEventListener('pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      if (event.target.closest('button, input, a, .diff-card')) return;
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startPanX = state.panX;
      startPanY = state.panY;
      state.architectureUserPanned = true;
      viewport.classList.add('is-panning');
      viewport.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      state.panX = Math.round(startPanX + event.clientX - startX);
      state.panY = Math.round(startPanY + event.clientY - startY);
      applyArchitectureTransform();
    });

    const endPan = (event) => {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-panning');
      viewport.releasePointerCapture?.(event.pointerId);
    };

    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);
    viewport.addEventListener('wheel', (event) => {
      if (event.target.closest('button, input, a, .diff-card')) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1 + ARCH_ZOOM.step : 1 - ARCH_ZOOM.step;
      zoomArchitectureAt(state.zoom * factor, event.clientX, event.clientY);
    }, { passive: false });
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const scenarioBtn = event.target.closest('[data-scenario]');
      if (scenarioBtn) {
        setScenario(scenarioBtn.dataset.scenario);
        return;
      }

      const viewBtn = event.target.closest('[data-view]');
      if (viewBtn) {
        setView(viewBtn.dataset.view);
        return;
      }

      const keyword = event.target.closest('[data-keyword]');
      if (keyword) {
        state.query = keyword.dataset.keyword;
        qs('#global-search').value = state.query;
        const next = viewItems()[0];
        state.activeId = next?.id || state.activeId;
        renderAll();
        return;
      }

      const card = event.target.closest('[data-item-id]');
      if (card) {
        setActiveById(card.dataset.itemId);
        card.scrollIntoView({ block: 'nearest' });
        return;
      }

      const diff = event.target.closest('[data-diff-id]');
      if (diff) {
        const diffData = data.diffs.find((item) => item.id === diff.dataset.diffId);
        if (diffData) {
          state.activeId = `diff:${diffData.id}`;
          const helper = window.PtoMemoryArchitecturePattern;
          helper?.setPathFocus(qs('#architecture-stage'), 'ascend950b', diffData.focus);
          qs('#architecture-focus').textContent = diffData.title;
        }
      }
    });

    qs('#global-search').addEventListener('input', (event) => {
      state.query = event.target.value.trim();
      const next = viewItems()[0];
      state.activeId = next?.id || 'conclusion';
      renderAll();
    });

    qs('#diff-toggle').addEventListener('click', () => {
      state.diffOn = !state.diffOn;
      qs('#diff-toggle').textContent = state.diffOn ? 'Diff on' : 'Diff off';
      qs('#diff-toggle').setAttribute('aria-pressed', String(state.diffOn));
      renderDiffOverlay();
    });

    qs('#rail-search')?.addEventListener('click', () => qs('#global-search')?.focus());
    qs('#rail-diff')?.addEventListener('click', () => qs('#diff-toggle').click());
    qs('#rail-profiling')?.addEventListener('click', () => setView('checklist'));
    qs('#zoom-out').addEventListener('click', () => setArchitectureZoom(state.zoom - ARCH_ZOOM.step));
    qs('#zoom-in').addEventListener('click', () => setArchitectureZoom(state.zoom + ARCH_ZOOM.step));
    qs('#zoom-reset').addEventListener('click', () => setArchitectureZoom(ARCH_ZOOM.default, { center: true }));
    qs('#theme-toggle')?.addEventListener('click', () => {
      setTheme(state.theme === 'light' ? 'dark' : 'light');
    });
    qs('#toggle-inspector')?.addEventListener('click', () => {
      state.inspectorOpen = !state.inspectorOpen;
      syncInspectorToggle();
    });
  }

  function initIdeFrame() {
    const frame = qs('[data-ide-frame]');
    if (frame?.dataset.ideFrameReady === 'true') {
      ideFrameInstance = {
        refresh() {
          window.dispatchEvent(new Event('resize'));
        },
      };
      return;
    }
    ideFrameInstance = window.PtoIdeFrame?.init?.(frame, {
      splitOptions: {
        'a3-a5-main': {
          onResize: () => {
            memoryOverlay?.render();
            if (state.architectureUserPanned) {
              applyArchitectureTransform();
            } else {
              centerArchitectureView();
            }
          },
        },
      },
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initIdeFrame();
    initArchitecture();
    initArchitecturePan();
    initCursorTracking();
    bindEvents();
    renderAll();
    syncInspectorToggle();
  });
})();
