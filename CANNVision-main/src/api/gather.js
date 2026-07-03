import {
  memStates,
  apiLoad,
  apiRangeProgress,
  apiProgress,
} from './memstates';


const dstSize= 32 * 8;
const dstInitValue =-1;
const offsetSize= 32 * 8;
const srcSize= 32 * 8;


const blockSizeUnit = 32;
const srcStrideUnit = 32;
const dstStrideUnit = 32;
const offsetTag='src0', srcTag='src1', dstTag='dst';

export const dataColors = {
  OFFSET: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  SRC: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  DST: { 1: '#5D9DEA', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: 'src0',
    title: 'srcOffsetLocal',
    subtitle: '/源数据地址偏移张量',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'src1',
    title: 'srcLocal',
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
function apiRangeBack  (state, tag, st, len,step)  {
  console.assert(tag in memStates[state], ` !!! ${tag} not in ${state}!!!`);
  if (len === 0) return;
  const dataStage = memStates[state][tag].dataStage;
  const end = Math.min(st + len, dataStage.length);
  for (let i = st; i < end; i++) {
    dataStage[i]=Math.min(dataStage[i]-step,0);
  }
};
function apiSetPos(state,tag,pos,val){
  const dataStage = memStates[state][tag].dataStage;
  dataStage[pos]=val;
}
function apiGetPos(state,tag,pos){
  return memStates[state][tag].dataStage[pos];
}


let processed_grid_num =0;
let processingBlock=0;
let processingLen =0;
let finished =false;
let iterate_num =0;

export const createGatherControlStates = ({
  srcBaseAddr =0,
  mask=128,
  repeatTimes=4,
  dstBlockStride =1,
  dstRepStride=8,

} = {}, elementSize = 2) => {
  let perBlockGrid= (blockSizeUnit / elementSize) |0; // to integer 16
  let repeatStrideGrid =(dstRepStride *blockSizeUnit) /elementSize |0;


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
      next: () => "offset",
      transfer: ()=> {
        processed_grid_num =0;
        processingBlock=0;
        processingLen = Math.min(mask,perBlockGrid);
        finished =false;
        iterate_num =0;


        let offset_data =new Array(offsetSize);
        const half_size = offsetSize/2;
        for(let i=0;i<half_size;i++) offset_data[i]=2*elementSize*(half_size-i-1);
        // random
        let tmp= new Array(perBlockGrid);
        for(let k=0;k<half_size/perBlockGrid;k++){
          for(let i=0;i<perBlockGrid;i++) tmp[i]=(Math.random()*srcSize*elementSize)|0;
          tmp.sort((a,b)=>a-b);
          for(let i=0;i<perBlockGrid;i++) offset_data[half_size+k*perBlockGrid+i]=tmp[i];
        }
        apiLoad(offsetTag,'OFFSET',offsetSize,offsetSize,offsetSize,offsetSize,offset_data);

        let src_data=new Array(srcSize);
        for(let i=0;i<srcSize;i++) src_data[i]=i;
        apiLoad(srcTag,'SRC',srcSize,srcSize,srcSize,srcSize,src_data);

        let dst_init_data =new Array(dstSize);
        for(let i=0;i<dstSize;i++) dst_init_data[i]=dstInitValue;
        apiLoad(dstTag,'DST',dstSize,dstSize,dstSize,dstSize,dst_init_data);

        return ({nodes: [offsetTag,srcTag,dstTag], edges: [] });
      }
    },
    offset: {
      next: () => "src",
      transfer: () => {
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);
        return ({nodes: [offsetTag], edges: [] });
      }
    },
    src: {
      next: () => "dst",
      transfer: () => {
        let offset_data =memStates[offsetTag]['OFFSET'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+srcBaseAddr)/elementSize) |0;
          if(pos >= srcSize) continue;
          apiSetPos(srcTag,'SRC',pos,1);
        }
        return ({nodes: [srcTag], edges: [] });
      }
    },
    dst: {
      next: () => "process",
      transfer: () => {
        apiRangeProgress('dst','DST',processingBlock*perBlockGrid,processingLen);
        return ({nodes: [dstTag], edges: [] });
      },
    },
    process: {
      next: () => "clean",
      transfer: () => {
        let offset_data =memStates[offsetTag]['OFFSET'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+srcBaseAddr)/elementSize) |0;
          if(pos >= srcSize) continue;
          apiSetPos(srcTag,'SRC',pos,2);
        }
        let dst_data =memStates[dstTag]['DST'].data;
        let src_data =memStates[srcTag]['SRC'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+srcBaseAddr)/elementSize) |0;
          if(pos >= srcSize) continue;
          dst_data[processingBlock*perBlockGrid+i]=src_data[pos];
        }
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);
        apiRangeProgress(dstTag,'DST',processingBlock*perBlockGrid,processingLen);
        processed_grid_num += processingLen;
        return ({nodes: [offsetTag,srcTag,dstTag], edges: [] });
      },
    },
    clean: {
      next: ()=> {
        if(iterate_num >= repeatTimes) return "final";
        return "offset";
      },
      transfer: ()=> {
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);
        apiRangeProgress(dstTag,'DST',processingBlock*perBlockGrid,processingLen);

        let offset_data =memStates[offsetTag]['OFFSET'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+srcBaseAddr)/elementSize) |0;
          if(pos >= srcSize) continue;
          apiSetPos(srcTag,'SRC',pos,0);
        }
        // update
        if(processed_grid_num >= mask){
          console.log('processed_grid_num ',processed_grid_num,'mask',mask);
          processed_grid_num =0;
          // to next iteration
          iterate_num++;
          processingLen =Math.min(mask,perBlockGrid);
          if(iterate_num < repeatTimes){
            processingBlock =dstRepStride* iterate_num;
            // console.log('next iteration, processingBlock ',processingBlock);
          }
        }else{
          // next block
          processingBlock += dstBlockStride;
          processingLen = Math.min(mask- processed_grid_num,perBlockGrid);
        }
        return ({nodes: [offsetTag,srcTag,dstTag], edges: [] });
      }
    },
  });
};

export const gatherParameterDefinitions= [
  { id: 'srcBaseAddr', label: 'srcBaseAddr', min: 0, max: 128, defaultValue: 0 },

  { id: 'mask', label: 'mask', min: 1, max: 128, defaultValue: 128 },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 2, defaultValue: 2 },
  { id: 'dstRepStride', label: 'dstRepStride', min: 0, max: 255, defaultValue: 8 },

];

export const gatherApiDefinition = {
  id: 'gather',
  label: 'gather',
  createControlStates: createGatherControlStates,
  parameterDefinitions:gatherParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
