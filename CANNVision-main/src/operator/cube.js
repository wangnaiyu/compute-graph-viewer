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

const gmABCSize = 12 * gmCols;
const gmABCBlock = 12 * gmCols;
const l2ABSize = 8 * l2Cols;
const l2ABBlock = 4 * l2Cols;
const l2CSize = l2ABSize;
const l2CBlock = 2 * l2Cols;
const l1ABSize = 8 * l1Cols;
const l1ABBlockSize = 2 * l1Cols;
const l0aASize = 8 * l0Cols;
const l0aABlockSize = 8 * l0Cols;
const l0bBSize = l0aASize;
const l0bBBlockSize = l0aABlockSize;
const l0CSize = 8 * l0Cols;
const l0CBlockSize = 8 * l0Cols;

let totalL2AStep = 0;
let totalL2BStep = 0;
let currentL2Step = 0;
let totalL2Step = 0;

const stateHighlightOnly = (state, tag, st, len) => {
  console.log(` >>> st: ${st}`);
  console.log(` >>> len: ${len}`);
  const dataStage = memStates[state][tag].dataStage;
  const start = Math.max(0, st);
  const end = Math.min(st + len, dataStage.length);

  dataStage.fill(0);
  if (start < end) {
    dataStage.fill(1, start, end);
  }
};


export const createCubeControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm: {
    next: () => (stateHasUnFinished("gm", "A") ? "l2" : "final"),
    transfer: () => {
      if (!stateHasData("gm", "A")) {
        stateLoadData("gm", "A", gmABCSize, gmABCBlock);
        stateLoadData("gm", "B", gmABCSize, gmABCBlock);
        stateLoadData("gm", "C", gmABCSize, gmABCBlock);
        currentL2Step = 0;
        totalL2AStep = l2ABSize / l2ABBlock;
        totalL2BStep = l2ABSize / l2ABBlock;

        totalL2Step = totalL2AStep * totalL2BStep;
        return { nodes: ["gm"], edges: [] };
      }

      stateProgress("gm", "C");
      stateRemove("l2", "A");
      stateRemove("l2", "B");
      stateRemove("l2", "C");
      return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
    },
  },
  l2: {
    next: () => {
      if (currentL2Step >= totalL2Step) return "gm";
      return "l1";
    },
    transfer: () => {
      if (!stateHasData("l2", "A")) {
        stateProgress("gm", "A");
        stateProgress("gm", "B");
        stateLoadData("l2", "A", l2ABSize, l2ABBlock);
        stateLoadData("l2", "B", l2ABSize, l2ABBlock);
        stateLoadData("l2", "C", l2CSize, l2CBlock);
        return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
      }

      if (stateHasFinished("l0c", "C")) {
        stateProgress("l2", "C");
        stateRemove("l0c", "C");
        return { nodes: ["l2", "l0c"], edges: ["fixpipe-l2"] };
      }

      return { nodes: [], edges: [] };
    },
  },
  l1: {
    next: () => "l0",
    transfer: () => {
      let actL2L1 = false;
      if (!stateHasData("l1", "A") || stateHasFinished("l1", "A")) {
        if (currentL2Step < totalL2Step) {
          stateLoadData("l1", "A", l1ABSize, l1ABBlockSize);
          stateLoadData("l1", "B", l1ABSize, l1ABBlockSize);

          let astep = Math.floor(currentL2Step / totalL2BStep);
          let bstep = currentL2Step % totalL2BStep;

          let aStart = astep * memStates.l2.A.stride;
          let aLen = memStates.l2.A.blockSize;
          let bStart = bstep * memStates.l2.B.stride;
          let bLen = memStates.l2.B.blockSize;
          stateHighlightOnly("l2", "A", aStart, aLen);
          stateHighlightOnly("l2", "B", bStart, bLen);
          
          actL2L1 = true;
          currentL2Step++;
        }
      }

      return {
        nodes: ["l2", "l1", "l0c"],
        edges: actL2L1 ? ["l2-l1"] : [],
      };
    },
  },
  l0: {
    next: () => "cube",
    transfer: () => {
      if (stateHasUnFinished("l1", "A")) {
        stateProgress("l1", "A");
        stateProgress("l1", "B");
        stateLoadData("l0a", "A", l0aASize, l0aABlockSize);
        stateLoadData("l0b", "B", l0bBSize, l0bBBlockSize);
        return { nodes: ["l0a", "l0b", "l1"], edges: ["l1-l0a", "l1-l0b"] };
      }

      return { nodes: [], edges: ["l1-l0a", "l1-l0b"] };
    },
  },
  cube: {
    next: () => "l0c",
    transfer: () => {
      stateProgress("l0a", "A");
      stateProgress("l0b", "B");
      return { nodes: ["l0a", "l0b", "cube"], edges: ["l0a-cube", "l0b-cube"] };
    },
  },
  l0c: {
    next: () => (stateHasFinished("l1", "A") ? "fixpipe" : "l1"),
    transfer: () => {
      if (!stateHasData("l0c", "C")) {
        stateLoadData("l0c", "C", l0CSize, l0CBlockSize);
      }         
      stateProgress("l0c", "C");

      stateRemove("l0a", "A");
      stateRemove("l0b", "B");

      return { nodes: ["l0a", "l0b", "l0c"], edges: ["cube-l0c"] };
    },
  },
  fixpipe: {
    next: () => (stateHasUnFinished("l1", "A") ? "l1" : "l2"),
    transfer: () => {
      stateRemove("l1", "A");
      stateRemove("l1", "B");
      return { nodes: ["l0c", "l1"], edges: ["l0c-fixpipe"] };
    },
  },
});

export const dataColors = {
  A: { 0: '#ED85EC33', 1: '#ED85ECFF' },
  B: { 0: '#B1E9FF33', 1: '#B1E9FF66' },
  C: {
    // 0: '#5CA7FF33',
    1: '#5CA7FF66',
    2: '#5CA7FF99',
    3: '#5CA7FFCC',
    4: '#5CA7FFFF',
  },
};

export const cubeOperatorDefinition = {
  id: 'cube',
  label: 'Cube',
  createControlStates: createCubeControlStates,
  dataColors,
};
