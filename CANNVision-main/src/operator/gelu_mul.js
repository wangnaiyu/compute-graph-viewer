import {
  memStates,
  stateProgress,
  stateLoadData,
  stateHasFinished,
  stateHasUnFinished,
} from './memstates';

const gmABCSize = 16 * 8;
const gmABCBlock = 8 * 8;
const l2AvSize = 7 * 3;
const l2AvBlockSize = l2AvSize / 3;
const ubSize = 16 * 2;
const ubBlockSize = ubSize;

const GELU_MUL_PHASES = [
  { id: '0-gelu', kind: 'gelu', reads: ['A'], writes: ['C'] },
  { id: '1-gelu', kind: 'gelu', reads: ['C'], writes: ['C'], usesScalar: true },
  { id: '2-gelu', kind: 'gelu', reads: ['A', 'C'], writes: ['A'] },
  { id: '3-mul', kind: 'mul', reads: ['A', 'B'], writes: ['A'] },
  { id: '4-writeback', kind: 'writeback', reads: ['A'], writes: ['L2_C'] },
];

const GELU_MUL_SLOT_IDS = [0, 1];
const GELU_MUL_WRITEBACK_PHASE_INDEX = GELU_MUL_PHASES.length - 1;

const GELU_MUL_SLOTS = {
  0: {
    tags: { A: 'ub_A0', B: 'B0', C: 'ub_C0' },
    size: ubSize,
    block: ubBlockSize,
  },
  1: {
    tags: { A: 'ub_A1', B: 'B1', C: 'ub_C1' },
    size: ubSize,
    block: ubBlockSize,
  },
};

const createGeluMulSlotRuntime = () => ({
  loaded: false,
  phaseIndex: 0,
  writebackDone: false,
});

const createGeluMulRuntime = () => ({
  activeSlot: 0,
  pendingSlot: null,
  slots: {
    0: createGeluMulSlotRuntime(),
    1: createGeluMulSlotRuntime(),
  },
});

let geluMulRuntime = createGeluMulRuntime();

const resetGeluMulRuntime = () => {
  geluMulRuntime = createGeluMulRuntime();
};

const getGeluMulRuntime = () => geluMulRuntime;
const getGeluMulSlot = (slot) => GELU_MUL_SLOTS[slot];
const getGeluMulSlotTags = (slot) => getGeluMulSlot(slot).tags;
const getGeluMulPhase = (phaseIndex) => GELU_MUL_PHASES[phaseIndex];
const getOtherGeluMulSlot = (slot) => (slot === 0 ? 1 : 0);

const isGeluMulWritebackPhase = (phase) => phase?.kind === 'writeback';

const hasMoreL2Input = () =>
  stateHasUnFinished("l2", "A0") && stateHasUnFinished("l2", "B0");

const isGeluMulSlotComputing = (slotState) =>
  slotState.loaded &&
  !slotState.writebackDone &&
  slotState.phaseIndex < GELU_MUL_WRITEBACK_PHASE_INDEX;

const isGeluMulSlotReadyForWriteback = (slotState) =>
  slotState.loaded &&
  !slotState.writebackDone &&
  slotState.phaseIndex >= GELU_MUL_WRITEBACK_PHASE_INDEX;

const isGeluMulUbReadyForL2 = (runtime) => {
  const loadedSlots = GELU_MUL_SLOT_IDS.filter((slot) => runtime.slots[slot].loaded);
  const hasComputingSlot = loadedSlots.some((slot) => isGeluMulSlotComputing(runtime.slots[slot]));
  const hasWritebackSlot = loadedSlots.some((slot) =>
    runtime.slots[slot].writebackDone || isGeluMulSlotReadyForWriteback(runtime.slots[slot])
  );

  return (
    loadedSlots.length > 0 &&
    hasWritebackSlot &&
    !hasComputingSlot &&
    stateHasFinished("l2", "A0") &&
    stateHasFinished("l2", "B0")
  );
};

const pushActiveEdge = (activeEdges, edge) => {
  if (!activeEdges.includes(edge)) activeEdges.push(edge);
};

const markGeluMulSlotLoaded = (slot) => {
  const runtime = getGeluMulRuntime();
  runtime.slots[slot] = {
    ...createGeluMulSlotRuntime(),
    loaded: true,
  };
};

