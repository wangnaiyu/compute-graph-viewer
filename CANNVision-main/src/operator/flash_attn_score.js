import { stackTraceLimit } from 'postcss/lib/css-syntax-error';
import {
    stateRemove,
    stateProgress,
    stateLoadData,
    stateHasData,
    stateHasFinished,
    stateHasUnFinished,
    memStates,
} from './memstates';

const gmCols = 16;
const l2Cols = 7;
const l1Cols = 16;
const l0Cols = 8;
const ubLogicalCols = 16;

const gmQKVSize = 12 * gmCols;
const gmQKVBlock = 6 * gmCols;
const s1NBlocks = gmQKVSize / gmQKVBlock;
const s2NBlocks = gmQKVSize / gmQKVBlock;
const nBlocks = s1NBlocks * s2NBlocks;
const totalSteps = nBlocks * 2 + 1;

const gmOSize = 12 * gmCols;
const gmOBlock = 3 * gmCols;
const l2QKSize = 6 * l2Cols;
const l2QKBlock = 6 * l2Cols;
const l2Tmp1Size = 2 * l2Cols;
const l2MatmulBlock = 2 * l2Cols;
const l1QKSize = 6 * l1Cols;
const l1QKBlockSize = 2 * l1Cols;
const l1AttnweightSize = 3 * l1Cols;
const l1AttnweightBlock = 1 * l1Cols;
const l0aQKVSize = 8 * l0Cols;
const l0aQKVBlock = 8 * l0Cols;
const l0bKSize = l0aQKVSize;
const l0bKBlock = l0aQKVBlock;

const l0cTmp1Size = 8 * l0Cols;
const l0cTmp1BlockSize = 8 * l0Cols;
const ubVectorSize = 1 * ubLogicalCols;
const ubVectorBlockSize = ubVectorSize;
const l2MatmulSize = 2 * l2Cols;
const l2TmpBlock = l2MatmulSize;


const stateClear = (state) => {
    memStates[state] = {}
}

const stateHighlightOnly = (state, tag, st, len) => {
    // console.log(` >>> st: ${st}`);
    // console.log(` >>> len: ${len}`);
    const dataStage = memStates[state][tag].dataStage;
    const start = Math.max(0, st);
    const end = Math.min(st + len, dataStage.length);

    dataStage.fill(0);
    if (start < end) {
        dataStage.fill(1, start, end);
    }
};

const stateDataReset = (state, tag) => {
    const dataStage = memStates[state][tag].dataStage;
    dataStage.fill(0);
}

const stateHighlightRange = (state, tag, st, len) => {
    const dataStage = memStates[state][tag].dataStage;
    const start = Math.max(0, st);
    const end = Math.min(st + len, dataStage.length);

    if (start < end) {
        dataStage.fill(1, start, end);
    }
};

let stepId = 0;

