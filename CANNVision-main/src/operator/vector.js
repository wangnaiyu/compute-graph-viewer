import {
  memStates,
  stateProgress,
  stateLoadData,
  stateHasFinished,
  stateHasUnFinished,
} from './memstates';

const gmABCSize = 12 * 8;
const gmABCBlock = 12 * 8;
const l2AvSize = 8 * 4;
const l2AvBlockSize = 1 * 4;
const ubA0Size = 2 * 16;
const ubA0BlockSize = 2 * 16;
const ubA1Size = ubA0Size;
const ubA1BlockSize = ubA0BlockSize;

export const createVectorControlStates = () => ({
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
        stateLoadData("gm", "A0", gmABCSize, gmABCBlock);
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
        stateLoadData("l2", "C0", l2AvSize, l2AvBlockSize);
        stateProgress("gm", "A0");
        return { nodes: ["l2", "gm"], edges: ["gm-l2"] };
      }

      stateProgress("l2", "C0");
      memStates.ub = {};
      return { nodes: ["l2", "ub"], edges: ["ub-l2"] };
    },
  },
  ub: {
    next: () => {
      if (
        !stateHasUnFinished("ub", "A0") &&
        !stateHasUnFinished("ub", "A1") &&
        stateHasFinished("l2", "A0")
      ) {
        return "l2";
      }
      return "vector";
    },
    transfer: () => {
      if (!("A0" in memStates.ub)) {
        stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "C0", ubA0Size, ubA0BlockSize);
        stateProgress("l2", "A0");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }

      if (stateHasFinished("ub", "A1")) {
        stateProgress("ub", "A1");
        stateProgress("ub", "C1");
      } else {
        stateProgress("ub", "A0");
        stateProgress("ub", "C0");
      }

      return { nodes: ["ub"], edges: ["vector-ub"] };
    },
  },
  vector: {
    next: () => "ub",
    transfer: () => {
      const activeEdges = ["ub-vector"];

      if (stateHasUnFinished("ub", "A0")) {
        stateProgress("ub", "A0");

        if (stateHasFinished("ub", "A1")) {
          stateProgress("l2", "C0");
          activeEdges.push("ub-l2");
        }

        if (stateHasUnFinished("l2", "A0")) {
          stateProgress("l2", "A0");
          stateLoadData("ub", "A1", ubA1Size, ubA1BlockSize);
          stateLoadData("ub", "C1", ubA1Size, ubA1BlockSize);
          activeEdges.push("l2-ub");
        }
      } else if (stateHasUnFinished("ub", "A1")) {
        stateProgress("ub", "A1");

        if (stateHasFinished("ub", "A0")) {
          stateProgress("l2", "C0");
          activeEdges.push("ub-l2");
        }

        if (stateHasUnFinished("l2", "A0")) {
          stateProgress("l2", "A0");
          stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
          stateLoadData("ub", "C0", ubA0Size, ubA0BlockSize);
          activeEdges.push("l2-ub");
        }
      }

      return { nodes: ["ub", "l2", "vector"], edges: activeEdges };
    },
  },
});

export const dataColors = {
  A0: { 0: '#ff9fb3', 1: '#ff4f7a' },
  A1: { 0: '#c084fc', 1: '#6b21a8' },
  C0: { 1: '#ffeaa0', 2: '#ffcf33' },
  C1: { 1: '#d2b48c', 2: '#8b5a2b' },
};

export const vectorOperatorDefinition = {
  id: 'vector',
  label: 'Vector',
  createControlStates: createVectorControlStates,
  dataColors,
};
