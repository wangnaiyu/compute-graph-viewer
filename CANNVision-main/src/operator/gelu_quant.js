import {
  stateRemove,
  stateProgress,
  stateLoadData,
  stateHasData,
  stateHasFinished,
} from './memstates';

// GM has 55 x 12 cells. These four regions use 336 cells, close to half.
const GM_X_SIZE = 132;
const GM_SCALE_SIZE = 36;
const GM_Y_SIZE = 132;
const GM_OUT_SCALE_SIZE = 36;

// L2 has 55 x 4 cells. This tile occupies 116 cells, close to half.
const L2_X_SIZE = 48;
const L2_SCALE_SIZE = 8;
const L2_Y_SIZE = 48;
const L2_OUT_SCALE_SIZE = 12;
const L2_TILE_SIZE = 16;
const L2_OUT_SCALE_TILE_SIZE = 4;

// UB has 8 x 16 cells. X is the main tile; scale is much smaller.
// For half/bfloat16 input cast to fp32, raw:fp32 is shown as 1:2.
const UB_X_SIZE = 16;
const UB_SCALE_SIZE = 4;
const UB_SCALE_FP32_SIZE = 8;
const UB_X_FP32_SIZE = 32;
const UB_TEMP_SIZE = 28;
const UB_GELU_SIZE = 28;
const UB_Y_SIZE = 8;
const UB_OUT_SCALE_SIZE = 4;

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

const resetUbTile = () => {
  ["X", "X32", "T", "G", "Y", "OS"].forEach((tag) => {
    if (stateHasData("ub", tag)) {
      stateRemove("ub", tag);
    }
  });
};

const vectorReadTransfer = (transfer = () => {}) => {
  transfer();
  return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
};

const vectorWriteTransfer = (transfer = () => {}) => {
  transfer();
  return { nodes: ["ub", "vector"], edges: ["vector-ub"] };
};

const buildStageColors = (colors) =>
  Object.fromEntries(colors.map((color, stage) => [stage, color]));