const loadGeluMulSlotData = (slot) => {
  const { size, block } = getGeluMulSlot(slot);
  const tags = getGeluMulSlotTags(slot);

  stateLoadData("ub", tags.A, size, block);
  stateLoadData("ub", tags.B, size, block);
  stateLoadData("ub", tags.C, size, block);
  markGeluMulSlotLoaded(slot);
};

const canLoadGeluMulSlot = (runtime, slot) =>
  (!runtime.slots[slot].loaded || runtime.slots[slot].writebackDone) && hasMoreL2Input();

const loadWaitingGeluMulSlot = (runtime, activeEdges) => {
  const waitingSlot = getOtherGeluMulSlot(runtime.activeSlot);

  if (!canLoadGeluMulSlot(runtime, waitingSlot)) return null;

  stateProgress("l2", "A0");
  stateProgress("l2", "B0");
  loadGeluMulSlotData(waitingSlot);
  pushActiveEdge(activeEdges, "l2-ub");

  return waitingSlot;
};

const getNextComputingGeluMulSlot = (runtime) => {
  const waitingSlot = getOtherGeluMulSlot(runtime.activeSlot);

  if (isGeluMulSlotComputing(runtime.slots[waitingSlot])) return waitingSlot;
  if (isGeluMulSlotComputing(runtime.slots[runtime.activeSlot])) return runtime.activeSlot;

  return null;
};

const progressGeluMulSlotTags = (slot, tagKeys) => {
  const tags = getGeluMulSlotTags(slot);

  tagKeys.forEach((tagKey) => {
    if (tagKey === 'L2_C') return;
    stateProgress("ub", tags[tagKey]);
  });
};

const progressGeluMulPhaseReads = (slot, phase) => {
  progressGeluMulSlotTags(slot, phase.reads);
};

const progressGeluMulPhaseWrites = (slot, phase) => {
  progressGeluMulSlotTags(slot, phase.writes);
};

const progressGeluMulPhaseUnchangedReads = (slot, phase) => {
  const readOnlyTags = phase.reads.filter((tagKey) => !phase.writes.includes(tagKey));
  progressGeluMulSlotTags(slot, readOnlyTags);
};

const clearGeluMulSlot = (slot) => {
  progressGeluMulSlotTags(slot, ['A', 'B', 'C']);
};

const commitPendingGeluMulPhase = () => {
  const runtime = getGeluMulRuntime();

  if (runtime.pendingSlot === null) return false;

  const slot = runtime.pendingSlot;
  const slotState = runtime.slots[slot];
  const phase = getGeluMulPhase(slotState.phaseIndex);

  if (!phase || isGeluMulWritebackPhase(phase)) {
    runtime.pendingSlot = null;
    return false;
  }

  progressGeluMulPhaseWrites(slot, phase);
  progressGeluMulPhaseUnchangedReads(slot, phase);
  slotState.phaseIndex += 1;
  runtime.pendingSlot = null;

  return true;
};

const startGeluMulVectorPhase = (runtime, slot, activeEdges) => {
  const slotState = runtime.slots[slot];
  const phase = getGeluMulPhase(slotState.phaseIndex);

  if (phase && !isGeluMulWritebackPhase(phase)) {
    progressGeluMulPhaseReads(slot, phase);
  }

  runtime.activeSlot = slot;
  runtime.pendingSlot = slot;
  pushActiveEdge(activeEdges, "ub-vector");
};

