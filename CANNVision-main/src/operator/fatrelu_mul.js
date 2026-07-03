import {
  stateRemove,
  stateProgress,
  stateLoadData,
  stateHasData,
  stateHasFinished,
  stateHasUnFinished,
  memStates,
} from './memstates';


const GM_X_SIZE  = 264; 
const GM_X1_SIZE = 132;
const GM_X2_SIZE = 132;
const GM_Y_SIZE  = 132;

const L2_X1_SIZE = 48;
const L2_X2_SIZE = 48;
const L2_Y_SIZE  = 48;
const L2_TILE    = 16;

const UB_SIZE = 16; 


const loadOnce = (state, tag, size, stride = size) => {
  if (!stateHasData(state, tag)) {
    stateLoadData(state, tag, size, stride);
  }
};

const progress = (state, tag) => {
  if (stateHasData(state, tag)) {
    stateProgress(state, tag);
  }
};

const resetUb = () => {
  ["x1_0", "x2_0", "mask_0"].forEach((tag) => {
    if (stateHasData("ub", tag)) {
      stateRemove("ub", tag);
    }
  });
};

const setStage = (tag, stage) => {
  if (stateHasData("ub", tag)) {
    memStates.ub[tag].dataStage.fill(stage);
  }
};

// ---- state machine ----

