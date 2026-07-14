#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.dirname(here);
const workbenchPath = path.join(moduleRoot, 'ascendport_migration_V3_MLA_pto.html');
const legacyPath = path.join(moduleRoot, 'ascendport_migration_V3_MLA_pto_legacy.js');
const modelvizPath = path.join(here, 'assets', 'modelviz.html');
const schemaPath = path.join(here, 'outputs', 'model_architecture.json');
const mappingPath = path.join(here, 'outputs', 'operator_mapping.json');

const workbench = fs.readFileSync(workbenchPath, 'utf8');
const legacy = fs.readFileSync(legacyPath, 'utf8');
const modelviz = fs.readFileSync(modelvizPath, 'utf8');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkInlineScriptSyntax(name, html) {
  const scripts = [...html.matchAll(/<script(?![^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  scripts.forEach((source, index) => {
    try {
      new Function(source);
    } catch (error) {
      throw new Error(`${name} inline script ${index + 1}: ${error.message}`);
    }
  });
}

assert(schema.nodes.length === 29, `expected 29 nodes, got ${schema.nodes.length}`);
assert(schema.edges.length === 42, `expected 42 edges, got ${schema.edges.length}`);
assert(mappings.mappings.length === 18, `expected 18 mappings, got ${mappings.mappings.length}`);
assert(workbench.includes("modelvizUiVersion = 'accuracy-fit-v8'"), 'workbench modelviz UI version is missing');
assert(workbench.includes('?embed=workbench&ui=${modelvizUiVersion}'), 'workbench modelviz source is not versioned');
assert(workbench.includes('?embed=accuracy&view=accuracy&ui=${modelvizUiVersion}'), 'S6 accuracy modelviz source is not versioned');
assert(workbench.includes("modelvizFrame.className = 'mla-modelviz-frame'"), 'workbench iframe mount is missing');
assert(workbench.includes("accuracyModelvizFrame.className = 'accuracy-modelviz-frame'"), 'S6 accuracy iframe mount is missing');
assert(workbench.includes('id="accuracyModelvizHost"'), 'S6 accuracy architecture host is missing');
assert(workbench.includes('id="accuracyReportContent"'), 'S6 accuracy report content host is missing');
assert(!workbench.includes('class="accuracy-modelviz__head"'), 'redundant S6 graph title and legend header is still mounted');
assert(workbench.includes('grid-template-rows: minmax(0, 1fr);'), 'S6 graph does not reclaim the removed header height');
assert(workbench.includes('<div class="analysis-tabbar" aria-label="分析视图">'), 'fixed analysis tab bar is missing');
const fixedGraphTab = workbench.indexOf('data-analysis="graph">计算图');
const scrollableTabs = workbench.indexOf('<div class="tabs analysis-tabs">');
assert(fixedGraphTab >= 0 && scrollableTabs > fixedGraphTab,
  'the original graph tab is not pinned before the horizontally scrollable tabs');
assert(workbench.includes('.analysispane[data-analysis-view="accuracy"] .accpane {'), 'S6 accuracy split layout is missing');
assert(workbench.includes('grid-template-columns: minmax(460px, 1.16fr) minmax(360px, .84fr);'),
  'S6 accuracy graph and report are not arranged as persistent side-by-side panes');
assert(workbench.includes('.accuracy-report-content { min-width: 0; min-height: 0; overflow: auto;'),
  'S6 accuracy report does not own its scroll context');
assert(workbench.includes('.accuracy-report-content .acc-kpi .kv { font-size: 15px;'),
  'S6 KPI cards are not using the compact report density');
assert(workbench.includes('.acc-table th, .acc-table td { padding: 5px var(--space-2);'),
  'S6 operator table rows are not compact');
assert(workbench.includes("event.data?.type === 'pto-mla-modelviz-ready'"), 'workbench ready bridge is missing');
assert(workbench.includes('event.data.uiVersion !== modelvizUiVersion'), 'workbench ready version handshake is missing');
assert(workbench.includes("refreshUrl.searchParams.set('reload', String(Date.now()))"), 'workbench stale-child reload is missing');
assert(workbench.includes("type: 'pto-mla-modelviz-focus-node'"), 'workbench focus bridge is missing');
assert(!workbench.includes('id="gdetail"'), 'legacy bottom graph detail is still mounted');
assert(workbench.includes('id="modelvizOperatorContext"'), 'top-level operator context menu is missing');
assert(workbench.includes('.workbench-operator-context {'), 'operator context menu style is missing');
assert(workbench.includes('position: fixed;'), 'operator context menu is not viewport-fixed');
assert(workbench.includes('background: var(--surface-1);'), 'operator context menu does not use a solid elevated gray surface');
assert(workbench.includes('pointer-events: none;'), 'operator context menu blocks graph node selection beneath it');
assert(workbench.includes('backdrop-filter: none;'), 'operator context menu still uses backdrop blur');
assert(workbench.includes("event.data?.type === 'pto-mla-modelviz-anchor'"), 'workbench anchor bridge is missing');
assert(workbench.includes("event.data?.type === 'pto-mla-modelviz-dismiss'"), 'workbench dismiss bridge is missing');
assert(workbench.includes("getElementById('accpane')?.addEventListener('scroll'"), 'accuracy pane scrolling does not reposition the node context menu');
assert(workbench.includes("type: 'pto-mla-modelviz-set-accuracy'"), 'workbench accuracy overlay bridge is missing');
assert(workbench.includes('window.mountAccuracyModelviz = function mountAccuracyModelviz()'), 'S6 accuracy graph mount API is missing');
assert(legacy.includes("nodeIds:['q_stage','kv_stage']"), 'DataCopy accuracy row is not mapped to graph nodes');
assert(legacy.includes("nodeIds:['qk_gemm','pe_gemm']"), 'score GEMM accuracy row is not mapped to graph nodes');
assert(legacy.includes("nodeIds:['score_exponential']"), 'Softmax anomaly is not mapped to score_exponential');
assert(legacy.includes('function getAccuracyModelvizOverlay()'), 'S6 accuracy overlay payload builder is missing');
assert(legacy.includes("document.getElementById('accuracyReportContent')"), 'S6 report still replaces the graph host');
assert(workbench.includes('ascendport_migration_V3_MLA_pto_legacy.js?v=workflow-gate-v9'),
  'workflow-gated legacy script is not cache-versioned');
assert(!legacy.includes('bootAnalysisParams'), 'URL parameters still bypass the staged analysis-tab unlock workflow');
assert(legacy.includes("const unlockedAnalysisViews=new Set(['graph'])"),
  'the workbench no longer starts with only the source graph unlocked');
const openAccuracyStart = legacy.indexOf('function openAccPanel(){');
const openAccuracyEnd = legacy.indexOf('/* ============================ S7', openAccuracyStart);
assert(openAccuracyStart >= 0 && openAccuracyEnd > openAccuracyStart, 'S6 accuracy opener is missing');
const openAccuracySource = legacy.slice(openAccuracyStart, openAccuracyEnd);
assert(openAccuracySource.includes("unlockAnalysisView('graph')"),
  'S6 does not restore the original graph tab after earlier workflow stages hide it');
assert(openAccuracySource.includes("unlockAnalysisView('accuracy')"), 'S6 accuracy tab is not unlocked');
assert(openAccuracySource.includes("document.getElementById('accuracyReportContent')"),
  'S6 does not reset the report-only scroll context');
const accuracyUnlockOccurrences = legacy.match(/unlockAnalysisView\('accuracy'\)/g) || [];
assert(accuracyUnlockOccurrences.length === 1,
  `accuracy must unlock only through S6 execution; found ${accuracyUnlockOccurrences.length} unlock paths`);
assert(legacy.includes("if(s.n==='S6'){ accFixed=false; setAccProblem(); openAccPanel(); }"),
  'S6 completion no longer owns the accuracy-tab unlock');
assert(modelviz.includes("html[data-embed] .mla-viz__title"), 'modelviz embed presentation is missing');
assert(modelviz.includes("type: 'pto-mla-modelviz-ready'"), 'modelviz ready message is missing');
assert(modelviz.includes("MODEL_VIZ_UI_VERSION = 'accuracy-fit-v8'"), 'modelviz UI version is missing');
assert(modelviz.includes('uiVersion: MODEL_VIZ_UI_VERSION'), 'modelviz ready version is missing');
assert(modelviz.includes("type: 'pto-mla-modelviz-selection'"), 'modelviz selection message is missing');
assert(modelviz.includes("type: 'pto-mla-modelviz-anchor'"), 'modelviz anchor message is missing');
assert(modelviz.includes("event.data?.type === 'pto-mla-modelviz-set-accuracy'"), 'modelviz accuracy overlay listener is missing');
assert(modelviz.includes('function aggregateAccuracyOverlay(nodeIds)'), 'folded accuracy aggregation is missing');
assert(modelviz.includes('function decorateAccuracyGraph()'), 'accuracy badge decoration is missing');
assert(modelviz.includes('function fitAccuracyGraphOnce()'), 'accuracy view one-time stable Fit is missing');
assert(modelviz.includes("group.classList.remove('is-accuracy-pass', 'is-accuracy-fail', 'is-accuracy-fixed')"),
  'accuracy decoration cannot update in place without leaving stale node states');
assert(modelviz.includes('is-accuracy-fail > rect:first-of-type'), 'accuracy failure border style is missing');
assert(modelviz.includes('accuracy-node-badge'), 'accuracy node badge style is missing');
assert(modelviz.includes('anchor: hostNodeAnchor(state.activeNodeId)'), 'modelviz selection does not carry the node viewport rect');
assert(modelviz.includes("event.data?.type !== 'pto-mla-modelviz-focus-node'"), 'modelviz focus listener is missing');
assert(modelviz.includes('id="operatorDetailPopover"'), 'operator hover panel is missing');
assert(modelviz.includes('function positionOperatorPopover'), 'operator hover anchoring is missing');
assert(modelviz.includes('function popoverPosition'), 'operator hover placement helper is missing');
assert(modelviz.includes('state.visibleGraph?.nodes?.find((item) => item.id === nodeId)'), 'collapsed module representatives are not selectable');
assert(modelviz.includes('popover.dataset.horizontal = position.horizontal'), 'operator hover horizontal fallback is missing');
assert(modelviz.includes('popover.dataset.vertical = position.vertical'), 'operator hover vertical fallback is missing');
const selectionStart = modelviz.indexOf('function handleNodeSelection(nodeId)');
const selectionEnd = modelviz.indexOf('async function loadArchitecture()', selectionStart);
assert(selectionStart >= 0 && selectionEnd > selectionStart, 'node selection handler is missing');
const selectionHandler = modelviz.slice(selectionStart, selectionEnd);
assert(selectionHandler.includes('renderOperatorPopover()'), 'node selection does not open the operator hover panel');
assert(modelviz.includes("onSelect: ({ nodeId }) => handleNodeSelection(nodeId)"), 'renderer selection is not wired to the node handler');
const accuracyMessageStart = modelviz.indexOf("if (event.data?.type === 'pto-mla-modelviz-set-accuracy')");
const accuracyMessageEnd = modelviz.indexOf("if (event.data?.type !== 'pto-mla-modelviz-focus-node')", accuracyMessageStart);
assert(accuracyMessageStart >= 0 && accuracyMessageEnd > accuracyMessageStart, 'accuracy message handler is missing');
const accuracyMessageHandler = modelviz.slice(accuracyMessageStart, accuracyMessageEnd);
assert(!accuracyMessageHandler.includes('renderGraph('),
  'accuracy styling still recreates the graph controller and changes the running interaction');
assert(accuracyMessageHandler.includes('state.visibleGraph = applyAccuracyOverlay(state.visibleGraph)'),
  'accuracy styling is not applied to the existing projected graph');
assert(accuracyMessageHandler.includes('decorateAccuracyGraph()'), 'accuracy styling does not update the existing SVG in place');
assert(accuracyMessageHandler.includes('fitAccuracyGraphOnce()'), 'accuracy graph does not Fit once after its final pane size is available');

const renderStart = workbench.indexOf('window.renderGraph = renderGraph = function renderGraphPto()');
const renderEnd = workbench.indexOf('window.selectNode = selectNode = function selectNodePto', renderStart);
assert(renderStart >= 0 && renderEnd > renderStart, 'active renderGraph integration was not found');
const activeRenderer = workbench.slice(renderStart, renderEnd);
assert(!activeRenderer.includes('buildPatternGraph()'), 'active renderGraph still calls the legacy graph builder');
assert(!activeRenderer.includes('modelGraph.renderController'), 'active renderGraph still creates the legacy renderer');

const positionStartMarker = '// MODEL_VIZ_CONTEXT_POSITION_START';
const positionEndMarker = '// MODEL_VIZ_CONTEXT_POSITION_END';
const positionStart = workbench.indexOf(positionStartMarker);
const positionEnd = workbench.indexOf(positionEndMarker, positionStart);
assert(positionStart >= 0 && positionEnd > positionStart, 'workbench context placement helper is missing');
const positionSource = workbench.slice(positionStart + positionStartMarker.length, positionEnd);
const modelvizContextPosition = new Function(`${positionSource}\nreturn modelvizContextPosition;`)();
const lowerRight = modelvizContextPosition(
  { width: 1440, height: 900 },
  { left: 200, top: 100 },
  { left: 300, top: 200, right: 500, bottom: 260 },
  { width: 340, height: 240 },
  8,
  12,
);
assert(lowerRight.left === 708 && lowerRight.top === 368
  && lowerRight.horizontal === 'right' && lowerRight.vertical === 'bottom',
'workbench context menu is not anchored to the operator lower-right corner');
const viewportFallback = modelvizContextPosition(
  { width: 1440, height: 900 },
  { left: 200, top: 100 },
  { left: 1100, top: 700, right: 1200, bottom: 760 },
  { width: 340, height: 240 },
  8,
  12,
);
assert(viewportFallback.left === 952 && viewportFallback.top === 552
  && viewportFallback.horizontal === 'left' && viewportFallback.vertical === 'top',
'workbench context menu does not flip at the browser viewport edges');

checkInlineScriptSyntax('workbench', workbench);
checkInlineScriptSyntax('modelviz', modelviz);
try {
  new Function(legacy);
} catch (error) {
  throw new Error(`legacy workbench script: ${error.message}`);
}

console.log(`workbench integration validated: ${schema.nodes.length} nodes, ${schema.edges.length} edges, ${mappings.mappings.length} mappings`);