export const createGeluMulControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm: {
    next: () => {
      if (! stateHasFinished("gm", "C0")) {
        return "l2";
      }

      return "final";
    },
    transfer: () => {
      if (!("A0" in memStates.gm)) {
        resetGeluMulRuntime();
        stateLoadData("gm", "A0", gmABCSize, gmABCBlock);
        stateLoadData("gm", "B0", gmABCSize, gmABCBlock);
        stateLoadData("gm", "C0", gmABCSize, gmABCBlock);
        return { nodes: ["gm"], edges: [] };
      }
      if (stateHasFinished("l2", "C0")) {
        memStates.l2 = {};
        stateProgress("gm", "C0");
        return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
      }

      return { nodes: [], edges: [] };
    },
  },
  l2: {
    next: () => {
      if (!stateHasFinished("l2", "C0")) return "ub";
      return "gm";
    },
    transfer: () => {
      if (!("A0" in memStates.l2)) {
        stateLoadData("l2", "A0", l2AvSize, l2AvBlockSize);
        stateLoadData("l2", "B0", l2AvSize, l2AvBlockSize);
        stateLoadData("l2", "C0", l2AvSize, l2AvBlockSize);
        stateProgress("gm", "A0");
        stateProgress("gm", "B0");
        return { nodes: ["l2", "gm"], edges: ["gm-l2"] };
      }

      stateProgress("l2", "C0");
      memStates.ub = {};
      resetGeluMulRuntime();
      return { nodes: ["l2", "ub"], edges: ["ub-l2"] };
    },
  },
  ub: {
    next: () => {
      if (isGeluMulUbReadyForL2(getGeluMulRuntime())) {
        return "l2";
      }

      return "vector";
    },
    transfer: () => {
      if (!getGeluMulRuntime().slots[0].loaded) {
        loadGeluMulSlotData(0);
        stateProgress("l2", "A0");
        stateProgress("l2", "B0");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }

      if (commitPendingGeluMulPhase()) {
        const activeEdges = ["vector-ub"];
        const loadedSlot = loadWaitingGeluMulSlot(getGeluMulRuntime(), activeEdges);
        const activeNodes = loadedSlot === null ? ["ub", "vector"] : ["ub", "l2", "vector"];

        return { nodes: activeNodes, edges: activeEdges };
      }

      return { nodes: ["ub"], edges: [] };
    },
  },
  vector: {
    next: () => "ub",
    transfer: () => {
      const runtime = getGeluMulRuntime();
      const activeEdges = [];

      let activeSlot = runtime.activeSlot;
      let slotState = runtime.slots[activeSlot];

      if (!slotState.loaded || slotState.writebackDone) {
        const nextSlot = getNextComputingGeluMulSlot(runtime);

        if (nextSlot === null) {
          return { nodes: ["ub", "l2", "vector"], edges: activeEdges };
        }

        runtime.activeSlot = nextSlot;
        activeSlot = nextSlot;
        slotState = runtime.slots[activeSlot];
      }

      const phase = getGeluMulPhase(slotState.phaseIndex);

      if (!phase) {
        return { nodes: ["ub", "l2", "vector"], edges: activeEdges };
      }

      if (isGeluMulWritebackPhase(phase)) {
        if (isGeluMulUbReadyForL2(runtime)) {
          return { nodes: ["ub", "l2"], edges: [] };
        }

        progressGeluMulPhaseReads(activeSlot, phase);
        stateProgress("l2", "C0");
        clearGeluMulSlot(activeSlot);
        slotState.phaseIndex += 1;
        slotState.writebackDone = true;
        runtime.pendingSlot = null;
        pushActiveEdge(activeEdges, "ub-l2");

        const nextSlot = getNextComputingGeluMulSlot(runtime);
        if (nextSlot !== null) {
          startGeluMulVectorPhase(runtime, nextSlot, activeEdges);
        }

        return { nodes: ["ub", "l2", "vector"], edges: activeEdges };
      }

      loadWaitingGeluMulSlot(runtime, activeEdges);
      startGeluMulVectorPhase(runtime, activeSlot, activeEdges);

      return { nodes: ["ub", "l2", "vector"], edges: activeEdges };
    },
  },
});

export const dataColors = {
  A0: { 0: '#ff9fb3', 1: '#ff4f7a' },
  A1: { 0: '#c084fc', 1: '#6b21a8' },
  C0: { 1: '#ffcf33' },
  C1: { 1: '#8b5a2b' },
  ub_A0: {
    0: '#ff9fb3', 1: '#ff4f7a', 2: '#ff9fb3', 3: '#ff4f7a',
    4: '#ffcf33', 5: '#ff4f7a', 6: '#d99200',
  },
  ub_A1: {
    0: '#c084fc', 1: '#6b21a8', 2: '#c084fc', 3: '#6b21a8',
    4: '#8b5a2b', 5: '#6b21a8', 6: '#5a3418',
  },
  B0: { 0: '#ff9fb3', 1: '#ff4f7a', 2: '#ff9fb3' },
  B1: { 0: '#c084fc', 1: '#6b21a8', 2: '#c084fc' },
  ub_C0: {
    1: '#ffcf33', 2: '#ff4f7a',
    3: '#9a6400', 4: '#ff4f7a', 5: '#633f00',
  },
  ub_C1: {
    1: '#8b5a2b', 2: '#6b21a8',
    3: '#3a1f0e', 4: '#6b21a8', 5: '#241106',
  },
};

export const gelumulOperatorDefinition = {
  id: 'gelumul',
  label: 'gelu_mul',
  createControlStates: createGeluMulControlStates,
  dataColors,
};
