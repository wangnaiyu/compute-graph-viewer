import {
  memStates,
  apiLoad,
  apiRangeProgress,
} from './memstates';


const dstSize= 32 * 8;
const dstInitValue =-1;


const blockSizeUnit = 32;
const srcStrideUnit = 32;
const dstStrideUnit = 32;

export const dataColors = {
  DST: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];
// // add an api 
// function apiRangeSet  (state, tag, st, len,val)  {
//   console.assert(tag in memStates[state], ` !!! ${tag} not in ${state}!!!`);
//   if (len === 0) return;
//   const dataStage = memStates[state][tag].dataStage;
//   const end = Math.min(st + len, dataStage.length);
//   for (let i = st; i < end; i++) {
//     dataStage[i]=val;
//   }
// };


let processed_grid_num =0;
let processingBlock=0;
let processingLen =0;
let iterate_num =0;

export const createDuplicateControlStates = ({
  scalarValue =1,
  mask=64,
  repeatTimes=4,
  dstBlockStride =1,
  dstRepeatStride=8,

} = {}, elementSize = 2) => {
  let perBlockGrid= (blockSizeUnit / elementSize) |0; // to integer 16
  let repeatStrideGrid =(dstRepeatStride *blockSizeUnit) /elementSize |0;


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
      next: () => "dst",
      transfer: ()=> {
        processed_grid_num =0;
        processingBlock=0;
        processingLen = Math.min(mask,perBlockGrid);
        iterate_num =0;

        let dst_init_data =new Array(dstSize);
        for(let i=0;i<dstSize;i++) dst_init_data[i]=dstInitValue;
        apiLoad('dst','DST',dstSize,dstSize,dstSize,dstSize,dst_init_data);
        return ({nodes: ["dst"], edges: [] });
      }
    },
    dst: {
      next: () => "process",
      transfer: () => {
        apiRangeProgress('dst','DST',processingBlock*perBlockGrid,processingLen);
        processed_grid_num += processingLen;
        // console.log('in dst: ',`processed_grid_num ${processed_grid_num}, processingLen ${processingLen}`);
        return ({nodes: ["dst"], edges: [] });
      },
    },
    process: {
      next: () => "clean",
      transfer: () => {
        // process the current block
        let dst_data =memStates.dst['DST'].data;
        let offset =processingBlock*perBlockGrid;
        for(let i=0;i<processingLen;++i) dst_data[offset+i] =scalarValue;
        apiRangeProgress('dst','DST',processingBlock*perBlockGrid,processingLen);
        return ({nodes: ["dst"], edges: [] });
      },
    },
    clean: {
      next: ()=> {
        if(iterate_num >= repeatTimes) return "final";
        return "dst";
      },
      transfer: ()=> {
        apiRangeProgress('dst','DST',processingBlock*perBlockGrid,processingLen);
        // udpate state
        // update the block
        if(processed_grid_num >= mask){
          processed_grid_num =0;
          // to next iteration
          iterate_num++;
          processingLen =Math.min(mask,perBlockGrid);
          if(iterate_num < repeatTimes){
            processingBlock =dstRepeatStride* iterate_num;
            // console.log('next iteration, processingBlock ',processingBlock);
          }
        }else{
          // next block
          processingBlock += dstBlockStride;
          processingLen = Math.min(mask- processed_grid_num,perBlockGrid);
        }
        return ({nodes: ["dst"], edges: [] });
      }
    },
  });
};

export const duplicateParameterDefinitions= [
  { id: 'scalarValue', label: 'scalarValue', min: 1, max: 4095, defaultValue: 1 },
  { id: 'mask', label: 'mask', min: 1, max: 128, defaultValue: 64 },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 2, defaultValue: 2 },
  { id: 'dstBlockStride', label: 'dstBlockStride', min: 0, max: 65535, defaultValue: 1 },
  { id: 'dsdtRepeatStride', label: 'dstRepeatStride', min: 0, max: 255, defaultValue: 8 },

];

export const duplicateApiDefinition = {
  id: 'duplicate',
  label: 'duplicate',
  createControlStates: createDuplicateControlStates,
  parameterDefinitions:duplicateParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
