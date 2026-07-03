import {
  memStates,
  apiLoad,
  defaultApiParameterDefinitions,
  apiRangeProgress,
} from './memstates';

const SRC_TAG = 'X';
const DST_TAG = 'Z';
const src0ASize = 32 * 8;

const getNextDataAIdx = () => {
  let stride = memStates.src0[SRC_TAG].stride;
  let nStride = memStates.src0[SRC_TAG].nStride;
  for (let i = 0; i < nStride; i++) {
    let blockFirst = i*stride;
    if (blockFirst >= memStates.src0[SRC_TAG].dataStage.length) 
      return i;
    if (memStates.src0[SRC_TAG].dataStage[blockFirst] === 0) {
      return i;
    }
  }

  return nStride;
}

const getCurrentDataAIdx =() => getNextDataAIdx() - 1;

const blockSizeUnit = 32; // blockSize in 32B
const srcStrideUnit = 32;
const dstStrideUnit = 32;

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'src0',
    title: 'srcLocal',
    subtitle: '/源数据集',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const createDatacopyControlStates = ({
  blockCount = 4,
  blockLen = 2,
  srcStride = 0,
  dstStride = 0,
} = {}, elementSize = 2) => {
  blockLen = blockCount * blockSizeUnit / elementSize;
  srcStride = srcStride * srcStrideUnit / elementSize;
  dstStride = dstStride * dstStrideUnit / elementSize;

  blockLen |= 0;
  srcStride |= 0;
  dstStride |= 0;
  
  srcStride = srcStride + blockLen;
  dstStride = dstStride + blockLen;
  
  return ({
    final: {
      next: () => "final",
      transfer: () => ({ nodes: [], edges: [] }),
    },
    init: {
      next: () => "load",
      transfer: () => ({ nodes: [], edges: [] }),
    },
    load: {
      next: () => "src",
      transfer: () => {
        let data = new Array(src0ASize);
        for (let i = 0; i < src0ASize; i += 1) {
          data[i] = (Math.random() * 256) | 0;
        }
        apiLoad("src0", SRC_TAG, src0ASize, blockCount, blockLen, srcStride, data)
        return { nodes: ["src0"], edges: [] };
      },
    },
    src: {
      next: () => "dst",
      transfer: () => {
        let strideIdx = getNextDataAIdx();
        apiRangeProgress("src0", SRC_TAG, strideIdx * srcStride, blockLen);
        if (strideIdx > 0) {
          apiRangeProgress("dst", DST_TAG, (strideIdx-1)* dstStride, blockLen);
        }
        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    dst: {
      next: () => "process",
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();
        if (strideIdx === 0){
          apiLoad("dst", DST_TAG, blockCount*dstStride, blockCount, blockLen, dstStride, []);
        }
        console.log(` >>> strideIdx: ${strideIdx}`);
        
        apiRangeProgress("src0", SRC_TAG, strideIdx*srcStride, blockLen);
        apiRangeProgress("dst", DST_TAG, strideIdx*dstStride, blockLen);
        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    process: {
      next: () => {
        if (getNextDataAIdx() === blockCount) {
          return "clean";
        } else 
          return "src";
      },
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();
        
        for (let i = 0; i < blockLen; i += 1) {
          memStates.dst[DST_TAG].data[strideIdx*dstStride+i] = memStates.src0[SRC_TAG].data[strideIdx*srcStride+i];
        }
        apiRangeProgress("dst", DST_TAG, strideIdx*dstStride, blockLen);
        apiRangeProgress("src0", SRC_TAG, strideIdx*srcStride, blockLen);
        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    clean: {
      next: () => "final",
      transfer: () => {
        apiRangeProgress("dst", DST_TAG, (blockCount-1)*dstStride, blockLen);
        return { nodes: ["dst"], edges: [] }
      }
    }
  });
};

export const datacopyApiDefinition = {
  id: 'datacopy',
  label: 'datacopy',
  createControlStates: createDatacopyControlStates,
  parameterDefinitions: defaultApiParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
