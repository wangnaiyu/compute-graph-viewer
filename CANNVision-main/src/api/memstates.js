export let memStates = {
  src0: {},
  src1: {},
  src2: {},
  dst: {},
  loadData: (node, datalabel, size, stride) => {
    memStates[node][datalabel] = createDetailedDataItem(datalabel, size, stride);
  },
  reset: () => {
    memStates.src0 = {};
    memStates.src1 = {};
    memStates.src2 = {};
    memStates.dst = {};
  },
  progress: (state, tag) => {
    memStates[state][tag].finishStride += 1;
    console.assert(memStates[state][tag].finishStride <= memStates[state][tag].nStride);
  },
};

export const API_GRID_COLUMNS = 32;
export const API_GRID_ROWS = 8;
export const API_GRID_TOTAL_CELLS = API_GRID_COLUMNS * API_GRID_ROWS;

export const defaultApiParameterDefinitions = [
  { id: 'blockCount', label: 'block-count', min: 1, max: 4095, defaultValue: 4 },
  { id: 'blockLen', label: 'block-size', min: 1, max: 65535, defaultValue: 2 },
  { id: 'srcStride', label: 'src-stride', min: 0, max: 65535, defaultValue: 0 },
  { id: 'dstStride', label: 'dst-stride', min: 0, max: 65535, defaultValue: 0 },
];

const getApiParameterChildren = (parameterDefinition) =>
  parameterDefinition.children ?? parameterDefinition.fields ?? [];
const isApiParameterGroup = (parameterDefinition) =>
  (parameterDefinition.type ?? 'number') === 'group';
const getApiLeafGroupChildren = (parameterDefinition) => {
  const childDefinitions = getApiParameterChildren(parameterDefinition);

  if (childDefinitions.some(isApiParameterGroup)) {
    throw new Error(`Nested API parameter groups are not supported: ${parameterDefinition.id}`);
  }

  return childDefinitions;
};

export const buildApiParameterValues = (parameterDefinitions = defaultApiParameterDefinitions) =>
  parameterDefinitions.reduce((parameterValues, parameterDefinition) => {
    const parameterType = parameterDefinition.type ?? 'number';

    if (parameterType === 'group') {
      parameterValues[parameterDefinition.id] = buildApiParameterValues(
        getApiLeafGroupChildren(parameterDefinition)
      );
      return parameterValues;
    }

    parameterValues[parameterDefinition.id] =
      parameterDefinition.defaultValue ?? parameterDefinition.min ?? 0;
    return parameterValues;
  }, {});

export const unaryApiNodeDefinitions = [
  {
    id: 'src0',
    title: 'src0Local',
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

export const binaryApiNodeDefinitions = [
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

export const ternaryApiNodeDefinitions = [
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
    id: 'src2',
    title: 'src2Local',
    subtitle: '/第三个源数据集',
    paintedCellClassName: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

export const apiNodeDefinitionPresets = {
  unary: unaryApiNodeDefinitions,
  binary: binaryApiNodeDefinitions,
  ternary: ternaryApiNodeDefinitions,
};

export const clampApiPaintCount = (count) => {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(API_GRID_TOTAL_CELLS, count));
};

export const apiProgress = (state, tag) => {
  let strideId = memStates[state][tag].finishStride % memStates[state][tag].nStride;
  let stride = memStates[state][tag].stride;
  let block_size = memStates[state][tag].blockSize;
  let st = strideId * stride;
  apiRangeProgress(state, tag, st, block_size);
}

export const apiRangeProgress = (state, tag, st, len) => {
  console.assert(tag in memStates[state], ` !!! ${tag} not in ${state}!!!`);

  if (len === 0) return;

  const dataStage = memStates[state][tag].dataStage;
  const end = Math.min(st + len, dataStage.length);
  for (let i = st; i < end; i++) {
    dataStage[i]++;
  }
};

export const apiLoad = (state, tag, size, nStride, blockSize, stride, data) => {
  if (!(tag in memStates[state])) {
    memStates[state][tag] = { 
      tag, size, nStride, blockSize, stride, data, 
      dataStage: new Uint32Array(size),
    };
    console.log(` >>> memStates[state][tag] : ${memStates[state][tag]}`);
     
  } else {
    memStates[state][tag].tag = tag;
    memStates[state][tag].size = size;
    memStates[state][tag].nStride = nStride;
    memStates[state][tag].blockSize = blockSize;
    memStates[state][tag].stride = stride;
    memStates[state][tag].data = data;
    memStates[state][tag].dataStage = new Uint32Array(size);
  }
};


export const apiRemoveHighlight = (state, tag) => {
  delete memStates[state][tag].size;
  delete memStates[state][tag].nStride;
  delete memStates[state][tag].blockSize;
  delete memStates[state][tag].finishStride;
};

export const getNextDataAIdx = () => {
  let lastLoadedIndex = -1;

  for (const tag in memStates.src0) {
    if (tag.startsWith("A-") && "nStride" in memStates.src0[tag]) {
      const index = Number(tag.slice(2));
      if (Number.isInteger(index) && index > lastLoadedIndex) {
        lastLoadedIndex = index;
      }
    }
  }

  return lastLoadedIndex + 1;
};

export const getCurrentDataAIdx = () => getNextDataAIdx() - 1;
