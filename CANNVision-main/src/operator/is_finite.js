import {
  memStates,
  stateProgress,
  stateLoadData,
  stateHasFinished,
  stateHasUnFinished,
} from './memstates';

const ubA0Size = 16;
const ubA0BlockSize = 16;
const ubA1Size = 16;
const ubA1BlockSize = 16;
const l2AvBlockSize = 2;
const gmABCSize = 8 * 16;
const gmABCBlock = 4 * 16;
const l2AvSize = 8 * 4;

let counter = 0;
let flag = false;

export const createIsfiniteControlStates = () => ({
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
        counter = 0;
        return { nodes: ["l2", "gm"], edges: ["gm-l2"] };
      }

      counter = 0;
      stateProgress("l2", "C0");
      memStates.ub = {};
      return { nodes: ["l2", "ub"], edges: ["ub-l2"] };
    },
  },
  ub: {
    next: () => {
      if(counter == 6) {
        return "l2";
      }
      if(counter == 0 | (counter == 1 && flag == false)) {
        //counter = 1;
        if(counter == 0){
          flag = false;
        }
        if(counter == 1){
          flag = true;
        }
        return "ub";
      }
      return "vector";
    },
    transfer: () => {
      if (!("A0" in memStates.ub)) {
        console.log("A0, C0 and Cache are loaded into ub !");
        stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "C0", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "Cache", ubA0Size, ubA0BlockSize);
        stateProgress("l2", "A0");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }
      if(counter == 0){
        console.log("Cache is progressed in ub transfer !");
        counter = 1;
        stateProgress("ub", "Cache");
        return { nodes: ["ub"], edges: [] };
      }
      if(counter == 1){
        console.log("counter is 1 !");
        stateProgress("ub", "A0");
        stateProgress("ub", "Cache");
        return { nodes: ["ub"], edges: ["ub-vector"] };
      }
      if(counter == 2){
        stateProgress("ub", "A0");
        stateProgress("ub", "Cache");
        return { nodes: ["ub"], edges: ["ub-vector"] };
      }
      if(counter == 3){
        stateProgress("ub", "A0");
        return { nodes: ["ub"], edges: ["ub-vector"] };
      }
      if(counter == 4){
        stateProgress("ub", "A0");
        return { nodes: ["ub"], edges: ["ub-vector"] };
      }
      if(counter == 5) {
        return { nodes: ["ub"], edges: ["ub-vector"] };
      }
      if(counter == 6) {
        return { nodes: [], edges: ["ub-l2"] };
      }
    },
  },
  vector: {
    next: () => "ub",
    transfer: () => {
      if(counter == 1){
        console.log("Cache is Back And A0 is progressed !");
        counter = 2;
        stateLoadData("ub", "Cache", ubA0Size, ubA0BlockSize);
        stateProgress("ub", "Cache");
        stateProgress("ub", "A0");
        return { nodes: ["ub","vector"], edges: ["vector-ub"] };
      }
      if(counter == 2){
        counter = 3;
        stateLoadData("ub", "Cache", ubA0Size, ubA0BlockSize);
        stateProgress("ub", "Cache");
        stateProgress("ub", "A0");
        return { nodes: ["ub","vector"], edges: ["vector-ub"] };
      }
      if(counter == 3){
        counter = 4;
        stateProgress("ub", "A0");
        return { nodes: ["ub","vector"], edges: ["vector-ub"] };
      }
      if(counter == 4){
        counter = 5;
        stateProgress("ub", "A0");
        return { nodes: ["ub","vector"], edges: ["vector-ub"] };
      }
      if(counter == 5) {
        counter = 6;
        console.log("ub-C0 is progressed in vector transfer !");
        stateProgress("ub", "C0");
        stateProgress("ub", "C0");
        return { nodes: ["ub","vector"], edges: ["vector-ub"] };
      }
    },
  },
});

export const dataColors = {
  A0: { 0: '#f4b8c4', 1: '#fa8ca6', 2:'#f35e81', 3:'#df1e4b', 4:'#b9153b', 5: '#720e25', 6:'#750f1e', 7:'#6b0d1d', 8:'#160204' },
  A1: { 0: '#c084fc', 1: '#6b21a8' },
  C0: { 1: '#ffeaa0', 2: '#ffcf33' },
  C1: { 1: '#d2b48c', 2: '#8b5a2b' },
  Cache: { 0: '#9469f7', 1: '#7729ed', 2: '#41118a', 3: '#370f74' },
};

export const isfiniteOperatorDefinition = {
  id: 'isfinite',
  label: 'Isfinite',
  createControlStates: createIsfiniteControlStates,
  dataColors,
};