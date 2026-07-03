import * as THREE from '../../hpc-topology-viewer-main/node_modules/three/build/three.module.min.js';
import { RoundedBoxGeometry } from '../../hpc-topology-viewer-main/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { animate as animeAnimate } from '../vendor/animejs-v4.4.1/src/index.js';

(function initArchitecture3DLift() {
  'use strict';

  const MODES = {
    collapsed: {
      label: 'Collapsed',
      opts: { moeExpanded: false, expertExpanded: false },
      summary: '折叠态保留 2D 架构主干：输入、Embedding、Dense×3、MoE×58 折叠盒、Final Norm、LM Head。',
    },
    moe: {
      label: 'MoE Layer',
      opts: { moeExpanded: true, expertExpanded: false },
      summary: '展开一个代表 MoE 解码层：MLA、Pre-RMSNorm、Router、All-to-All、路由专家、共享专家、Combine 都沿用原图节点和边。',
    },
    ep: {
      label: 'EP Buckets',
      opts: { moeExpanded: true, expertExpanded: true },
      summary: '进一步展开 32 个 EP 桶。注意这里仍然是模型架构视图，不把 EP 桶映射到具体 rank 或卡。',
    },
  };

  const SEM_HUE = {
    'sem:embedding': 262,
    'module:decoder': 222,
    'sem:attention': 205,
    'sem:norm': 182,
    'sem:gate': 330,
    'sem:comm': 158,
    'sem:moe': 280,
    'sem:mlp': 118,
    'sem:residual': 242,
    'sem:head': 20,
    'module:moe': 288,
    'module:model': 215,
    'module:mlp': 118,
  };

  const EDGE_COLORS = {
    activation: '#4369ef',
    communication: '#10b981',
    parameter: '#f59e0b',
    gradient: '#ef4444',
    cache: '#8b5cf6',
  };

  const els = {
    body: document.body,
    root: document.documentElement,
    host: document.getElementById('arch3dCanvas'),
    tip: document.getElementById('arch3dTip'),
    tipTitle: document.getElementById('arch3dTipTitle'),
    tipBody: document.getElementById('arch3dTipBody'),
    readout: document.getElementById('readout'),
    nodeCount: document.getElementById('nodeCount'),
    edgeCount: document.getElementById('edgeCount'),
    modeLabel: document.getElementById('modeLabel'),
    modeSummary: document.getElementById('modeSummary'),
    orientationCanvas: document.getElementById('orientationCanvas'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    themeBtn: document.getElementById('themeBtn'),
  };

  const state = {
    mode: 'moe',
    graph: null,
    selected: null,
  };

  const initialParams = new URLSearchParams(window.location.search);

  const sceneState = {
    hoverables: [],
    objects: [],
    nodeMeshes: new Map(),
    edgeMeshes: new Map(),
    pointer: new THREE.Vector2(),
    raycaster: new THREE.Raycaster(),
    dragging: false,
    dragStart: { x: 0, y: 0, lastX: 0, lastY: 0 },
    zoom: 1,
    viewportScale: 1,
    view: ['front', 'iso'].includes(initialParams.get('view')) ? initialParams.get('view') : 'iso',
    baseRotation: { x: -0.78, y: 0.58 },
    orbit: { pitch: -0.78, yaw: 0.58 },
    animation: null,
    viewAnimation: null,
  };

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const readCssColor = (name, fallback) => css(name) || fallback;
  const themeInk = () => (els.root.dataset.theme === 'dark' ? '#f8fafc' : '#111827');
  const themeMuted = () => (els.root.dataset.theme === 'dark' ? '#b9c0cc' : '#475569');
  const themeGrid = () => (els.root.dataset.theme === 'dark' ? '#3d4656' : '#cbd5e1');
  function hslHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  function normalizeColor(color) {
    if (!color) return '#64748b';
    return color.trim();
  }

  function colorForNode(node) {
    if (SEM_HUE[node.colorKey] !== undefined) return hslHex(SEM_HUE[node.colorKey], 0.45, 0.46);
    if (node.kind === 'tensor') return els.root.dataset.theme === 'dark' ? '#676c75' : '#a9afb8';
    return normalizeColor(readCssColor('--arch3d-input', '#64748b'));
  }

  function colorForEdge(edge) {
    return EDGE_COLORS[edge.edgeType] || '#64748b';
  }

  function buildGraph() {
    if (!window.buildUltraMoE718BGraph) throw new Error('buildUltraMoE718BGraph is not loaded');
    return window.buildUltraMoE718BGraph(MODES[state.mode].opts);
  }

  function fitScale(graph) {
    return graph.height > 1350 ? 0.0058 : 0.0066;
  }

  function toWorld(x, y, graph = state.graph) {
    const s = fitScale(graph);
    return new THREE.Vector3((x - graph.width / 2) * s, 0, (y - graph.height / 2) * s);
  }

  function clusterCenter(cluster, graph = state.graph) {
    return toWorld(cluster.x + cluster.width / 2, cluster.y + cluster.height / 2, graph);
  }

  function nodeHeight(node) {
    return 0.34;
  }

  function nodeLayerOffset(node) {
    return 0.08;
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
        else child.material.dispose();
      }
      if (child.material && child.material.map) child.material.map.dispose();
    });
  }

  function clearRoot() {
    if (sceneState.animation && typeof sceneState.animation.revert === 'function') sceneState.animation.revert();
    else if (sceneState.animation && typeof sceneState.animation.pause === 'function') sceneState.animation.pause();
    sceneState.animation = null;
    while (sceneState.root.children.length) {
      const object = sceneState.root.children.pop();
      disposeObject(object);
    }
    sceneState.hoverables = [];
    sceneState.objects = [];
    sceneState.nodeMeshes.clear();
    sceneState.edgeMeshes.clear();
  }

  function material(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.72,
      metalness: opts.metalness ?? 0.08,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.depthWrite ?? true,
    });
  }

  function makeLabelTexture(text, options = {}) {
    const width = options.width || 640;
    const height = options.height || 160;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    const bg = options.background || (els.root.dataset.theme === 'dark' ? 'rgba(15, 23, 42, 0.84)' : 'rgba(255, 255, 255, 0.88)');
    if (options.box !== false) {
      roundRect(ctx, 8, 8, width - 16, height - 16, 18);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = els.root.dataset.theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = options.color || themeInk();
    ctx.font = options.font || '600 34px Inter, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = String(text || '').length > 28 ? `${String(text).slice(0, 27)}...` : String(text || '');
    ctx.fillText(label, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function addLabel(text, position, scaleX, scaleY, options = {}) {
    const texture = makeLabelTexture(text, options);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    sprite.position.copy(position);
    sprite.scale.set(scaleX, scaleY, 1);
    sprite.renderOrder = options.renderOrder || 20;
    sceneState.root.add(sprite);
    sceneState.objects.push(sprite);
    return sprite;
  }

  function roundedBox(width, height, depth) {
    const radius = Math.max(0.018, Math.min(0.08, width * 0.08, height * 0.34, depth * 0.32));
    return new RoundedBoxGeometry(width, height, depth, 5, radius);
  }

  function colorLuminance(hex) {
    const normalized = String(hex || '').replace('#', '').trim();
    if (normalized.length !== 6) return 0.5;
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function textColorForFill(fill) {
    return colorLuminance(fill) > 0.56 ? '#111827' : '#ffffff';
  }

  function makeFaceLabelTexture(text, fill) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = textColorForFill(fill);
    ctx.fillStyle = color;
    ctx.font = '700 44px Inter, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color === '#ffffff' ? 'rgba(0,0,0,0.34)' : 'rgba(255,255,255,0.28)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 1;
    const label = String(text || '').length > 24 ? `${String(text).slice(0, 23)}...` : String(text || '');
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function addFaceLabel(node, center, width, depth, topY, fill) {
    const texture = makeFaceLabelTexture(node.label, fill);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.88, Math.max(depth * 0.56, 0.16)),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(center.x, topY + 0.006, center.z);
    plane.renderOrder = 12;
    sceneState.root.add(plane);
    sceneState.objects.push(plane);
    return plane;
  }

  function addGrid(graph) {
    const s = fitScale(graph);
    const width = graph.width * s;
    const depth = graph.height * s;
    const group = new THREE.Group();
    const gridMaterial = new THREE.LineBasicMaterial({ color: themeGrid(), transparent: true, opacity: 0.35 });
    const step = 0.52;
    for (let x = -width / 2; x <= width / 2 + 0.01; x += step) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, -depth / 2), new THREE.Vector3(x, 0, depth / 2)]);
      group.add(new THREE.Line(geo, gridMaterial));
    }
    for (let z = -depth / 2; z <= depth / 2 + 0.01; z += step) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-width / 2, 0, z), new THREE.Vector3(width / 2, 0, z)]);
      group.add(new THREE.Line(geo, gridMaterial));
    }
    sceneState.root.add(group);
    sceneState.objects.push(group);
    addAxis(graph, width, depth);
  }

  function addAxis(graph, width, depth) {
    const origin = new THREE.Vector3(-width / 2, 0.04, -depth / 2);
    const xEnd = new THREE.Vector3(width / 2, 0.04, -depth / 2);
    const computeEnd = new THREE.Vector3(-width / 2, 0.04, depth / 2);
    const stackEnd = new THREE.Vector3(-width / 2, -1.35, -depth / 2);
    addCylinder(origin, xEnd, 0.006, '#111827', { opacity: 0.72 });
    addCylinder(origin, computeEnd, 0.006, '#111827', { opacity: 0.72 });
    addCylinder(origin, stackEnd, 0.006, '#111827', { opacity: 0.72 });
    addLabel('X · operator row', xEnd.clone().add(new THREE.Vector3(-0.28, 0.12, 0)), 0.76, 0.12, { box: false, color: themeMuted(), font: '600 26px Inter, sans-serif' });
    addLabel('Z · compute order', computeEnd.clone().add(new THREE.Vector3(0.82, 0.12, -0.18)), 0.9, 0.12, { box: false, color: themeMuted(), font: '600 26px Inter, sans-serif' });
    addLabel('Y · block stack', stackEnd.clone().add(new THREE.Vector3(0.55, -0.04, 0)), 0.86, 0.12, { box: false, color: themeMuted(), font: '600 26px Inter, sans-serif' });
  }

  function addClusters(graph) {
    (graph.clusters || []).forEach((cluster) => {
      const p = clusterCenter(cluster, graph);
      const s = fitScale(graph);
      const plate = new THREE.Mesh(
        roundedBox(cluster.width * s, 0.035, cluster.height * s),
        material(colorForNode(cluster), { transparent: true, opacity: 0.07, depthWrite: false })
      );
      plate.position.set(p.x, -0.006, p.z);
      plate.renderOrder = 0;
      plate.userData = {
        kind: 'cluster',
        title: cluster.label,
        body: `cluster id: ${cluster.id}${cluster.repeat ? ` · repeat: ${cluster.repeat}` : ''}`,
      };
      sceneState.root.add(plate);
      sceneState.hoverables.push(plate);
      addRectOutline(p, cluster.width * s, cluster.height * s, 0.018, colorForNode(cluster), 0.36);
      addLabel(cluster.label, new THREE.Vector3(p.x, 0.18, p.z - (cluster.height * s) / 2 - 0.16), Math.min(2.6, cluster.width * s * 0.34), 0.18, {
        box: false,
        color: themeMuted(),
        font: '600 30px Inter, PingFang SC, sans-serif',
      });
    });
  }

  function addBlockLayers(graph) {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const clusterById = new Map((graph.clusters || []).map((cluster) => [cluster.id, cluster]));
    const dense = byId.get('dense_block');
    const moeCluster = clusterById.get('moe_layer');
    const moeCollapsed = byId.get('moe_block');
    if (dense) {
      addBlockLayerStack({
        id: 'dense-block-stack',
        label: 'Dense blocks 0-2',
        x: dense.x,
        y: dense.y,
        width: dense.width,
        height: dense.height,
        count: 3,
        color: colorForNode(dense),
        graph,
      });
    }
    if (moeCluster) {
      addBlockLayerStack({
        id: 'moe-block-stack',
        label: 'MoE blocks 3-60',
        x: moeCluster.x + moeCluster.width / 2,
        y: moeCluster.y + moeCluster.height / 2,
        width: moeCluster.width,
        height: moeCluster.height,
        count: 58,
        color: colorForNode(moeCluster),
        graph,
      });
    } else if (moeCollapsed) {
      addBlockLayerStack({
        id: 'moe-block-stack',
        label: 'MoE blocks 3-60',
        x: moeCollapsed.x,
        y: moeCollapsed.y,
        width: moeCollapsed.width,
        height: moeCollapsed.height,
        count: 58,
        color: colorForNode(moeCollapsed),
        graph,
      });
    }
  }

  function addBlockLayerStack({ id, label, x, y, width, height, count, color, graph }) {
    const center = toWorld(x, y, graph);
    const s = fitScale(graph);
    const layerWidth = width * s;
    const layerDepth = height * s;
    const frontY = -0.04;
    const depthSpan = count > 10 ? Math.min(1.22, 0.34 + count * 0.015) : 0.24;
    const layerStep = count > 1 ? depthSpan / (count - 1) : 0;
    const rearY = frontY - depthSpan;
    const majorEvery = count > 24 ? 8 : 1;
    const userData = {
      kind: 'block-stack',
      title: label,
      body: `${count} 个重复 block 沿 3D Y 轴向后堆叠。正视图保留原始 2D 架构面；2.5D 视图展示 block 深度。这里表达模型层/块的静态架构重复，不是 rank 或卡的位置。`,
    };
    const group = new THREE.Group();
    group.userData = { kind: 'block-stack', id };

    const hoverBody = new THREE.Mesh(
      roundedBox(layerWidth, Math.max(depthSpan, 0.08), layerDepth),
      material(color, { transparent: true, opacity: 0.01, depthWrite: false })
    );
    hoverBody.position.set(center.x, (frontY + rearY) / 2, center.z);
    hoverBody.userData = userData;
    group.add(hoverBody);
    sceneState.hoverables.push(hoverBody);

    for (let index = 0; index < count; index += 1) {
      const yDepth = frontY - index * layerStep;
      const isEnd = index === 0 || index === count - 1;
      const isMajor = isEnd || index % majorEvery === 0;
      const opacity = isEnd ? 0.46 : isMajor ? 0.22 : 0.045;
      const outline = addRectOutline(center, layerWidth, layerDepth, yDepth, color, opacity, group, userData);
      outline.renderOrder = isEnd ? 2 : 1;
      if (isMajor) sceneState.hoverables.push(outline);

      if (isEnd) {
        const cap = new THREE.Mesh(
          roundedBox(layerWidth, 0.006, layerDepth),
          material(color, { transparent: true, opacity: index === 0 ? 0.035 : 0.025, depthWrite: false })
        );
        cap.position.set(center.x, yDepth, center.z);
        cap.userData = userData;
        group.add(cap);
        sceneState.hoverables.push(cap);
      }
    }

    const corners = [
      [center.x - layerWidth / 2, center.z - layerDepth / 2],
      [center.x + layerWidth / 2, center.z - layerDepth / 2],
      [center.x + layerWidth / 2, center.z + layerDepth / 2],
      [center.x - layerWidth / 2, center.z + layerDepth / 2],
    ];
    corners.forEach(([cx, cz]) => {
      addLine(
        [new THREE.Vector3(cx, frontY, cz), new THREE.Vector3(cx, rearY, cz)],
        color,
        count > 10 ? 0.32 : 0.46,
        group,
        userData
      );
    });

    sceneState.root.add(group);
    sceneState.objects.push(group);
  }

  function addLine(points, color, opacity = 0.5, parent = sceneState.root, userData = null) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    if (userData) line.userData = userData;
    parent.add(line);
    sceneState.objects.push(line);
    return line;
  }

  function addRectOutline(center, width, depth, y, color, opacity = 0.5, parent = sceneState.root, userData = null) {
    const points = [
      new THREE.Vector3(center.x - width / 2, y, center.z - depth / 2),
      new THREE.Vector3(center.x + width / 2, y, center.z - depth / 2),
      new THREE.Vector3(center.x + width / 2, y, center.z + depth / 2),
      new THREE.Vector3(center.x - width / 2, y, center.z + depth / 2),
      new THREE.Vector3(center.x - width / 2, y, center.z - depth / 2),
    ];
    return addLine(points, color, opacity, parent, userData);
  }

  function addNodes(graph) {
    const s = fitScale(graph);
    graph.nodes.forEach((node) => {
      const p = toWorld(node.x, node.y, graph);
      const w = node.width * s;
      const d = node.height * s;
      const h = nodeHeight(node);
      const base = nodeLayerOffset(node);
      const fill = colorForNode(node);
      const geo = roundedBox(w, h, d);
      const mesh = new THREE.Mesh(geo, material(fill));
      mesh.position.set(p.x, base + h / 2, p.z);
      mesh.userData = {
        kind: 'node',
        id: node.id,
        title: node.label,
        body: `${node.typeLabel || node.kind} · ${node.id}${node.desc ? `\n${node.desc}` : ''}`,
        node,
      };
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      sceneState.root.add(mesh);
      sceneState.hoverables.push(mesh);
      sceneState.nodeMeshes.set(node.id, mesh);

      addFaceLabel(node, p, w, d, base + h, fill);
    });
  }

  function nodeBoundaryPoint(source, target, graph) {
    const s = fitScale(graph);
    const sx = (target.x - source.x);
    const sy = (target.y - source.y);
    const halfW = source.width / 2;
    const halfH = source.height / 2;
    const useVertical = Math.abs(sy / Math.max(1, sx || 1)) >= source.height / Math.max(1, source.width);
    const px = source.x + (useVertical ? Math.max(-halfW * 0.72, Math.min(halfW * 0.72, sx * 0.06)) : Math.sign(sx || 1) * halfW);
    const py = source.y + (useVertical ? Math.sign(sy || 1) * halfH : Math.max(-halfH * 0.72, Math.min(halfH * 0.72, sy * 0.06)));
    return new THREE.Vector3((px - graph.width / 2) * s, 0, (py - graph.height / 2) * s);
  }

  function addEdges(graph) {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    graph.edges.forEach((edge, index) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return;
      const sourceMesh = sceneState.nodeMeshes.get(source.id);
      const targetMesh = sceneState.nodeMeshes.get(target.id);
      const start = nodeBoundaryPoint(source, target, graph);
      const end = nodeBoundaryPoint(target, source, graph);
      const y = Math.max(
        sourceMesh ? sourceMesh.position.y : 0.36,
        targetMesh ? targetMesh.position.y : 0.36
      );
      start.y = y;
      end.y = y;
      const color = colorForEdge(edge);
      const edgeObjects = edge.dashed
        ? addDashedCylinder(start, end, 0.012, color, edge)
        : [addCylinder(start, end, edge.edgeType === 'communication' ? 0.018 : 0.012, color, { edge, opacity: 0.9 })];
      addArrow(end, start, color, edge);
      const mid = start.clone().lerp(end, 0.5);
      if (edge.tag && edge.tag.trim()) {
        addLabel(edge.tag.trim(), mid.add(new THREE.Vector3(0, 0.13 + (index % 3) * 0.03, 0)), 0.5, 0.16, {
          box: false,
          color: color,
          font: '700 30px Inter, sans-serif',
        });
      }
      edgeObjects.forEach((object) => {
        object.userData = {
          kind: 'edge',
          title: `${edge.source} -> ${edge.target}`,
          body: `${edge.edgeType || 'edge'}${edge.tag && edge.tag.trim() ? ` · tag: ${edge.tag.trim()}` : ''}`,
          edge,
        };
        sceneState.hoverables.push(object);
        if (!sceneState.edgeMeshes.has(edge.source + '->' + edge.target)) sceneState.edgeMeshes.set(edge.source + '->' + edge.target, []);
        sceneState.edgeMeshes.get(edge.source + '->' + edge.target).push(object);
      });
    });
  }

  function addCylinder(start, end, radius, color, opts = {}) {
    const delta = end.clone().sub(start);
    const length = delta.length();
    const geo = new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.001), 10, 1);
    const mesh = new THREE.Mesh(geo, material(color, { transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1 }));
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    if (opts.edge) mesh.userData.edge = opts.edge;
    sceneState.root.add(mesh);
    sceneState.objects.push(mesh);
    return mesh;
  }

  function addDashedCylinder(start, end, radius, color, edge) {
    const delta = end.clone().sub(start);
    const length = delta.length();
    const dir = delta.clone().normalize();
    const dash = 0.16;
    const gap = 0.12;
    const objects = [];
    for (let cursor = 0; cursor < length; cursor += dash + gap) {
      const a = start.clone().add(dir.clone().multiplyScalar(cursor));
      const b = start.clone().add(dir.clone().multiplyScalar(Math.min(length, cursor + dash)));
      const part = addCylinder(a, b, radius, color, { edge, opacity: 0.78 });
      objects.push(part);
    }
    return objects;
  }

  function addArrow(target, previous, color, edge) {
    const dir = target.clone().sub(previous).normalize();
    const geo = new THREE.ConeGeometry(0.05, 0.13, 12);
    const cone = new THREE.Mesh(geo, material(color, { transparent: true, opacity: 0.94 }));
    cone.position.copy(target).add(dir.clone().multiplyScalar(-0.045));
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.userData = {
      kind: 'edge',
      title: `${edge.source} -> ${edge.target}`,
      body: `${edge.edgeType || 'edge'}${edge.tag && edge.tag.trim() ? ` · tag: ${edge.tag.trim()}` : ''}`,
      edge,
    };
    sceneState.root.add(cone);
    sceneState.hoverables.push(cone);
    sceneState.objects.push(cone);
  }

  function rebuild() {
    state.graph = buildGraph();
    clearRoot();
    addGrid(state.graph);
    addBlockLayers(state.graph);
    addClusters(state.graph);
    addNodes(state.graph);
    addEdges(state.graph);
    updateHud();
    applyView(sceneState.view === 'free' ? 'iso' : sceneState.view, false);
    sceneState.root.position.y = -0.25;
    applyScale();
    sceneState.animation = animeAnimate(sceneState.root.position, {
      y: 0,
      duration: 520,
      ease: 'outCubic',
    });
    els.body.dataset.renderStatus = 'ready';
  }

  function updateHud() {
    const mode = MODES[state.mode];
    els.nodeCount.textContent = `${state.graph.nodes.length} nodes`;
    els.edgeCount.textContent = `${state.graph.edges.length} edges`;
    els.modeLabel.textContent = mode.label;
    els.modeSummary.textContent = mode.summary;
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.mode === state.mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    });
  }

  function quaternionFromEuler(x, y, z = 0) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyOrbit() {
    sceneState.root.quaternion.copy(quaternionFromEuler(sceneState.orbit.pitch, sceneState.orbit.yaw, 0));
  }

  function viewPreset(view) {
    if (view === 'front') {
      return {
        orbit: { pitch: 0, yaw: 0 },
        rootQuaternion: new THREE.Quaternion(),
        cameraPosition: new THREE.Vector3(0, 15.4, 0.01),
        cameraUp: new THREE.Vector3(0, 0, -1),
      };
    }
    return {
      orbit: { pitch: 0, yaw: 0 },
      rootQuaternion: new THREE.Quaternion(),
      cameraPosition: new THREE.Vector3(4.2, 12.4, 4.9),
      cameraUp: new THREE.Vector3(0, 0, -1),
    };
  }

  function syncViewButtons() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      const selected = button.dataset.view === sceneState.view;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function stopViewAnimation() {
    if (sceneState.viewAnimation && typeof sceneState.viewAnimation.revert === 'function') sceneState.viewAnimation.revert();
    else if (sceneState.viewAnimation && typeof sceneState.viewAnimation.pause === 'function') sceneState.viewAnimation.pause();
    sceneState.viewAnimation = null;
  }

  function applyView(view, animated = true) {
    sceneState.view = view;
    syncViewButtons();
    const target = viewPreset(view);
    stopViewAnimation();
    sceneState.orbit = { ...target.orbit };
    if (!animated) {
      sceneState.root.quaternion.copy(target.rootQuaternion);
      sceneState.camera.position.copy(target.cameraPosition);
      sceneState.camera.up.copy(target.cameraUp);
      sceneState.camera.lookAt(0, 0, 0);
      return;
    }
    const start = sceneState.root.quaternion.clone();
    const startCamera = sceneState.camera.position.clone();
    const tween = { t: 0 };
    sceneState.camera.up.copy(target.cameraUp);
    sceneState.viewAnimation = animeAnimate(tween, {
      t: 1,
      duration: 420,
      ease: 'outCubic',
      update: () => {
        sceneState.root.quaternion.slerpQuaternions(start, target.rootQuaternion, tween.t);
        sceneState.camera.position.lerpVectors(startCamera, target.cameraPosition, tween.t);
        sceneState.camera.lookAt(0, 0, 0);
      },
    });
  }

  function setFreeView() {
    sceneState.view = 'free';
    syncViewButtons();
    stopViewAnimation();
  }

  function drawOrientationWidget() {
    const canvas = els.orientationCanvas;
    if (!canvas || !sceneState.camera || !sceneState.root) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(72, Math.floor(canvas.clientWidth || 128));
    if (canvas.width !== Math.floor(size * dpr) || canvas.height !== Math.floor(size * dpr)) {
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const center = size / 2;
    const radius = size * 0.34;
    const cameraInverse = sceneState.camera.quaternion.clone().invert();
    const axes = [
      { label: 'X', color: '#ef4444', axis: new THREE.Vector3(1, 0, 0) },
      { label: 'Y', color: '#22c55e', axis: new THREE.Vector3(0, 1, 0) },
      { label: 'Z', color: '#3b82f6', axis: new THREE.Vector3(0, 0, 1) },
    ].map((item) => {
      const v = item.axis.clone().applyQuaternion(sceneState.root.quaternion).applyQuaternion(cameraInverse).normalize();
      return {
        ...item,
        x: center + v.x * radius,
        y: center - v.y * radius,
        depth: v.z,
      };
    }).sort((a, b) => b.depth - a.depth);

    ctx.strokeStyle = themeGrid();
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    axes.forEach((axis) => {
      const behind = axis.depth < 0;
      ctx.globalAlpha = behind ? 0.38 : 0.95;
      ctx.strokeStyle = axis.color;
      ctx.fillStyle = axis.color;
      ctx.lineWidth = behind ? 1.2 : 2.2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(axis.x, axis.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(axis.x, axis.y, behind ? 4 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = themeInk();
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(axis.label, axis.x + (axis.x >= center ? 12 : -12), axis.y + (axis.y >= center ? 10 : -10));
    });

    ctx.fillStyle = themeMuted();
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sceneState.view === 'front' ? 'FRONT' : sceneState.view === 'iso' ? '2.5D' : 'FREE', center, size - 10);
  }

  function updateReadout(item) {
    if (!item) {
      els.readout.innerHTML = '<div class="panel-shell-meta">hover</div><strong>Hover a node or edge</strong><span>查看原始 node id、edge source/target、tag/type 和架构说明。</span>';
      return;
    }
    const meta = item.kind === 'node' ? `node · ${item.id}` : item.kind;
    const body = String(item.body || '').replace(/\n/g, '<br>');
    els.readout.innerHTML = `<div class="panel-shell-meta">${meta}</div><strong>${item.title || ''}</strong><span>${body}</span>`;
  }

  function highlightObject(object) {
    sceneState.hoverables.forEach((item) => {
      if (item.material && item.material.emissive) item.material.emissive.setHex(0x000000);
      if (item.material && item.userData._originalScale) item.scale.copy(item.userData._originalScale);
    });
    if (!object || !object.material) return;
    if (object.material.emissive) object.material.emissive.setHex(0x223344);
    if (!object.userData._originalScale) object.userData._originalScale = object.scale.clone();
    object.scale.copy(object.userData._originalScale).multiplyScalar(1.035);
  }

  function updateHover(event) {
    const rect = els.host.getBoundingClientRect();
    sceneState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    sceneState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
    const hits = sceneState.raycaster.intersectObjects(sceneState.hoverables, false);
    const hit = hits[0] && hits[0].object;
    if (!hit) {
      hideTip();
      highlightObject(null);
      updateReadout(null);
      return;
    }
    const data = hit.userData || {};
    highlightObject(hit);
    showTip(event, data.title, data.body);
    updateReadout(data);
  }

  function showTip(event, title, body) {
    els.tipTitle.textContent = title || '';
    els.tipBody.textContent = String(body || '').replace(/\n/g, ' ');
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    els.tip.classList.add('is-visible');
    const rect = els.tip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    els.tip.style.left = `${x}px`;
    els.tip.style.top = `${y}px`;
  }

  function hideTip() {
    els.tip.classList.remove('is-visible');
  }

  function bindEvents() {
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
        rebuild();
      });
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        applyView(button.dataset.view, true);
      });
    });
    els.resetViewBtn.addEventListener('click', resetView);
    els.themeBtn.addEventListener('click', () => {
      const next = els.root.dataset.theme === 'dark' ? 'light' : 'dark';
      els.root.dataset.theme = next;
      window.localStorage && window.localStorage.setItem('arch-3d-lift-theme', next);
      els.themeBtn.textContent = next === 'dark' ? 'Dark' : 'Light';
      rebuild();
    });
    els.host.addEventListener('pointerdown', (event) => {
      sceneState.dragging = true;
      setFreeView();
      sceneState.dragStart = {
        x: event.clientX,
        y: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      els.host.setPointerCapture(event.pointerId);
    });
    els.host.addEventListener('pointermove', (event) => {
      if (sceneState.dragging) {
        const dx = event.clientX - sceneState.dragStart.lastX;
        const dy = event.clientY - sceneState.dragStart.lastY;
        sceneState.dragStart.lastX = event.clientX;
        sceneState.dragStart.lastY = event.clientY;
        const sensitivity = event.shiftKey ? 0.0019 : 0.0046;
        sceneState.orbit.yaw += dx * sensitivity;
        sceneState.orbit.pitch = clamp(sceneState.orbit.pitch + dy * sensitivity, -1.16, 1.16);
        applyOrbit();
      }
      updateHover(event);
    });
    els.host.addEventListener('pointerup', (event) => {
      sceneState.dragging = false;
      if (els.host.hasPointerCapture(event.pointerId)) els.host.releasePointerCapture(event.pointerId);
    });
    els.host.addEventListener('pointerleave', () => {
      sceneState.dragging = false;
      hideTip();
      highlightObject(null);
    });
    els.host.addEventListener('wheel', (event) => {
      event.preventDefault();
      sceneState.zoom = Math.max(0.58, Math.min(1.7, sceneState.zoom + (event.deltaY > 0 ? -0.055 : 0.055)));
      applyScale();
    }, { passive: false });
    window.addEventListener('resize', resize);
  }

  function applyScale() {
    sceneState.root.scale.setScalar(1.06 * sceneState.viewportScale * sceneState.zoom);
  }

  function resetView() {
    sceneState.zoom = 1;
    applyScale();
    applyView('iso', true);
  }

  function resize() {
    const rect = els.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    sceneState.viewportScale = width < 560 ? 0.54 : width < 900 ? 0.76 : 1;
    sceneState.root.position.x = width < 560 ? -0.58 : width < 900 ? -0.22 : 0;
    applyScale();
    sceneState.camera.aspect = width / height;
    sceneState.camera.updateProjectionMatrix();
    sceneState.renderer.setSize(width, height, false);
  }

  function animateFrame() {
    drawOrientationWidget();
    sceneState.renderer.render(sceneState.scene, sceneState.camera);
    requestAnimationFrame(animateFrame);
  }

  function initScene() {
    sceneState.scene = new THREE.Scene();
    sceneState.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    sceneState.camera.position.set(4.8, 6.8, 9.4);
    sceneState.camera.lookAt(0, 0, 0);
    sceneState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sceneState.renderer.outputColorSpace = THREE.SRGBColorSpace;
    els.host.appendChild(sceneState.renderer.domElement);
    sceneState.root = new THREE.Group();
    sceneState.scene.add(sceneState.root);
    sceneState.scene.add(new THREE.HemisphereLight(0xffffff, 0x536171, 2.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(4, 8, 6);
    sceneState.scene.add(key);
    const rim = new THREE.DirectionalLight(0x80a7ff, 0.8);
    rim.position.set(-4, 4, -5);
    sceneState.scene.add(rim);
    resize();
    rebuild();
    animateFrame();
  }

  function sampleCanvas() {
    const canvas = sceneState.renderer && sceneState.renderer.domElement;
    if (!canvas) return null;
    const temp = document.createElement('canvas');
    temp.width = canvas.width;
    temp.height = canvas.height;
    const ctx = temp.getContext('2d');
    if (!ctx) return { width: canvas.width, height: canvas.height, readable: false };
    ctx.drawImage(canvas, 0, 0);
    const sampleWidth = Math.min(240, canvas.width);
    const sampleHeight = Math.min(160, canvas.height);
    const image = ctx.getImageData(Math.floor((canvas.width - sampleWidth) / 2), Math.floor((canvas.height - sampleHeight) / 2), sampleWidth, sampleHeight);
    let nonTransparent = 0;
    let colored = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3] > 0) nonTransparent += 1;
      if (image.data[i + 3] > 0 && (image.data[i] !== image.data[i + 1] || image.data[i + 1] !== image.data[i + 2])) colored += 1;
    }
    return { width: canvas.width, height: canvas.height, nonTransparent, colored };
  }

  els.themeBtn.textContent = els.root.dataset.theme === 'dark' ? 'Dark' : 'Light';
  bindEvents();
  initScene();

  window.ModelArchitecture3DLift = {
    setMode(mode) {
      if (!MODES[mode]) return;
      state.mode = mode;
      rebuild();
    },
    setView(view) {
      if (!['front', 'iso'].includes(view)) return;
      applyView(view, false);
    },
    sampleCanvas,
    getGraphStats() {
      return state.graph ? {
        mode: state.mode,
        view: sceneState.view,
        nodes: state.graph.nodes.length,
        edges: state.graph.edges.length,
        clusters: (state.graph.clusters || []).length,
      } : null;
    },
  };
})();