export const createFlashAttnScoreControlStates = () => ({
    final: {
        next: () => "final",
        transfer: () => ({ nodes: [], edges: [] }),
    },
    init: {
        next: () => "gm",
        transfer: () => ({ nodes: [], edges: [] }),
    },
    gm: {
        next: () => "warm1",
        transfer: () => {
            stepId = 0;
            stateLoadData("gm", "Q", gmQKVSize, gmQKVBlock);
            stateLoadData("gm", "K", gmQKVSize, gmQKVBlock);
            stateLoadData("gm", "V", gmQKVSize, gmQKVBlock);
            stateLoadData("gm", "O", gmOSize, gmOBlock);

            return { nodes: ["gm"], edges: [] };
        },
    },
    warm1: {
        next: () => "warm1_l1",
        transfer: () => {
            // init-l2
            stateProgress("gm", "Q");
            stateProgress("gm", "K");
            stateProgress("gm", "V");

            stateLoadData("l2", "Q", l2QKSize, l2QKBlock);
            stateLoadData("l2", "K", l2QKSize, l2QKBlock);
            stateLoadData("l2", "V", l2QKSize, l2QKBlock);
            stateLoadData("l2", "matmul_", l2Tmp1Size, l2MatmulBlock);
            return { nodes: ["gm", "l2"], edges: ["gm-l2"] };
        },
    },
    warm1_l1: {
        next: () => "warm1_l0",
        transfer: () => {
            stateLoadData("l1", "Q", l1QKSize, l1QKBlockSize);
            stateLoadData("l1", "K", l1QKSize, l1QKBlockSize);

            stateProgress("l2", "Q");
            stateProgress("l2", "K");

            return {
                nodes: ["l2", "l1"],
                edges: ["l2-l1"]
            };
        },
    },
    warm1_l0: {
        next: () => "warm1_cube",
        transfer: () => {
            stateProgress("l1", "Q");
            stateProgress("l1", "K");
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K", l0bKSize, l0bKBlock);
            return { nodes: ["l0a", "l0b", "l1"], edges: ["l1-l0a", "l1-l0b"] };
        },
    },
    warm1_cube: {
        next: () => "warm1_l0c",
        transfer: () => {
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K");
            return { nodes: ["l0a", "l0b", "cube"], edges: ["l0a-cube", "l0b-cube"] };
        },
    },
    warm1_l0c: {
        next: () => (stateHasFinished("l1", "Q") ? "warm1_fixpipe" : "warm1_l0"),
        transfer: () => {
            if (!stateHasData("l0c", "c_matmul")) {
                stateLoadData("l0c", "c_matmul", l0cTmp1Size, l0cTmp1BlockSize);
            }
            stateProgress("l0c", "c_matmul");

            stateRemove("l0a", "Q");
            stateRemove("l0b", "K");
            // stateDataReset("l2", "Q");

            return { nodes: ["l0a", "l0b", "l0c", "l2"], edges: ["cube-l0c"] };
        },
    },
    warm1_fixpipe: {
        next: () => ("warm1_writel2"),
        transfer: () => {
            stateClear("l1");
            stateClear("l0a");
            stateClear("l0b");
            return { nodes: ["l1", "l0a", "l0b"], edges: ["l0c-fixpipe"] };
        },
    },
    warm1_writel2: {
        next: () => "warm2_step1",
        transfer: () => {
            stateClear("l0c");

            stateDataReset("l2", "Q");          // Q still useful, reset 
            stateProgress("l2", "K");           // K used, set to transparency
            stateProgress("l2", "matmul_");

            stateLoadData("l2", "K1", l2QKSize, l2QKBlock);
            stateHighlightOnly("gm", "K", gmQKVBlock, gmQKVBlock);

            stepId += 1;

            return { nodes: ["gm", "l2", "l0c"], edges: ["fixpipe-l2", "gm-l2"] };
        }
    },
    warm2_step1: {
        next: () => "warm2_step2",
        transfer: () => {
            // cube side:
            stateProgress("l2", "Q");
            stateProgress("l2", "K1");
            stateLoadData("l1", "Q", l1QKSize, l1QKBlockSize);
            stateLoadData("l1", "K1", l1QKSize, l1QKBlockSize);
            // output 
            stateLoadData("l2", "matmul2_", l2MatmulSize, l2MatmulBlock);   

            // vector side
            stateProgress("l2", "matmul_");
            stateLoadData("ub", "matmul", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "add", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "mul", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "sel", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "softmax", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "dropout", ubVectorSize, ubVectorBlockSize);
            
            // output
            stateLoadData("l2", "attn_weight_", l2MatmulSize, l2TmpBlock);
            return { nodes: ["l2", "ub", "l1"], edges: ["l2-ub", "l2-l1"] }
        }
    },
    warm2_step2: {
        next: () => "warm2_step3",
        transfer: () => {
            // cube
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K1", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K1");

            // vector
            stateProgress("ub", "matmul");
            return {
                nodes: ["l1", "l0a", "l0b", "vector", "ub"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            }
        }
    },
    warm2_step3: {
        next: () => "warm2_step4",
        transfer: () => {
            // cube
            stateProgress("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateProgress("l0b", "K1", l0bKSize, l0bKBlock);

            // vector
            stateProgress("ub", "add");
            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            }
        }
    },
    warm2_step4: {
        next: () => "warm2_step5",
        transfer: () => {
            // cube
            stateLoadData("l0c", "c_matmul", l0cTmp1Size, l0cTmp1BlockSize);
            stateProgress("l0c", "c_matmul");

            // vector
            stateProgress("ub", "add");
            return {
                nodes: ["l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            }
        }
    },
    warm2_step5: {
        next: () => "warm2_step6",
        transfer: () => {
            // cube
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K1", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K1");

            // vector
            stateProgress("ub", "mul");
            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["vector-ub"]
            }
        }
    },
    warm2_step6: {
        next: () => "warm2_step7",
        transfer: () => {
            // cube
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K1");

            // vector
            stateProgress("ub", "mul");
            return {
                nodes: ["l0a", "l0b", "cube", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            }
        }
    },
    warm2_step7: {
        next: () => "warm2_step8",
        transfer: () => {
            // cube
            stateProgress("l0c", "c_matmul");
            stateClear("l0a");
            stateClear("l0b");

            // vector
            stateProgress("ub", "sel");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub"],
                edges: ["cube-l0c", "vector-ub"]
            }
        }
    },
    warm2_step8: {
        next: () => "warm2_step9",
        transfer: () => {
            // cube
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K1", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K1");

            // vector ub->vector(sub)
            stateProgress("ub", "sel");
            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            }
        }
    },
    warm2_step9: {
        next: () => "warm2_step10",
        transfer: () => {
            // cube
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K1");

            // vector  vec->ub(softmax)
            stateProgress("ub", "softmax");
            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            }
        }
    },
    warm2_step10: {
        next: () => "warm2_step11",
        transfer: () => {
            // cube
            stateProgress("l0c", "c_matmul");
            stateClear("l0a");
            stateClear("l0b");

            // vector ub->vec(dropout)
            stateProgress("ub", "softmax")
            return {
                nodes: ["l0a", "l0b", "l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            }
        }
    },
    warm2_step11: {
        next: () => "warm2_step12",
        transfer: () => {
            // cube
            // to fixpipe

            // vector: vec->ub(dropout)
            stateProgress("ub", "dropout");


            return {
                nodes: ["fixpipe", "ub"],
                edges: ["l0c-fixpipe", "vector-ub"]
            }
        }
    },
    warm2_step12: {
        next: () => "c2v1_step1",
        transfer: () => {
            // cube
            stateProgress("l2", "matmul2_");      // block1 matmul output
            
            stateDataReset("l2", "Q");
            stateProgress("l2", "K1");              // used, set transparent
            stateClear("l0c");

            // vector
            stateProgress("l2", "matmul_");      // block2 matmul used
            stateProgress("l2", "attn_weight_");  // output 

            stateClear("ub");
            stateClear("l1");
            stepId ++;

            return {
                nodes: ["l2", "l0c", "ub", "l1"],
                edges: ["fixpipe-l2", "ub-l2"]
            }
        }
    },
    c2v1_step1: {
        next: () => "c2v1_step2",
        transfer : () => {
            console.log(` >>> stepId: ${stepId}`);

            // cube-side
            stateLoadData("l1", "V", l1QKSize, l1QKBlockSize);
            stateLoadData("l1", "attn_weight", l1QKSize, l1QKBlockSize);
            stateProgress("l2", "V");
            stateProgress("l2", "attn_weight_");    // as input-used

            // output:
            stateLoadData("l2", "attn_out_", l2Tmp1Size, l2TmpBlock);

            // vector-side
            if (stepId === 2) {
                stateProgress("l2", "matmul2_");
            } else {
                stateProgress("l2", "matmul_");
            }
            
            stateLoadData("ub", "matmul", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "add", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "mul", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "sel", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "softmax", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "dropout", ubVectorSize, ubVectorBlockSize);


            return {
                nodes: ["gm", "l2", "l1", "ub"],
                edges: ["l2-l1", "l2-ub"]
            }
        }
    },
    c2v1_step2: {
        next : () => "c2v1_step3",
        transfer : () => {
            if (stepId >= 4) {
                stateDataReset("l2", "final");
            }

            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");

            stateProgress("ub", "matmul");

            return {
                nodes: ["gm","l2", "l0a", "l0b", "l1", "vector", "ub"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            };
        }
    },
    c2v1_step3: {
        next : () => "c2v1_step4",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            };
        }
    },
    c2v1_step4: {
        next : () => "c2v1_step5",
        transfer : () => {
            stateLoadData("l0c", "c_attn_out", l0cTmp1Size, l0cTmp1BlockSize);
            stateProgress("l0c", "c_attn_out");
            stateClear("l0a");
            stateClear("l0b");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            };
        }
    },
    c2v1_step5: {
        next : () => "c2v1_step6",
        transfer : () => {
            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");

            stateProgress("ub", "mul");

            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "vector-ub"]
            };
        }
    },
    c2v1_step6: {
        next : () => "c2v1_step7",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            stateProgress("ub", "mul");

            return {
                nodes: ["l0a", "l0b", "cube", "ub", "vector"],
                edges: ["l0a-cube", "l0b-cube", "ub-vector"]
            };
        }
    },
    c2v1_step7: {
        next : () => "c2v1_step8",
        transfer : () => {
            stateProgress("l0c", "c_attn_out");
            stateClear("l0a");
            stateClear("l0b");

            stateProgress("ub", "sel");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub"],
                edges: ["cube-l0c", "vector-ub"]
            };
        }
    },
    c2v1_step8: {
        next : () => "c2v1_step9",
        transfer : () => {
            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");

            stateProgress("ub", "sel");

            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            };
        }
    },
    c2v1_step9: {
        next : () => "c2v1_step10",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            stateProgress("ub", "softmax");

            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            };
        }
    },
    c2v1_step10: {
        next : () => "c2v1_step11",
        transfer : () => {
            stateProgress("l0c", "c_attn_out");
            stateClear("l0a");
            stateClear("l0b");

            stateProgress("ub", "softmax");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            };
        }
    },
    c2v1_step11: {
        next : () => "c2v1_step12",
        transfer : () => {
            stateProgress("ub", "dropout");
            
            return {
                nodes: ["fixpipe", "ub"],
                edges: ["l0c-fixpipe", "vector-ub"]
            };
        }
    },
    c2v1_step12: {
        next : () => (stepId >= 7 ? "c2v2_step1" : "c1v2_step1"),
        transfer : () => {
            stateProgress("l2", "attn_out_");
                        // vector-side
            if (stepId === 2) {
                stateDataReset("l2", "matmul2_");
            } else {
                stateDataReset("l2", "matmul_");
            }

            stateClear("l0c");
            stateClear("ub");
            stateClear("l1");
            
            if (stateHasData("l2", "attn_weight_")) {
                stateDataReset("l2", "attn_weight_");
            } else {
                stateLoadData("l2", "attn_weight_", l2Tmp1Size, l2TmpBlock);
            }
            stateProgress("l2", "attn_weight_");

            let blockId = Math.floor(stepId / 2) + 1;

            // load next QK
            if (blockId < nBlocks) {
                let QId = Math.floor(blockId / 2);
                let KId = blockId % s2NBlocks;
                stateHighlightOnly("gm", "Q", QId*gmQKVBlock, gmQKVBlock);
                stateHighlightOnly("gm", "K", KId*gmQKVBlock, gmQKVBlock);
                stateDataReset("l2", "Q");
                stateDataReset("l2", "K");
                stateDataReset("l2", "V");
            }  else if (blockId === nBlocks) {
                let VId = Math.floor(blockId / 2) % s2NBlocks;
                console.log(` >>> VId: ${VId}`);
                stateHighlightOnly("gm", "V", VId*gmQKVBlock, gmQKVBlock);
                stateDataReset("l2", "Q");
                stateDataReset("l2", "K");
                stateDataReset("l2", "V");
            }

            stepId++;

            return {
                nodes: ["gm", "l2", "l0c", "ub", "l1"],
                edges: ["gm-l2", "fixpipe-l2", "ub-l2"]
            };
        }
    },
    c1v2_step1: {
        next: () => "c1v2_step2",
        transfer: () => {
            console.log(` >>> stepId: ${stepId}`);
            //  cube-side
            stateLoadData("l1", "Q", l1QKSize, l1QKBlockSize);
            stateLoadData("l1", "K", l1QKSize, l1QKBlockSize);
            stateProgress("l2", "Q");
            stateProgress("l2", "K");
            // output
            stateDataReset("l2", "matmul_");

            // vector side
            stateProgress("l2", "attn_out_");
            stateLoadData("ub", "attn_out", ubVectorSize, ubVectorBlockSize);
            
            stateLoadData("ub", "add", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "div", ubVectorSize, ubVectorBlockSize);

            // output
            if (!stateHasData("l2", "final")) {
                stateLoadData("l2", "final", l2MatmulSize, l2TmpBlock);
            } else {
                stateDataReset("l2", "final");
            }

            return {
                nodes: ["l2", "l1", "ub"],
                edges: ["l2-l1", "l2-ub"]
            };
        }
    },
    c1v2_step2: {
        next: () => "c1v2_step3",
        transfer: () => {
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K");

            stateProgress("ub", "attn_out");

            return {
                nodes: ["l0a", "l0b", "l1", "vector", "ub"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            };
        }
    },
    c1v2_step3: {
        next: () => "c1v2_step4",
        transfer: () => {
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            };
        }
    },
    c1v2_step4: {
        next: () => "c1v2_step5",
        transfer: () => {
            stateLoadData("l0c", "c_matmul", l0cTmp1Size, l0cTmp1BlockSize);
            stateProgress("l0c", "c_matmul");
            stateClear("l0a");
            stateClear("l0b");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            };
        }
    },
    c1v2_step5: {
        next: () => "c1v2_step6",
        transfer: () => {
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K");

            stateProgress("ub", "div");

            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "vector-ub"]
            };
        }
    },
    c1v2_step6: {
        next: () => "c1v2_step7",
        transfer: () => {
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K");

            stateProgress("l2", "final");
            stateDataReset("l2", "attn_out_")
            stateProgress("ub", "div");

            return {
                nodes: ["l0a", "l0b", "cube", "l2", "ub"],
                edges: ["l0a-cube", "l0b-cube", "ub-l2"]
            };
        }
    },
    c1v2_step7: {
        next: () => "c1v2_step8",
        transfer: () => {
            stateProgress("l0c", "c_matmul");
            stateClear("l0a");
            stateClear("l0b");
            
            stateClear("ub");
            stateProgress("gm", "O");
            stateProgress("l2", "final");

            return {
                nodes: ["gm", "l2", "ub", "l0a", "l0b", "l0c"],
                edges: ["cube-l0c"]
            };
        }
    },
    c1v2_step8: {
        next: () => "c1v2_step9",
        transfer: () => {
            stateLoadData("l0a", "Q", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "K", l0bKSize, l0bKBlock);
            stateProgress("l1", "Q");
            stateProgress("l1", "K");


            stateDataReset("l2", "final");

            return {
                nodes: ["l2", "l0a", "l0b", "l1"],
                edges: ["l1-l0a", "l1-l0b"]
            };
        },
    },
    c1v2_step9: {
        next: () => "c1v2_step10",
        transfer: () => {
            stateProgress("l0a", "Q");
            stateProgress("l0b", "K");

            return {
                nodes: ["l0a", "l0b", "cube"],
                edges: ["l0a-cube", "l0b-cube"]
            };
        }
    },
    c1v2_step10: {
        next: () => "c1v2_step11",
        transfer: () => {
            stateProgress("l0c", "c_matmul");
            stateClear("l0a");
            stateClear("l0b");

            return {
                nodes: ["l0a", "l0b", "l0c"],
                edges: ["cube-l0c"]
            };
        }
    },
    c1v2_step11: {
        next: () => "c1v2_step12",
        transfer: () => {
            stateClear("l1");
            stateClear("l0a");
            stateClear("l0b");

            stateDataReset("l2", "Q");
            stateDataReset("l2", "K");

            return {
                nodes: ["l2", "l1", "l0a", "l0b"],
                edges: ["l0c-fixpipe"]
            };
        }
    },
    c1v2_step12: {
        next: () => {
            return "c2v1_step1";
        },
        transfer: () => {
            stateClear("l0c");
            stateClear("ub");
            
            stateProgress("l2", "matmul_");
            
            let blockId = Math.floor(stepId / 2) + 1;
            if (blockId < nBlocks) {
                blockId = blockId - 1; // QK[i] next loop: AV[i-1]
                let VId = blockId % s2NBlocks;
                stateHighlightOnly("gm", "V", VId*gmQKVBlock, gmQKVBlock);
                stateLoadData("l2", "V", l2QKSize, l2QKBlock);
            }

            stepId++;

            return {
                nodes: ["gm", "l2", "l0c", "ub"],
                edges: ["fixpipe-l2", "gm-l2"]
            };
        }
    },
    c2v2_step1: {
        next: () => "c2v2_step2",
        transfer: () => {
            // cube-side
            stateDataReset("gm", "Q");
            stateDataReset("gm", "K");

            stateDataReset("l2", "K");              
            stateProgress("l2", "V");               // c2: V attn_weight -> attn_out_
            stateProgress("l2", "attn_weight_");

            stateLoadData("l1", "V", l1QKSize, l1QKBlockSize);
            stateLoadData("l1", "attn_weight", l1QKSize, l1QKBlockSize);

            stateProgress("l2", "attn_out_");    // v2: attn_out_ -> final

            stateLoadData("ub", "attn_out", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "add", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "div", ubVectorSize, ubVectorBlockSize);

            if (!stateHasData("l2", "final")) {
                stateLoadData("l2", "final", l2MatmulSize, l2TmpBlock);
            } else {
                stateDataReset("l2", "final");
            }

            return {
                nodes: ["gm", "l2", "l1", "ub"],
                edges: ["l2-l1", "l2-ub"]
            };
        }
    },
    c2v2_step2: {
        next : () => "c2v2_step3",
        transfer : () => {
            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");

            stateProgress("ub", "attn_out");

            return {
                nodes: ["l0a", "l0b", "l1", "vector", "ub"],
                edges: ["l1-l0a", "l1-l0b", "ub-vector"]
            };
        }
    },
    c2v2_step3: {
        next : () => "c2v2_step4",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "cube", "ub"],
                edges: ["l0a-cube", "l0b-cube", "vector-ub"]
            };
        }
    },
    c2v2_step4: {
        next : () => "c2v2_step5",
        transfer : () => {
            stateLoadData("l0c", "c_attn_out", l0cTmp1Size, l0cTmp1BlockSize);
            stateProgress("l0c", "c_attn_out");
            stateClear("l0a");
            stateClear("l0b");

            stateProgress("ub", "add");

            return {
                nodes: ["l0a", "l0b", "l0c", "ub", "vector"],
                edges: ["cube-l0c", "ub-vector"]
            };
        }
    },
    c2v2_step5: {
        next : () => "c2v2_step6",
        transfer : () => {
            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");

            stateProgress("ub", "div");

            return {
                nodes: ["l0a", "l0b", "l1", "ub", "vector"],
                edges: ["l1-l0a", "l1-l0b", "vector-ub"]
            };
        }
    },
    c2v2_step6: {
        next : () => "c2v2_step7",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            stateProgress("l2", "final");
            stateDataReset("l2", "attn_out_");
            stateProgress("ub", "div");

            return {
                nodes: ["l0a", "l0b", "cube", "l2", "ub"],
                edges: ["l0a-cube", "l0b-cube", "ub-l2"]
            };
        }
    },
    c2v2_step7: {
        next : () => "c2v2_step8",
        transfer : () => {
            stateProgress("l0c", "c_attn_out");
            stateClear("l0a");
            stateClear("l0b");

            stateClear("ub");
            stateProgress("gm", "O");
            stateProgress("l2", "final");

            return {
                nodes: ["l0a", "l0b", "l0c", "l2", "gm", "ub"],
                edges: ["cube-l0c"]
            };
        }
    },
    c2v2_step8: {
        next : () => "c2v2_step9",
        transfer : () => {
            stateLoadData("l0a", "attn_weight", l0aQKVSize, l0aQKVBlock);
            stateLoadData("l0b", "V", l0bKSize, l0bKBlock);
            stateProgress("l1", "attn_weight");
            stateProgress("l1", "V");
            
            stateDataReset("l2", "final");

            return {
                nodes: ["l0a", "l0b", "l1", "l2"],
                edges: ["l1-l0a", "l1-l0b"]
            };
        }
    },
    c2v2_step9: {
        next : () => "c2v2_step10",
        transfer : () => {
            stateProgress("l0a", "attn_weight");
            stateProgress("l0b", "V");

            return {
                nodes: ["l0a", "l0b", "cube"],
                edges: ["l0a-cube", "l0b-cube"]
            };
        }
    },
    c2v2_step10: {
        next : () => "c2v2_step11",
        transfer : () => {
            stateProgress("l0c", "c_attn_out");

            return {
                nodes: ["l0c"],
                edges: ["cube-l0c"]
            };
        }
    },
    c2v2_step11: {
        next : () => "c2v2_step12",
        transfer : () => {
            
            stateClear("l0a");
            stateClear("l0b")
            return {
                nodes: ["fixpipe", "l0a", "l0b"],
                edges: ["l0c-fixpipe"]
            };
        }
    },
    c2v2_step12: {
        next : () => "tail_v2_step1",
        transfer : () => {
            stateProgress("l2", "attn_out_");   // c2 output

            stateClear("l0c");
            stateClear("ub");
            stateClear("l1");
        
            stateDataReset("gm", "V");
            stateProgress("l2", "attn_weight_");
            stateProgress("l2", "V");               // c2: used, set transparency
            stepId++;

            return {
                nodes: ["gm", "l2", "l0c", "ub", "l1"],
                edges: ["fixpipe-l2"]
            };
        }
    },
    tail_v2_step1: {
        next: () => "tail_v2_step2",
        transfer: () => {
            stateLoadData("ub", "attn_out", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "add", ubVectorSize, ubVectorBlockSize);
            stateLoadData("ub", "div", ubVectorSize, ubVectorBlockSize);
            stateProgress("l2", "attn_out_");

            if (!stateHasData("l2", "final")) {
                stateLoadData("l2", "final", l2MatmulSize, l2TmpBlock);
            } else {
                stateDataReset("l2", "final");
            }

            return {
                nodes: ["gm", "l2", "ub"],
                edges: ["l2-ub"]
            };
        }
    },
    tail_v2_step2: {
        next: () => "tail_v2_step3",
        transfer: () => {
            stateProgress("ub", "attn_out");

            return {
                nodes: ["ub", "vector"],
                edges: ["ub-vector"]
            };
        }
    },
    tail_v2_step3: {
        next: () => "tail_v2_step4",
        transfer: () => {
            stateProgress("ub", "add");

            return {
                nodes: ["ub", "vector"],
                edges: ["vector-ub"]
            };
        }
    },
    tail_v2_step4: {
        next: () => "tail_v2_step5",
        transfer: () => {
            stateProgress("ub", "add");

            return {
                nodes: ["ub", "vector"],
                edges: ["ub-vector"]
            };
        }
    },
    tail_v2_step5: {
        next: () => "tail_v2_step6",
        transfer: () => {
            stateProgress("ub", "div");

            return {
                nodes: ["ub", "vector"],
                edges: ["vector-ub"]
            };
        }
    },
    tail_v2_step6: {
        next: () => "tail_v2_step7",
        transfer: () => {
            stateProgress("ub", "div");
            stateProgress("l2", "final");

            return {
                nodes: ["l2", "ub"],
                edges: ["ub-l2"]
            };
        }
    },
    tail_v2_step7: {
        next: () => "tail_v2_step8",
        transfer: () => {
            stateProgress("l2", "final");
            stateProgress("gm", "O");
            stateDataReset("l2", "attn_out_")
            stateClear("ub");

            return {
                nodes: ["gm", "l2", "ub"],
                edges: ["l2-gm"]
            };
        }
    },
    tail_v2_step8: {
        next: () => "final",
        transfer: () => {
            stateProgress("l2", "final");

            return {
                nodes: ["l2"],
                edges: []
            };
        }
    },
});

