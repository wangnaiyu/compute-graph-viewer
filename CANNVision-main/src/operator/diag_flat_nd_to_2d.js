import {
  memStates,
  stateProgress,
  stateLoadData,
  stateHasFinished,
  stateHasUnFinished,
} from './memstates';

const gmABCSize = 8 * 16;
const gmABCBlock = 4 * 16;
const l2AvSize = 8 * 4;
const l2AvBlockSize = 1 * 4;
const ubAvSize = 2 * 16;
const ubA0BlockSize = 2 * 16;
const ubAzSize = ubAvSize;
const ubA1BlockSize = 2 * 16;

let First_Enter_GM = true;
let First_Enter_UB = true;
let First_Enter_L2 = true;

export const createDiagflatndto2dControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "const_init",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  const_init:{
    next: () => "gm",
    transfer: () => {
      stateLoadData("ub", "AssistBuf", 16, 4);
      return { nodes: ["ub"], edges: [] };
    },
  },
  gm: {
    next: () => {
      if (! stateHasFinished("gm", "C0")) {
        First_Enter_UB = true;
        return "l2";
      }

      return "final";
    },
    transfer: () => {
      if (!("A0" in memStates.gm)) {
        First_Enter_UB = true;
        stateLoadData("gm", "A0", 4, 4);
        stateLoadData("gm", "C0", 16, 16);
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
        stateLoadData("l2", "A0", 4, 4);
        stateLoadData("l2", "C0", 16, 16);
        stateProgress("gm", "A0");
        return { nodes: ["l2", "gm"], edges: ["gm-l2"] };
      }
      console.log("l2 is Entered!");
      if (stateHasFinished("l2", "C0")) {
        stateProgress("gm", "C0");
        memStates.ub = {};
        return { nodes: ["l2", "ub", "gm"], edges: ["l2-gm"] };
      }
    },
  },
  ub: {
    next: () => {
      if(First_Enter_UB){
        First_Enter_UB = false;
        return "ub";
      }
      if(!stateHasFinished("ub", "C0")) {
        console.log("Here we go vector!");
        if(!("AssistBuf" in memStates.ub)){
          return "l2";
        }
        return "vector";
      }
      console.log("Here we go l2!");
      return "l2";
    },
    transfer: () => {
      if (!("A0" in memStates.ub)) {
        stateLoadData("ub", "A0", 4, 4);
        stateLoadData("ub", "C0", 16, 4);
        //stateLoadData("ub", "AssistBuf", 16, 4);
        stateProgress("l2", "A0");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }
      if(stateHasFinished("ub", "C0")) {
        stateProgress("l2", "C0");
        memStates.ub = {};
        return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
      }
      else{
        console.log("ub-A0 is progressed in ub transfer !");
        stateProgress("ub", "A0");
        stateProgress("ub", "AssistBuf");
        return { nodes: ["vector", "ub"], edges: ["ub-vector"] };
      }
    },
  },
  vector: {
    next: () => "ub",
    transfer: () => {
      stateProgress("ub", "C0");
      stateLoadData("ub", "A0", 4, 4);
      return { nodes: ["vector", "ub"], edges: ["vector-ub"] };
    },
  },
});

export const dataColors = {
  A0: { 0: '#ff9fb3', 1: '#ff4f7a' },
  A1: { 0: '#c084fc', 1: '#6b21a8' },
  C0: { 0: '#ffeaa0', 1: '#ffcf33' },
  AssistBuf: { 0: '#dfb57e', 1: '#8b5a2b' },
};

export const diagflatndto2dOperatorDefinition = {
  id: 'diagflatnd_to_2d',
  label: 'DiagFlatND_to_2D',
  createControlStates: createDiagflatndto2dControlStates,
  dataColors,
};