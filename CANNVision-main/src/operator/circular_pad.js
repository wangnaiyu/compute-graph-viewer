import {
  memStates,
  stateProgress,
  stateLoadData,
  stateHasFinished,
  stateHasUnFinished,
  stateHasData,
} from './memstates';

const LINE_WIDTH=16
const I_W=10,I_H=2; // need to modify if line width is changed
const BLOCK_CNT=2;
// need to modify if line width is changed
const PADDING_CNT=3;
const LEFT_RIGHT_BLOCK=3;
const MID_BLOCK=4;

const INPUT_SINGLE_SIZE=I_W*I_H,INPUT_SIZE=INPUT_SINGLE_SIZE*BLOCK_CNT;
const W_W=16,W_H=I_H;
const W_SIZE=W_W*W_H;
const TB_PADDING_CNT=1;
const O_W=W_W, O_SH=W_H* 2*TB_PADDING_CNT;
const O_SINGLE_SIZE=W_W*W_H, O_SIZE=O_SINGLE_SIZE*BLOCK_CNT;
let block_idx=0;
let line_type="mid"; //  mid,  right,  left
const RED_COLOR={ 0: '#ff9fb3', 1: '#ff4f7a' };
const INPUT_MID_COLOR={ 0: '#ff9fb3', 1: '#ff4f7a' ,2: '#ff9fb3'};
const INPUT_LEFT_RIGHT_COLOR={ 0: '#ff9fb3', 1: '#ff4f7a' ,2: '#ff9fb3', 3: '#ff4f7a' ,4: '#ff9fb3'};
function get_input_color_mid(k,i){ return `IM${k}_${i}`;}
function get_input_color_right(k,i){ return `IR${k}_${i}`}
function get_input_color_left(k,i){ return `IL${k}_${i}`}
function get_input_color_left_p(k,i){ return `IPL${k}_${i}`;}
function get_input_color_right_p(k,i){ return `IPR${k}_${i}`;}
function get_output_color(k,t){ return `O${k}_${t}`;}
function get_w_color_mid(i){ return `WM_${i}`;}
function get_w_color_left(i){ return `WL_${i}`;}
function get_w_color_right(i){ return `WR_${i}`;}
const W_COLOR_LIST=[
  '#94a3b8',
  '#64748b',
  '#94a3b8',
  '#64748b',
  '#94a3b8',
  '#64748b',
  '#94a3b8',
  '#64748b',
  '#94a3b8',
]
function make_color(color_list,n){
  let res ={};
  for(let i=0;i<n;++i){
    res[i]=color_list[i];
  }
  return res;
}
const W_COLOR=make_color(W_COLOR_LIST,9);

const TEST_OUT_COLOR={0:'#90EE90',1:'#006400',2: '#ff9fb3'};

