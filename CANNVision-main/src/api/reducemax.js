import {
  memStates,
  apiLoad,
  apiRangeProgress,
} from './memstates';

export const parameterDefinitions = [
  {
    id: 'pattern',
    label: 'pattern(AR/RA)',
    type: 'text',
    defaultValue: 'AR',
    placeholder: 'AR or RA',
  },
  {
    id: 'shape',
    label: 'shape',
    type: 'group',
    children: [
      { id: 'length', label: 'length', min: 1, max: 128, defaultValue: 32 },
      { id: 'width', label: 'width', min: 1, max: 128, defaultValue: 4 },
    ],
  },
];

const SRC0_TAG = 'X';
const DST_TAG = 'Z';

const dstBlockLen = 1;

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
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
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

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

const progressSourceBlock = (strideIdx, blockLen, srcStride, srcElementStride) => {
  const srcOffset = strideIdx * srcStride;

  if (srcElementStride === 1) {
    apiRangeProgress("src0", SRC0_TAG, srcOffset, blockLen);
    return;
  }

  for (let i = 0; i < blockLen; i += 1) {
    apiRangeProgress("src0", SRC0_TAG, srcOffset + i * srcElementStride, 1);
  }
};

const getSourceDataSize = (blockCount, blockLen, srcStride, srcElementStride) =>
  (blockCount - 1) * srcStride + (blockLen - 1) * srcElementStride + 1;

const normalizePattern = (pattern) => {
  const patternText = String(pattern).trim().toUpperCase();
  if (pattern === 1 || patternText === '1' || patternText === 'RA') return 'RA';
  return 'AR';
};

export const createReducemaxControlStates = ({
  pattern = 'AR',
  shape: {
    length = 32,
    width = 4,
  } = {},
} = {}) => {
  length = Math.max(1, length | 0);
  width = Math.max(1, width | 0);
  const patternMode = normalizePattern(pattern);

  let blockCount = width;
  let blockLen = length;
  const dstStride = dstBlockLen;
  let srcStride = blockLen;
  let srcElementStride = 1;

  if (patternMode === 'RA') {
    blockCount = length;
    blockLen = width;
    srcStride = 1;
    srcElementStride = length;
  }

  return ({
    final: {
      next: () => "final",
      transfer: () => ({ nodes: [], edges: [] }),
    },
    init: {
      next: () => {
        if (patternMode === 'RA' || patternMode === 'AR') {
          return "load";
        }
        return "final";
      },
      transfer: () => ({ nodes: [], edges: [] }),
    },
    load: {
      next: () => "src",
      transfer: () => {
        const src0DataSize = getSourceDataSize(blockCount, blockLen, srcStride, srcElementStride);
        const src0Data = new Array(src0DataSize);

        for (let i = 0; i < src0DataSize; i += 1) {
          src0Data[i] = (Math.random() * 256) | 0;
        }

        apiLoad("src0", SRC0_TAG, src0DataSize, blockCount, blockLen, srcStride, src0Data);

        return { nodes: ["src0"], edges: [] };
      },
    },
    src: {
      next: () => "dst",
      transfer: () => {
        const strideIdx = getNextDataAIdx();
        progressSourceBlock(strideIdx, blockLen, srcStride, srcElementStride);

        if (strideIdx > 0) {
          progressSourceBlock(strideIdx - 1, blockLen, srcStride, srcElementStride);
          apiRangeProgress("dst", DST_TAG, (strideIdx - 1) * dstStride, dstBlockLen);
        }

        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    dst: {
      next: () => "process",
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();

        if (strideIdx === 0) {
          apiLoad("dst", DST_TAG, blockCount * dstStride, blockCount, dstBlockLen, dstStride, []);
        }

        apiRangeProgress("dst", DST_TAG, strideIdx * dstStride, dstBlockLen);

        return { nodes: ["src0", "dst"], edges: [] };
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

        let maxValue = src0Data[srcOffset];

        for (let i = 1; i < blockLen; i += 1) {
          const srcIndex = srcOffset + i * srcElementStride;
          if (src0Data[srcIndex] > maxValue) {
            maxValue = src0Data[srcIndex];
          }
        }
        dstData[dstOffset] = maxValue;

        apiRangeProgress("dst", DST_TAG, dstOffset, dstBlockLen);
        progressSourceBlock(strideIdx, blockLen, srcStride, srcElementStride);

        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    clean: {
      next: () => "final",
      transfer: () => {
        apiRangeProgress("dst", DST_TAG,  (blockCount - 1) * dstStride, dstBlockLen);
        progressSourceBlock(blockCount - 1, blockLen, srcStride, srcElementStride);
        return { nodes: ["dst", "src0"], edges: [] };
      },
    },
  });
};

export const reducemaxApiDefinition = {
  id: 'reduceMax',
  label: 'reduceMax',
  createControlStates: createReducemaxControlStates,
  parameterDefinitions: parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
