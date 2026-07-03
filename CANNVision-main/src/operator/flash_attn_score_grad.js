import {
  stateRemove,
  stateProgress,
  stateLoadData,
  stateHasData,
  stateHasFinished,
  stateHasUnFinished,
  memStates,
} from './memstates';

const gmABCSize = 16 * 4;
const gmABCBlock = 16 * 4;
const l2ABSize = 16 * 4;
const l2ABBlock = 16 * 2;
const l2CSize = l2ABSize;
const l2CBlock = l2ABSize / 4;
const l1ABSize = 4 * 16;
const l1ABBlockSize = 2 * 16;
const l0aASize = 8 * 8;
const l0aABlockSize = 8 * 8;
const l0bBSize = l0aASize;
const l0bBBlockSize = l0aABlockSize;
const l0CSize = 8 * 16;
const l0CBlockSize = 8 * 16;

let totalL2AStep = 0;
let totalL2BStep = 0;
let currentL2Step = 0;
let totalL2Step = 0;

//确保vector操作只进行一次
let vec_stepId = 0; 

//第一次进入bmm3-1
let flag_bmm3_1 = true;
let flag_bmm3_2 = true;
let flag_bmm3_3 = true;

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

const stateHighlightOnly2 = (state, tag, st, len) => {
  console.log(` >>> st: ${st}`);
  console.log(` >>> len: ${len}`);
  const dataStage = memStates[state][tag].dataStage;
  const start = Math.max(0, st);
  const end = Math.min(st + len, dataStage.length);

  //dataStage.fill(0);
  if (start < end) {
    dataStage.fill(2, start, end);
  }
};

let bmm_3_1_cnt = 0;
let bmm_3_2_cnt = 0;
let bmm_4_cnt = 0;

export const createFlashAttnScoreGradControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "gm",
    transfer: () => {
        vec_stepId = 0;
        return { nodes: [], edges: [] };
    },
  },
  gm: {
    next: () => (stateHasUnFinished("gm", "dy") ? "l2" : "gm1"),
    transfer: () => {
      vec_stepId = 0;
      flag_bmm3_1 = true;
      flag_bmm3_2 = true;
      flag_bmm3_3 = true;
      bmm_3_1_cnt = 0;
      bmm_3_2_cnt = 0;
      bmm_4_cnt = 0;
      if (!stateHasData("gm", "dy")) {
        stateLoadData("gm", "dy", gmABCSize, gmABCBlock);
        stateLoadData("gm", "V", gmABCSize, gmABCBlock);
        stateLoadData("gm", "bmm1", gmABCSize, gmABCBlock);
        currentL2Step = 0;
        totalL2AStep = l2ABSize / l2ABBlock;
        totalL2BStep = l2ABSize / l2ABBlock;

        totalL2Step = totalL2AStep * totalL2BStep;
        return { nodes: ["gm"], edges: [] };
      }

      stateProgress("gm", "bmm1");
      stateRemove("l2", "dy");
      stateRemove("l2", "V");
      stateRemove("l2", "bmm1");
      return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
    },
  },
  l2: {
    next: () => {
      if (currentL2Step >= totalL2Step) return "gm";
      return "l1";
    },
    transfer: () => {
      if (!stateHasData("l2", "dy")) {
        stateProgress("gm", "dy");
        stateProgress("gm", "V");
        stateLoadData("l2", "dy", l2ABSize, l2ABBlock);
        stateLoadData("l2", "V", l2ABSize, l2ABBlock);
        stateLoadData("l2", "bmm1", l2CSize, l2CBlock);

        return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
      }

      if (stateHasFinished("l0c", "bmm1")) {
        stateProgress("l2", "bmm1");
        stateRemove("l0c", "bmm1");
        return { nodes: ["l2", "l0c"], edges: ["fixpipe-l2"] };
      }

      return { nodes: [], edges: [] };
    },
  },
  l1: {
    next: () => "l0",
    transfer: () => {
      let actL2L1 = false;
      if (!stateHasData("l1", "dy") || stateHasFinished("l1", "dy")) {
        if (currentL2Step < totalL2Step) {
          stateLoadData("l1", "dy", l1ABSize / 2, l1ABBlockSize / 2);
          stateLoadData("l1", "V", l1ABSize / 2, l1ABBlockSize / 2);

          let astep = Math.floor(currentL2Step / totalL2BStep);
          let bstep = currentL2Step % totalL2BStep;

          let aStart = astep * memStates.l2.dy.stride;
          let aLen = memStates.l2.dy.blockSize;
          let bStart = bstep * memStates.l2.V.stride;
          let bLen = memStates.l2.V.blockSize;
          stateHighlightOnly("l2", "dy", aStart, aLen);
          stateHighlightOnly("l2", "V", bStart, bLen);
          
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
      if (stateHasUnFinished("l1", "dy")) {
        stateProgress("l1", "dy");
        stateProgress("l1", "V");
        stateLoadData("l0a", "dy", 16, 16);
        stateLoadData("l0b", "V", 16, 16);
        return { nodes: ["l0a", "l0b", "l1"], edges: ["l1-l0a", "l1-l0b"] };
      }

      return { nodes: [], edges: ["l1-l0a", "l1-l0b"] };
    },
  },
  cube: {
    next: () => "l0c",
    transfer: () => {
      stateProgress("l0a", "dy");
      stateProgress("l0b", "V");
      return { nodes: ["l0a", "l0b", "cube"], edges: ["l0a-cube", "l0b-cube"] };
    },
  },
  l0c: {
    next: () => (stateHasFinished("l1", "dy") ? "fixpipe" : "l1"),
    transfer: () => {
      if (!stateHasData("l0c", "bmm1")) {
        stateLoadData("l0c", "bmm1", 16, 16);
      }         
      stateProgress("l0c", "bmm1");

      stateRemove("l0a", "dy");
      stateRemove("l0b", "V");

      return { nodes: ["l0a", "l0b", "l0c"], edges: ["cube-l0c"] };
    },
  },
  fixpipe: {
    next: () => (stateHasUnFinished("l1", "dy") ? "l1" : "l2"),
    transfer: () => {
      stateRemove("l1", "dy");
      stateRemove("l1", "V");
      return { nodes: ["l0c", "l1"], edges: ["l0c-fixpipe"] };
    },
  },
  gm1: {
    next: () => (stateHasUnFinished("gm", "K") ? "l21" : "Muls_step0"),
    transfer: () => {
      if (!stateHasData("gm", "K")) {
        stateLoadData("gm", "K", gmABCSize, gmABCBlock);
        stateLoadData("gm", "Q", gmABCSize, gmABCBlock);
        stateLoadData("gm", "bmm2", gmABCSize, gmABCBlock);
        currentL2Step = 0;
        totalL2AStep = l2ABSize / l2ABBlock;
        totalL2BStep = l2ABSize / l2ABBlock;
        totalL2Step = totalL2AStep * totalL2BStep;

        //vector_preProcess
        stateLoadData("gm", "dq", gmABCSize, gmABCBlock);
        stateLoadData("gm", "dk", gmABCSize, gmABCBlock);
        stateLoadData("gm", "dv", gmABCSize, gmABCBlock);

        return { nodes: ["gm"], edges: [] };
      }
      stateProgress("gm", "bmm2");
      stateRemove("l2", "K");
      stateRemove("l2", "Q");
      stateRemove("l2", "bmm2");
      return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
    },
  },
  l21: {
    next: () => {
      if (currentL2Step >= totalL2Step) return "gm1";
      return "l11";
    },
    transfer: () => {
      if (!stateHasData("l2", "K")) {
        stateProgress("gm", "K");
        stateProgress("gm", "Q");
        stateLoadData("l2", "K", l2ABSize, l2ABBlock);
        stateLoadData("l2", "Q", l2ABSize, l2ABBlock);
        stateLoadData("l2", "bmm2", l2CSize, l2CBlock);

        //vector操作
        if(vec_stepId == 0){
            vec_stepId = 1;
            stateLoadData("gm", "AttnIn", 16 * 4, 16 * 4);
            stateLoadData("gm", "sfmgWorkspaceGm", 16 * 4, 16 * 4);
        }

        return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
      }

      if (stateHasFinished("l0c", "bmm2")) {
        stateProgress("l2", "bmm2");
        stateRemove("l0c", "bmm2");
        return { nodes: ["l2", "l0c"], edges: ["fixpipe-l2"] };
      }
      return { nodes: [], edges: [] };
    },
  },
  l11: {
    next: () => "l01",
    transfer: () => {
      if(vec_stepId == 9){
        //console.log("l11!!!");
      }

      let actL2L1 = false;
      if (!stateHasData("l1", "K") || stateHasFinished("l1", "K")) {
        if (currentL2Step < totalL2Step) {
          stateLoadData("l1", "K", l1ABSize / 2, l1ABBlockSize / 2);
          stateLoadData("l1", "Q", l1ABSize / 2, l1ABBlockSize / 2);

          let astep = Math.floor(currentL2Step / totalL2BStep);
          let bstep = currentL2Step % totalL2BStep;
          let aStart = astep * memStates.l2.K.stride;
          let aLen = memStates.l2.K.blockSize;
          let bStart = bstep * memStates.l2.Q.stride;
          let bLen = memStates.l2.Q.blockSize;

          stateHighlightOnly("l2", "K", aStart, aLen);
          stateHighlightOnly("l2", "Q", bStart, bLen);
          
          actL2L1 = true;
          currentL2Step++;
        }
      }

      if(vec_stepId == 1){
          console.log("Vec_StepID is ", vec_stepId);
          vec_stepId = 2;
          stateProgress("gm", "AttnIn");
          stateProgress("gm", "dy");
          stateLoadData("l2", "AttnIn", 16 * 4, 16 * 2);
          stateLoadData("l2", "dy", 16 * 4, 16 * 2);
          stateLoadData("l2", "outBuf", 16 * 4, 16 * 2);
          return { 
            nodes: ["l2", "l1", "l0c", "gm"], 
            edges: actL2L1 ? ["l2-l1", "gm-l2"] : ["gm-l2"],
        };
      }

      //vector操作部分
      if(vec_stepId == 5){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 6;
        //修改删除并下移
        //Cast操作结束
        stateProgress("ub", "sfmgClc1");
        stateProgress("ub", "sfmgClc2");
        return {
            nodes: ["l2", "l1", "l0c", "ub"],
            edges: actL2L1 ? ["l2-l1", "vector-ub"] : ["vector-ub"],
        };
      }

      if(vec_stepId == 10){
        console.log("l11!!!");
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 11;
        return {
            nodes: ["l2", "l1", "l0c", "vector"],
            edges: actL2L1 ? ["l2-l1"] : [],
        };
      }

      if(vec_stepId == 14){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 15;
        
        stateProgress("ub", "outBuf");

        return {
            nodes: ["l2", "l1", "l0c", "ub"],
            edges: actL2L1 ? ["l2-l1", "vector-ub"] : ["vector-ub"],
        };
      }

      return {
        nodes: ["l2", "l1", "l0c"],
        edges: actL2L1 ? ["l2-l1"] : [],
      };
    },
  },
  l01: {
    next: () => "cube1",
    transfer: () => {
      if (stateHasUnFinished("l1", "K")) {
        stateProgress("l1", "K");
        stateProgress("l1", "Q");
        stateLoadData("l0a", "K", l0aASize / 5 * 2, l0aABlockSize / 5 * 2);
        stateLoadData("l0b", "Q", l0bBSize / 5 * 2, l0bBBlockSize / 5 * 2);

        //vector操作
        if(vec_stepId == 2){
            console.log("Vec_StepID is ", vec_stepId);
            vec_stepId = 3;
            stateProgress("l2", "AttnIn");
            stateProgress("l2", "dy");
            stateLoadData("ub", "AttnIn", 16 * 2, 16 * 2);
            stateLoadData("ub", "dy", 16 * 2, 16 * 2);
            stateLoadData("ub", "sfmgClc1", 16 * 2, 16 * 2);
            stateLoadData("ub", "sfmgClc2", 16 * 2, 16 * 2);
            stateLoadData("ub", "outBuf", 16 * 2, 16 * 2);
            return { nodes: ["l0a", "l0b", "l1", "ub", "l2"], edges: ["l1-l0a", "l1-l0b", "l2-ub"] };
        }

        if(vec_stepId == 6){
            vec_stepId = 7;
            stateProgress("ub", "sfmgClc1");
            stateProgress("ub", "sfmgClc2");
            return { nodes: ["l0a", "l0b", "l1", "ub"], edges: ["l1-l0a", "l1-l0b", "ub-vector"] };
        }

        if(vec_stepId == 11){
            console.log("Vec_StepID is ", vec_stepId);
            vec_stepId = 12;
            stateProgress("ub", "sfmgClc1");
            stateProgress("ub", "sfmgClc2");

            return { 
                nodes: ["l0a", "l0b", "l1", "ub"], 
                edges: ["l1-l0a", "l1-l0b", "vector-ub"] 
            };
        }

        if(vec_stepId == 15){
            console.log("Vec_StepID is ", vec_stepId);
            vec_stepId = 16;

            stateProgress("l2", "outBuf");

            memStates["ub"] = {};

            return { 
                nodes: ["l0a", "l0b", "l1", "ub", "l2"], 
                edges: ["l1-l0a", "l1-l0b", "ub-l2"] 
            };
        }

        return { nodes: ["l0a", "l0b", "l1"], edges: ["l1-l0a", "l1-l0b"] };
      }

    if(vec_stepId == 6){
        vec_stepId = 7;
        stateProgress("ub", "sfmgClc1");
        stateProgress("ub", "sfmgClc2");
        return { nodes: ["l0a", "l0b", "l1", "ub"], edges: ["l1-l0a", "l1-l0b", "ub-vector"] };
    }

      return { nodes: [], edges: ["l1-l0a", "l1-l0b"] };
    },
  },
  cube1: {
    next: () => "l0c1",
    transfer: () => {
      stateProgress("l0a", "K");
      stateProgress("l0b", "Q");

      //vector操作
      if(vec_stepId == 3){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 4;
        stateProgress("ub", "AttnIn");
        stateProgress("ub", "dy");
        return { nodes: ["l0a", "l0b", "cube", "ub"], edges: ["l0a-cube", "l0b-cube", "ub-vector"] };
      }

      if(vec_stepId == 7){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 8;
        return { nodes: ["l0a", "l0b", "cube", "vector"], edges: ["l0a-cube", "l0b-cube"] };
      }

      if(vec_stepId == 12){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 13;

        stateProgress("ub", "sfmgClc1");
        stateProgress("ub", "sfmgClc2");
        
        return { 
            nodes: ["l0a", "l0b", "cube", "ub"], 
            edges: ["l0a-cube", "l0b-cube", "ub-vector"] 
        };
      }

      if(vec_stepId == 16){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 17;

        stateProgress("gm", "sfmgWorkspaceGm");

        memStates["l2"]["outBuf"] = {};
        memStates["l2"]["dy"] = {};
        memStates["l2"]["AttnIn"] = {};

        return { nodes: ["l0a", "l0b", "cube", "l2", "gm"], edges: ["l0a-cube", "l0b-cube", "l2-gm"] };
      }

      return { nodes: ["l0a", "l0b", "cube"], edges: ["l0a-cube", "l0b-cube"] };
    },
  },
  l0c1: {
    next: () => (stateHasFinished("l1", "K") ? "fixpipe1" : "l11"),
    transfer: () => {
      if (!stateHasData("l0c", "bmm2")) {
        stateLoadData("l0c", "bmm2", 16 , 16);
      }

      stateProgress("l0c", "bmm2");
      stateRemove("l0a", "K");
      stateRemove("l0b", "Q");

      //vector操作
      if(vec_stepId == 4){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 5;
        return { nodes: ["l0a", "l0b", "l0c", "vector"], edges: ["cube-l0c"] };
      }

      if(vec_stepId == 8){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 9;
        //双缓存的体现，这时候已经拿到下一批的“AttnIn"和"dy"了
        stateLoadData("ub", "AttnIn", 16 * 2, 16 * 2);
        stateLoadData("ub", "dy", 16 * 2, 16 * 2);
        stateLoadData("ub", "sfmgClc1", 16 * 2, 16 * 2);
        stateLoadData("ub", "sfmgClc2", 16 * 2, 16 * 2);
        stateLoadData("ub", "dy", 16 * 2, 16 * 2);
        //结果放到outbuf里面去，下一回合放到l2里面
        stateProgress("ub", "outBuf");

        return { 
            nodes: ["l0a", "l0b", "l0c", "ub"], 
            edges: ["cube-l0c", "l2-ub", "vector-ub"] 
        };
      }

      if(vec_stepId == 13){
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 14;

        return { 
            nodes: ["l0a", "l0b", "l0c", "vector"], 
            edges: ["cube-l0c"] 
        };
      }

      return { nodes: ["l0a", "l0b", "l0c"], edges: ["cube-l0c"] };
    },
  },
  fixpipe1: {
    next: () => (stateHasUnFinished("l1", "K") ? "l11" : "l21"),
    transfer: () => {
      if(vec_stepId == 9){
        console.log("fixPipe!!!");
        console.log("Vec_StepID is ", vec_stepId);
        vec_stepId = 10;

        stateProgress("ub", "AttnIn");
        stateProgress("ub", "dy");

        //stateLoadData("l2", "outBuf", 16 * 4, 16 * 2);
        stateLoadData("ub", "outBuf", 16 * 2, 16 * 2);
        stateProgress("l2", "outBuf");

        return { 
            nodes: ["l0c", "l1", "ub", "l2"], 
            edges: ["l0c-fixpipe", "ub-vector", "ub-l2", "l2-vector"] 
        };
      }
      stateRemove("l1", "K");
      stateRemove("l1", "Q");
      return { 
        nodes: ["l0c", "l1"], 
        edges: ["l0c-fixpipe"] 
    };
    },
  },
  Muls_step0: {
    next: () => "Muls_step1",
    transfer: () => {
        stateLoadData("gm", "softMax_l", 16 * 4, 16 * 4);

        return { 
            nodes: ["gm"], 
            edges: [] 
        };
    },
  },
  Muls_step1: {
    next: () => "Muls_step2",
    transfer: () => {
        stateProgress("gm", "bmm2");

        stateLoadData("l2", "vecClc2Buffer", 16 * 4, 16 * 4);

        return { 
            nodes: ["gm", "l2"], 
            edges: ["gm-l2"] 
        };
    },
  },
  Muls_step2: {
    next: () => "Muls_step3",
    transfer: () => {
        stateProgress("l2", "vecClc2Buffer");

        stateLoadData("ub", "vecClc2Buffer", 16 * 4, 16 * 1);

        return { 
            nodes: ["l2", "ub"], 
            edges: ["l2-ub"] 
        };
    },
  },
  Muls_step3: {
    next: () => "Muls_step4",
    transfer: () => {
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  Muls_step4: {
    next: () => "Muls_step5",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  Muls_step5: {
    next: () => "softmax_step0",
    transfer: () => {
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");
        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  softmax_step0: {
    next: () => "softmax_step1",
    transfer: () => {
        stateLoadData("ub", "p", 16 * 4, 16 * 1);

        return { 
            nodes: ["ub"], 
            edges: [] 
        };
    },
  },
  softmax_step1: {
    next: () => "softmax_step2",
    transfer: () => {
        stateProgress("gm", "softMax_l");

        stateLoadData("l2", "softMax_l", 16 * 4, 16 * 4);

        return { 
            nodes: ["gm", "l2"], 
            edges: ["gm-l2"] 
        };
    },
  },
  softmax_step2: {
    next: () => "softmax_step3",
    transfer: () => {
        stateProgress("l2", "softMax_l");

        stateLoadData("ub", "softMax_l", 16 * 4, 16 * 1);

        return { 
            nodes: ["ub", "l2"], 
            edges: ["l2-ub"] 
        };
    },
  },
  softmax_step3: {
    next: () => "softmax_step4",
    transfer: () => {
        stateProgress("ub", "softMax_l");

        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  softmax_step4: {
    next: () => "softmax_step5",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  softmax_step5: {
    next: () => "softmax_step6",
    transfer: () => {
        stateProgress("ub", "p");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  softmax_step6: {
    next: () => "softmax_step7",
    transfer: () => {
        stateProgress("ub", "softMax_l");

        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  softmax_step7: {
    next: () => "softmax_step8",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  softmax_step8: {
    next: () => "softmax_step9",
    transfer: () => {
        stateProgress("ub", "p");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  softmax_step9: {
    next: () => "softmax_step10",
    transfer: () => {
        stateProgress("ub", "softMax_l");

        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  softmax_step10: {
    next: () => "softmax_step11",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  softmax_step11: {
    next: () => "softmax_step12",
    transfer: () => {
        stateProgress("ub", "p");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  softmax_step12: {
    next: () => "softmax_step13",
    transfer: () => {
        stateProgress("ub", "softMax_l");

        stateProgress("ub", "vecClc2Buffer");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  softmax_step13: {
    next: () => "softmax_step14",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  softmax_step14: {
    next: () => "drop_Work_step1",
    transfer: () => {
        stateProgress("ub", "p");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  drop_Work_step1: {
    next: () => "drop_Work_step2",
    transfer: () => {
        memStates["ub"]["vecClc2Buffer"] = {};
        memStates["ub"]["softMax_l"] = {};

        stateLoadData("l2", "p", 16 * 4, 16 * 4);

        stateProgress("ub", "p");
        stateProgress("ub", "p");
        stateProgress("ub", "p");
        stateProgress("ub", "p");

        return { 
            nodes: ["ub", "l2"], 
            edges: ["ub-l2"] 
        };
    },
  },
  drop_Work_step2: {
    next: () => "ds_step1",
    transfer: () => {
        stateProgress("l2", "p");

        stateLoadData("gm", "dropWorkSpace", 16 * 4, 16 * 4);

        stateProgress("gm", "dropWorkSpace");

        memStates["l2"] = {};

        return { 
            nodes: ["gm", "l2"], 
            edges: ["l2-gm"] 
        };
    },
  },
  ds_step1: {
    next: () => "ds_step2",
    transfer: () => {
        stateProgress("gm", "bmm1");
        stateProgress("gm", "sfmgWorkspaceGm");

        stateLoadData("l2", "bmm1", 16 * 4, 16 * 4);
        stateLoadData("l2", "sfmgWorkspaceGm", 16 * 4, 16 * 4);

        return { 
            nodes: ["gm", "l2"], 
            edges: ["gm-l2"] 
        };
    },
  },
  ds_step2: {
    next: () => "ds_step3",
    transfer: () => {
        stateProgress("l2", "bmm1");
        stateProgress("l2", "sfmgWorkspaceGm");

        stateLoadData("ub", "bmm1", 16 * 4, 16 * 1);
        stateLoadData("ub", "sfmgWorkspaceGm", 16 * 4, 16 * 1);

        return { 
            nodes: ["ub", "l2"], 
            edges: ["l2-ub"] 
        };
    },
  },
  ds_step3: {
    next: () => "ds_step4",
    transfer: () => {
        stateProgress("l2", "bmm1");
        stateProgress("l2", "sfmgWorkspaceGm");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  ds_step4: {
    next: () => "ds_step5",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_step5: {
    next: () => "ds_step6",
    transfer: () => {
        console.log("1-16高亮");
        stateHighlightOnly2("ub", "bmm1", 0, 16);

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_step6: {
    next: () => "ds_step7",
    transfer: () => {
        stateProgress("l2", "bmm1");
        stateProgress("l2", "sfmgWorkspaceGm");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  ds_step7: {
    next: () => "ds_step8",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_step8: {
    next: () => "ds_step9",
    transfer: () => {
        console.log("16-31高亮");
        stateHighlightOnly2("ub", "bmm1", 16, 16);

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_step9: {
    next: () => "ds_step10",
    transfer: () => {
        stateProgress("l2", "bmm1");
        stateProgress("l2", "sfmgWorkspaceGm");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  ds_step10: {
    next: () => "ds_step11",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_step11: {
    next: () => "ds_step12",
    transfer: () => {
        console.log("32-47高亮");
        stateHighlightOnly2("ub", "bmm1", 32, 16);

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_step12: {
    next: () => "ds_step13",
    transfer: () => {
        stateProgress("l2", "bmm1");
        stateProgress("l2", "sfmgWorkspaceGm");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  ds_step13: {
    next: () => "ds_step14",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_step14: {
    next: () => "ds_step15",
    transfer: () => {
        console.log("48-63高亮");
        stateHighlightOnly2("ub", "bmm1", 48, 16);

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_step15: {
    next: () => "ds_step16",
    transfer: () => {
        stateProgress("ub", "p");
        stateProgress("ub", "p");
        stateProgress("ub", "p");
        stateProgress("ub", "p");

        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");

        return { 
            nodes: ["ub"], 
            edges: ["ub-vector"] 
        };
    },
  },
  ds_step16: {
    next: () => "ds_step17",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_step17: {
    next: () => "ds_cast1",
    transfer: () => {
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_cast1: {
    next: () => "ds_cast2",
    transfer: () => {
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_cast2: {
    next: () => "ds_cast3",
    transfer: () => {
        return { 
            nodes: ["vector"], 
            edges: [] 
        };
    },
  },
  ds_cast3: {
    next: () => "ds_cast4",
    transfer: () => {
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");
        stateProgress("ub", "bmm1");

        return { 
            nodes: ["ub"], 
            edges: ["vector-ub"] 
        };
    },
  },
  ds_cast4: {
    next: () => "ds_cast5",
    transfer: () => {
        stateProgress("l2", "bmm1");

        memStates["ub"] = {};

        return { 
            nodes: ["l2", "ub"], 
            edges: ["ub-l2"] 
        };
    },
  },
  ds_cast5: {
    next: () => "gm_3_1",
    transfer: () => {
        stateProgress("gm", "bmm1");

        memStates["l2"] = {};

        return { 
            nodes: ["gm", "l2"], 
            edges: ["l2-gm"] 
        };
    },
  },
  gm_3_1: {
    next: () => {
        if(bmm_3_1_cnt == 4){
            return "final";
        }
        return "l2_3_1";
    },
    transfer: () => {
        if(bmm_3_1_cnt == 0){
            bmm_3_1_cnt = 1;
            stateProgress("gm", "bmm1");
            stateProgress("gm", "K");

            stateLoadData("l2", "bmm1", 16 * 4, 16 * 2);
            stateLoadData("l2", "K", 16 * 4, 16 * 2);

            stateLoadData("l2", "bmm3_1", 16 * 4, 16);

            return { 
                nodes: ["gm", "l2"], 
                edges: ["gm-l2"] 
            };
        }
    },
  },
  l2_3_1: {
    next: () => {
        if(bmm_3_1_cnt == 1){
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 3){
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 5){
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 7){
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 9){
            return "gm_3_2";
        }
    },
    transfer: () => {
        console.log("Bmm_3_1 is ", bmm_3_1_cnt);

        if(bmm_3_1_cnt == 1){
            stateHighlightOnly("l2", "bmm1", 0, 32);
            stateHighlightOnly("l2", "K", 0, 32);

            stateLoadData("l1", "bmm1", 16 * 2, 16);
            stateLoadData("l1", "K", 16 * 2, 16);

            return { 
                nodes: ["l1", "l2", "l0c"], 
                edges: ["l2-l1"]
            };
        }

        if(bmm_3_1_cnt == 3){
            stateHighlightOnly("l2", "bmm1", 0, 32);
            stateHighlightOnly("l2", "K", 32, 32);

            stateLoadData("l1", "bmm1", 16 * 2, 16);
            stateLoadData("l1", "K", 16 * 2, 16);

            return { 
                nodes: ["l1", "l2"], 
                edges: ["l2-l1"]
            };
        }

        if(bmm_3_1_cnt == 5){
            stateHighlightOnly("l2", "bmm1", 32, 32);
            stateHighlightOnly("l2", "K", 0, 32);

            stateLoadData("l1", "bmm1", 16 * 2, 16);
            stateLoadData("l1", "K", 16 * 2, 16);

            return { 
                nodes: ["l1", "l2"], 
                edges: ["l2-l1"]
            };
        }

        if(bmm_3_1_cnt == 7){
            stateHighlightOnly("l2", "bmm1", 32, 32);
            stateHighlightOnly("l2", "K", 32, 32);

            stateLoadData("l1", "bmm1", 16 * 2, 16);
            stateLoadData("l1", "K", 16 * 2, 16);

            return { 
                nodes: ["l1", "l2"], 
                edges: ["l2-l1"]
            };
        }

        stateLoadData("gm", "dqWorkSpace", 16 * 4, 16 * 4);

        memStates["l2"] = {};

        return { 
            nodes: ["gm", "l2"], 
            edges: ["l2-gm"]
        };
    },
  },
  l1_3_1: {
    next: () => {
        return "l0_3_1";
    },
    transfer: () => {
        stateProgress("l1", "bmm1");
        stateProgress("l1", "K");

        stateLoadData("l0a", "bmm1", 16, 16);
        stateLoadData("l0b", "K", 16, 16);

        return { 
            nodes: ["l1", "l0a", "l0b"], 
            edges: ["l1-l0a", "l1-l0b"]
        };
    },
  },
  l0_3_1: {
    next: () => {
        return "cube_3_1";
    },
    transfer: () => {
        stateProgress("l0a", "bmm1");
        stateProgress("l0b", "K");

        return { 
            nodes: ["l1", "l0a"], 
            edges: ["l0a-cube", "l0b-cube"]
        };
    }
  },
  cube_3_1: {
    next: () => {
        return "l0c_3_1";
    },
    transfer: () => {
        if(bmm_3_1_cnt == 1){
            stateLoadData("l0c", "bmm3_1", 16, 16);
        }

        if(bmm_3_1_cnt == 3){
            stateLoadData("l0c", "bmm3_1", 16, 16);
        }

        if(bmm_3_1_cnt == 5){
            stateLoadData("l0c", "bmm3_1", 16, 16);
        }

        if(bmm_3_1_cnt == 7){
            stateLoadData("l0c", "bmm3_1", 16, 16);
        }

        stateRemove("l0a", "bmm1");
        stateRemove("l0b", "K");

        return { 
            nodes: ["cube", "l0c", "l0a", "l0b"], 
            edges: []
        };
    },
  },
  l0c_3_1: {
    next: () => {
        console.log("bmm3_1_cnt is ", bmm_3_1_cnt);
        if(bmm_3_1_cnt == 1){
            bmm_3_1_cnt = 2;
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 2){
            bmm_3_1_cnt = 3;
            return "fixpipe_3_1";
        }
        if(bmm_3_1_cnt == 3){
            bmm_3_1_cnt = 4;
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 4){
            bmm_3_1_cnt = 5;
            return "fixpipe_3_1";
        }
        if(bmm_3_1_cnt == 5){
            bmm_3_1_cnt = 6;
            return "l1_3_1";
        }
        if(bmm_3_1_cnt == 6){
            bmm_3_1_cnt = 7;
            return "fixpipe_3_1";
        }
        if(bmm_3_1_cnt == 7){
            bmm_3_1_cnt = 8;
            return "l1_3_1";
        }

        if(bmm_3_1_cnt == 8){
            bmm_3_1_cnt = 9;
            return "fixpipe_3_1";
        }
    },
    transfer: () => {
        stateProgress("l0c", "bmm3_1");

        return { 
            nodes: ["l0c"], 
            edges: ["cube-l0c"]
        };
    },
  },
  fixpipe_3_1: {
    next: () => {
        return "fixpipe_3_1_1";
    },
    transfer: () => {
        return { 
            nodes: [], 
            edges: ["l0c-fixpipe"]
        };
    }
  },
  fixpipe_3_1_1: {
    next: () => {
        if(bmm_3_1_cnt == 3){
            return "l2_3_1";
        }
        if(bmm_3_1_cnt == 5){
            return "l2_3_1";
        }
        if(bmm_3_1_cnt == 7){
            return "l2_3_1";
        }
        if(bmm_3_1_cnt == 9){
            return "l2_3_1";
        }
    },
    transfer: () => {
        stateProgress("l2", "bmm3_1");

        memStates["l0c"] = {};

        memStates["l1"] = {};

        return { 
            nodes: ["l2", "l0c", "l1"], 
            edges: ["fixpipe-l2"]
        };
    }
  },
    gm_3_2: {
        next: () => {
            if (bmm_3_2_cnt == 4) {
                return "final";
            }
            return "l2_3_2";
        },
        transfer: () => {
            if (bmm_3_2_cnt == 0) {
                bmm_3_2_cnt = 1;
                stateProgress("gm", "bmm1");   // 左矩阵仍然是 ds
                stateProgress("gm", "Q");      // 右矩阵改为 Q

                stateLoadData("l2", "bmm1", 16 * 4, 16 * 2);
                stateLoadData("l2", "Q", 16 * 4, 16 * 2);
                stateLoadData("l2", "bmm3_2", 16 * 4, 16);   // 输出改为 bmm3_2

                return { 
                    nodes: ["gm", "l2"], 
                    edges: ["gm-l2"] 
                };
            }
        },
    },

    l2_3_2: {
        next: () => {
            if (bmm_3_2_cnt == 1) return "l1_3_2";
            if (bmm_3_2_cnt == 3) return "l1_3_2";
            if (bmm_3_2_cnt == 5) return "l1_3_2";
            if (bmm_3_2_cnt == 7) return "l1_3_2";
            if (bmm_3_2_cnt == 9) return "gm_4";
        },
        transfer: () => {
            console.log("Bmm_3_2 is ", bmm_3_2_cnt);

            if (bmm_3_2_cnt == 1) {
                stateHighlightOnly("l2", "bmm1", 0, 32);
                stateHighlightOnly("l2", "Q", 0, 32);
                stateLoadData("l1", "bmm1", 16 * 2, 16);
                stateLoadData("l1", "Q", 16 * 2, 16);
                return { nodes: ["l1", "l2", "l0c"], edges: ["l2-l1"] };
            }
            if (bmm_3_2_cnt == 3) {
                stateHighlightOnly("l2", "bmm1", 0, 32);
                stateHighlightOnly("l2", "Q", 32, 32);
                stateLoadData("l1", "bmm1", 16 * 2, 16);
                stateLoadData("l1", "Q", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }
            if (bmm_3_2_cnt == 5) {
                stateHighlightOnly("l2", "bmm1", 32, 32);
                stateHighlightOnly("l2", "Q", 0, 32);
                stateLoadData("l1", "bmm1", 16 * 2, 16);
                stateLoadData("l1", "Q", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }
            if (bmm_3_2_cnt == 7) {
                stateHighlightOnly("l2", "bmm1", 32, 32);
                stateHighlightOnly("l2", "Q", 32, 32);
                stateLoadData("l1", "bmm1", 16 * 2, 16);
                stateLoadData("l1", "Q", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }

            // 最后一块完成时，把最终结果搬到 dk 输出
            stateLoadData("gm", "dkWorkSpace", 16 * 4, 16 * 4);

            memStates["l2"] = {};
            
            return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
        },
    },

    l1_3_2: {
        next: () => "l0_3_2",
        transfer: () => {
            stateProgress("l1", "bmm1");
            stateProgress("l1", "Q");
            stateLoadData("l0a", "bmm1", 16, 16);
            stateLoadData("l0b", "Q", 16, 16);
            return { nodes: ["l1", "l0a", "l0b"], edges: ["l1-l0a", "l1-l0b"] };
        },
    },

    l0_3_2: {
        next: () => "cube_3_2",
        transfer: () => {
            stateProgress("l0a", "bmm1");
            stateProgress("l0b", "Q");
            return { nodes: ["l1", "l0a"], edges: ["l0a-cube", "l0b-cube"] };
        },
    },

    cube_3_2: {
        next: () => "l0c_3_2",
        transfer: () => {
            // 每个子块第一次进入时在 L0C 中分配输出空间
            if (bmm_3_2_cnt == 1) stateLoadData("l0c", "bmm3_2", 16, 16);
            if (bmm_3_2_cnt == 3) stateLoadData("l0c", "bmm3_2", 16, 16);
            if (bmm_3_2_cnt == 5) stateLoadData("l0c", "bmm3_2", 16, 16);
            if (bmm_3_2_cnt == 7) stateLoadData("l0c", "bmm3_2", 16, 16);

            stateRemove("l0a", "bmm1");
            stateRemove("l0b", "Q");

            return { nodes: ["cube", "l0c", "l0a", "l0b"], edges: [] };
        },
    },

    l0c_3_2: {
        next: () => {
            console.log("bmm3_2_cnt is ", bmm_3_2_cnt);
            if (bmm_3_2_cnt == 1) { 
                bmm_3_2_cnt = 2; 
                return "l1_3_2"; 
            }
            if (bmm_3_2_cnt == 2) { 
                bmm_3_2_cnt = 3; 
                return "fixpipe_3_2"; 
            }
            if (bmm_3_2_cnt == 3) { 
                bmm_3_2_cnt = 4; 
                return "l1_3_2"; 
            }
            if (bmm_3_2_cnt == 4) { 
                bmm_3_2_cnt = 5; 
                return "fixpipe_3_2"; 
            }
            if (bmm_3_2_cnt == 5) { 
                bmm_3_2_cnt = 6; 
                return "l1_3_2"; 
            }
            if (bmm_3_2_cnt == 6) { 
                bmm_3_2_cnt = 7; 
                return "fixpipe_3_2"; 
            }
            if (bmm_3_2_cnt == 7) { 
                bmm_3_2_cnt = 8; 
                return "l1_3_2"; 
            }
            if (bmm_3_2_cnt == 8) { 
                bmm_3_2_cnt = 9; 
                return "fixpipe_3_2"; 
            }
        },
        transfer: () => {
            stateProgress("l0c", "bmm3_2");
            return { 
                nodes: ["l0c"], 
                edges: ["cube-l0c"] 
            };
        },
    },

    fixpipe_3_2: {
        next: () => "fixpipe_3_2_1",
        transfer: () => {
            return { nodes: [], edges: ["l0c-fixpipe"] };
        },
    },

    fixpipe_3_2_1: {
        next: () => {
            if (bmm_3_2_cnt == 3) return "l2_3_2";
            if (bmm_3_2_cnt == 5) return "l2_3_2";
            if (bmm_3_2_cnt == 7) return "l2_3_2";
            if (bmm_3_2_cnt == 9) return "l2_3_2";
        },
        transfer: () => {
            stateProgress("l2", "bmm3_2");
            memStates["l0c"] = {};
            memStates["l1"] = {};
            return { nodes: ["l2", "l0c", "l1"], edges: ["fixpipe-l2"] };
        },
    },
    gm_4: {
        next: () => {
            if (bmm_4_cnt == 4) {
                return "final";
            }
            return "l2_4";
        },
        transfer: () => {
            if (bmm_4_cnt == 0) {
                bmm_4_cnt = 1;
                stateProgress("gm", "dropWorkSpace");   // 左矩阵：P
                stateProgress("gm", "dy");              // 右矩阵：dy

                stateLoadData("l2", "dropWorkSpace", 16 * 4, 16 * 2);
                stateLoadData("l2", "dy", 16 * 4, 16 * 2);
                stateLoadData("l2", "dv", 16 * 4, 16);   // 输出：dv

                return { 
                    nodes: ["gm", "l2"], 
                    edges: ["gm-l2"] 
                };
            }
        },
    },

    l2_4: {
        next: () => {
            if (bmm_4_cnt == 1) return "l1_4";
            if (bmm_4_cnt == 3) return "l1_4";
            if (bmm_4_cnt == 5) return "l1_4";
            if (bmm_4_cnt == 7) return "l1_4";
            if (bmm_4_cnt == 9) return "dq_step1";
        },
        transfer: () => {
            console.log("Bmm_4 is ", bmm_4_cnt);

            if (bmm_4_cnt == 1) {
                stateHighlightOnly("l2", "dropWorkSpace", 0, 32);
                stateHighlightOnly("l2", "dy", 0, 32);
                stateLoadData("l1", "dropWorkSpace", 16 * 2, 16);
                stateLoadData("l1", "dy", 16 * 2, 16);
                return { nodes: ["l1", "l2", "l0c"], edges: ["l2-l1"] };
            }
            if (bmm_4_cnt == 3) {
                stateHighlightOnly("l2", "dropWorkSpace", 0, 32);
                stateHighlightOnly("l2", "dy", 32, 32);
                stateLoadData("l1", "dropWorkSpace", 16 * 2, 16);
                stateLoadData("l1", "dy", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }
            if (bmm_4_cnt == 5) {
                stateHighlightOnly("l2", "dropWorkSpace", 32, 32);
                stateHighlightOnly("l2", "dy", 0, 32);
                stateLoadData("l1", "dropWorkSpace", 16 * 2, 16);
                stateLoadData("l1", "dy", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }
            if (bmm_4_cnt == 7) {
                stateHighlightOnly("l2", "dropWorkSpace", 32, 32);
                stateHighlightOnly("l2", "dy", 32, 32);
                stateLoadData("l1", "dropWorkSpace", 16 * 2, 16);
                stateLoadData("l1", "dy", 16 * 2, 16);
                return { nodes: ["l1", "l2"], edges: ["l2-l1"] };
            }

            // 最后一块完成时，把最终结果搬到 dv 输出
            stateLoadData("gm", "dv", 16 * 4, 16 * 4);

            memStates["l2"] = {};
            
            return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
        },
    },

    l1_4: {
        next: () => "l0_4",
        transfer: () => {
            stateProgress("l1", "dropWorkSpace");
            stateProgress("l1", "dy");
            stateLoadData("l0a", "dropWorkSpace", 16, 16);
            stateLoadData("l0b", "dy", 16, 16);
            return { nodes: ["l1", "l0a", "l0b"], edges: ["l1-l0a", "l1-l0b"] };
        },
    },

    l0_4: {
        next: () => "cube_4",
        transfer: () => {
            stateProgress("l0a", "dropWorkSpace");
            stateProgress("l0b", "dy");
            return { nodes: ["l1", "l0a"], edges: ["l0a-cube", "l0b-cube"] };
        },
    },

    cube_4: {
        next: () => "l0c_4",
        transfer: () => {
            // 每个子块第一次进入时在 L0C 中分配输出空间
            if (bmm_4_cnt == 1) {
                stateLoadData("l0c", "dv", 16, 16);
            }
            if (bmm_4_cnt == 3) {
                stateLoadData("l0c", "dv", 16, 16);
            }
            if (bmm_4_cnt == 5) {
                stateLoadData("l0c", "dv", 16, 16);
            }
            if (bmm_4_cnt == 7) {
                stateLoadData("l0c", "dv", 16, 16);
            }

            stateRemove("l0a", "dropWorkSpace");
            stateRemove("l0b", "dy");

            return { nodes: ["cube", "l0c", "l0a", "l0b"], edges: [] };
        },
    },

    l0c_4: {
        next: () => {
            console.log("bmm_4_cnt is ", bmm_4_cnt);
            if (bmm_4_cnt == 1) { 
                bmm_4_cnt = 2; 
                return "l1_4"; 
            }
            if (bmm_4_cnt == 2) { 
                bmm_4_cnt = 3; 
                return "fixpipe_4"; 
            }
            if (bmm_4_cnt == 3) { 
                bmm_4_cnt = 4; 
                return "l1_4"; 
            }
            if (bmm_4_cnt == 4) { 
                bmm_4_cnt = 5; 
                return "fixpipe_4"; 
            }
            if (bmm_4_cnt == 5) { 
                bmm_4_cnt = 6; 
                return "l1_4"; 
            }
            if (bmm_4_cnt == 6) { 
                bmm_4_cnt = 7; 
                return "fixpipe_4"; 
            }
            if (bmm_4_cnt == 7) { 
                bmm_4_cnt = 8; 
                return "l1_4"; 
            }
            if (bmm_4_cnt == 8) { 
                bmm_4_cnt = 9; 
                return "fixpipe_4"; 
            }
        },
        transfer: () => {
            stateProgress("l0c", "dv");
            return { 
                nodes: ["l0c"], 
                edges: ["cube-l0c"] 
            };
        },
    },

    fixpipe_4: {
        next: () => "fixpipe_4_1",
        transfer: () => {
            return { nodes: [], edges: ["l0c-fixpipe"] };
        },
    },

    fixpipe_4_1: {
        next: () => {
            if (bmm_4_cnt == 3) {
                return "l2_4";
            }
            if (bmm_4_cnt == 5) {
                return "l2_4";
            }
            if (bmm_4_cnt == 7) {
                return "l2_4";
            }
            if (bmm_4_cnt == 9) {
                return "l2_4";
            }
        },
        transfer: () => {
            stateProgress("l2", "dv");
            memStates["l0c"] = {};
            memStates["l1"] = {};
            return { nodes: ["l2", "l0c", "l1"], edges: ["fixpipe-l2"] };
        },
    },
    dq_step1: {
        next: () => {
            return "dq_step2";
        },
        transfer: () => {
            stateProgress("gm", "dqWorkSpace");
            
            stateLoadData("l2", "dqWorkSpace", 16 * 4, 16 * 4);
            stateLoadData("l2", "dq", 16 * 4, 16 * 4);

            return { 
                nodes: ["gm", "l2"], 
                edges: ["gm-l2"] 
            };
        }
    },
    dq_step2: {
        next: () => {
            return "dq_step3";
        },
        transfer: () => {
            stateProgress("l2", "dqWorkSpace");

            stateLoadData("ub", "dqWorkSpace", 16 * 4, 16);
            stateLoadData("ub", "dq", 16 * 4, 16);

            return { 
                nodes: ["ub", "l2"], 
                edges: ["l2-ub"] 
            };
        },
    },
    dq_step3: {
        next: () => {
            return "dq_step4";
        },
        transfer: () => {
            stateProgress("ub", "dqWorkSpace");

            return { 
                nodes: ["ub"], 
                edges: ["ub-vector"] 
            };
        },
    },
    dq_step4: {
        next: () => {
            return "dq_step5";
        },
        transfer: () => {
            return { 
                nodes: ["vector"], 
                edges: [] 
            };
        },
    },
    dq_step5: {
        next: () => {
            return "dq_step6";
        },
        transfer: () => {
            stateProgress("ub", "dq");

            return { 
                nodes: ["ub"], 
                edges: ["vector-ub"] 
            };
        },
    },
    dq_step6: {
        next: () => {
            return "dq_step7";
        },
        transfer: () => {
            stateProgress("ub", "dqWorkSpace");

            return { 
                nodes: ["ub"], 
                edges: ["ub-vector"] 
            };
        },
    },
    dq_step7: {
        next: () => {
            return "dq_step8";
        },
        transfer: () => {
            return { 
                nodes: ["vector"], 
                edges: [] 
            };
        },
    },
    dq_step8: {
        next: () => {
            return "dq_step9";
        },
        transfer: () => {
            stateProgress("ub", "dq");

            return { 
                nodes: ["ub"], 
                edges: ["vector-ub"] 
            };
        },
    },
    dq_step9: {
        next: () => {
            return "dq_step10";
        },
        transfer: () => {
            stateProgress("ub", "dqWorkSpace");

            return { 
                nodes: ["ub"], 
                edges: ["ub-vector"] 
            };
        },
    },
    dq_step10: {
        next: () => {
            return "dq_step11";
        },
        transfer: () => {
            return { 
                nodes: ["vector"], 
                edges: [] 
            };
        },
    },
    dq_step11: {
        next: () => {
            return "dq_step12";
        },
        transfer: () => {
            stateProgress("ub", "dq");

            return { 
                nodes: ["ub"], 
                edges: ["vector-ub"] 
            };
        },
    },
    dq_step12: {
        next: () => {
            return "dq_step13";
        },
        transfer: () => {
            stateProgress("ub", "dqWorkSpace");

            return { 
                nodes: ["ub"], 
                edges: ["ub-vector"] 
            };
        },
    },
    dq_step13: {
        next: () => {
            return "dq_step14";
        },
        transfer: () => {
            return { 
                nodes: ["vector"], 
                edges: [] 
            };
        },
    },
    dq_step14: {
        next: () => {
            return "dq_back";
        },
        transfer: () => {
            stateProgress("ub", "dq");

            return { 
                nodes: ["ub"], 
                edges: ["vector-ub"] 
            };
        },
    },
    dq_back: {
        next: () => {
            return "dq_back1";
        },
        transfer: () => {
            memStates["ub"] = {};

            stateProgress("l2", "dq");

            return { 
                nodes: ["ub", "l2"], 
                edges: ["ub-l2"] 
            };
        },
    },
    dq_back1: {
        next: () => {
            return "dk_step1";
        },
        transfer: () => {
            memStates["l2"] = {};

            stateProgress("gm", "dq");

            return { 
                nodes: ["gm", "l2"], 
                edges: ["l2-gm"] 
            };
        },
    },
    dk_step1: {
        next: () => "dk_step2",
        transfer: () => {
            stateProgress("gm", "dkWorkSpace");
            stateLoadData("l2", "dkWorkSpace", 16 * 4, 16 * 4);
            stateLoadData("l2", "dk", 16 * 4, 16 * 4);
            return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
        }
    },
    dk_step2: {
        next: () => "dk_step3",
        transfer: () => {
            stateProgress("l2", "dkWorkSpace");
            stateLoadData("ub", "dkWorkSpace", 16 * 4, 16);
            stateLoadData("ub", "dk", 16 * 4, 16);
            return { nodes: ["ub", "l2"], edges: ["l2-ub"] };
        },
    },
    dk_step3: {
        next: () => "dk_step4",
        transfer: () => {
            stateProgress("ub", "dkWorkSpace");
            return { nodes: ["ub"], edges: ["ub-vector"] };
        },
    },
    dk_step4: {
        next: () => "dk_step5",
        transfer: () => {
            return { nodes: ["vector"], edges: [] };
        },
    },
    dk_step5: {
        next: () => "dk_step6",
        transfer: () => {
            stateProgress("ub", "dk");
            return { nodes: ["ub"], edges: ["vector-ub"] };
        },
    },
    dk_step6: {
        next: () => "dk_step7",
        transfer: () => {
            stateProgress("ub", "dkWorkSpace");
            return { nodes: ["ub"], edges: ["ub-vector"] };
        },
    },
    dk_step7: {
        next: () => "dk_step8",
        transfer: () => {
            return { nodes: ["vector"], edges: [] };
        },
    },
    dk_step8: {
        next: () => "dk_step9",
        transfer: () => {
            stateProgress("ub", "dk");
            return { nodes: ["ub"], edges: ["vector-ub"] };
        },
    },
    dk_step9: {
        next: () => "dk_step10",
        transfer: () => {
            stateProgress("ub", "dkWorkSpace");
            return { nodes: ["ub"], edges: ["ub-vector"] };
        },
    },
    dk_step10: {
        next: () => "dk_step11",
        transfer: () => {
            return { nodes: ["vector"], edges: [] };
        },
    },
    dk_step11: {
        next: () => "dk_step12",
        transfer: () => {
            stateProgress("ub", "dk");
            return { nodes: ["ub"], edges: ["vector-ub"] };
        },
    },
    dk_step12: {
        next: () => "dk_step13",
        transfer: () => {
            stateProgress("ub", "dkWorkSpace");
            return { nodes: ["ub"], edges: ["ub-vector"] };
        },
    },
    dk_step13: {
        next: () => "dk_step14",
        transfer: () => {
            return { nodes: ["vector"], edges: [] };
        },
    },
    dk_step14: {
        next: () => "dk_back",
        transfer: () => {
            stateProgress("ub", "dk");
            return { nodes: ["ub"], edges: ["vector-ub"] };
        },
    },
    dk_back: {
        next: () => "dk_back1",
        transfer: () => {
            memStates["ub"] = {};
            stateProgress("l2", "dk");
            return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
        },
    },
    dk_back1: {
        next: () => "final",
        transfer: () => {
            memStates["l2"] = {};
            stateProgress("gm", "dk");
            return { nodes: ["gm", "l2"], edges: ["l2-gm"] };
        },
    },
});

export const dataColors = {
  dy: { 0: '#ed62eb33', 1: 'rgba(181, 17, 179, 0.82)' },
  V: { 0: '#B1E9FF33', 1: '#98cfe566' },
  bmm1: {
    1: '#5CA7FF66',
    2: '#5CA7FF99',
    3: '#5CA7FFCC',
    4: '#5CA7FFFF',
    5: 'rgb(37, 132, 240)',
    6: 'rgb(5, 68, 141)',
    7: 'rgb(3, 41, 84)',
    8: 'rgb(1, 13, 27)',
  },
  K: { 0: '#f35ff033', 1: 'rgba(134, 11, 132, 0.82)' },
  Q: { 0: '#B1E9FF33', 1: '#98cfe566' },
  bmm2: {
    1: '#5CA7FF66',
    2: '#5CA7FF99',
    3: '#5CA7FFCC',
    4: '#5CA7FFFF',
    5: 'rgb(37, 132, 240)',
    6: 'rgb(5, 68, 141)',
    7: 'rgb(3, 41, 84)',
    8: 'rgb(1, 13, 27)',
  },
  bmm3_1: {
    1: '#5CA7FF66',
    2: '#5CA7FF99',
    3: '#5CA7FFCC',
    4: '#5CA7FFFF',
    5: 'rgb(37, 132, 240)',
    6: 'rgb(5, 68, 141)',
    7: 'rgb(3, 41, 84)',
    8: 'rgb(1, 13, 27)',
  },
  bmm3_2: {
    1: '#5CA7FF66',
    2: '#5CA7FF99',
    3: '#5CA7FFCC',
    4: '#5CA7FFFF',
    5: 'rgb(37, 132, 240)',
    6: 'rgb(5, 68, 141)',
    7: 'rgb(3, 41, 84)',
    8: 'rgb(1, 13, 27)',
  },
  dq: { 0: '#99d6bc33', 1: '#0d724733' },
  dk: { 0: '#e6b58733', 1: '#743e0c33' },
  dv: { 0: '#5CA7FF66', 1: '#5CA7FF99' },
  AttnIn: { 0: '#90f05466', 1: '#417d1c66' },
  sfmgClc1: { 0: '#85e14c66', 1: '#31611266', 2:'#1a310a66' },
  sfmgClc2: { 0: '#7e70f666', 1: '#23178a66', 2:'#140e4e66' },
  outBuf: { 0: 'rgba(243, 229, 112, 0.4)', 1: 'rgba(201, 182, 12, 0.4)' },
  sfmgWorkspaceGm: { 0: 'rgba(243, 229, 112, 0.4)', 1: 'rgba(201, 182, 12, 0.4)', 2: 'rgba(104, 94, 7, 0.4)' },
  vecClc2Buffer: {
    0: '#5CA7FF66',
    1: '#5CA7FF99',
    2: '#5CA7FFCC',
    3: '#5CA7FFFF',
  },
  softMax_l: {
    0: '#eea8dd66',
    1: '#9f137c66',
    2: '#7e0c6166',
    3: '#41063266',
  },
  p: {
    1: '#eea8dd66',
    2: '#9f137c66',
    3: '#7e0c6166',
    4: '#41063266',
  },
  dropWorkSpace: {
    1: '#eea8dd66',
    2: '#9f137c66',
    3: '#7e0c6166',
    4: '#41063266',
  },
  dqWorkSpace: { 0: '#ED85EC33', 1: 'rgba(225, 68, 222, 0.82)' },
  dkWorkSpace: { 0: '#B1E9FF33', 1: '#98cfe566' },
};


export const flashAttnScoreGradOperatorDefinition = {
    id: 'flash_attn_score_grad',
    label: 'flash_attn_score_grad',
    createControlStates: createFlashAttnScoreGradControlStates,
    dataColors,
};