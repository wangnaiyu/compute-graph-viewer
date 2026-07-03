import * as THREE from '../../hpc-topology-viewer-main/node_modules/three/build/three.module.min.js';
import {
  animate as animeAnimate,
  stagger,
} from '../vendor/animejs-v4.4.1/src/index.js';

(function initZAxisComparison() {
  'use strict';

  const MODEL = {
    blocks: 61,
    denseBlocks: 3,
    pp: 16,
    selectedRank: 299,
  };

  const OPTION_INFO = {
    placement: {
      title: 'Scheme A · Placement Mode',
      summary: 'XY 平面是 rank placement，Z 轴是模型 block depth。每个 rank tower 只长出自己负责的 PP block range，并且每一层 block 内嵌 operator deck。',
      fit: '最适合解释静态 mapping：哪个 rank 拥有哪些 block、哪些 operator、哪些 weight shard。',
      tradeoff: '时间过程不直接占用 Z 轴，需要用 pulse / playback 在 tower 上点亮 runtime。',
    },
    runtime: {
      title: 'Scheme B · Runtime Mode',
      summary: 'XY 平面仍是 rank placement，但 Z 轴改成 runtime sequence。一个个 operator event 从对应 rank 上穿过，通信在同一时间高度连接多个 rank。',
      fit: '最适合解释训练 step 里算子如何执行、MoE token 如何 dispatch、DP/TP/PP/EP 通信何时发生。',
      tradeoff: '静态 block ownership 需要通过标签、hover 或回切 Placement Mode 才能看清。',
    },
  };

  const els = {
    body: document.body,
    root: document.documentElement,
    selectedTitle: document.getElementById('selectedTitle'),
    selectedSummary: document.getElementById('selectedSummary'),
    tip: document.getElementById('zdoTip'),
    tipTitle: document.getElementById('zdoTipTitle'),
    tipBody: document.getElementById('zdoTipBody'),
    autoRotateBtn: document.getElementById('autoRotateBtn'),
    resetViewsBtn: document.getElementById('resetViewsBtn'),
    themeBtn: document.getElementById('themeBtn'),
  };

  const state = {
    selected: 'placement',
    autoRotate: true,
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const color = (name, fallback) => css(name) || fallback;
  const palette = () => ({
    dense: color('--zdo-dense', '#4369ef'),
    moe: color('--zdo-moe', '#ffaa3b'),
    attn: color('--zdo-attn', '#0ea5e9'),
    router: color('--zdo-router', '#f59e0b'),
    dispatch: color('--zdo-dispatch', '#7c3aed'),
    expert: color('--zdo-expert', '#04d793'),
    weight: color('--zdo-weight', '#ef4444'),
    comm: color('--zdo-comm', '#ff4b7b'),
    ink: color('--foreground', '#111111'),
    muted: color('--foreground-muted', '#777777'),
    grid: color('--border-default', '#d0d0d0'),
    surface: color('--surface-2', '#f2f2f2'),
  });

  const rankGrid = [
    { id: 296, dp: 2, pp: 5, tp: 0, x: -1.35, z: -0.78 },
    { id: 297, dp: 2, pp: 5, tp: 1, x: -0.95, z: -0.78 },
    { id: 298, dp: 2, pp: 5, tp: 2, x: -0.55, z: -0.78 },
    { id: 299, dp: 2, pp: 5, tp: 3, x: -0.15, z: -0.78 },
    { id: 304, dp: 2, pp: 6, tp: 0, x: 0.65, z: -0.78 },
    { id: 305, dp: 2, pp: 6, tp: 1, x: 1.05, z: -0.78 },
    { id: 306, dp: 2, pp: 6, tp: 2, x: 1.45, z: -0.78 },
    { id: 307, dp: 2, pp: 6, tp: 3, x: 1.85, z: -0.78 },
    { id: 424, dp: 3, pp: 5, tp: 0, x: -1.35, z: 0.48 },
    { id: 425, dp: 3, pp: 5, tp: 1, x: -0.95, z: 0.48 },
    { id: 426, dp: 3, pp: 5, tp: 2, x: -0.55, z: 0.48 },
    { id: 427, dp: 3, pp: 5, tp: 3, x: -0.15, z: 0.48 },
    { id: 432, dp: 3, pp: 6, tp: 0, x: 0.65, z: 0.48 },
    { id: 433, dp: 3, pp: 6, tp: 1, x: 1.05, z: 0.48 },
    { id: 434, dp: 3, pp: 6, tp: 2, x: 1.45, z: 0.48 },
    { id: 435, dp: 3, pp: 6, tp: 3, x: 1.85, z: 0.48 },
  ];

  const opColors = {
    Attention: 'attn',
    Router: 'router',
    Dispatch: 'dispatch',
    Expert: 'expert',
    Combine: 'dispatch',
    Weight: 'weight',
    GradSync: 'weight',
    P2P: 'dispatch',
  };

  function stageBlockRange(pp) {
    const base = Math.floor(MODEL.blocks / MODEL.pp);
    const remainder = MODEL.blocks % MODEL.pp;
    const count = base + (pp < remainder ? 1 : 0);
    let start = 0;
    for (let i = 0; i < pp; i += 1) start += base + (i < remainder ? 1 : 0);
    return { start, end: start + count - 1, count };
  }

  function blockKind(blockId) {
    return blockId < MODEL.denseBlocks ? 'Dense' : 'MoE';
  }

  class ComparisonScene {
    constructor(kind, host) {
      this.kind = kind;
      this.host = host;
      this.hoverables = [];
      this.animated = [];
      this.pulses = [];
      this.animeAnimations = [];
      this.pointer = new THREE.Vector2();
      this.raycaster = new THREE.Raycaster();
      this.dragging = false;
      this.dragStart = { x: 0, y: 0, rx: 0, ry: 0 };
      this.zoom = 1;
      this.viewportScale = 1;
      this.baseRotation = kind === 'runtime' ? { x: -0.72, y: 0.62 } : { x: -0.68, y: 0.72 };
      this.init();
    }

    init() {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      this.camera.position.set(4.8, 4.1, 7.4);
      this.camera.lookAt(0.15, 1.55, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.host.appendChild(this.renderer.domElement);

      this.root = new THREE.Group();
      this.root.rotation.set(this.baseRotation.x, this.baseRotation.y, 0);
      this.scene.add(this.root);

      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x536171, 2.35));
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(4, 7, 5);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x7aa2ff, 0.7);
      rim.position.set(-5, 4, -4);
      this.scene.add(rim);

      this.build();
      this.bind();
      this.resize();
    }

    bind() {
      this.host.addEventListener('click', () => selectOption(this.kind));
      this.renderer.domElement.addEventListener('pointerdown', (event) => {
        this.dragging = true;
        this.dragStart = { x: event.clientX, y: event.clientY, rx: this.root.rotation.x, ry: this.root.rotation.y };
        this.renderer.domElement.setPointerCapture(event.pointerId);
      });
      this.renderer.domElement.addEventListener('pointermove', (event) => {
        if (this.dragging) {
          this.root.rotation.y = this.dragStart.ry + (event.clientX - this.dragStart.x) * 0.008;
          this.root.rotation.x = Math.max(-1.28, Math.min(-0.22, this.dragStart.rx + (event.clientY - this.dragStart.y) * 0.006));
        }
        this.updateHover(event);
      });
      this.renderer.domElement.addEventListener('pointerup', (event) => {
        this.dragging = false;
        if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
      });
      this.renderer.domElement.addEventListener('pointerleave', () => {
        this.dragging = false;
        hideTip();
      });
      this.renderer.domElement.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.zoom = Math.max(0.72, Math.min(1.55, this.zoom + (event.deltaY > 0 ? -0.06 : 0.06)));
        this.applyRootScale();
      }, { passive: false });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
    }

    resize() {
      const rect = this.host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      this.viewportScale = width < 460 ? 0.66 : width < 700 ? 0.84 : 1;
      this.applyRootScale();
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }

    applyRootScale() {
      if (this.root) this.root.scale.setScalar(this.zoom * this.viewportScale);
    }

    reset() {
      this.zoom = 1;
      this.applyRootScale();
      this.root.rotation.set(this.baseRotation.x, this.baseRotation.y, 0);
    }

    stopAnime() {
      this.animeAnimations.forEach((animation) => {
        if (animation && typeof animation.revert === 'function') animation.revert();
        else if (animation && typeof animation.pause === 'function') animation.pause();
      });
      this.animeAnimations = [];
    }

    runAnime(targets, params) {
      const animation = animeAnimate(targets, params);
      this.animeAnimations.push(animation);
      return animation;
    }

    mat(hex, opacity = 1, roughness = 0.68) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(hex),
        transparent: opacity < 1,
        opacity,
        roughness,
        metalness: 0.03,
      });
    }

    addMesh(mesh, tip, animated = false) {
      if (tip) {
        mesh.userData.tip = tip;
        this.hoverables.push(mesh);
      }
      if (animated) {
        mesh.userData.basePosition = mesh.position.clone();
        mesh.userData.baseScale = mesh.scale.clone();
        mesh.userData.baseOpacity = mesh.material ? mesh.material.opacity : 1;
        this.animated.push(mesh);
      }
      this.root.add(mesh);
      return mesh;
    }

    box({ x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, color: fill, opacity = 1, tip, animated = false }) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(fill, opacity));
      mesh.position.set(x, y, z);
      return this.addMesh(mesh, tip, animated);
    }

    sphere({ x = 0, y = 0, z = 0, radius = 0.06, color: fill, opacity = 1, tip }) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), this.mat(fill, opacity, 0.46));
      mesh.position.set(x, y, z);
      this.addMesh(mesh, tip, false);
      this.pulses.push(mesh);
      return mesh;
    }

    line(points, hex, opacity = 1, width = 1) {
      const geom = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
      const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color: new THREE.Color(hex),
        transparent: opacity < 1,
        opacity,
        linewidth: width,
      }));
      this.root.add(line);
      return line;
    }

    label(text, x, y, z, options = {}) {
      const p = palette();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 384;
      canvas.height = 96;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '600 28px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = options.color || p.ink;
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
      sprite.position.set(x, y, z);
      sprite.scale.set(options.scale || 0.72, (options.scale || 0.72) * 0.25, 1);
      this.root.add(sprite);
      return sprite;
    }

    addGround(size = 4.7) {
      const p = palette();
      const grid = new THREE.GridHelper(size, 10, p.grid, p.grid);
      grid.material.transparent = true;
      grid.material.opacity = 0.24;
      this.root.add(grid);
      this.label('X · PP/TP rank placement', 0.3, -0.08, -2.3, { scale: 0.46, color: p.muted });
      this.label('Y · DP replicas', -2.0, -0.08, 0.18, { scale: 0.42, color: p.muted });
    }

    addZAxis(label) {
      const p = palette();
      const x = -2.05;
      const z = -1.56;
      const height = 3.55;
      this.line([[x, 0, z], [x, height, z]], p.ink, 0.72);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 18), this.mat(p.ink, 0.86));
      cone.position.set(x, height + 0.09, z);
      this.root.add(cone);
      this.label(label, x + 0.56, height + 0.28, z, { scale: 0.58, color: p.ink });
    }

    build() {
      this.stopAnime();
      this.root.clear();
      this.hoverables = [];
      this.animated = [];
      this.pulses = [];
      this.addGround();
      if (this.kind === 'placement') this.buildPlacement();
      if (this.kind === 'runtime') this.buildRuntime();
      this.revealObjects();
      this.startMotion();
    }

    drawRankBase(rank, compact = false) {
      const p = palette();
      const selected = rank.id === MODEL.selectedRank;
      this.box({
        x: rank.x,
        y: 0.04,
        z: rank.z,
        w: compact ? 0.28 : 0.31,
        h: 0.08,
        d: compact ? 0.28 : 0.32,
        color: selected ? p.weight : p.surface,
        opacity: selected ? 0.94 : 0.86,
        tip: {
          title: `rank_${rank.id} · DP${rank.dp} / PP${rank.pp} / TP${rank.tp}`,
          body: 'XY 平面上的 rank tile。Scheme A 在它上方长 block tower；Scheme B 让 operator event 从它上方穿过。',
        },
        animated: true,
      });
      if (selected) this.label('rank_299', rank.x + 0.08, 0.18, rank.z + 0.36, { scale: 0.28, color: p.ink });
    }

    buildPlacement() {
      const p = palette();
      this.addZAxis('Z · model blocks');
      rankGrid.forEach((rank) => this.drawRankBase(rank));

      const focusRanks = rankGrid.filter((rank) => rank.dp === 2 && (rank.pp === 5 || rank.pp === 6));
      focusRanks.forEach((rank) => {
        const range = stageBlockRange(rank.pp);
        for (let block = range.start; block <= range.end; block += 1) {
          const local = block - range.start;
          const y = 0.22 + local * 0.34;
          const isDense = block < MODEL.denseBlocks;
          this.box({
            x: rank.x,
            y,
            z: rank.z,
            w: 0.27,
            h: 0.15,
            d: 0.27,
            color: isDense ? p.dense : p.moe,
            opacity: 0.82,
            tip: {
              title: `rank_${rank.id} owns Block ${block}`,
              body: `PP${rank.pp} maps to blocks ${range.start}-${range.end}. This is static placement; runtime only lights it up.`,
            },
            animated: true,
          });

          const ops = [
            { name: 'Attention', offset: -0.105 },
            { name: 'Router', offset: -0.052 },
            { name: 'Dispatch', offset: 0 },
            { name: 'Expert', offset: 0.052 },
            { name: 'Weight', offset: 0.105 },
          ];
          ops.forEach((op) => {
            this.box({
              x: rank.x + op.offset,
              y: y + 0.105,
              z: rank.z + 0.18,
              w: 0.032,
              h: 0.04,
              d: 0.04,
              color: p[opColors[op.name]],
              opacity: 0.96,
              tip: {
                title: `Block ${block} · ${op.name}`,
                body: `Operator deck embedded inside the rank tower. Weight shard stays static; activation/gradient will be animated over this deck.`,
              },
              animated: true,
            });
          });
        }
      });

      const selected = rankGrid.find((rank) => rank.id === MODEL.selectedRank);
      this.box({
        x: selected.x,
        y: 1.78,
        z: selected.z + 0.36,
        w: 0.7,
        h: 0.055,
        d: 0.08,
        color: p.weight,
        opacity: 0.88,
        tip: {
          title: 'Weight shard plate',
          body: 'Static parameter shard attached to rank_299 / Block range B20-B23. It does not move during a runtime step.',
        },
        animated: true,
      });

      const tpRow = rankGrid.filter((rank) => rank.dp === 2 && rank.pp === 5);
      this.line(tpRow.map((rank) => [rank.x, 1.1, rank.z + 0.28]), p.attn, 0.62);
      this.line([[-0.15, 1.46, -0.55], [0.65, 1.58, -0.55]], p.dispatch, 0.76);
      this.line([[-0.15, 1.28, -0.78], [-0.15, 1.28, 0.48]], p.weight, 0.64);
      this.line([[-0.55, 1.62, -0.78], [0.65, 1.72, 0.48], [1.45, 1.62, -0.78]], p.expert, 0.72);
      this.pulsePath([[-1.35, 1.1, -0.50], [-0.55, 1.1, -0.50], [-0.15, 1.1, -0.50]], 'attn', 1900);
      this.pulsePath([[-0.15, 1.46, -0.55], [0.65, 1.58, -0.55]], 'dispatch', 2200);
      this.label('TP line', -0.78, 1.28, -0.48, { scale: 0.3, color: p.attn });
      this.label('PP send/recv', 0.34, 1.76, -0.44, { scale: 0.3, color: p.dispatch });
      this.label('EP all-to-all', 0.58, 1.96, 0.12, { scale: 0.3, color: p.expert });
      this.label('Placement: blocks live on ranks', 0, 3.34, 1.18, { scale: 0.56, color: p.ink });
    }

    buildRuntime() {
      const p = palette();
      this.addZAxis('Z · runtime time');
      rankGrid.forEach((rank) => this.drawRankBase(rank, true));

      const events = [
        { step: 0, name: 'Attention', block: 20, rank: 296, y: 0.34 },
        { step: 1, name: 'Attention', block: 20, rank: 297, y: 0.56 },
        { step: 2, name: 'Router', block: 23, rank: 299, y: 0.82 },
        { step: 3, name: 'Dispatch', block: 23, rank: 299, y: 1.08, to: [304, 305, 426] },
        { step: 4, name: 'Expert', block: 23, rank: 304, y: 1.36 },
        { step: 5, name: 'Expert', block: 23, rank: 426, y: 1.58 },
        { step: 6, name: 'Combine', block: 23, rank: 299, y: 1.86, from: [304, 426] },
        { step: 7, name: 'P2P', block: 24, rank: 304, y: 2.16, to: [305] },
        { step: 8, name: 'GradSync', block: 23, rank: 299, y: 2.48, to: [427] },
        { step: 9, name: 'Weight', block: 23, rank: 299, y: 2.78 },
      ];

      events.forEach((event) => {
        const rank = rankGrid.find((item) => item.id === event.rank);
        const c = p[opColors[event.name]] || p.moe;
        this.box({
          x: rank.x,
          y: event.y,
          z: rank.z,
          w: event.name === 'Dispatch' || event.name === 'Combine' ? 0.36 : 0.28,
          h: 0.12,
          d: event.name === 'Dispatch' || event.name === 'Combine' ? 0.36 : 0.28,
          color: c,
          opacity: 0.9,
          tip: {
            title: `t${event.step} · B${event.block}.${event.name} on rank_${rank.id}`,
            body: 'This is a runtime operator event. Z position is time/order, not model layer ownership.',
          },
          animated: true,
        });
        this.label(`${event.name}`, rank.x, event.y + 0.18, rank.z + 0.24, { scale: 0.24, color: p.ink });
      });

      const eventByName = Object.fromEntries(events.map((event) => [`${event.name}-${event.step}`, event]));
      const dispatch = eventByName['Dispatch-3'];
      const combine = eventByName['Combine-6'];
      this.drawComm(dispatch, dispatch.to, p.expert, 'MoE Dispatch All-to-All');
      this.drawComm(combine, combine.from, p.dispatch, 'MoE Combine return path');
      this.drawComm(eventByName['GradSync-8'], eventByName['GradSync-8'].to, p.weight, 'DP gradient sync');
      this.drawComm(eventByName['P2P-7'], eventByName['P2P-7'].to, p.dispatch, 'PP send / recv');

      const path = events.map((event) => {
        const rank = rankGrid.find((item) => item.id === event.rank);
        return [rank.x, event.y + 0.17, rank.z];
      });
      this.pulsePath(path, 'router', 3600);
      this.label('Runtime: operators pass through ranks', 0.15, 3.34, 1.18, { scale: 0.52, color: p.ink });
    }

    drawComm(event, targetRankIds, colorHex, label) {
      const source = rankGrid.find((rank) => rank.id === event.rank);
      targetRankIds.forEach((rankId) => {
        const target = rankGrid.find((rank) => rank.id === rankId);
        const midY = event.y + 0.34;
        this.line([[source.x, event.y, source.z], [(source.x + target.x) / 2, midY, (source.z + target.z) / 2], [target.x, event.y, target.z]], colorHex, 0.72);
        this.pulsePath([[source.x, event.y + 0.06, source.z], [(source.x + target.x) / 2, midY, (source.z + target.z) / 2], [target.x, event.y + 0.06, target.z]], colorHex === palette().weight ? 'weight' : colorHex === palette().expert ? 'expert' : 'dispatch', 2400 + Math.abs(target.x - source.x) * 300);
      });
      this.label(label, source.x + 0.32, event.y + 0.5, source.z + 0.36, { scale: 0.28, color: colorHex });
    }

    revealObjects() {
      const targets = this.animated.map((mesh, index) => ({
        mesh,
        index,
        reveal: 0,
        baseY: mesh.userData.basePosition.y,
        baseOpacity: mesh.userData.baseOpacity,
      }));
      targets.forEach((target) => {
        target.mesh.position.y = target.baseY - 0.26;
        target.mesh.scale.y = target.mesh.userData.baseScale.y * 0.2;
        if (target.mesh.material) target.mesh.material.opacity = target.baseOpacity * 0.18;
      });
      this.runAnime(targets, {
        reveal: 1,
        delay: stagger(this.kind === 'runtime' ? 38 : 12, { from: 'first' }),
        duration: 900,
        ease: 'out(4)',
        onUpdate: () => {
          targets.forEach((target) => {
            const scale = target.mesh.userData.baseScale;
            target.mesh.position.y = target.baseY - 0.26 + target.reveal * 0.26;
            target.mesh.scale.y = scale.y * (0.2 + target.reveal * 0.8);
            if (target.mesh.material) target.mesh.material.opacity = target.baseOpacity * (0.18 + target.reveal * 0.82);
          });
        },
      });
    }

    pulsePath(points, colorName, duration = 2600) {
      const p = palette();
      const pulse = this.sphere({
        x: points[0][0],
        y: points[0][1],
        z: points[0][2],
        radius: 0.07,
        color: p[colorName] || p.comm,
        opacity: 0.92,
        tip: {
          title: 'Anime.js pulse',
          body: 'Runtime signal animated over static rank/operator geometry. This can become the real playback trace later.',
        },
      });
      const driver = { t: 0 };
      this.runAnime(driver, {
        t: 1,
        duration,
        loop: true,
        ease: 'inOut(2)',
        onUpdate: () => {
          const scaled = driver.t * (points.length - 1);
          const index = Math.min(points.length - 2, Math.floor(scaled));
          const local = scaled - index;
          const a = points[index];
          const b = points[index + 1];
          pulse.position.set(
            a[0] + (b[0] - a[0]) * local,
            a[1] + (b[1] - a[1]) * local,
            a[2] + (b[2] - a[2]) * local,
          );
          const s = 0.85 + Math.sin(driver.t * Math.PI * 2) * 0.2;
          pulse.scale.setScalar(s);
          pulse.material.opacity = 0.7 + Math.sin(driver.t * Math.PI * 2) * 0.18;
        },
      });
    }

    startMotion() {
      if (this.kind === 'placement') {
        const liftTargets = this.animated.filter((mesh) => mesh.position.y > 0.5).map((mesh) => ({ mesh, lift: 0, baseY: mesh.userData.basePosition.y }));
        this.runAnime(liftTargets, {
          lift: 1,
          delay: stagger(18, { from: 'center' }),
          duration: 1700,
          loop: true,
          alternate: true,
          ease: 'inOut(2)',
          onUpdate: () => {
            liftTargets.forEach((target) => {
              target.mesh.position.y = target.baseY + target.lift * 0.035;
            });
          },
        });
      }
    }

    updateHover(event) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.hoverables, false)[0];
      if (!hit || !hit.object.userData.tip) {
        hideTip();
        return;
      }
      const tip = hit.object.userData.tip;
      showTip(tip.title, tip.body, event.clientX, event.clientY);
    }

    render() {
      if (state.autoRotate && !this.dragging) {
        this.root.rotation.y += this.kind === 'runtime' ? 0.00125 : 0.0015;
      }
      this.renderer.render(this.scene, this.camera);
    }

    sampleCanvas() {
      const canvas = this.renderer.domElement;
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const w = Math.min(80, canvas.width);
      const h = Math.min(80, canvas.height);
      ctx.canvas.width = w;
      ctx.canvas.height = h;
      ctx.drawImage(canvas, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let nonTransparent = 0;
      let colorVariance = 0;
      for (let i = 0; i < data.length; i += 16) {
        if (data[i + 3] > 10) nonTransparent += 1;
        colorVariance += Math.abs(data[i] - data[i + 4]) + Math.abs(data[i + 1] - data[i + 5]);
      }
      return { nonTransparent, colorVariance };
    }
  }

  const scenes = [
    new ComparisonScene('placement', document.getElementById('scene-placement')),
    new ComparisonScene('runtime', document.getElementById('scene-runtime')),
  ];

  function selectOption(kind) {
    state.selected = kind;
    els.body.dataset.selected = kind;
    document.querySelectorAll('.zdo-option').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.option === kind);
    });
    const info = OPTION_INFO[kind];
    els.selectedTitle.textContent = info.title;
    els.selectedSummary.innerHTML = `
      <h3>${escapeHtml(info.summary)}</h3>
      <dl>
        <div><dt>Best fit</dt><dd>${escapeHtml(info.fit)}</dd></div>
        <div><dt>Tradeoff</dt><dd>${escapeHtml(info.tradeoff)}</dd></div>
      </dl>
    `;
  }

  function showTip(title, body, x, y) {
    els.tipTitle.textContent = title;
    els.tipBody.textContent = body;
    els.tip.style.left = `${Math.min(window.innerWidth - 312, x + 12)}px`;
    els.tip.style.top = `${Math.min(window.innerHeight - 132, y + 12)}px`;
    els.tip.classList.add('is-visible');
  }

  function hideTip() {
    els.tip.classList.remove('is-visible');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function frame() {
    scenes.forEach((scene) => scene.render());
    requestAnimationFrame(frame);
  }

  els.autoRotateBtn.addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    els.autoRotateBtn.classList.toggle('is-selected', state.autoRotate);
    els.autoRotateBtn.setAttribute('aria-pressed', String(state.autoRotate));
  });

  els.resetViewsBtn.addEventListener('click', () => scenes.forEach((scene) => scene.reset()));

  els.themeBtn.addEventListener('click', () => {
    const next = els.root.dataset.theme === 'dark' ? 'light' : 'dark';
    els.root.dataset.theme = next;
    window.localStorage.setItem('z-depth-operator-theme', next);
    els.themeBtn.textContent = next === 'dark' ? 'Dark' : 'Light';
    scenes.forEach((scene) => scene.build());
  });

  selectOption('placement');
  els.body.dataset.renderStatus = 'ready';
  requestAnimationFrame(frame);

  window.ZAxisComparison = {
    scenes,
    selectOption,
    sampleCanvases() {
      return Object.fromEntries(scenes.map((scene) => [scene.kind, scene.sampleCanvas()]));
    },
  };
}());