function gen_color(){
  let colors={
    I: { 0: '#ff9fb3', 1: '#ff4f7a' },
    W: { 0: '#B1E9FF33', 1: '#B1E9FF66' }, // work space color
    O: { 1: '#ffeaa0', 2: '#ffcf33' },
    I_FORWARD: { 0: '#ff9fb3', 1: '#ff4f7a' },
    I_BACKWARD: make_color(W_COLOR_LIST,2),
    W_FORWARD: make_color(W_COLOR_LIST,2),
    W_BACKWARD: TEST_OUT_COLOR, 
    I_UB: { 0:  '#ff9fb3',1: '#94a3b8',2: '#64748b'},
    // TODO
    W_UB: { 0:  '#94a3b8',1:'#90EE90',2:'#006400'},
  };
  for(let k =0;k<BLOCK_CNT;++k){
    for(let i=0;i<I_H;++i){
      colors[get_input_color_mid(k,i)]=INPUT_MID_COLOR;
      colors[get_input_color_left(k,i)]=colors[get_input_color_right(k,i)] =INPUT_LEFT_RIGHT_COLOR;
      colors[get_input_color_left_p(k,i)]=colors[get_input_color_right_p(k,i)]={}
    }
  }
  for(let i=0;i<W_H;++i) {
    colors[get_w_color_left(i)]=
    colors[get_w_color_right(i)]=
    colors[get_w_color_mid(i)]=W_COLOR;
  }
  // output color
  for(let k=0;k<BLOCK_CNT;++k){
    colors[get_output_color(k,"top")]=TEST_OUT_COLOR;
    colors[get_output_color(k,"main")]=TEST_OUT_COLOR;
    colors[get_output_color(k,"bottom")]=TEST_OUT_COLOR;
  }
  console.log('gen color');
  return colors;
}
let cur_k=0, cur_i=0, cur_block=0;
let ub_transfer =0;
let ws_type="main"; // main, top, bottom
function gen_gm_init(){
  // gen two input 
  for(let k =0;k<BLOCK_CNT;++k){
    for(let i=0;i<I_H;++i){
      console.log(`load P${i}`);
      stateLoadData("gm", get_input_color_left_p(k,i),PADDING_CNT,PADDING_CNT);
      stateLoadData("gm",get_input_color_left(k,i),LEFT_RIGHT_BLOCK,LEFT_RIGHT_BLOCK);
      stateLoadData("gm",get_input_color_mid(k,i),MID_BLOCK,MID_BLOCK);
      stateLoadData("gm",get_input_color_right(k,i),LEFT_RIGHT_BLOCK,LEFT_RIGHT_BLOCK);
      stateLoadData("gm", get_input_color_right_p(k,i),PADDING_CNT,PADDING_CNT);
      console.log(`load ${i}`);
    }
  }
  // gen workspace in gm
  for(let i=0;i<W_H;++i){
    stateLoadData("gm", get_w_color_left(i),PADDING_CNT,PADDING_CNT);
    stateLoadData("gm", get_w_color_mid(i),I_W,I_W);
    stateLoadData("gm", get_w_color_right(i),PADDING_CNT,PADDING_CNT);
  }
  // gen output
  for(let k=0;k<BLOCK_CNT;++k){
    // top
    stateLoadData("gm",get_output_color(k,"top"),O_W*TB_PADDING_CNT,O_W*TB_PADDING_CNT);
    stateLoadData("gm", get_output_color(k,"main"),O_W*I_H,O_W*I_H);
    stateLoadData("gm",get_output_color(k,"bottom"),O_W*TB_PADDING_CNT,O_W*TB_PADDING_CNT);
    // bottom
  }
}

function update_gm_input(k,i){
  if(line_type ==="mid"){
    stateProgress("gm", get_input_color_left(k,i));
    stateProgress("gm", get_input_color_mid(k,i));
    stateProgress("gm", get_input_color_right(k,i))
  }else if(line_type ==="left") stateProgress("gm", get_input_color_right(k,i))
  else stateProgress("gm", get_input_color_left(k,i));
}
function update_gm_w(i){
  if(line_type ==="mid") stateProgress("gm", get_w_color_mid(i));
  else if(line_type ==="right") stateProgress("gm", get_w_color_right(i));
  else stateProgress("gm", get_w_color_left(i));
}
let gm_state="iw"; // i->w, w->o

function to_w_f(){
  stateProgress("l2","I_BACKWARD");
  memStates.ub ={}
  update_gm_input(cur_k,cur_i);
  update_gm_w(cur_i);
  if(line_type === "left" || line_type === "right"){
    ++cur_i;
    if(cur_i ===I_H && line_type === "left"){
      gm_state ="wo";
    }
  }
  return ({nodes:["l2","gm","ub"],edges:["l2-gm"]})
}

function process_w_main_copy(){
  for(let i=0;i<W_H;++i){
    stateProgress("gm",get_w_color_left(i));
    stateProgress("gm",get_w_color_mid(i));
    stateProgress("gm",get_w_color_right(i));
  }
}
function process_w_top_copy(){
  for(let i=W_H-TB_PADDING_CNT;i<W_H;++i){
    stateProgress("gm",get_w_color_left(i));
    stateProgress("gm",get_w_color_mid(i));
    stateProgress("gm",get_w_color_right(i));
  }
}
function process_w_bottom_copy(){
  for(let i=0;i<TB_PADDING_CNT;++i){
    stateProgress("gm",get_w_color_left(i));
    stateProgress("gm",get_w_color_mid(i));
    stateProgress("gm",get_w_color_right(i));
  }
}
function process_out(t){
  console.log("process out: ",t,cur_k);
  stateProgress("gm",get_output_color(cur_k,t));
}


