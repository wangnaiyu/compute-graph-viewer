import {
  apiLoad,
  apiRangeProgress,
  binaryApiNodeDefinitions,
  memStates,
} from './memstates';

const BLOCKS_PER_REPEAT = 8;
const BLOCK_BYTES = 32;
const MAX_MASK_BYTES = BLOCKS_PER_REPEAT * BLOCK_BYTES;
const DEFAULT_MASK_BYTES = 128;
const DEFAULT_REPEAT_TIMES = 1;
const DEFAULT_BLOCK_STRIDE = 1;
const DEFAULT_REPEAT_STRIDE = BLOCKS_PER_REPEAT;
const BLOCK_SIZE = 32;

let stepId = 0;

const getOperandSize = (repeatTimes, repeatStride, blockStride, elementSize) => {
  const lastBlock = (repeatTimes - 1) * repeatStride + (BLOCKS_PER_REPEAT - 1) * blockStride; 

  const blockElements = BLOCK_SIZE / elementSize;
  return (lastBlock + 1 ) * blockElements;
}

const calculateRange = (stepId, repeatStride, blockStride, elementSize, mask) => {
  const repeatId = Math.floor(stepId / BLOCKS_PER_REPEAT);
  const blockId = stepId % BLOCKS_PER_REPEAT;
  let len = Math.min(mask - blockId * BLOCK_SIZE / elementSize, BLOCK_SIZE / elementSize);

  if (len <= 0) len = 0;

  console.log(` >>> len: ${len}`);
  
  return { st: (repeatStride * repeatId + blockStride * blockId) * (BLOCK_SIZE / elementSize), len};
};

export const parameterDefinitions = [
  { id: 'mask', label: 'mask', min: 1, max: MAX_MASK_BYTES, defaultValue: DEFAULT_MASK_BYTES },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 64, defaultValue: DEFAULT_REPEAT_TIMES },
  {
    id: 'binaryRepeatParams',
    label: 'BinaryRepeatParams',
    type: 'group',
    children: [
      { id: 'dstBlkStride', label: 'dstBlkStride', min: 0, max: 65535, defaultValue: DEFAULT_BLOCK_STRIDE },
      { id: 'src0BlkStride', label: 'src0BlkStride', min: 0, max: 65535, defaultValue: DEFAULT_BLOCK_STRIDE },
      { id: 'src1BlkStride', label: 'src1BlkStride', min: 0, max: 65535, defaultValue: DEFAULT_BLOCK_STRIDE },
      { id: 'dstRepStride', label: 'dstRepStride', min: 0, max: 65535, defaultValue: DEFAULT_REPEAT_STRIDE },
      { id: 'src0RepStride', label: 'src0RepStride', min: 0, max: 65535, defaultValue: DEFAULT_REPEAT_STRIDE },
      { id: 'src1RepStride', label: 'src1RepStride', min: 0, max: 65535, defaultValue: DEFAULT_REPEAT_STRIDE },
    ],
  },
];

 const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Y: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = binaryApiNodeDefinitions;

export const createMulControlStates = (parameters) => {
  // console.log(" >>> running create");
  
  const {
    mask,
    repeatTimes,
    binaryRepeatParams,
    elementSize = 2,
  } = parameters ?? {};

  const {
    dstBlkStride ,
    src0BlkStride,
    src1BlkStride,
    dstRepStride ,
    src0RepStride,
    src1RepStride,
  } = binaryRepeatParams;


  const src0Size = getOperandSize(
    repeatTimes,
    src0RepStride,
    src0BlkStride,
    elementSize
  )
    
  const src1Size = getOperandSize(
    repeatTimes,
    src1RepStride,
    src1BlkStride,
    elementSize

  );
  const dstSize = getOperandSize(
    repeatTimes,
    dstRepStride,
    dstBlkStride,
    elementSize
  );

  const blockElements = BLOCK_SIZE / elementSize;
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
      next: () => 'block',
      transfer: () => {
        stepId = 0;
        const src0Data = Array.from({ length: src0Size }, () => (Math.random() * 16) | 0);
        const src1Data = Array.from({ length: src1Size }, () => (Math.random() * 16) | 0);
        const dstData = new Array(dstSize);

        apiLoad(
          'src0',
          'X',
          src0Size,
          totalBlockCount,
          blockElements,
          blockElements,
          src0Data
        );
        apiLoad(
          'src1',
          'Y',
          src1Size,
          totalBlockCount,
          blockElements,
          blockElements,
          src1Data
        );
        apiLoad(
          'dst',
          'Z',
          dstSize,
          totalBlockCount,
          blockElements,
          blockElements,
          dstData
        );

        memStates.src0['X'].completedBlocks = 0;

        return { nodes: ['src0', 'src1', 'dst'], edges: [] };
      },
    },
    block: {
      next: () => {
        if (stepId === totalBlockCount) {
          return 'clean';
        }
        return 'block';
      },
      transfer: () => {
        const { st: dstSt, len: dstLen } = calculateRange(stepId, dstRepStride, dstBlkStride, elementSize, mask);
        const { st: src0St, len: src0Len } = calculateRange(stepId, src0RepStride, src0BlkStride, elementSize, mask);
        const { st: src1St, len: src1Len } = calculateRange(stepId, src1RepStride, src1BlkStride, elementSize, mask);

        const dstData = memStates.dst['Z'].data;
        const src0Data = memStates.src0['X'].data;
        const src1Data = memStates.src1['Y'].data;

        console.log(` >>> dstLen: ${dstLen}`);
        
        apiRangeProgress("dst", "Z", dstSt, dstLen);
        apiRangeProgress("src0", "X", src0St, src0Len);
        apiRangeProgress("src1", "Y", src1St, src1Len);

        for (let i = 0; i < dstLen; i += 1) {
          dstData[dstSt + i] = src0Data[src0St + i] * src1Data[src1St + i];
        }

        if (stepId > 0) {
          const { st: dstPreSt, len: dstPreLen } = calculateRange(stepId - 1, dstRepStride, dstBlkStride, elementSize, mask);
          const { st: src0PreSt, len: src0PreLen } = calculateRange(stepId - 1, src0RepStride, src0BlkStride, elementSize, mask);
          const { st: src1PreSt, len: src1PreLen } = calculateRange(stepId - 1, src1RepStride, src1BlkStride, elementSize, mask);
          apiRangeProgress("dst", "Z", dstPreSt, dstPreLen);
          apiRangeProgress("src0", "X", src0PreSt, src0PreLen);
          apiRangeProgress("src1", "Y", src1PreSt, src1PreLen);
        }

        stepId += 1;
        return { nodes: ['src0', 'src1', 'dst'], edges: [] };
      },
    },
    clean: {
      next: () => 'final',
      transfer: () => {
        const lastStepId = totalBlockCount - 1;
        const { st: dstSt, len: dstLen } = calculateRange(lastStepId, dstRepStride, dstBlkStride, elementSize, mask);
        const { st: src0St, len: src0Len } = calculateRange(lastStepId, src0RepStride, src0BlkStride, elementSize, mask);
        const { st: src1St, len: src1Len } = calculateRange(lastStepId, src1RepStride, src1BlkStride, elementSize, mask);

        apiRangeProgress("dst", "Z", dstSt, dstLen);
        apiRangeProgress("src0", "X", src0St, src0Len);
        apiRangeProgress("src1", "Y", src1St, src1Len);
        return { nodes: ['dst', 'src0', 'src1'], edges: [] };
      },
    },
  });
};

export const mulApiDefinition = {
  id: 'mul',
  label: 'mul',
  createControlStates: createMulControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
