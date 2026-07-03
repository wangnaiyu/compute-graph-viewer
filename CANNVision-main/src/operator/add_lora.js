import { stackTraceLimit } from 'postcss/lib/css-syntax-error';
import {
  stateRemove,
  stateProgress,
  stateLoadData,
  stateHasData,
  stateHasFinished,
  stateHasUnFinished,
  memStates,
} from './memstates';

const gmCols = 16;
const l2Cols = 7;
const l1Cols = 16;
const l0Cols = 8;
const ubCols = 16;

const gmXSize = 8 * gmCols;
const gmXBlock = gmXSize;
const gmWeightASize = 4 * gmCols;
const gmWeightABlock = gmWeightASize;
const gmWeightBSize = 4 * gmCols;
const gmWeightBBlock = gmWeightBSize;
const gmYSize = 8 * gmCols;
const gmYBlock = gmYSize;

const gmIndicesSize = 1 * gmCols;
const gmIndicesBlock = gmIndicesSize;

const gmOutSize = gmYSize;
const gmOutBlock = gmOutSize;

const l2XSize = 4 * l2Cols;
const l2XBlock = l2XSize;
const l2WeightASize = 4 * l2Cols;
const l2WeightABlock = l2WeightASize;
const l2WeightBSize = 4 * l2Cols;
const l2WeightBBlock = l2WeightBSize;
const l2YSize = 4 * l2Cols;
const l2YBlock = l2YSize;
const l2IndicesSize = 1 * l2Cols;
const l2IndicesBlock = l2IndicesSize;
const l2Z1Size = 2 * l2Cols;
const l2Z1Block = l2Z1Size;
const l2DeltaSize = 4 * l2Cols;
const l2DeltaBlock = l2DeltaSize;
const l2OutSize = 4 * l2Cols;
const l2OutBlock = l2OutSize;

const l1MatmulSize = 4 * l1Cols;
const l1Block = 2 * l1Cols;
const l0MatmulSize = 4 * l0Cols;
const l0Block = 4 * l0Cols;
const l0cSize = 4 * l0Cols;
const l0cBlock = 4 * l0Cols;
const ubSize =  ubCols;
const ubBlock = ubCols;
const ubD1Size = ubSize;
const ubD1Block = ubBlock;

let currentMatmulAStep = 0;
let totalMatmulAStep = 0;
let totalMatmulAWeightStep = 0;
let currentMatmulBStep = 0;
let totalMatmulBStep = 0;
let totalMatmulBWeightStep = 0;

const stateClear = (state) => {
  memStates[state] = {};
};

const progressIfPresent = (state, tag) => {
  if (stateHasData(state, tag)) {
    stateProgress(state, tag);
  }
};

const stateHighlightOnly = (state, tag, st, len) => {
  const dataStage = memStates[state][tag].dataStage;
  const start = Math.max(0, st);
  const end = Math.min(st + len, dataStage.length);

  dataStage.fill(0);
  if (start < end) {
    dataStage.fill(1, start, end);
  }
};

const resetMatmulSteps = () => {
  currentMatmulAStep = 0;
  currentMatmulBStep = 0;
  totalMatmulAWeightStep = l2WeightASize / l2WeightABlock;
  totalMatmulBWeightStep = l2WeightBSize / l2WeightBBlock;
  totalMatmulAStep = (l2XSize / l2XBlock) * totalMatmulAWeightStep;
  totalMatmulBStep = Math.max(1, l2Z1Size / l2Z1Block) * totalMatmulBWeightStep;
};

