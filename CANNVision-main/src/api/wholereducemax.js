import {
  apiLoad,
  apiRangeProgress,
  memStates,
} from './memstates';

const BLOCKS_PER_REPEAT = 8;
const BLOCK_SIZE = 32;
const MAX_MASK_ELEMENTS = 128;        // half 类型下每个 repeat 最多 128 个元素
const DEFAULT_MASK = 128;
const DEFAULT_REPEAT_TIMES = 1;
const DEFAULT_SRC_BLK_STRIDE = 1;
const DEFAULT_SRC_REP_STRIDE = 8;
const DEFAULT_DST_REP_STRIDE = 1;

let stepId = 0;

// 计算操作数总元素数（考虑步幅产生的间隙）
const getOperandSize = (repeatTimes, repeatStride, blockStride, elementSize) => {
  const lastBlock = (repeatTimes - 1) * repeatStride + (BLOCKS_PER_REPEAT - 1) * blockStride;
  const blockElements = BLOCK_SIZE / elementSize;
  return (lastBlock + 1) * blockElements;
};

export const parameterDefinitions = [
  {
    id: 'mask',
    label: 'mask',
    min: 1,
    max: 128,
    defaultValue: 128,
    description: '每个 repeat 内参与计算的连续元素个数。half 最多 128，float 最多 64',
  },
  {
    id: 'repeatTimes',
    label: 'repeatTimes',
    min: 1,
    max: 255,
    defaultValue: 1,
    description: '迭代次数，每次迭代处理一个 repeat 的数据',
  },
  {
    id: 'srcBlkStride',
    label: 'srcBlkStride',
    min: 0,
    max: 65535,
    defaultValue: 1,
    description: '同一迭代内相邻 datablock 的地址步幅（单位：datablock 个数）',
  },
  {
    id: 'srcRepStride',
    label: 'srcRepStride',
    min: 0,
    max: 65535,
    defaultValue: 8,
    description: '相邻迭代间源操作数的步幅（单位：datablock 个数）',
  },
  {
    id: 'dstRepStride',
    label: 'dstRepStride',
    min: 1,
    max: 65535,
    defaultValue: 1,
    description: '相邻迭代间目的操作数的步幅（单位：一次迭代的输出长度）',
  },
  {
    id: 'dataType',
    label: 'dataType',
    type: 'select',
    min: 0,
    max: 1,
    defaultValue: 0,
    options: [
      { value: 0, label: 'half (16-bit)' },
      { value: 1, label: 'float (32-bit)' },
    ],
    description: '操作数数据类型',
  },
  {
    id: 'order',
    label: 'ReduceOrder',
    type: 'select',
    min: 0,
    max: 3,
    defaultValue: 0,
    options: [
      { value: 0, label: 'ORDER_VALUE_INDEX' },
      { value: 1, label: 'ORDER_INDEX_VALUE' },
      { value: 2, label: 'ORDER_ONLY_VALUE' },
      { value: 3, label: 'ORDER_ONLY_INDEX' },
    ],
    description: '输出格式：值和索引的相对顺序，或只输出值/索引',
  },
];

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },   // 源操作数 (src)
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },   // 目的操作数 (dst)
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
    subtitle: '/目的数据集（每repeat最值/索引）',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const createWholeReduceMaxControlStates = (parameters) => {
  const {
    mask = 128,
    repeatTimes = 1,
    srcBlkStride = 1,
    srcRepStride = 8,
    dstRepStride = 1,
    dataType: dataTypeValue = 0,
    order = 0,
  } = parameters ?? {};

  const elementSize = dataTypeValue === 1 ? 4 : 2;
  const blockElements = BLOCK_SIZE / elementSize;

  const srcSize = getOperandSize(repeatTimes, srcRepStride, srcBlkStride, elementSize);

  const isOnlyValue = order === 2;
  const isOnlyIndex = order === 3;
  const outputElems = (isOnlyValue || isOnlyIndex) ? 1 : 2;

  const dstSize = ((repeatTimes - 1) * dstRepStride + 1) * outputElems;

  const totalSteps = repeatTimes;

  const getSrcStart = (iter) => iter * srcRepStride * blockElements;
  const getSrcSpan = () => (BLOCKS_PER_REPEAT - 1) * srcBlkStride * blockElements + blockElements;

  return {
    final: {
      next: () => 'final',
      transfer: () => ({ nodes: [], edges: [] }),
    },
    init: {
      next: () => 'load',
      transfer: () => ({ nodes: [], edges: [] }),
    },
    load: {
      next: () => 'block',
      transfer: () => {
        stepId = 0;

        const srcData = Array.from({ length: srcSize }, () => Math.floor(Math.random() * 101));
        const dstData = new Array(dstSize).fill(0);

        apiLoad('src0', 'X', srcSize, totalSteps,
                BLOCKS_PER_REPEAT * blockElements, blockElements, srcData);
        apiLoad('dst', 'Z', dstSize, totalSteps, outputElems, outputElems, dstData);

        memStates.src0['X'].completedBlocks = 0;
        memStates.dst['Z'].completedBlocks = 0;

        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    block: {
      next: () => (stepId < totalSteps ? 'block' : 'clean'),
      transfer: () => {
        const iter = stepId;

        const srcStart = getSrcStart(iter);
        const srcLen = getSrcSpan();

        const dstStart = iter * dstRepStride * outputElems;
        const dstLen = outputElems;

        const srcData = memStates.src0['X'].data;
        const dstData = memStates.dst['Z'].data;

        const effectiveCount = Math.min(mask, BLOCKS_PER_REPEAT * blockElements);
        let maxVal = -Infinity;
        let maxIdx = 0;

        for (let i = 0; i < effectiveCount; i++) {
          const blockIdx = Math.floor(i / blockElements);
          const elemInBlock = i % blockElements;
          const srcIdx = srcStart + blockIdx * srcBlkStride * blockElements + elemInBlock;
          const val = srcData[srcIdx] ?? 0;
          if (val > maxVal) {
            maxVal = val;
            maxIdx = i;
          }
        }

        if (order === 0) {
          dstData[dstStart] = maxVal;
          dstData[dstStart + 1] = maxIdx;
        } else if (order === 1) {
          dstData[dstStart] = maxIdx;
          dstData[dstStart + 1] = maxVal;
        } else if (order === 2) {
          dstData[dstStart] = maxVal;
        } else if (order === 3) {
          dstData[dstStart] = maxIdx;
        }

        apiRangeProgress('src0', 'X', srcStart, srcLen);
        apiRangeProgress('dst', 'Z', dstStart, dstLen);

        if (stepId > 0) {
          const prevIter = stepId - 1;
          apiRangeProgress('src0', 'X', getSrcStart(prevIter), srcLen);
          apiRangeProgress('dst', 'Z', prevIter * dstRepStride * outputElems, outputElems);
        }

        stepId++;
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    clean: {
      next: () => 'final',
      transfer: () => {
        if (totalSteps > 0) {
          const lastIter = totalSteps - 1;
          apiRangeProgress('src0', 'X', getSrcStart(lastIter), getSrcSpan());
          apiRangeProgress('dst', 'Z', lastIter * dstRepStride * outputElems, outputElems);
        }
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
  };
};

export const WholeReduceMaxApiDefinition = {
  id: 'wholeReduceMax',
  label: 'WholeReduceMax',
  createControlStates: createWholeReduceMaxControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};