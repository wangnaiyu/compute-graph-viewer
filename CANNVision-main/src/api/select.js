import {
  apiLoad,
  apiRangeProgress,
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
  { id: 'selMode', label: 'selMode', min: 0, max: 2, defaultValue: 2 },
  { id: 'scalarValue', label: 'scalarValue', min: 0, max: 65535, defaultValue: 0 },
];

 const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Y: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  M: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'selMask',
    title: 'selMask',
    subtitle: '/选择掩码',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'src0',
    title: 'src0Local',
    subtitle: '/源数据集0',
    paintedCellClassName: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'src1',
    title: 'src1Local',
    subtitle: '/源数据集1',
    paintedCellClassName: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-sky-100 text-sky-800 border-sky-200',
  },
];

let flag = false;

export const createSelectControlStates = (parameters) => {
  //console.log(" >>> running create");
  
  const {
    mask,
    repeatTimes,
    binaryRepeatParams,
    selMode = 2,
    scalarValue = 0,
    elementSize = 2,
  } = parameters ?? {};

  const {
    dstBlkStride,
    src0BlkStride,
    src1BlkStride,
    dstRepStride,
    src0RepStride,
    src1RepStride,
  } = binaryRepeatParams;

  const src0Size = getOperandSize(
    repeatTimes,
    src0RepStride,
    src0BlkStride,
    elementSize
  )
    
  const src1Size = (selMode == 1) ? 0 : getOperandSize(
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

  const maskSize = (selMode == 0) ? MAX_MASK_BYTES / elementSize : getOperandSize(repeatTimes, dstRepStride, dstBlkStride, elementSize);

  const blockElements = BLOCK_SIZE / elementSize;
  const totalBlockCount = repeatTimes * BLOCKS_PER_REPEAT;

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
        flag = false;
        if (!memStates.selMask) memStates.selMask = {};
        stepId = 0;
        
        const src0Data = Array.from({ length: src0Size }, () => (Math.random() * 16) | 0);
        
        let src1Data;
        if (selMode !== 1) {
          src1Data = Array.from({ length: src1Size }, () => (Math.random() * 16) | 0);
        }
        
        const selMaskData = Array.from({ length: maskSize }, () => (Math.random() < 0.5 ? 0 : 1));
        const dstData = new Array(dstSize);

        apiLoad('src0', 'X', src0Size, totalBlockCount, blockElements, blockElements, src0Data);
        
        if (selMode !== 1) {
          apiLoad('src1', 'Y', src1Size, totalBlockCount, blockElements, blockElements, src1Data);
        }
        
        apiLoad('selMask', 'M', maskSize, totalBlockCount, 1, 1, selMaskData);
        apiLoad('dst', 'Z', dstSize, totalBlockCount, blockElements, blockElements, dstData);

        memStates.src0['X'].completedBlocks = 0;

        return { nodes: ['selMask', 'src0', 'src1', 'dst'], edges: [] };
      },
    },
    block: {
      next: () => {
        if (stepId === totalBlockCount) return 'clean';
        return 'block';
      },
      transfer: () => {
        const { st: dstSt, len: dstLen } = calculateRange(stepId, dstRepStride, dstBlkStride, elementSize, mask);
        const { st: src0St, len: src0Len } = calculateRange(stepId, src0RepStride, src0BlkStride, elementSize, mask);

        let src1St, src1Len;
        if (selMode !== 1) {
          ({ st: src1St, len: src1Len } = calculateRange(stepId, src1RepStride, src1BlkStride, elementSize, mask));
        }

        const dstData = memStates.dst['Z'].data;
        const src0Data = memStates.src0['X'].data;
        let src1Data;
        if (selMode !== 1) {
          src1Data = memStates.src1['Y'].data;
        }
        const selMaskData = memStates.selMask['M'].data; // 0/1 数组

        const repeatId = Math.floor(stepId / BLOCKS_PER_REPEAT);
        const blockId = stepId % BLOCKS_PER_REPEAT;
        const selMaskBitsPerIter = 256 / elementSize;

        if (selMode === 0 && blockId === 1 && flag == true) {
          console.log(" >>> reset selMask");
          memStates.selMask['M'].dataStage?.fill(0);
          for(let i = 0; i < BLOCK_BYTES / elementSize; i++) {
            memStates.selMask['M'].dataStage[i] += 1;
          }
        }

        if(selMode === 0 && blockId === 0 && stepId > 0){
          flag = true;
        }

        apiRangeProgress("dst", "Z", dstSt, dstLen);
        apiRangeProgress("src0", "X", src0St, src0Len);
        if (selMode !== 1) {
          apiRangeProgress("src1", "Y", src1St, src1Len);
        }

        const selMaskGlobalStart = (selMode === 0) ? 0 : repeatId * selMaskBitsPerIter;
        const selMaskBlockStart = selMaskGlobalStart + blockId * blockElements;
        const selMaskBlockLen = Math.min(blockElements, dstLen);
        apiRangeProgress("selMask", "M", selMaskBlockStart, selMaskBlockLen);

        for (let i = 0; i < dstLen; i++) {
          const selBitIndex = selMaskGlobalStart + blockId * blockElements + i;
          const bit = selMaskData[selBitIndex] ?? 0;
          if (bit) {
            dstData[dstSt + i] = src0Data[src0St + i];
          } else {
            if (selMode === 1) {
              dstData[dstSt + i] = scalarValue;
            } else {
              dstData[dstSt + i] = src1Data[src1St + i];
            }
          }
        }

        if (stepId > 0) {
          const prevStep = stepId - 1;
          const { st: dstPreSt, len: dstPreLen } = calculateRange(prevStep, dstRepStride, dstBlkStride, elementSize, mask);
          const { st: src0PreSt, len: src0PreLen } = calculateRange(prevStep, src0RepStride, src0BlkStride, elementSize, mask);

          apiRangeProgress("dst", "Z", dstPreSt, dstPreLen);
          apiRangeProgress("src0", "X", src0PreSt, src0PreLen);

          if (selMode !== 1) {
            const { st: src1PreSt, len: src1PreLen } = calculateRange(prevStep, src1RepStride, src1BlkStride, elementSize, mask);
            apiRangeProgress("src1", "Y", src1PreSt, src1PreLen);
          }

          const prevRepeatId = Math.floor(prevStep / BLOCKS_PER_REPEAT);
          const prevBlockId = prevStep % BLOCKS_PER_REPEAT;
          const prevSelMaskGlobalStart = (selMode === 0) ? 0 : prevRepeatId * selMaskBitsPerIter;
          const prevSelMaskBlockStart = prevSelMaskGlobalStart + prevBlockId * blockElements;
          const prevSelMaskBlockLen = Math.min(blockElements, dstPreLen);
          apiRangeProgress("selMask", "M", prevSelMaskBlockStart, prevSelMaskBlockLen);
        }

        stepId += 1;
        return { nodes: ['selMask', 'src0', 'src1', 'dst'], edges: [] };
      },
    },
    clean: {
      next: () => 'final',
      transfer: () => {
        const lastStepId = totalBlockCount - 1;

        const { st: dstSt, len: dstLen } = calculateRange(lastStepId, dstRepStride, dstBlkStride, elementSize, mask);
        const { st: src0St, len: src0Len } = calculateRange(lastStepId, src0RepStride, src0BlkStride, elementSize, mask);

        let src1St, src1Len;
        if (selMode !== 1) {
          ({ st: src1St, len: src1Len } = calculateRange(lastStepId, src1RepStride, src1BlkStride, elementSize, mask));
        }

        const lastRepeatId = Math.floor(lastStepId / BLOCKS_PER_REPEAT);
        const lastBlockId = lastStepId % BLOCKS_PER_REPEAT;
        const selMaskBitsPerIter = 256 / elementSize;
        const selMaskGlobalStart = (selMode === 0) ? 0 : lastRepeatId * selMaskBitsPerIter;
        const selMaskBlockStart = selMaskGlobalStart + lastBlockId * blockElements;
        const selMaskBlockLen = Math.min(blockElements, dstLen);

        apiRangeProgress("dst", "Z", dstSt, dstLen);
        apiRangeProgress("src0", "X", src0St, src0Len);
        if (selMode !== 1) {
          apiRangeProgress("src1", "Y", src1St, src1Len);
        }
        apiRangeProgress("selMask", "M", selMaskBlockStart, selMaskBlockLen);

        const nodes = ['selMask', 'src0', 'dst'];
        if (selMode !== 1) nodes.splice(1, 0, 'src1');
        return { nodes, edges: [] };
      },
    },
  };
};

export const selectApiDefinition = {
  id: 'select',
  label: 'select',
  createControlStates: createSelectControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