export const createFatreluMulControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm: {
    next: () => "gm_split",
    transfer: () => {
      loadOnce("gm", "x", GM_X_SIZE);
      loadOnce("gm", "y", GM_Y_SIZE);
      return { nodes: ["gm"], edges: [] };
    },
  },

 
  gm_split: {
    next: () => "l2_load",
    transfer: () => {
      progress("gm", "x");
      stateRemove("gm", "x");
      stateRemove("gm", "y");
      loadOnce("gm", "x1", GM_X1_SIZE);
      loadOnce("gm", "x2", GM_X2_SIZE);
      loadOnce("gm", "y",  GM_Y_SIZE);
      return { nodes: ["gm"], edges: [] };
    },
  },

  l2_load: {
    next: () => "ub_load_0",
    transfer: () => {
      progress("gm", "x1");
      progress("gm", "x2");
      loadOnce("l2", "x1", L2_X1_SIZE, L2_TILE);
      loadOnce("l2", "x2", L2_X2_SIZE, L2_TILE);
      loadOnce("l2", "y",  L2_Y_SIZE,  L2_TILE);
      return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
    },
  },

  ub_load_0: {
    next: () => "to_v_cmp_0",
    transfer: () => {
      resetUb();
      progress("l2", "x1");
      progress("l2", "x2");
      loadOnce("ub", "x1_0",  UB_SIZE);
      loadOnce("ub", "x2_0",  UB_SIZE);
      loadOnce("ub", "mask_0", UB_SIZE);
      return { nodes: ["l2", "ub"], edges: ["l2-ub"] };
    },
  },

  // ==================== buf 0: Compare ====================
  to_v_cmp_0: {
    next: () => "v_cmp_0",
    transfer: () => {
      setStage("x1_0", 1);
      setStage("x2_0", 0);
      setStage("mask_0", 0);

      if (stateHasUnFinished("l2", "x1")) {
        progress("l2", "x1");
        progress("l2", "x2");
        loadOnce("ub", "pad_0", UB_SIZE);
        loadOnce("ub", "x1_1",  UB_SIZE);
        loadOnce("ub", "x2_1",  UB_SIZE);
        loadOnce("ub", "mask_1", UB_SIZE);
        setStage("x1_1", 0);
        setStage("x2_1", 0);
        setStage("mask_1", 0);
        return { nodes: ["ub", "vector", "l2"], edges: ["ub-vector", "l2-ub"] };
      }
      ["x1_1", "x2_1", "mask_1", "pad_0"].forEach((tag) => {
        if (stateHasData("ub", tag)) stateRemove("ub", tag);
      });
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_cmp_0: {
    next: () => "to_v_sel_0",
    transfer: () => {
      setStage("x1_0", 0);
      setStage("x2_0", 0);
      setStage("mask_0", 2);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  // ==================== buf 0: Select ====================
  to_v_sel_0: {
    next: () => "v_sel_0",
    transfer: () => {
      setStage("x1_0", 1);
      setStage("x2_0", 0);
      setStage("mask_0", 2);
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_sel_0: {
    next: () => "to_v_mul_0",
    transfer: () => {
      setStage("x1_0", 1);
      setStage("x2_0", 0);
      setStage("mask_0", 1);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  // ==================== buf 0: Mul ====================
  to_v_mul_0: {
    next: () => "v_mul_0",
    transfer: () => {
      setStage("x1_0", 1);
      setStage("x2_0", 1);
      setStage("mask_0", 1);
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_mul_0: {
    next: () => "ub_flush_0",
    transfer: () => {
      setStage("x1_0", 1);
      setStage("x2_0", 0);
      setStage("mask_0", 1);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  ub_flush_0: {
    next: () => (stateHasFinished("l2", "y") ? "gm_store" : "to_v_cmp_1"),
    transfer: () => {
      progress("l2", "y");
      setStage("x1_0", 1);
      setStage("x2_0", 0);
      setStage("mask_0", 1);
      return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
    },
  },

  // ==================== buf 1: Compare ====================
  to_v_cmp_1: {
    next: () => "v_cmp_1",
    transfer: () => {
      setStage("x1_0", 0);
      setStage("x2_0", 0);
      setStage("mask_0", 0);
      setStage("x1_1", 1);
      setStage("x2_1", 0);
      setStage("mask_1", 0);

      if (stateHasUnFinished("l2", "x1")) {
        progress("l2", "x1");
        progress("l2", "x2");
        setStage("x1_0", 0);
        setStage("x2_0", 0);
        setStage("mask_0", 0);
        return { nodes: ["ub", "vector", "l2"], edges: ["ub-vector", "l2-ub"] };
      }
      ["x1_0", "x2_0", "mask_0"].forEach((tag) => {
        if (stateHasData("ub", tag)) stateRemove("ub", tag);
      });
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_cmp_1: {
    next: () => "to_v_sel_1",
    transfer: () => {
      setStage("x1_1", 0);
      setStage("x2_1", 0);
      setStage("mask_1", 2);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  // ==================== buf 1: Select ====================
  to_v_sel_1: {
    next: () => "v_sel_1",
    transfer: () => {
      setStage("x1_1", 1);
      setStage("x2_1", 0);
      setStage("mask_1", 2);
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_sel_1: {
    next: () => "to_v_mul_1",
    transfer: () => {
      setStage("x1_1", 1);
      setStage("x2_1", 0);
      setStage("mask_1", 1);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  // ==================== buf 1: Mul ====================
  to_v_mul_1: {
    next: () => "v_mul_1",
    transfer: () => {
      setStage("x1_1", 1);
      setStage("x2_1", 1);
      setStage("mask_1", 1);
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },

  v_mul_1: {
    next: () => "ub_flush_1",
    transfer: () => {
      setStage("x1_1", 1);
      setStage("x2_1", 0);
      setStage("mask_1", 1);
      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },

  ub_flush_1: {
    next: () => (stateHasFinished("l2", "y") ? "gm_store" : "to_v_cmp_0"),
    transfer: () => {
      progress("l2", "y");
      setStage("x1_1", 1);
      setStage("x2_1", 0);
      setStage("mask_1", 1);
      return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
    },
  },

  gm_store: {
    next: () => "final",
    transfer: () => {
      progress("gm", "y");
      ["x1_0", "x2_0", "mask_0", "pad_0", "x1_1", "x2_1", "mask_1"].forEach((tag) => {
        if (stateHasData("ub", tag)) stateRemove("ub", tag);
      });
      return { nodes: ["l2", "gm", "ub"], edges: ["l2-gm"] };
    },
  },
});


const x1Colors = { 0: '#ff9fb3', 1: '#ff4f7a' };
const x2Colors = { 0: '#c084fc', 1: '#6b21a8' };
const maskColors = { 1: '#ffeaa0', 2: '#ffcf33' };

export const dataColors = {
  x: { 0: '#cbd5e1', 1: '#64748b' },
  x1: x1Colors,
  x2: x2Colors,
  x1_0: x1Colors,
  x2_0: x2Colors,
  mask_0: maskColors,
  x1_1: x1Colors,
  x2_1: x2Colors,
  mask_1: maskColors,
  y: { 0: '#f5ebe0', 1: '#d2b48c', 2: '#8b5a2b' },
};

export const fatreluMulOperatorDefinition = {
  id: 'fatrelu_mul',
  label: 'fatrelu_mul',
  createControlStates: createFatreluMulControlStates,
  dataColors,
};