export const createAddLoraControlStates = () => ({
  final: {
    next: () => 'final',
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => 'gm',
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm: {
    next: () => 'l2',
    transfer: () => {
      if (!stateHasData('gm', 'X')) {
        stateLoadData('gm', 'X', gmXSize, gmXBlock);
        stateLoadData('gm', 'A', gmWeightASize, gmWeightABlock);
        stateLoadData('gm', 'B', gmWeightBSize, gmWeightBBlock);
        stateLoadData('gm', 'Y', gmYSize, gmYBlock);
        stateLoadData('gm', 'INDICES', gmIndicesSize, gmIndicesBlock);
        stateLoadData('gm', 'OUT', gmOutSize, gmOutBlock);
      }

      return { nodes: ['gm'], edges: [] };
    },
  },
  'l2': {
    next: () => 'indices',
    transfer: () => {
      resetMatmulSteps();
      stateProgress('gm', 'X');
      stateProgress('gm', 'A');
      stateProgress('gm', 'B');
      stateProgress('gm', 'Y');
      stateProgress('gm', 'INDICES');

      stateLoadData('l2', 'X', l2XSize, l2XBlock);
      stateLoadData('l2', 'A', l2WeightASize, l2WeightABlock);
      stateLoadData('l2', 'B', l2WeightBSize, l2WeightBBlock);
      stateLoadData('l2', 'Y', l2YSize, l2YBlock);
      stateLoadData('l2', 'INDICES', l2IndicesSize, l2IndicesBlock);

      stateLoadData('l2', 'Z1', l2Z1Size, l2Z1Block);
      stateLoadData('l2', 'DELTA_dst', l2DeltaSize, l2DeltaBlock);
      stateLoadData('l2', 'OUT', l2OutSize, l2OutBlock);

      return { nodes: ['gm', 'l2'], edges: ['gm-l2'] };
    },
  },
  indices: {
    next: () => 'l1',
    transfer: () => {
      stateProgress('l2', 'INDICES');
      return { nodes: ['l2'], edges: [] };
    },
  },
  l1: {
    next: () => 'l0',
    transfer: () => {
      stateProgress('l2', 'X');
      stateProgress('l2', 'A');
      stateLoadData('l1', 'X', l1MatmulSize, l1Block);
      stateLoadData('l1', 'A', l1MatmulSize, l1Block);

      return {
        nodes: ['l2', 'l1'],
        edges: ['l2-l1'],
      };
    },
  },
  l0: {
    next: () => 'cube',
    transfer: () => {
      stateProgress('l1', 'X');
      stateProgress('l1', 'A');
      stateLoadData('l0a', 'X', l0MatmulSize, l0Block);
      stateLoadData('l0b', 'A', l0MatmulSize, l0Block);
      return { nodes: ['l1', 'l0a', 'l0b'], edges: ['l1-l0a', 'l1-l0b'] };
    },
  },
  cube: {
    next: () => 'l0c',
    transfer: () => {
      stateProgress('l0a', 'X');
      stateProgress('l0b', 'A');
      return { nodes: ['l0a', 'l0b', 'cube'], edges: ['l0a-cube', 'l0b-cube'] };
    },
  },
  l0c: {
    next: () => stateHasUnFinished('l1', 'X')? 'l0': 'fixpipe',
    transfer: () => {
      if (!stateHasData('l0c', 'C')) {
        stateLoadData('l0c', 'C', l0cSize, l0cBlock);
      }

      stateProgress('l0c', 'C');
      stateRemove('l0a', 'X');
      stateRemove('l0b', 'A');
      return { nodes: ['l0a', 'l0b', 'l0c', 'cube'], edges: ['cube-l0c'] };
    },
  },
  fixpipe: {
    next: () => 'z1',
    transfer: () => {
      stateClear('l0a');
      stateClear('l0b');
      stateClear('l1');
      return { nodes: ['l0a', 'l0b', 'l1', 'fixpipe'], edges: ['l0c-fixpipe'] };
    },
  },
  z1: {
    next: () => 'l1_2',
    transfer: () => {
      stateProgress('l2', 'Z1');
      stateClear('l0c');
      return { nodes: ['l0c', 'l2', 'fixpipe'], edges: ['fixpipe-l2'] };
    },
  },
  l1_2: {
    next: () => 'l0_2',
    transfer: () => {
      stateProgress('l2', 'Z1');
      stateProgress('l2', 'B');
      stateLoadData('l1', 'Z1_src', l1MatmulSize, l1Block);
      stateLoadData('l1', 'B', l1MatmulSize, l1Block);

      return {
        nodes: ['l2', 'l1'],
        edges: ['l2-l1'],
      };
    },
  },
  l0_2: {
    next: () => 'cube_2',
    transfer: () => {
      stateProgress('l1', 'Z1_src');
      stateProgress('l1', 'B');
      stateLoadData('l0a', 'Z1_src', l0MatmulSize, l0Block);
      stateLoadData('l0b', 'B', l0MatmulSize, l0Block);
      return { nodes: ['l1', 'l0a', 'l0b'], edges: ['l1-l0a', 'l1-l0b'] };
    },
  },
  cube_2: {
    next: () => 'l0c_2',
    transfer: () => {
      stateProgress('l0a', 'Z1_src');
      stateProgress('l0b', 'B');
      return { nodes: ['l0a', 'l0b', 'cube'], edges: ['l0a-cube', 'l0b-cube'] };
    },
  },
  l0c_2: {
    next: () => stateHasUnFinished('l1', 'B') ? 'l0_2':'fixpipe_2',
    transfer: () => {
      if (!stateHasData('l0c', 'DELTA_c')) {
        stateLoadData('l0c', 'DELTA_c', l0cSize, l0cBlock);
      }

      stateProgress('l0c', 'DELTA_c');
      stateClear('l0a');
      stateClear('l0b');
      return { nodes: ['l0a', 'l0b', 'l0c', 'cube'], edges: ['cube-l0c'] };
    },
  },
  fixpipe_2: {
    next: () => 'delta',
    transfer: () => {
      stateClear('l0a');
      stateClear('l0b');
      stateClear('l1');
      return { nodes: ['l0a', 'l0b', 'l1', 'fixpipe'], edges: ['l0c-fixpipe'] };
    },
  },
  delta: {
    next: () => 'ub',
    transfer: () => {
      stateProgress('l2', 'DELTA_dst');
      stateClear('l0c');
      return { nodes: ['l0c', 'l2', 'fixpipe'], edges: ['fixpipe-l2'] };
    },
  },
  ub: {
    next: () => 'scaling',
    transfer: () => {
      stateProgress('l2', 'DELTA_dst');
      stateProgress('l2', 'Y');
      stateLoadData('ub', 'DELTA_src', ubSize, ubBlock);
      stateLoadData('ub', 'Y', ubSize, ubBlock);
      stateLoadData('ub', 'D1', ubD1Size, ubD1Block);
      stateLoadData('ub', 'OUT', ubSize, ubBlock);
      return { nodes: ['l2', 'ub'], edges: ['l2-ub'] };
    },
  },
  
  scaling: {
    next: () => 'd1',
    transfer: () => {
      stateProgress('ub', 'DELTA_src');
      return { nodes: ['ub', 'vector'], edges: ['ub-vector'] };
    }
  },
  d1: {
    next: () => 'vector-add',
    transfer: () => {
      stateProgress('ub', 'D1');
      return { nodes: ['ub', 'vector'], edges: ['vector-ub'] };
    },
  },
  'vector-add': {
    next: () => 'out',
    transfer: () => {
      stateProgress('ub', 'D1');
      stateProgress('ub', 'Y');
      return { nodes: ['ub', 'vector'], edges: ['ub-vector'] };
    },
  },
  'out': {
    next: () => 'write-l2',
    transfer: () => {
      stateProgress('ub', 'OUT');
      return { nodes: ['ub', 'vector'], edges: ['vector-ub'] };
    },
  },
  'write-l2': {
    next: () => 'write-gm',
    transfer: () => {
      stateProgress('l2', 'OUT');
      stateClear('ub');
      return { nodes: ['ub', 'l2'], edges: ['ub-l2'] };
    },
  },
  'write-gm': {
    next: () => 'final',
    transfer: () => {
      stateProgress('gm', 'OUT');
      progressIfPresent('l2', 'OUT');
      stateClear('l2');
      return { nodes: ['l2', 'gm'], edges: ['l2-gm'] };
    },
  },
});

const createOpacityStages = (baseColor) => ({
    1: `${baseColor}66`,
    2: `${baseColor}99`,
    3: `${baseColor}CC`,
    4: `${baseColor}FF`,
});

const z1BaseColor = "#8800ff";


export const dataColors = {
  X: { 0: '#C7D2FE55', 1: '#818CF8', 2: '#4F46E5' },
  A: { 0: '#BBF7D055', 1: '#22C55E', 2: '#15803D' },
  B: { 0: '#FED7AA55', 1: '#F97316', 2: '#C2410C' },
  Y: { 0: '#00f2ff33', 1: '#00f2ff66', 2: '#00f2ffFF' },
  Y_src: { 0: '#BFDBFE55', 1: '#3B82F6', 2: '#1D4ED8' },
  INDICES: { 0: '#00ff2255', 1: '#00ff22ff'},
  C: createOpacityStages("#8800ff"),
  Z1_src:  { 0: '#8800ff31', 1: '#8800ffFF'},
  Z1:  { 1: '#8800ff31', 2: '#8800ffFF'},

  DELTA_c: { 1: '#EF444433', 2: '#EF444499', 3: '#EF4444FF' },
  DELTA_dst: {  1: '#EF444433', 2: '#EF4444CC'  },
  DELTA_src: {  0: '#EF444433', 1: '#EF4444CC'  },
  D1: { 1: '#EF4444CC', 2: '#EF4444FF'},
  OUT: { 1: '#0284C7', 2: '#075985' },
};


export const addLoraOperatorDefinition = {
  id: 'add_lora',
  label: 'add_lora',
  createControlStates: createAddLoraControlStates,
  dataColors,
};