export const createCircularPadControlStates = () => ({
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  init: {
    next: () => "init_gm",
    transfer: () => {
      return ({ nodes: [], edges: [] })
    },
  },
  init_gm: {
    next: () => "gm_in_mid",
    transfer: () => { 
      cur_k =0;
      cur_i =0;
      console.log("init block: ",cur_block);
      line_type ="mid";
      gen_gm_init();
      return ({nodes: ["gm"], edges: []})
    },
  },
  gm_in_mid: {
    next: () => {
      return "l2_iw";
    },
    transfer: () => {
      console.log("in mid transfer",cur_k,cur_i);
      memStates.l2 ={}
      cur_block = I_W;
      line_type ="mid";
      return ({nodes: ["gm","l2"], edges: []});
    }
  },
  gm_in_right:{
    next: () => "l2_iw",
    transfer: ()=>{
      memStates.l2 ={}
      line_type ="left";
      cur_block =LEFT_RIGHT_BLOCK;
      return ({nodes: ["gm","l2"], edges: []});
    }
  },
  gm_in_left:{
    next: () => "l2_iw",
    transfer: ()=>{
      line_type ="right";
      memStates.l2 ={}
      cur_block =LEFT_RIGHT_BLOCK;
      return ({nodes: ["gm","l2"], edges: []});
    }
  },
  gm_to_w_mid: {
    next: () => "gm_in_left",
    transfer: to_w_f
  },
  gm_to_w_right: {
    next: () => {
      if(cur_i >= I_H) {
        cur_i =0;
        return "gm_in_right";
      }
      return "gm_in_mid";
    },
    transfer: to_w_f,
  },
  gm_to_w_left:{
    next: () => {
      if(cur_i >= I_H){
        gm_state ="wo";
        return "gm_copy_w_main_begin";
      }
      return "gm_in_right";
    },
    transfer: to_w_f,
  },
  l2_iw: {
    next: () => {
      if(stateHasFinished("l2", "I_FORWARD")) {
        if(line_type === "mid") return "gm_to_w_mid";
        else if(line_type ==="right") return "gm_to_w_right";
        return "gm_to_w_left";
      }
      ub_transfer =2;
      return "ub_iw";
    },
    transfer: () => {
      if(!("I_FORWARD" in memStates.l2)){
        console.log("hit l2 in transfer");
        stateLoadData("l2", "I_FORWARD",cur_block,cur_block);
        update_gm_input(cur_k,cur_i);
        return ({ nodes: ["l2", "gm"], edges: ["gm-l2"] });
      }
      if(!("I_BACKWARD" in memStates.l2)){
        // from ub
        stateLoadData("l2", "I_BACKWARD",cur_block,cur_block);
        stateProgress("ub","I_UB");
        return ({nodes: ["l2", "ub"], edges: ["ub-l2"]});
      }
    },
  },
  ub_iw: {
    next: () => {
      if(ub_transfer >0) return "ub_iw";
      return "l2_iw";
    },
    transfer: ()=> {
      --ub_transfer;
      if(!("I_UB" in memStates.ub)){
        stateLoadData("ub", "I_UB",cur_block,cur_block);
        stateProgress("l2", "I_FORWARD");
        return ({nodes: ["ub", "l2"], edges: ["l2-ub"]});
      }
      stateProgress("ub","I_UB");
      return ({nodes: ["ub"], edges: []});
    }
  },

  l2_wo: {
    next: () => {
      if(stateHasUnFinished("l2","W_FORWARD")) return "ub_wo";
      if(ws_type==="main") return "gm_copy_w_main_finish";
      if(ws_type==="top") return "gm_copy_w_top_finish";
      return "gm_copy_w_bottom_finish";
    },
    transfer: () => { 
      if(!("W_FORWARD" in memStates.l2)){
        // load from workspace
        if(ws_type === "top") {
          process_w_top_copy();
          console.log("process w top");
        }
        else if(ws_type === "bottom") process_w_bottom_copy();
        console.log("hit l2 in wo transfer, cur_block: ",cur_block);
        stateLoadData("l2","W_FORWARD",cur_block,cur_block);
        return ({nodes: ["gm","l2"],edges: ["gm-l2"]});
      }
      if(!("W_BACKWARD" in memStates.l2)){
        stateLoadData("l2","W_BACKWARD",cur_block,cur_block);
        stateProgress("ub","W_UB");
        return ({nodes: ["l2","ub"],edges: ["ub-l2"]});
      }
    },
  },
  ub_wo: {
    next: () => {
      if(stateHasFinished("ub","W_UB")) return "l2_wo";
      return "ub_wo";
    },
    transfer: () => {
      if(!("W_UB" in memStates.ub)){
        stateLoadData("ub","W_UB",cur_block,cur_block);
        stateProgress("l2","W_FORWARD");
        return ({nodes:["l2","ub"],edges:["l2-ub"]});
      }
      stateProgress("ub","W_UB");
      return ({nodes:["ub"],edges:[]});
    }

  },

  gm_copy_w_main_begin: {
    next: () => "l2_wo",
    transfer: () => { 
      console.log("copy w main",cur_k,cur_i);
      cur_i =0;
      cur_block =W_W*W_H;
      ws_type ="main";
      memStates.l2 ={}
      return ({nodes: ["gm","l2"], edges: []});

    },
  },
  gm_copy_w_main_finish:{
    next: ()=> "gm_copy_w_top_begin",
    transfer: ()=>{
      process_w_main_copy();
      process_out("main");
      stateProgress("l2","W_BACKWARD");
      memStates.ub ={};

      return ({nodes: ["gm","l2","ub"], edges: ["l2-gm"]});
    }
  },
  gm_copy_w_top_begin: {
    next: () => "l2_wo",
    transfer: ()=> {
      ws_type ="top";
      cur_block =TB_PADDING_CNT *W_W;
      memStates.l2 ={}
      return ({nodes: ["gm","l2"], edges: []});
    }

  },
  gm_copy_w_top_finish: {
    next: ()=> "gm_copy_w_bottom_begin",
    transfer: ()=> {
      // update top data
      process_w_top_copy();
      console.log("hit in copy top");
      stateProgress("l2","W_BACKWARD");
      // stateProgress("gm", get_output_color(0,W_H));
      process_out("top");

      memStates.ub ={};
      return ({nodes: ["gm","l2","ub"], edges: ["l2-gm"]});
    }
  },
  gm_copy_w_bottom_begin: {
    next: () => "l2_wo",
    transfer: () => {
      ws_type ="bottom";
      cur_block =TB_PADDING_CNT *W_W;
      memStates.l2 ={}
      return ({nodes: ["gm","l2"], edges: []});
    }
  },
  gm_copy_w_bottom_finish: {
    next: ()=> {
      if(cur_k >= BLOCK_CNT) return "free_l2";
      return "gm_in_mid";
    },
    transfer: ()=>{
      process_w_bottom_copy();
      process_out("bottom");
      stateProgress("l2","W_BACKWARD");
      memStates.ub ={};
      cur_i =0;
      ++cur_k;
      return ({nodes: ["gm","l2","ub"], edges: ["l2-gm"]});
    }

  },
  free_l2: {
    next: () => "final",
    transfer: () => {
      memStates.l2 ={};
      return ({nodes: ["l2"], edges: []});
    }
  }

});
export const dataColors = gen_color();

export const circularPadOperatorDefinition = {
  id: 'circular_pad',
  label: 'circular_pad',
  createControlStates: createCircularPadControlStates,
  dataColors,
};
