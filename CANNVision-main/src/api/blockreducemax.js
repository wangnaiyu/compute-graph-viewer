import {
  apiLoad,
  apiRangeProgress,
  memStates,
} from './memstates';

const BLOCKS_PER_REPEAT = 8;
const BLOCK_SIZE = 32;
const MAX_MASK_ELEMENTS = 128;
const DEFAULT_MASK = 64;
const DEFAULT_REPEAT_TIMES = 1;
const DEFAULT_SRC_BLK_STRIDE = 1;
const DEFAULT_SRC_REP_STRIDE = 8;
const DEFAULT_DST_REP_STRIDE = 1;

let stepId = 0;

const getOperandSize = (repeatTimes, repeatStride, blockStride, elementSize) => {
  const lastBlock = (repeatTimes - 1) * repeatStride + (BLOCKS_PER_REPEAT - 1) * blockStride; 

  const blockElements = BLOCK_SIZE / elementSize;
  return (lastBlock + 1 ) * blockElements;
}

export const parameterDefinitions = [
  {
    id: 'mask',
    label: 'mask',
    min: 1,
    max: MAX_MASK_ELEMENTS,
    defaultValue: DEFAULT_MASK,
    description: '每次迭代内每个datablock参与计算的连续元素个数。half最多128，float最多64',
  },
  {
    id: 'repeatTimes',
    label: 'repeatTimes',
    min: 1,
    max: 255,
    defaultValue: DEFAULT_REPEAT_TIMES,
    description: '迭代次数，每次迭代处理8个datablock',
  },
  {
    id: 'srcBlkStride',
    label: 'srcBlkStride',
    min: 0,
    max: 65535,
    defaultValue: DEFAULT_SRC_BLK_STRIDE,
    description: '同一迭代内相邻datablock之间的步幅（单位：datablock个数）',
  },
  {
    id: 'srcRepStride',
    label: 'srcRepStride',
    min: 0,
    max: 65535,
    defaultValue: DEFAULT_SRC_REP_STRIDE,
    description: '相邻迭代间源操作数的步幅（单位：datablock个数）',
  },
  {
    id: 'dstRepStride',
    label: 'dstRepStride',
    min: 1,
    max: 65535,
    defaultValue: DEFAULT_DST_REP_STRIDE,
    description: '相邻迭代间目的操作数的步幅（单位：8个元素）',
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
    description: '操作数数据类型，影响每个datablock的元素个数和mask上限',
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
    subtitle: '/目的数据集（每迭代8个最大值）',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const createBlockReduceMaxControlStates = (parameters) => {
  const {
    mask = DEFAULT_MASK,
    repeatTimes = DEFAULT_REPEAT_TIMES,
    srcBlkStride = DEFAULT_SRC_BLK_STRIDE,
    srcRepStride = DEFAULT_SRC_REP_STRIDE,
    dstRepStride = DEFAULT_DST_REP_STRIDE,
    dataType: dataTypeValue = 0,
  } = parameters ?? {};

  const elementSize = dataTypeValue === 1 ? 4 : 2; // half=2, float=4
  const blockElements = BLOCK_SIZE / elementSize;   // 每个 datablock 的元素数

  // 源操作数总元素数（考虑步长，可能出现空洞）
  const srcSize = getOperandSize(repeatTimes, srcRepStride, srcBlkStride, elementSize);
  // 目标操作数总元素数：每次输出8个，步长 dstRepStride（单位：8元素）
  const dstSize = ((repeatTimes - 1) * dstRepStride + 1) * 8;

  const totalSteps = repeatTimes; // 总步骤数 = 迭代次数

  // 辅助函数：计算某次迭代的源数据起始索引（以元素计）
  const getSrcStart = (iter) => iter * srcRepStride * blockElements;

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

        const srcData = Array.from({ length: srcSize }, () => (Math.random() * 100) | 0);
        const dstData = new Array(dstSize).fill(0);

        apiLoad('src0', 'X', srcSize, totalSteps, BLOCKS_PER_REPEAT * blockElements, blockElements, srcData);
        apiLoad('dst', 'Z', dstSize, totalSteps, 8, 8, dstData);

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
        const srcLen = (BLOCKS_PER_REPEAT - 1) * srcBlkStride * blockElements + blockElements; // 含空洞总跨度

        const dstStart = iter * dstRepStride * 8;
        const dstLen = 8;

        const srcData = memStates.src0['X'].data;
        const dstData = memStates.dst['Z'].data;

        // 对 8 个 datablock 分别求最大值
        for (let b = 0; b < BLOCKS_PER_REPEAT; b++) {
          const blockStart = srcStart + b * srcBlkStride * blockElements;
          const effectiveLen = Math.min(mask, blockElements);
          let maxVal = -Infinity;
          for (let e = 0; e < effectiveLen; e++) {
            const val = srcData[blockStart + e] ?? 0;
            if (val > maxVal) maxVal = val;
          }
          dstData[dstStart + b] = maxVal;
        }

        // 高亮
        apiRangeProgress('src0', 'X', srcStart, srcLen);
        apiRangeProgress('dst', 'Z', dstStart, dstLen);

        // 淡出上一步
        if (stepId > 0) {
          const prevIter = stepId - 1;
          apiRangeProgress('src0', 'X', getSrcStart(prevIter), srcLen);
          apiRangeProgress('dst', 'Z', prevIter * dstRepStride * 8, 8);
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
          apiRangeProgress('src0', 'X', getSrcStart(lastIter), BLOCKS_PER_REPEAT * blockElements);
          apiRangeProgress('dst', 'Z', lastIter * dstRepStride * 8, 8);
        }
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
  };
};

export const BlockReduceMaxApiDefinition = {
  id: 'blockReduceMax',
  label: 'blockReduceMax',
  createControlStates: createBlockReduceMaxControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};