export const createGeluQuantControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm_prepare",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm_prepare: {
    next: () => "copy_scale_gm_to_l2",
    transfer: () => {
      loadOnce("gm", "X", GM_X_SIZE);
      loadOnce("gm", "S", GM_SCALE_SIZE);
      loadOnce("gm", "Y", GM_Y_SIZE);
      loadOnce("gm", "OS", GM_OUT_SCALE_SIZE);
      return { nodes: ["gm"], edges: [] };
    },
  },
  copy_scale_gm_to_l2: {
    next: () => "copy_scale_l2_to_ub",
    transfer: () => {
      progress("gm", "S");
      loadOnce("l2", "S", L2_SCALE_SIZE);
      return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
    },
  },
  copy_scale_l2_to_ub: {
    next: () => "cast_scale_read",
    transfer: () => {
      progress("l2", "S");
      loadOnce("ub", "SI", UB_SCALE_SIZE);
      loadOnce("ub", "S32", UB_SCALE_FP32_SIZE);
      return { nodes: ["l2", "ub"], edges: ["l2-ub"] };
    },
  },
  cast_scale_read: {
    next: () => "cast_scale_write",
    transfer: () => vectorReadTransfer(),
  },
  cast_scale_write: {
    next: () => "copy_x_gm_to_l2",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "SI");
      progress("ub", "S32");
    }),
  },
  copy_x_gm_to_l2: {
    next: () => "copy_x_l2_to_ub",
    transfer: () => {
      progress("gm", "X");
      loadOnce("l2", "X", L2_X_SIZE, L2_TILE_SIZE);
      loadOnce("l2", "Y", L2_Y_SIZE, L2_TILE_SIZE);
      loadOnce("l2", "OS", L2_OUT_SCALE_SIZE, L2_OUT_SCALE_TILE_SIZE);
      return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
    },
  },
  copy_x_l2_to_ub: {
    next: () => "cast_x_read",
    transfer: () => {
      resetUbTile();
      progress("l2", "X");
      loadOnce("ub", "X", UB_X_SIZE);
      loadOnce("ub", "X32", UB_X_FP32_SIZE);
      return { nodes: ["l2", "ub"], edges: ["l2-ub"] };
    },
  },
  cast_x_read: {
    next: () => "cast_x_write",
    transfer: () => vectorReadTransfer(),
  },
  cast_x_write: {
    next: () => "gelu_erf_read",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "X");
      progress("ub", "X32");
    }),
  },
  gelu_erf_read: {
    next: () => "gelu_erf_write",
    transfer: () => vectorReadTransfer(),
  },
  gelu_erf_write: {
    next: () => "apply_input_scale_read",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "X32");
      loadOnce("ub", "T", UB_TEMP_SIZE);
      progress("ub", "T");
      loadOnce("ub", "G", UB_GELU_SIZE);
      progress("ub", "G");
    }),
  },
  apply_input_scale_read: {
    next: () => "apply_input_scale_write",
    transfer: () => vectorReadTransfer(),
  },
  apply_input_scale_write: {
    next: () => "reduce_abs_max_read",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "G");
    }),
  },
  reduce_abs_max_read: {
    next: () => "reduce_abs_max_write",
    transfer: () => vectorReadTransfer(),
  },
  reduce_abs_max_write: {
    next: () => "calculate_out_scale_read",
    transfer: () => vectorWriteTransfer(() => progress("ub", "T")),
  },
  calculate_out_scale_read: {
    next: () => "calculate_out_scale_write",
    transfer: () => vectorReadTransfer(),
  },
  calculate_out_scale_write: {
    next: () => "quantize_to_int8_read",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "T");
      loadOnce("ub", "OS", UB_OUT_SCALE_SIZE);
      progress("ub", "OS");
    }),
  },
  quantize_to_int8_read: {
    next: () => "quantize_to_int8_write",
    transfer: () => vectorReadTransfer(),
  },
  quantize_to_int8_write: {
    next: () => "store_tile_to_l2",
    transfer: () => vectorWriteTransfer(() => {
      progress("ub", "OS");
      loadOnce("ub", "Y", UB_Y_SIZE);
      progress("ub", "Y");
    }),
  },
  store_tile_to_l2: {
    next: () => (stateHasFinished("l2", "Y") ? "write_l2_to_gm" : "copy_x_l2_to_ub"),
    transfer: () => {
      progress("ub", "Y");
      progress("ub", "OS");
      progress("l2", "Y");
      progress("l2", "OS");
      return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
    },
  },
  write_l2_to_gm: {
    next: () => "final",
    transfer: () => {
      progress("gm", "Y");
      progress("gm", "OS");
      return { nodes: ["l2", "gm"], edges: ["l2-gm"] };
    },
  },
});

export const dataColors = {
  X: buildStageColors(['#2563eb', '#1d4ed8', '#1d4ed8']),
  X32: buildStageColors(['#bfdbfe', '#3b82f6', '#3b82f6']),
  S: buildStageColors(['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e']),
  SI: buildStageColors(['#f59e0b', '#d97706']),
  S32: buildStageColors(['#fde68a', '#fbbf24']),
  T: buildStageColors([
    '#94a3b8',
    '#64748b',
    '#475569',
    '#334155',
    '#1f2937',
    '#111827',
    '#0f172a',
    '#020617',
    '#312e81',
    '#1e1b4b',
  ]),
  G: buildStageColors(['#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#450a0a']),
  Y: buildStageColors(['#bbf7d0', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#052e16']),
  OS: buildStageColors([
    '#ddd6fe',
    '#a855f7',
    '#9333ea',
    '#7e22ce',
    '#6b21a8',
    '#581c87',
    '#3b0764',
    '#2e1065',
    '#1e1b4b',
  ]),
};

export const geluQuantOperatorDefinition = {
  id: 'gelu_quant',
  label: 'gelu_quant',
  createControlStates: createGeluQuantControlStates,
  dataColors,
};
