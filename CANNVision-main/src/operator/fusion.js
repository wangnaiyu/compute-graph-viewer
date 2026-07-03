import {
  stateRemove,
  stateProgress,
  stateLoadData,
  stateHasData,
  stateHasFinished,
  stateHasUnFinished,
} from './memstates';

const gmABCSize = 12 * 8;
const gmABCBlock = 12 * 8;
const l2ABSize = 8 * 4;
const l2ABBlock = 4 * 4;
const l2CSize = l2ABSize;
const l2CBlock = l2ABSize / 4;
const l1ABSize = 8 * 16;
const l1ABBlockSize = 2 * 16;
const l0aASize = 8 * 8;
const l0aABlockSize = 8 * 8;
const l0bBSize = l0aASize;
const l0bBBlockSize = l0aABlockSize;
const l0CSize = 8 * 16;
const l0CBlockSize = 8 * 16;
const l2TmpSize = l2ABBlock;
const l2TmpBlockSize = l2ABBlock;
const ubASize = 2 * 16;
const ubABlockSize = 2 * 16;
const ubCSize = ubASize;
const ubCBlockSize = ubABlockSize;

export const createFusionControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  gm: {
    next: () => (stateHasFinished("gm", "A") ? "final" : "l2"),
    transfer: () => {
      if (!stateHasData("gm", "A")) {
        stateLoadData("gm", "A", gmABCSize, gmABCBlock);
        stateLoadData("gm", "B", gmABCSize, gmABCBlock);
        stateLoadData("gm", "C", gmABCSize, gmABCBlock);
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
      if (stateHasFinished("l2", "C")) return "gm";
      if (stateHasUnFinished("l2", "tmp")) return "ub";
      if (!stateHasData("l2", "A")) return "l1";
      if (stateHasUnFinished("l2", "A")) return "l1";
      console.log(" >>> invalide state of l2");
      return "l1";
    },
    transfer: () => {
      if (!stateHasData("l2", "A")) {
        console.log(` >>> gm -> l2`);
        stateProgress("gm", "A");
        stateProgress("gm", "B");
        stateLoadData("l2", "A", l2ABSize, l2ABBlock);
        stateLoadData("l2", "B", l2ABSize, l2ABBlock);
        stateLoadData("l2", "C", l2CSize, l2CBlock);
        return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
      }

      if (stateHasFinished("ub", "C")) {
        console.log(` >>> l2 <- ub`);
        stateProgress("l2", "C");
        stateRemove("ub", "C");
        stateRemove("ub", "A");
        stateRemove("l2", "tmp");
        return { nodes: ["l2", "ub"], edges: ["ub-l2"] };
      }

      if (stateHasFinished("l1", "A")) {
        console.log(` >>> l2 <- fixpipe`);
        stateLoadData("l2", "tmp", l2TmpSize, l2TmpBlockSize);
        stateRemove("l0c", "C");
        return { nodes: ["l2"], edges: ["fixpipe-l2"] };
      }

      console.log(` >>> invalid state in l2`);
      return { nodes: [], edges: [] };
    },
  },
  l1: {
    next: () => "l0",
    transfer: () => {
      let actL2L1 = false;

      if (!stateHasData("l1", "A") || stateHasFinished("l1", "A")) {
        if (stateHasUnFinished("l2", "A")) {
          stateLoadData("l1", "A", l1ABSize, l1ABBlockSize);
          stateLoadData("l1", "B", l1ABSize, l1ABBlockSize);
          stateLoadData("l1", "C", l1ABSize, l1ABBlockSize);
          stateProgress("l2", "A");
          stateProgress("l2", "B");
          actL2L1 = true;
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
      if (stateHasUnFinished("l0a", "A")) {
        stateProgress("l0a", "A");
        stateProgress("l0b", "B");
        return {
          nodes: ["l0a", "l0b", "cube"],
          edges: ["l0a-cube", "l0b-cube"],
        };
      }

      return { nodes: ["l0a", "l0b", "cube"], edges: ["l0a-cube", "l0b-cube"] };
    },
  },
  l0c: {
    next: () => (stateHasUnFinished("l1", "A") ? "l1" : "fixpipe"),
    transfer: () => {
      if (!stateHasData("l0c", "C")) {
        stateLoadData("l0c", "C", l0CSize, l0CBlockSize);
      } else {
        stateProgress("l0c", "C");
      }

      stateRemove("l0a", "A");
      stateRemove("l0b", "B");
      return { nodes: ["l0c", "l0a", "l0b"], edges: ["cube-l0c"] };
    },
  },
  fixpipe: {
    next: () => "l2",
    transfer: () => ({ nodes: [], edges: ["l0c-fixpipe"] }),
  },
  ub: {
    next: () => {
      if (stateHasUnFinished("ub", "A")) return "vector";
      if (stateHasFinished("ub", "C")) return "l2";
      console.log(" !!! in invalid state ub");
      return "vector";
    },
    transfer: () => {
      if (!stateHasData("ub", "A")) {
        stateLoadData("ub", "A", ubASize, ubABlockSize);
        stateLoadData("ub", "C", ubCSize, ubCBlockSize);
        stateProgress("l2", "tmp");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }

      if (stateHasFinished("ub", "A")) {
        stateProgress("ub", "C");
        return { nodes: ["ub"], edges: ["vector-ub"] };
      }

      console.log(` !!! invalid state of ub`);
      return { nodes: [], edges: [] };
    },
  },
  vector: {
    next: () => "ub",
    transfer: () => {
      stateProgress("ub", "A");
      return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
    },
  },
});

export const dataColors = {
  A: { 0: '#FF7F7F', 1: '#ff0000' },
  B: { 0: '#c6ffe3', 1: '#00ff0070' },
  C: {
    0: '#FFFACD',
    1: '#ffeaa0',
    2: '#ffc857',
    3: '#d68a2f',
    4: '#8f5a24',
  },
  tmp: { 0: '#D2D2D2', 1: '#505050' },
};

export const fusionOperatorDefinition = {
  id: 'fusion',
  label: 'Fusion',
  createControlStates: createFusionControlStates,
  dataColors,
};
