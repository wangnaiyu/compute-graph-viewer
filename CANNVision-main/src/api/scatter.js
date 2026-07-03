
import {
  memStates,
  apiLoad,
  apiRangeProgress,
} from './memstates';



const dstSize= 32 * 8;
const srcSize= 32 * 8;
const offsetSize= 32 * 8;
const dstInitValue =-1;


const blockSizeUnit = 32;
const srcStrideUnit = 32;
const dstStrideUnit = 32;
const srcTag='src0', offsetTag='src1',  dstTag='dst';

export const dataColors = {
  OFFSET: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  SRC: { 1: '#E6D4F3', 2: '#AD77F4', 3: '#E6D4F3' },
  DST: { 1: '#E6D4F3', 2: '#0671E8', 3: '#5D9DEA' },
};

export const apiNodeDefinitions = [
  {
    id: srcTag,
    title: 'srcLocal',
    subtitle: '/源数据集',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: offsetTag,
    title: 'srcOffsetLocal',
    subtitle: '/目标数据地址偏移张量',
    paintedCellClassName: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 'dst',
    title: 'dstLocal',
    subtitle: '/目标数据集',
    paintedCellClassName: 'bg-blue-100 text-blue-800 border-blue-200',
  },
];

function apiSetPos(state,tag,pos,val){
  const dataStage = memStates[state][tag].dataStage;
  dataStage[pos]=val;
}

let processed_grid_num =0;
let processingBlock=0;
let processingLen =0;
let finished =false;
let iterate_num =0;

export const createScatterControlStates = ({
  dstBaseAddr =0,
  mask=64,
  repeatTimes=4,
  srcRepStride=8,

} = {}, elementSize = 2) => {
  let perBlockGrid= (blockSizeUnit / elementSize) |0; // to integer 16


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
      transfer: ()=> {
        console.log('in load, dst base addr: ',dstBaseAddr);
        processed_grid_num =0;
        processingBlock=0;
        processingLen = Math.min(mask,perBlockGrid);
        finished =false;
        iterate_num =0;

        let src_data=new Array(srcSize);
        for(let i=0;i<srcSize;i++) src_data[i]=i;
        apiLoad(srcTag,'SRC',srcSize,srcSize,srcSize,srcSize,src_data);

        let offset_data =new Array(offsetSize);
        let half_size =offsetSize/2;
        for(let i=0;i<half_size;++i) offset_data[i]=i*2*elementSize;
        let tmp =new Array(perBlockGrid);
        for(let k=0;k<half_size/perBlockGrid;++k){
          for(let i=0;i<perBlockGrid;i++) tmp[i]= (Math.random() * dstSize)*elementSize | 0;
          tmp.sort((a,b)=>a-b);
          for(let i=0;i<perBlockGrid;i++) offset_data[half_size+k*perBlockGrid+i]=tmp[i];
        }
        apiLoad(offsetTag,'OFFSET',offsetSize,offsetSize,offsetSize,offsetSize,offset_data);

        let dst_data=new Array(dstSize);
        for(let i=0;i<dstSize;i++) dst_data[i]=dstInitValue;
        apiLoad('dst','DST',dstSize,dstSize,dstSize,dstSize,dst_data);
        return ({nodes: [offsetTag,srcTag,dstTag], edges: [] });
      }
    },

    src: {
      next: () => "offset",
      transfer: () => {
        apiRangeProgress(srcTag,'SRC',processingBlock*perBlockGrid,processingLen);
        return ({nodes: [srcTag], edges: [] });
      }
    },
    offset: {
      next: () => "dst",
      transfer: ()=> {
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);
        return ({nodes: [offsetTag], edges: [] });
      }
    },
    dst: {
      next: () => "process",
      transfer: () => {
        console.log('dst base addr: ',dstBaseAddr);
        let offset_data =memStates[offsetTag]['OFFSET'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+dstBaseAddr)/elementSize) |0;
          if(pos >= dstSize) continue;
          apiSetPos(dstTag,'DST',pos,1);
        }
        return ({nodes: [dstTag], edges: [] });
      },
    },
    process: {
      next: () => "clean",
      transfer: () => {
        // process the current block
        apiRangeProgress(srcTag,'SRC',processingBlock*perBlockGrid,processingLen);
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);
        let src_data =memStates[srcTag]['SRC'].data;
        let offset_data =memStates[offsetTag]['OFFSET'].data;
        let dst_data =memStates[dstTag]['DST'].data;
        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+dstBaseAddr)/elementSize) |0;
          if(pos >= dstSize) continue;
          dst_data[pos]=src_data[processingBlock*perBlockGrid+i];
          apiSetPos(dstTag,'DST',pos,2);
        }
        processed_grid_num += processingLen;
        return ({nodes: [srcTag,offsetTag,dstTag], edges: [] });
      },
    },
    clean: {
      next: ()=> {
        if(iterate_num >= repeatTimes) return "final";
        return "src";
      },
      transfer:()=> {
        apiRangeProgress(srcTag,'SRC',processingBlock*perBlockGrid,processingLen);
        apiRangeProgress(offsetTag,'OFFSET',processingBlock*perBlockGrid,processingLen);

        let offset_data =memStates[offsetTag]['OFFSET'].data;

        for(let i=0;i<processingLen;i++){
          let pos =((offset_data[processingBlock*perBlockGrid+i]+dstBaseAddr)/elementSize) |0;
          if(pos >= dstSize) continue;
          apiSetPos(dstTag,'DST',pos,3);
        }
        // udpate state
        if(processed_grid_num >= mask){
          processed_grid_num =0;
          // to next iteration
          iterate_num++;
          processingLen =Math.min(mask,perBlockGrid);
          if(iterate_num < repeatTimes){
            processingBlock =srcRepStride* iterate_num;
            // console.log('next iteration, processingBlock ',processingBlock);
          }else finished =true;
        }else{
          // next block
          processingBlock ++;
          processingLen = Math.min(mask- processed_grid_num,perBlockGrid);
        }
        return ({nodes: [srcTag,offsetTag,dstTag], edges: [] });
      }
    }
  });
};

export const scatterParameterDefinitions= [

  { id: 'dstBaseAddr', label: 'dstBaseAddr', min: 0, max: 256, defaultValue: 0 },
  { id: 'mask', label: 'mask', min: 1, max: 128, defaultValue: 64 },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 2, defaultValue: 2 },
  { id: 'srcRepStride', label: 'srcRepStride', min: 0, max: 255, defaultValue: 8 },

];

export const scatterApiDefinition = {
  id: 'scatter',
  label: 'scatter',
  createControlStates: createScatterControlStates,
  parameterDefinitions:scatterParameterDefinitions,
  dataColors,
  apiNodeDefinitions,
};
