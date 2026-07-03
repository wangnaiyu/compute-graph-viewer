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

const gmABCSize = 12 * 8;
const gmABCBlock = 12 * 8;
const l2AvSize = 8 * 4;

let turn = 0;
let counter = 0;
//let flag = true;//判断是否为l0-ub的第一次那就是继续回到ub，不去vector了

export const createAngle_V2ControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => {
      return "const_init";
    },
    transfer: () => {
      return { nodes: [], edges: [] };
    },
  },
  const_init:{
    next: () => "gm",
    transfer: () => {
      counter = 0;
      turn = 0;
      stateLoadData("ub", "mask", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "zero", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "nan", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "pi", ubA0Size, ubA0BlockSize);
      return { nodes: ["const_ub_init"], edges: [] };
    },
  },
  gm:{
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
  l2:{
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
      //将ub当中的缓存小初始化一波
      delete memStates.ub["A0"];
      delete memStates.ub["C0"];
      delete memStates.ub["A1"];
      delete memStates.ub["C1"];
      stateLoadData("ub", "mask", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "zero", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "nan", ubA0Size, ubA0BlockSize);
      stateLoadData("ub", "pi", ubA0Size, ubA0BlockSize);
      return { nodes: ["l2", "ub"], edges: ["ub-l2"] };
    },
  },
  ub:{
    next: () => {
      if(counter == 0){
        counter = 1;
        return "ub";
      }
      if (
        counter == 5
      ) {
        counter = 0;
        return "l2";
      }
      return "vector";
    },
    transfer: () => {
      if (!("A0" in memStates.ub) && turn == 0) {
        turn = 1;
        stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "C0", ubA0Size, ubA0BlockSize);
        stateProgress("l2", "A0");
        return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
      }

      if(counter == 1){
        if(turn == 0){
          stateProgress("ub", "A1");
        }
        else{
          stateProgress("ub", "A0");
        }
        stateProgress("ub", "zero");
        return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
      }

      if(counter == 2){
        if(turn == 0){
          stateProgress("ub", "A1");
        }
        else{
          stateProgress("ub", "A0");
        }
        stateProgress("ub", "mask");
        stateProgress("ub", "zero");
        stateProgress("ub", "pi");
        return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
      }

      if(counter == 3){
        if(turn == 0){
          stateProgress("ub", "A1");
        }
        else{
          stateProgress("ub", "A0");
        }
        //stateProgress("ub", "mask");
        return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
      }

      if(counter == 4){
        stateProgress("ub", "mask");
        stateProgress("ub", "nan");
        return { nodes: ["ub", "vector"], edges: ["ub-vector"] };
      }

      return { nodes: [], edges: [] };
    },
  },
  vector:{
    next: () => "ub",
    transfer: () => {
      if(counter == 1){
        counter = 2;
        if(turn == 1){
          stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        }
        else{
          stateLoadData("ub", "A1", ubA1Size, ubA1BlockSize);
        }
        //stateLoadData("ub", "mask", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "zero", ubA0Size, ubA0BlockSize);
        stateProgress("ub", "mask");
        return { nodes: ["ub"], edges: ["vector-ub"] };
      }

      if(counter == 2){
        counter = 3;
        if(turn == 1){
          stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        }
        else{
          stateLoadData("ub", "A1", ubA1Size, ubA1BlockSize);
        }
        stateLoadData("ub", "mask", ubA0Size, ubA0BlockSize);
        stateProgress("ub", "mask");
        stateLoadData("ub", "zero", ubA0Size, ubA0BlockSize);
        stateLoadData("ub", "pi", ubA0Size, ubA0BlockSize);
        if(turn == 1){
          stateProgress("ub", "C0");
        }
        else{
          stateProgress("ub", "C1");
        }
        return { nodes: ["ub"], edges: ["vector-ub"] };
      }

      if(counter == 3){
        counter = 4;
        if(turn == 1){
          stateLoadData("ub", "A0", ubA0Size, ubA0BlockSize);
        }
        else{
          stateLoadData("ub", "A1", ubA1Size, ubA1BlockSize);
        }
        stateProgress("ub", "mask");
        return { nodes: ["ub"], edges: ["vector-ub"] };
      }

      if(counter == 4){
        counter = 5;
        if(turn == 1){
          stateProgress("ub", "C0");
          turn = 0;
        }
        else{
          stateProgress("ub", "C1");
          turn = 1;
        }
        stateLoadData("ub", "nan", ubA0Size, ubA0BlockSize);
        return { nodes: ["ub"], edges: ["vector-ub"] };
      }
    },
  },
});

export const dataColors = {
  A0: { 0: '#ff9fb3', 1: '#ff4f7a' },
  A1: { 0: '#ff9fb3', 1: '#ff4f7a' },
  C0: { 1: '#ffeaa0', 2: '#ffcf33', 3: '#3706f9', 4: '#0f0c01' },
  C1: { 1: '#ffeaa0', 2: '#ffcf33', 3: '#3706f9', 4: '#0f0c01' },
  zero: { 0: '#52f5da', 1: '#276e63' },
  pi: { 0: '#8352f5', 1: '#4709a4' },
  nan: { 0: '#f392a4', 1: '#71424a' },
  mask: { 0: '#e7e3c0', 1: '#b7ae61' ,2: '#9a924e', 3:'#7b732a',4:'#574f0d'},
};

export const angle_v2OperatorDefinition = {
  id: 'angle_v2',
  label: 'Angle V2',
  createControlStates: createAngle_V2ControlStates,
  dataColors,
};
