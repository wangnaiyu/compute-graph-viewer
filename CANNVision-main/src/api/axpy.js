import {
  apiLoad,
  apiRangeProgress,
  memStates,
} from './memstates';

const BLOCKS_PER_REPEAT = 8;
const BLOCK_BYTES = 32;
const DEFAULT_MASK = 128;
const DEFAULT_REPEAT_TIMES = 2;
const DEFAULT_BLOCK_STRIDE = 1;
const DEFAULT_REPEAT_STRIDE = BLOCKS_PER_REPEAT;
const DEFAULT_SCALAR_VALUE = 2;
const DEFAULT_ELEMENT_SIZE = 2;

const SRC_TAG = 'X';
const DST_TAG = 'Z';

let stepId = 0;

const getBlockElements = (elementSize) => BLOCK_BYTES / elementSize;

const getOperandSize = (repeatTimes, repeatStride, blockStride, elementSize) => {
  const lastBlock = (repeatTimes - 1) * repeatStride + (BLOCKS_PER_REPEAT - 1) * blockStride;
  return (lastBlock + 1) * getBlockElements(elementSize);
};

const calculateRange = (stepIndex, repeatStride, blockStride, elementSize, mask) => {
  const blockElements = getBlockElements(elementSize);
  const repeatId = Math.floor(stepIndex / BLOCKS_PER_REPEAT);
  const blockId = stepIndex % BLOCKS_PER_REPEAT;
  const len = Math.max(0, Math.min(mask - blockId * blockElements, blockElements));

  return {
    st: (repeatStride * repeatId + blockStride * blockId) * blockElements,
    len,
  };
};

export const parameterDefinitions = [
  { id: 'scalarValue', label: 'scalarValue', min: -16, max: 16, defaultValue: DEFAULT_SCALAR_VALUE },
  { id: 'mask', label: 'mask', min: 1, max: DEFAULT_MASK, defaultValue: DEFAULT_MASK },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 255, defaultValue: DEFAULT_REPEAT_TIMES },
  {
    id: 'unaryRepeatParams',
    label: 'UnaryRepeatParams',
    type: 'group',
    children: [
      { id: 'dstBlkStride', label: 'dstBlkStride', min: 0, max: 65535, defaultValue: DEFAULT_BLOCK_STRIDE },
      { id: 'srcBlkStride', label: 'srcBlkStride', min: 0, max: 65535, defaultValue: DEFAULT_BLOCK_STRIDE },
      { id: 'dstRepStride', label: 'dstRepStride', min: 0, max: 65535, defaultValue: DEFAULT_REPEAT_STRIDE },
      { id: 'srcRepStride', label: 'srcRepStride', min: 0, max: 65535, defaultValue: DEFAULT_REPEAT_STRIDE },
    ],
  },
];

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'src0',
    title: 'srcLocal',
    subtitle: '/源操作数',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目的操作数',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const createAxpyControlStates = (parameters = {}) => {
  const {
    scalarValue = DEFAULT_SCALAR_VALUE,
    mask = DEFAULT_MASK,
    repeatTimes = DEFAULT_REPEAT_TIMES,
    unaryRepeatParams = {},
    elementSize = DEFAULT_ELEMENT_SIZE,
  } = parameters;

  const {
    dstBlkStride = DEFAULT_BLOCK_STRIDE,
    srcBlkStride = DEFAULT_BLOCK_STRIDE,
    dstRepStride = DEFAULT_REPEAT_STRIDE,
    srcRepStride = DEFAULT_REPEAT_STRIDE,
  } = unaryRepeatParams;

  const srcSize = getOperandSize(repeatTimes, srcRepStride, srcBlkStride, elementSize);
  const dstSize = getOperandSize(repeatTimes, dstRepStride, dstBlkStride, elementSize);
  const blockElements = getBlockElements(elementSize);
  const totalBlockCount = repeatTimes * BLOCKS_PER_REPEAT;

  return ({
    final: {
      next: () => 'final',
      transfer: () => ({ nodes: [], edges: [] }),
    },
    init: {
      next: () => 'load',
      transfer: () => ({ nodes: [], edges: [] }),
    },
    load: {
      next: () => 'prepare',
      transfer: () => {
        stepId = 0;
        const srcData = Array.from({ length: srcSize }, () => (Math.random() * 10) | 0);
        const dstData = Array.from({ length: dstSize }, () => (Math.random() * 10) | 0);

        apiLoad('src0', SRC_TAG, srcSize, totalBlockCount, blockElements, blockElements, srcData);
        apiLoad('dst', DST_TAG, dstSize, totalBlockCount, blockElements, blockElements, dstData);

        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    prepare: {
      next: () => 'compute',
      transfer: () => {
        const { st: srcSt, len: srcLen } = calculateRange(
          stepId,
          srcRepStride,
          srcBlkStride,
          elementSize,
          mask
        );
        const { st: dstSt, len: dstLen } = calculateRange(
          stepId,
          dstRepStride,
          dstBlkStride,
          elementSize,
          mask
        );
        const len = Math.min(srcLen, dstLen);

        apiRangeProgress('src0', SRC_TAG, srcSt, len);
        apiRangeProgress('dst', DST_TAG, dstSt, len);

        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    compute: {
      next: () => {
        if (stepId === totalBlockCount) {
          return 'clean';
        }
        return 'prepare';
      },
      transfer: () => {
        const { st: srcSt, len: srcLen } = calculateRange(
          stepId,
          srcRepStride,
          srcBlkStride,
          elementSize,
          mask
        );
        const { st: dstSt, len: dstLen } = calculateRange(
          stepId,
          dstRepStride,
          dstBlkStride,
          elementSize,
          mask
        );
        const len = Math.min(srcLen, dstLen);
        const srcData = memStates.src0[SRC_TAG].data;
        const dstData = memStates.dst[DST_TAG].data;

        for (let i = 0; i < len; i += 1) {
          dstData[dstSt + i] = dstData[dstSt + i] + srcData[srcSt + i] * scalarValue;
        }

        apiRangeProgress('src0', SRC_TAG, srcSt, len);
        apiRangeProgress('dst', DST_TAG, dstSt, len);

        stepId += 1;
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    clean: {
      next: () => 'final',
      transfer: () => ({ nodes: ['dst', 'src0'], edges: [] }),
    },
  });
};

export const axpyApiDefinition = {
  id: 'axpy',
  label: 'axpy',
  createControlStates: createAxpyControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
