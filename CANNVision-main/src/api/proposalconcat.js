import {
  apiLoad,
  apiRangeProgress,
  memStates,
} from './memstates';

const ELEMENTS_PER_ITER = 16;
const PROPOSAL_SIZE = 8;
const DEFAULT_REPEAT_TIME = 2;
const DEFAULT_MODE_NUMBER = 4;

let stepId = 0;

export const parameterDefinitions = [
  {
    id: 'repeatTime',
    label: 'repeatTime',
    min: 0,
    max: 255,
    defaultValue: DEFAULT_REPEAT_TIME,
  },
  {
    id: 'modeNumber',
    label: 'modeNumber',
    min: 0,
    max: 5,
    defaultValue: DEFAULT_MODE_NUMBER,
    options: [
      { value: 0, label: '0 - x1' },
      { value: 1, label: '1 - y1' },
      { value: 2, label: '2 - x2' },
      { value: 3, label: '3 - y2' },
      { value: 4, label: '4 - score' },
      { value: 5, label: '5 - label' },
    ],
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
  },
];

export const dataColors = {
  X: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  Z: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'src0',
    title: 'src0Local',
    subtitle: '/源数据集0',
    paintedCellClassName: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-sky-100 text-sky-800 border-sky-200',
  },
];

export const createProposalConcatControlStates = (parameters) => {
  const {
    repeatTime = DEFAULT_REPEAT_TIME,
    modeNumber = DEFAULT_MODE_NUMBER,
    dataType: dataTypeValue = 0,
  } = parameters ?? {};
  const dataType = dataTypeValue === 1 ? 'float' : 'half';
  const elementSize = dataTypeValue === 1 ? 4 : 2;
  const totalIters = repeatTime;                                 // 总迭代次数
  const srcSize = totalIters * ELEMENTS_PER_ITER;                // 源元素总数
  const dstSize = totalIters * ELEMENTS_PER_ITER * PROPOSAL_SIZE; // 目标元素总数
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
        // 生成随机源数据
        const srcData = Array.from(
          { length: srcSize },
          () => Math.round((Math.random() * 200 - 100) * 100) / 100
        );
        // 目标数据初始全0
        const dstData = new Array(dstSize).fill(0);
        // 加载数据
        apiLoad(
          'src0', 'X',
          srcSize,
          totalIters,
          ELEMENTS_PER_ITER,
          ELEMENTS_PER_ITER,
          srcData
        );
        apiLoad(
          'dst', 'Z',
          dstSize,
          totalIters,
          ELEMENTS_PER_ITER * PROPOSAL_SIZE,
          ELEMENTS_PER_ITER * PROPOSAL_SIZE,
          dstData
        );
        // 重置完成计数
        memStates.src0['X'].completedBlocks = 0;
        memStates.dst['Z'].completedBlocks = 0;
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    block: {
      next: () => (stepId < totalIters ? 'block' : 'clean'),
      transfer: () => {
        const iter = stepId;
        // 当前迭代的源数据范围
        const srcStart = iter * ELEMENTS_PER_ITER;
        const srcLen = ELEMENTS_PER_ITER;
        // 当前迭代的目标数据范围（16个Proposal，共128个元素）
        const dstStart = iter * ELEMENTS_PER_ITER * PROPOSAL_SIZE;
        const dstLen = ELEMENTS_PER_ITER * PROPOSAL_SIZE;
        const srcData = memStates.src0['X'].data;
        const dstData = memStates.dst['Z'].data;
        // 将16个源元素写入对应Proposal的指定字段
        for (let i = 0; i < ELEMENTS_PER_ITER; i++) {
          const srcIdx = srcStart + i;
          const propStart = dstStart + i * PROPOSAL_SIZE;   // 第i个Proposal的起始索引
          const fieldIdx = propStart + modeNumber;          // modeNumber指定的字段位置
          dstData[fieldIdx] = srcData[srcIdx];
        }
        // 高亮当前步骤
        apiRangeProgress('src0', 'X', srcStart, srcLen);
        apiRangeProgress('dst', 'Z', dstStart, dstLen);
        // 对前一步骤的二次高亮（淡出效果）
        if (stepId > 0) {
          const prevIter = stepId - 1;
          apiRangeProgress('src0', 'X', prevIter * ELEMENTS_PER_ITER, ELEMENTS_PER_ITER);
          apiRangeProgress('dst', 'Z', prevIter * ELEMENTS_PER_ITER * PROPOSAL_SIZE, ELEMENTS_PER_ITER * PROPOSAL_SIZE);
        }
        stepId++;
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
    clean: {
      next: () => 'final',
      transfer: () => {
        if (totalIters > 0) {
          const lastIter = totalIters - 1;
          apiRangeProgress('src0', 'X', lastIter * ELEMENTS_PER_ITER, ELEMENTS_PER_ITER);
          apiRangeProgress('dst', 'Z', lastIter * ELEMENTS_PER_ITER * PROPOSAL_SIZE, ELEMENTS_PER_ITER * PROPOSAL_SIZE);
        }
        return { nodes: ['src0', 'dst'], edges: [] };
      },
    },
  };
};

export const proposalConcatApiDefinition = {
  id: 'proposalConcat',
  label: 'proposalConcat',
  createControlStates: createProposalConcatControlStates,
  parameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};