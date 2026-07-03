import {
  memStates,
  apiLoad,
  apiRangeProgress,
  defaultApiParameterDefinitions,
} from './memstates';

const src0ASize = 32 * 8;
const src0BSize = src0ASize;


const SRC0_TAG = 'X';
const SRC1_TAG = 'Y';
const DST_TAG = 'Z';

const getNextDataAIdx = () => {
  if (!(SRC0_TAG in memStates.src0)) return 0;

  const stride = memStates.src0[SRC0_TAG].stride;
  const nStride = memStates.src0[SRC0_TAG].nStride;

  for (let i = 0; i < nStride; i += 1) {
    const blockFirst = i * stride;
    if (blockFirst >= memStates.src0[SRC0_TAG].dataStage.length) {
      return i;
    }
    if (memStates.src0[SRC0_TAG].dataStage[blockFirst] === 0) {
      return i;
    }
  }
  return nStride;
};

const getCurrentDataAIdx = () => getNextDataAIdx() - 1;

const blockSizeUnit = 32;
const srcStrideUnit = 32;
const dstStrideUnit = 32;

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Y: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'src0',
    title: 'src0Local',
    subtitle: '/第一个源数据集',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'src1',
    title: 'src1Local',
    subtitle: '/第二个源数据集',
    paintedCellClassName: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const createCompareControlStates = ({
  blockCount = 4,
  blockLen = 2,
  srcStride = 0,
  dstStride = 0,
  cmpMode = 0,
} = {}, elementSize = 2) => {
  blockLen = blockLen * blockSizeUnit / elementSize;
  srcStride = srcStride * srcStrideUnit / elementSize;
  dstStride = dstStride * dstStrideUnit / elementSize;

  blockLen |= 0;
  srcStride |= 0;
  dstStride |= 0;

  srcStride += blockLen;
  dstStride += blockLen;

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
        const src0Data = new Array(src0ASize);
        const src1Data = new Array(src0BSize);

        for (let i = 0; i < src0ASize; i += 1) {
          src0Data[i] = (Math.random() * 256) | 0;
        }

        for (let i = 0; i < src0BSize; i += 1) {
          src1Data[i] = (Math.random() * 256) | 0;
        }

        apiLoad("src0", SRC0_TAG, src0ASize, blockCount, blockLen, srcStride, src0Data);
        apiLoad("src1", SRC1_TAG, src0BSize, blockCount, blockLen, srcStride, src1Data);

        return { nodes: ["src0", "src1"], edges: [] };
      },
    },
    src: {
      next: () => "dst",
      transfer: () => {
        const strideIdx = getNextDataAIdx();
        apiRangeProgress("src0", SRC0_TAG, strideIdx * srcStride, blockLen);
        apiRangeProgress("src1", SRC1_TAG, strideIdx * srcStride, blockLen);

        if (strideIdx > 0) {
          apiRangeProgress("src0", SRC0_TAG, (strideIdx - 1) * srcStride, blockLen);
          apiRangeProgress("src1", SRC1_TAG, (strideIdx - 1) * srcStride, blockLen);
          apiRangeProgress("dst", DST_TAG, (strideIdx - 1) * dstStride, blockLen);
        }

        return { nodes: ["src0", "src1", "dst"], edges: [] };
      },
    },
    dst: {
      next: () => "process",
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();

        if (strideIdx === 0) {
          apiLoad("dst", DST_TAG, blockCount * dstStride, blockCount, blockLen, dstStride, []);
        }

        apiRangeProgress("dst", DST_TAG, strideIdx * dstStride, blockLen);

        return { nodes: ["src0", "src1", "dst"], edges: [] };
      },
    },
    process: {
      next: () => {
        if (getNextDataAIdx() === blockCount) {
          return "clean";
        }
        return "src";
      },
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();
        const srcOffset = strideIdx * srcStride;
        const dstOffset = strideIdx * dstStride;
        const dstData = memStates.dst[DST_TAG].data;
        const src0Data = memStates.src0[SRC0_TAG].data;
        const src1Data = memStates.src1[SRC1_TAG].data;

        for (let i = 0; i < blockLen; i += 1) {
          const s0 = src0Data[srcOffset + i];
          const s1 = src1Data[srcOffset + i];
          let res = 0;
          if (cmpMode === 0 || cmpMode === 'LT') res = s0 < s1 ? 1 : 0;
          else if (cmpMode === 1 || cmpMode === 'GT') res = s0 > s1 ? 1 : 0;
          else if (cmpMode === 2 || cmpMode === 'GE') res = s0 >= s1 ? 1 : 0;
          else if (cmpMode === 3 || cmpMode === 'EQ') res = s0 === s1 ? 1 : 0;
          else if (cmpMode === 4 || cmpMode === 'NE') res = s0 !== s1 ? 1 : 0;
          else if (cmpMode === 5 || cmpMode === 'LE') res = s0 <= s1 ? 1 : 0;
          dstData[dstOffset + i] = res;
        }

        apiRangeProgress("dst", DST_TAG, dstOffset, blockLen);
        apiRangeProgress("src0", SRC0_TAG, srcOffset, blockLen);
        apiRangeProgress("src1", SRC1_TAG, srcOffset, blockLen);

        return { nodes: ["src0", "src1", "dst"], edges: [] };
      },
    },
    clean: {
      next: () => "final",
      transfer: () => {
        apiRangeProgress("dst", DST_TAG,  (blockCount - 1) * dstStride, blockLen);
        apiRangeProgress("src0", SRC0_TAG, (blockCount - 1) * dstStride, blockLen);
        apiRangeProgress("src1", SRC1_TAG, (blockCount - 1) * dstStride, blockLen);
        return { nodes: ["dst", "src0", "src1"], edges: [] };
      },
    },
  });
};

export const compareApiParameterDefinitions = [
  ...defaultApiParameterDefinitions,
  { id: 'cmpMode', label: '比较模式(LT:0,GT:1,GE:2,EQ:3,NE:4,LE:5)', min: 0, max: 5, defaultValue: 0 },
];

export const compareApiDefinition = {
  id: 'compare',
  label: 'Compare',
  createControlStates: createCompareControlStates,
  parameterDefinitions: compareApiParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
