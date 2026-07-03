export let memStates = {
  init: {},
  gm: {},
  l2: {},
  l1: {},
  l0a: {},
  l0b: {},
  l0c: {},
  ub: {},
  reset: () => {
    memStates.init = {};
    memStates.gm = {};
    memStates.l2 = {};
    memStates.l1 = {};
    memStates.l0a = {};
    memStates.l0b = {};
    memStates.l0c = {};
    memStates.ub = {};
  },
};

export const stateRemove = (state, tag) => {
  delete memStates[state][tag];
};

const getStrideIdx = (state, tag) => {
  let dataItem = memStates[state][tag];
  let nStride = dataItem.nStride;
  let stride = dataItem.stride;
  let strideId = 0;
  let stage = dataItem.dataStage[0];

  for(let st = 1; st < nStride; st++) {
    let blockFirst = st * stride;
    if (dataItem.dataStage[blockFirst] < stage) {
      strideId = st;
      break;
    } 
  }
  return strideId;
}

export const stateProgress = (state, tag) => {
  let strideIdx = getStrideIdx(state, tag);
  let st = memStates[state][tag].stride * strideIdx;
  let len = memStates[state][tag].blockSize;
  apiRangeProgress(state, tag, st, len);
};

export const apiRangeProgress = (state, tag, st, len) => {
  const dataStage = memStates[state][tag].dataStage;
  const end = Math.min(st + len, dataStage.length);
  for (let i = st; i < end; i++) {
    dataStage[i]++;
  }
};

export const stateLoadData = (state, tag, size, stride) => {
  memStates[state][tag] = { tag, size, 
    nStride:size/stride, 
    blockSize:stride, 
    stride, 
    dataStage: new Uint32Array(size),
  };
  console.log(` >>> state: ${state}`);
  console.log(` >>> tag: ${tag}`);
};

export const stateHasData = (state, tag) =>
  tag in memStates[state] && memStates[state][tag] !== null;

export const stateHasFinished = (state, tag) => {
  if (!(tag in memStates[state])) return false;

  console.assert("dataStage" in memStates[state][tag], ` !!! datastage should be set in ${state}.${tag}`);
  let dataStage = memStates[state][tag].dataStage;
  return dataStage.at(0) === dataStage.at(-1) && dataStage.at(0) > 0;
}

export const stateHasUnFinished = (state, tag) =>
  tag in memStates[state] &&
  !stateHasFinished(state, tag);
