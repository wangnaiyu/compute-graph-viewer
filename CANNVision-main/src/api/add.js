import {
  memStates,
  apiLoad,
  apiRangeProgress,
  API_GRID_COLUMNS,
  API_GRID_ROWS,
  defaultApiParameterDefinitions,
} from './memstates';


const SRC0_TAG = 'X';
const SRC1_TAG = 'Y';
const DST_TAG = 'Z';
const srcLocalRows = API_GRID_ROWS;
const srcLocalCols = API_GRID_COLUMNS;
const src0ASize = srcLocalRows * srcLocalCols;
const src0BSize = src0ASize;

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

export const createAddControlStates = ({
  blockCount = 4,
  blockLen = 2,
  srcStride = 0,
  dstStride = 0,
} = {}, elementSize = 2) => {
  blockLen  = blockLen * blockSizeUnit / elementSize;
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

        // apiRangeProgress("src0", SRC0_TAG, strideIdx * srcStride, blockLen);
        // apiRangeProgress("src1", SRC1_TAG, strideIdx * srcStride, blockLen);
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
          dstData[dstOffset + i] = src0Data[srcOffset + i] + src1Data[srcOffset + i];
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

export const addApiDefinition = {
  id: 'add',
  label: 'add',
  createControlStates: createAddControlStates,
  parameterDefinitions: defaultApiParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