const createOpacityStages = (baseColor) => ({
    1: `${baseColor}66`,
    2: `${baseColor}99`,
    3: `${baseColor}CC`,
    4: `${baseColor}FF`,
});

const cColorStages = createOpacityStages('#858585');
const cMatmulColorStages = createOpacityStages('#8800ff');
const cAttnOutColorStages = createOpacityStages('#00f2ff');

export const dataColors = {
    Q: { 0: '#ED85EC33', 1: '#ED85ECFF' },
    K: { 0: '#B1E9FF33', 1: '#5CA7FFFF', 0: '#B1E9FF33', },
    K1: { 0: '#B1E9FF33', 1: '#5CA7FFFF' },
    V: { 0: '#8FE6C433', 1: '#8FE6C4CC' },
    C: {
        // 0: '#5CA7FF33',
        ...cColorStages,
    },
    c_matmul: {
        ...cMatmulColorStages,
    },
    c_attn_out: {
        ...cAttnOutColorStages,
    },
    O: {
        // 0: '#5CA7FF33',
        ...cColorStages,
    },
    matmul_: { 1: '#8800ff31', 2: '#8800ffFF'},
    matmul: { 0: '#8800ff31', 1: '#8800ffFF' },
    matmul2_: { 1: '#8800ff31', 2: '#8800ffFF'},
    matmul2: { 0: '#8800ff31', 1: '#8800ffFF'},
    tmp1_ : {  0: '#85858533', 1: '#858585FF', 2: '#85858533',},
    attn_weight_: { 1: '#ff000033', 2: 'rgb(255, 0, 0)', },      // attn_weight as an output
    attn_weight: { 0: '#ff000033', 1: 'rgb(255, 0, 0)', },       // attn_weight as an source data
    add:    {  1: '#85858533', 2: '#858585FF',},
    mul:    {  1: '#85858533', 2: '#858585FF',},
    sel:    {  1: '#85858533', 2: '#858585FF',},
    softmax: {  1: '#85858533', 2: '#858585FF', },
    dropout: {  1: '#ff000033', },
    div: { 1: "#00ff2233", 2: "#00ff22ff"},
    attn_out_: { 1: "#00f2ff33", 2: "#00f2ffFF"},
    attn_out: { 0: "#00f2ff33", 1: "#00f2ffFF"},
    final: { 1: "#00ff2233", 2: "#00ff22ff"}

};

export const flashAttnScoreOperatorDefinition = {
    id: 'flash_attn_score',
    label: 'flash_attn_score',
    createControlStates: createFlashAttnScoreControlStates,
    dataColors,
};

