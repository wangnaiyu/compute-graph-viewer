import { useState, useCallback, useEffect, useEffectEvent, useRef } from 'react';
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';

// 194.83 - 183.42  - 10.54
console.log(window.visualViewport?.width, window.visualViewport?.height);

import cannLogoPng from './assets/cann-logo.png';
import fanPng from './assets/fan.png';
import matmulPng from './assets/matmul.png';
import { NavigationIcon } from './pageutils';
import { hexToRgba, getReadableTextColor } from './colorUtils';

import { memStates } from './operator/memstates';
import { getOperatorDefinition, operatorProcessItems } from './operator';
import {
  memStates as apiMemStates,
  API_GRID_COLUMNS,
  API_GRID_TOTAL_CELLS,
  clampApiPaintCount,
} from './api/memstates';
import {
  apiOperationItems,
  buildApiParameterValues,
  defaultApiParameterDefinitions,
  getApiOperationDefinition,
} from './api';

const apiFloatingbarAPISelectorHeight = 36;
const apiFloatingbarParamControllerHeight = 36;

const apiFloatingbarHeight = 56;
const apiFloatingbarWidth = 1783 

const apiFloatingBarParamInputboxHeight = 28;
const apiFloatingBarParamInputboxWidth = 47;

const DEFAULT_GRID_ROWS = 4;
const DEFAULT_GRID_COLS = 8;
const DEFAULT_GRID_CELL_SIZE = 10.54;
const DEFAULT_GRID_CELL_GAP = 0.87;
const DEFAULT_GRID_CELL_RADIUS = 1.76;
const DEFAULT_GRID_CELL_BORDER_WIDTH = 0.88;
const DEFAULT_GRID_CELL_BORDER_COLOR = '#E3E7EA';
const DEFAULT_NODE_BACKGROUND = '#FFFFFF';
const DEFAULT_NODE_BORDER_RADIUS = 14;
const DEFAULT_NODE_WIDTH = 208;
const DEFAULT_NODE_HEIGHT = 'auto';
const DEFAULT_NODE_LABEL_FONT_SIZE = 16;
const MUTED_NODE_BACKGROUND = '#A6A8A9';
const MUTED_NODE_SHADOW = '0px 4px 20px 0px #A6A8A93F';
const CONTROL_NODE_LABEL_STYLE = {
  width: '100%',
  color: '#FFFFFF',
  fontFamily: 'HarmonyOS Sans SC',
  fontWeight: 'bold',
  fontSize: '16px',
  lineHeight: '24px',
  letterSpacing: '0px',
};
const FIXPIPE_LABEL_STYLE = {
  ...CONTROL_NODE_LABEL_STYLE,
  textAlign: 'center',
};
const INSTRUCTION_NODE_LABEL_STYLE = {
  width: '100%',
  color: '#FFFFFF',
  fontFamily: 'HarmonyOS Sans SC',
  fontWeight: 500,
  fontSize: '12.29px',
  lineHeight: '19.31px',
  letterSpacing: '0px',
  textAlign: 'center',
};
const DIAMOND_NODE_SCALE = 0.72;
const COMPUTE_NODE_FRAME_WIDTH = 10;
const CUBE_NODE_WIDTH = 101.8;
const COMPUTE_NODE_FAN_SIZE = (CUBE_NODE_WIDTH - (2 * COMPUTE_NODE_FRAME_WIDTH)) / 3;
const NODE_LABEL_FONT_SIZE_BY_ID = {
  'cube-iq': 12,
  'fixpipe-iq': 12,
  'mte1-iq': 14,
  'mte2-iq': 14,
  'aiv-vector-iq': 12,
  'aiv-mte2-iq': 14,
  'aiv-mte3-iq': 14,
  fixpipe: 16,
};
const getGridSize = (cellCount) =>
  (cellCount * DEFAULT_GRID_CELL_SIZE) + (Math.max(cellCount - 1, 0) * DEFAULT_GRID_CELL_GAP);
const getGridNodeDimension = (cellCount) => getGridSize(cellCount) + (2 * DEFAULT_GRID_CELL_SIZE);
const DEFAULT_HANDLE_STYLE = {
  background: 'transparent',
  border: 'none',
  width: '10px',
  height: '10px',
};
const DEFAULT_GRID_CELL_STYLE = {
  width: DEFAULT_GRID_CELL_SIZE,
  height: DEFAULT_GRID_CELL_SIZE,
  border: `${DEFAULT_GRID_CELL_BORDER_WIDTH}px solid ${DEFAULT_GRID_CELL_BORDER_COLOR}`,
  borderColor: DEFAULT_GRID_CELL_BORDER_COLOR,
  borderRadius: DEFAULT_GRID_CELL_RADIUS,
  boxSizing: 'border-box',
  backgroundColor: '#F0F3F6',
};
const getGridCellStyle = (cellColor) => ({
  ...DEFAULT_GRID_CELL_STYLE,
  ...(cellColor
    ? {
      backgroundColor: cellColor,
      borderColor: increaseHexOpacity(cellColor),
    }
    : null),
});
const NODE_HANDLE_GROUPS = [
  { dataKey: 'leftInputs', type: 'target', position: Position.Left, idPrefix: 'left-in', offsetProperty: 'top' },
  { dataKey: 'leftOutputs', type: 'source', position: Position.Left, idPrefix: 'left-out', offsetProperty: 'top' },
  { dataKey: 'rightOutputs', type: 'source', position: Position.Right, idPrefix: 'right-out', offsetProperty: 'top' },
  { dataKey: 'rightInputs', type: 'target', position: Position.Right, idPrefix: 'right-in', offsetProperty: 'top' },
  { dataKey: 'bottomOutputs', type: 'source', position: Position.Bottom, idPrefix: 'bottom-out', offsetProperty: 'left' },
  { dataKey: 'bottomInputs', type: 'target', position: Position.Bottom, idPrefix: 'bottom-in', offsetProperty: 'left' },
  { dataKey: 'topInputs', type: 'target', position: Position.Top, idPrefix: 'top-in', offsetProperty: 'left' },
  { dataKey: 'topOutputs', type: 'source', position: Position.Top, idPrefix: 'top-out', offsetProperty: 'left' },
];

const NodeHandleGroup = ({ offsets, type, position, idPrefix, offsetProperty }) =>
  (offsets ?? []).map((offset, index) => (
    <Handle
      key={`${idPrefix}-${index}`}
      type={type}
      position={position}
      id={`${idPrefix}-${index}`}
      style={{
        [offsetProperty]: `${offset}px`,
        ...DEFAULT_HANDLE_STYLE,
      }}
    />
  ));

const FanIndicator = ({ isRunning, offset, size = COMPUTE_NODE_FAN_SIZE }) => (
  <div
    className="absolute z-20 pointer-events-none"
    style={{ right: `${offset}px`, bottom: `${offset}px` }}
  >
    <div
      className="flex items-center justify-center"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div className="relative w-full h-full">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: '#22b45c',
            transition: 'background-color 0.3s ease'
          }}
        />
        <img
          src={fanPng}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full ${isRunning ? 'animate-fan-spin' : ''}`}
        />
      </div>
    </div>
  </div>
);

// define-nodes
const AscendNode = ({ id, data }) => {
  const showGrid = data.showGrid || false;
  const rows = data.rows || DEFAULT_GRID_ROWS;
  const cols = data.cols || DEFAULT_GRID_COLS;
  const totalCells = rows * cols;
  const cellColors = data.cellColors || {};
  const nodeWidth = data.width ?? (showGrid ? getGridNodeDimension(cols) : DEFAULT_NODE_WIDTH);
  const nodeHeight = data.height ?? (showGrid ? getGridNodeDimension(rows) : DEFAULT_NODE_HEIGHT);
  const nodeBorderRadius = data.borderRadius ?? DEFAULT_NODE_BORDER_RADIUS;
  const labelFontSize = NODE_LABEL_FONT_SIZE_BY_ID[id] ?? DEFAULT_NODE_LABEL_FONT_SIZE;
  const isDimmed = Boolean(data.isDimmed);
  const isHighlighted = Boolean(data.isHighlighted);
  const isSelected = Boolean(data.isSelected);
  const isDiamond = data.shape === 'diamond';
  const focusColor = data.focusColor || data.accentColor || '#3b82f6';
  const baseNodeShadow = data.boxShadow || '4px 1px 38px 0px #00000019';
  const backgroundFrameWidth = data.backgroundFrameWidth || 0;
  const hasBackgroundFrame = backgroundFrameWidth > 0;
  const nodeBackgroundColor = data.backgroundColor || DEFAULT_NODE_BACKGROUND;
  const nodeFrameColor = data.backgroundFrameColor || DEFAULT_NODE_BACKGROUND;
  const labelContainerClassName = 'absolute inset-0 z-10 flex items-center justify-center text-center pointer-events-none';

  const nodeShadow = isSelected
    ? `0 0 0 6px ${hexToRgba(focusColor, 0.18)}, ${baseNodeShadow}`
    : isHighlighted
      ? `0 0 0 4px ${hexToRgba(focusColor, 0.14)}, ${baseNodeShadow}`
      : baseNodeShadow;
  const diamondSelectionShadow = isSelected
    ? `0 0 0 6px ${hexToRgba(focusColor, 0.18)}`
    : isHighlighted
      ? `0 0 0 4px ${hexToRgba(focusColor, 0.14)}`
      : 'none';

  const showFan = data.showFan;
  const isRunning = Boolean(data.isRunning);
  const fanOffset = hasBackgroundFrame ? backgroundFrameWidth + 2 : 2;
  const innerFrameBorderRadius = Math.max(nodeBorderRadius - backgroundFrameWidth, 0);
  return (
    <div
      className={`relative font-mono select-none transition-all 
        ${showGrid ? 'flex items-center justify-center' : 'p-4'}
      `}
      style={{
        width: nodeWidth,
        height: nodeHeight,
        borderRadius: nodeBorderRadius,
        backgroundColor: isDiamond ? 'transparent' : hasBackgroundFrame ? nodeFrameColor : nodeBackgroundColor,
        opacity: isDimmed ? 0.24 : 1,
        boxShadow: isDiamond ? diamondSelectionShadow : nodeShadow,
        filter: isDimmed ? 'saturate(0.8)' : 'none',
        cursor: 'pointer',
      }}
    >
      {isDiamond && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `scale(${DIAMOND_NODE_SCALE}) rotate(45deg)`,
            borderRadius: nodeBorderRadius,
            backgroundColor: nodeBackgroundColor,
            boxShadow: baseNodeShadow,
          }}
        />
      )}

      {hasBackgroundFrame && (
        <div
          className="absolute pointer-events-none"
          style={{
            inset: `${backgroundFrameWidth}px`,
            borderRadius: innerFrameBorderRadius,
            backgroundColor: nodeBackgroundColor,
          }}
        />
      )}

      {showFan && (
        <FanIndicator
          isRunning={isRunning}
          offset={fanOffset}
          size={data.fanSize}
        />
      )}

      {showGrid && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="grid"
            style={{
              gap: `${DEFAULT_GRID_CELL_GAP}px`,
              gridTemplateColumns: `repeat(${cols}, ${DEFAULT_GRID_CELL_SIZE}px)`,
              gridTemplateRows: `repeat(${rows}, ${DEFAULT_GRID_CELL_SIZE}px)`,
            }}
          >
            {Array.from({ length: totalCells }).map((_, i) => (
              <div
                key={i}
                className="opacity-80 transition-colors duration-200"
                style={getGridCellStyle(cellColors[i])}
              />
            ))}
          </div>
        </div>
      )}

      <div className={labelContainerClassName}>
        <div
          className={`font-bold ${data.textColor || 'text-gray-800'} ${showGrid ? 'tracking-wide' : ''} ${data.labelClassName || ''}`}
          style={{ fontSize: labelFontSize, ...data.labelStyle }}
        >
          {data.label}
        </div>
      </div>

      {NODE_HANDLE_GROUPS.map(({ dataKey, type, position, idPrefix, offsetProperty }) => (
        <NodeHandleGroup
          key={idPrefix}
          offsets={data[dataKey]}
          type={type}
          position={position}
          idPrefix={idPrefix}
          offsetProperty={offsetProperty}
        />
      ))}
    </div>
  );
};

// define-edges
const CapsuleEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerStart,
  markerEnd,
  data,
}) => {
  const {
    borderRadius = DEFAULT_EDGE_TURN_RADIUS,
    offset = DEFAULT_EDGE_OFFSET,
    turnX,
    turnY,
  } = data?.pathOptions ?? {};
  const isHorizontalStraight =
    Math.abs(sourceY - targetY) <= 0.5 &&
    ((sourcePosition === Position.Right && targetPosition === Position.Left) ||
      (sourcePosition === Position.Left && targetPosition === Position.Right));
  const isVerticalStraight =
    Math.abs(sourceX - targetX) <= 0.5 &&
    ((sourcePosition === Position.Bottom && targetPosition === Position.Top) ||
      (sourcePosition === Position.Top && targetPosition === Position.Bottom));

  let edgePath;
  let labelX;
  let labelY;

  if (isHorizontalStraight || isVerticalStraight) {
    edgePath = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2;
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius,
      centerX: turnX,
      centerY: turnY,
      offset,
    });
  }
  const labelPosX = data?.labelPosition?.x ?? labelX;
  const labelPosY = data?.labelPosition?.y ?? labelY;
  return (
    <>
      <BaseEdge path={edgePath} markerStart={markerStart} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelPosX}px,${labelPosY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              style={{
                backgroundColor: '#FFA73D',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '53.53px',
                fontSize: '14px',
                fontWeight: 'bold',
                border: '3px solid #FFFFFF',
                boxShadow: '0px 4px 4px 0px #FAB76633',
                whiteSpace: 'nowrap',
              }}
            >
              {data.label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// register-types
const nodeTypes = { unifiedNode: AscendNode };
const edgeTypes = { capsule: CapsuleEdge };
const arrowMarker = { type: MarkerType.ArrowClosed, color: '#b1b1b7' };
const edgeStrokeWidth = 1.76
const DEFAULT_EDGE_TURN_RADIUS = 8;
const DEFAULT_EDGE_OFFSET = 20;

const defaultEdgeStyle = { stroke: '#b1b1b7', strokeWidth: edgeStrokeWidth };
const dottedEdgeStyle = {
  strokeDasharray: '4 3',
  strokeLinecap: 'round',
};

const createEdgeBaseStyle = (style = {}) => ({
  ...defaultEdgeStyle,
  ...style,
});

const getEdgeBaseStyle = (edge) => createEdgeBaseStyle(edge.data?.baseStyle ?? edge.style);

const makeEdge = (
  id,
  source,
  sourceHandle,
  target,
  targetHandle,
  type = "capsule",
  label,
  options = {},
) => {
  const baseStyle = createEdgeBaseStyle(options.style);
  const edge = {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    type,
    markerEnd: arrowMarker,
    style: { ...baseStyle },
  };

  const edgeData = {
    baseStyle: { ...baseStyle },
  };

  if (label) {
    edgeData.label = label;
  }

  if (options.pathOptions) {
    edgeData.pathOptions = options.pathOptions;
  }

  if (options.labelPosition) {
    edgeData.labelPosition = options.labelPosition;
  }

  if (Object.keys(edgeData).length > 0) {
    edge.data = edgeData;
  }

  return edge;
};

const gmLeft = 162
const l2Left = 411;
const l0aLeft = 1180;
const l0bLeft = 1182;
const btLeft = 1182;
const fpLeft = 1182;
const cubeLeft = 1372.06;
const l0cLeft = 1561;
const fixpipeLeft = 1493;
const dcacheLeft = 787.58;
const icacheLeft = 787.58;
const l1Left = dcacheLeft - 10;

const scalarLeft = 1060;
const instructqLeft = 1310;
const aiv_iqLeft = 1309.75;
const cubeiqLeft = 1546.71;
const fixpipeiqLeft = cubeiqLeft;
const mte1iqLeft = cubeiqLeft;
const mte2iqLeft = cubeiqLeft;

const aiv_vectoriqLeft  = cubeiqLeft;
const aiv_mte2iqLeft    = cubeiqLeft;
const aiv_mte3iqLeft    = cubeiqLeft;
const ubLeft = 783
const vectorLeft = 1493.17

const gmWidth = 202;
const gmHeight = 897;
const l2Width = 94;
const l2Height = 897;
const gridBufferWidth = 111;
const gridBufferHeight = 78;
const iqWidth =  109.22
const iqHeight = 109.22
const cubeHeight = 272.06;
const l0cWidth = 109;
const l0cHeight = 155;
const fixpipeWidth = 170;
const fixpipeHeight = 42;
const cacheWidth = 143.93;
const cacheHeight = 42.12;
const cubeIqWidth = 121.99;
const cubeIqHeight = 29.53;
const fixpipeIqWidth = 122.08;
const fixpipeInstructionQueueHeight = 29.53;
const mteInstructionQueueWidth = 121.99;
const mteInstructionQueueHeight = 29.53;
const ubWidth = 568;
const ubHeight = 64;
const vectorWidth = 172.01;
const vectorHeight = 56.17;
const gmUp = 144
const l2Up = 145
const l1Up = 240
const cubeUp = 194.64;
const l0aUp = 189;
const l0bUp = 275;
const btUp = 360;
const fpUp = 444;
const l0cUp = 253
const fixpipeUp = 477

const dcacheUp = 598
const icacheUp = 655
const scalarUp = 615

const instructqUp = 591.31
const cubeiqUp = 575.51
const fixpipeiqUp = 612.06
const mte1iqUp = 648.62
const mte2iqUp = 685.17

const ubUp = 799
const vectorUp = 803.69

const aiv_icacheUp = 960.78
const aiv_dcacheUp = 906
const aiv_scalarUp = 925.67
const aiv_iqUp = 899.35
const aiv_vectoriqUp = 905.49
const aiv_mte2qUp = 938.53
const aiv_mte3qUp = 971.57

const AICUp = 149
const AICLeft = 565
const AIVUp = 759
const AIVLeft = 565
const AICWidth = 1192
const AIVWidth = 1191
const AICHeight = 580
const AIVHeight = 280

const icacheWidth  = cacheWidth
const icacheHeight = cacheHeight
const dcacheWidth  = cacheWidth
const dcacheHeight = cacheHeight
const aiv_vectoriqWidth = 118.48
const aiv_vectoriqHeight = 29.53
const aiv_mte2iqWidth = aiv_vectoriqWidth;
const aiv_mte2iqHeight = aiv_vectoriqHeight;
const aiv_mte3iqWidth = aiv_vectoriqWidth;
const aiv_mte3iqHeight = aiv_vectoriqHeight;

const scalarWidth = 120;
const scalarHeight = 60;

const gm_l2PosY = 550;
const l2_gmPosY = 629.92 ;
const l2_l0aPosY = 210.43;
const l2_l0b_startPosY = 217.45+15.76;
const l2_l0b_endPosY = 296;
const l2_l1PosY = 398;

const l1_l0aPosY = 246.41;
const l1_l0bPosY = l0bUp + 60;
const l1_btPosY = btUp + 40;
const l1_fpPosY = fpUp + 40;
const l0a_cubePosY = l0aUp + 40;
const l0b_cubePosY = l0bUp + 40;
const bt_cubePosY = 400;
const cube_l0cPosY = 330;
const fp_fixpipePosY = 498;
const fixpipe_l2PosY = 404.38 + 136.03 + 6.;
const l2_dcachePosY = dcacheUp + 21.06;
const l2_icachePosY = icacheUp + 21.06;
const l2SharedLabelPosX = 643.66;
const l1SharedLabelPosX = 1049.99;
const dcache_scalarPosY = dcacheUp + 21.06;
const icache_scalarPosY = icacheUp + 21.06;
const scalar_iqPosY = instructqUp + 60;
const iq_cubePosY = cubeiqUp + 14.765;
const iq_fixpipePosY = fixpipeiqUp + 14.765;
const iq_mte1PosY = mte1iqUp + 14.765;
const iq_mte2PosY = mte2iqUp + 14.765;
const l2_ubPosY = 796.67+ 15.76;
const ub_l2PosY =  851.08;
const ub_vectorPosY = vectorUp + 18;
const ub_aivScalarLeft = 1125.46;
const vector_ubPosY = vectorUp + 38;
const l2_aiv_dcachePosY = aiv_dcacheUp + 21.06;
const l2_aiv_icachePosY = aiv_icacheUp + 21.06;
const aiv_dcache_scalarPosY = aiv_dcacheUp + 21.06;
const aiv_icache_scalarPosY = aiv_icacheUp + 21.06;
const aiv_scalar_iqPosY = aiv_iqUp + iqHeight / 2;
const aiv_iq_vectorPosY = aiv_vectoriqUp + aiv_vectoriqHeight / 2;
const aiv_iq_mte2PosY = aiv_mte2qUp + aiv_mte2iqHeight / 2;
const aiv_iq_mte3PosY = aiv_mte3qUp + aiv_mte3iqHeight / 2;
const l0c_fixpipeLeft = 508.51 + 1106.65;
const iq_rightOut = instructqUp + iqHeight / 2;
const aiv_iq_rightOut = aiv_iqUp + iqHeight / 2;

const gmRows = 77
const gmCols = 16
const l2Rows = gmRows
const l2Cols = 7
const l1Rows = 23
const l1Cols = 16
const l1Width = getGridNodeDimension(l1Cols);
const l1Right = l1Left + l1Width;
const l2_l0bTurnX = l1Right + 20;
const l0aRows = 5
const l0aCols = 8
const l0bRows = 5
const l0bCols = 8
const btRows = 5
const btCols = 8
const fpRows = 5
const fpCols = 8
const l0cRows = 12
const l0cCols = 8
const ubRows = 4
const ubCols = 48

// init-nodes
const hardwareNodes = [
  {
    id: 'gm',
    type: 'unifiedNode',
    position: { x: gmLeft, y: gmUp },
    data: {
      showGrid: true,
      rows: gmRows, cols: gmCols,
      label: 'Global Memory',
      width: gmWidth, height: gmHeight,
      rightOutputs: [
        gm_l2PosY - gmUp
      ], rightInputs: [
        l2_gmPosY - gmUp
      ],
      accentColor: '#3b82f6', textColor: 'text-blue-800',
    },
  },
  {
    id: 'l2',
    type: 'unifiedNode',
    position: { x: l2Left, y: l2Up },
    data: {
      showGrid: true,
      rows: l2Rows, cols: l2Cols,
      label: 'L2 Cache',
      width: l2Width, height: l2Height,
      leftInputs: [
        gm_l2PosY - l2Up
      ], leftOutputs: [
        l2_gmPosY - l2Up
      ],
      rightOutputs: [
        l2_l0aPosY - l2Up,
        l2_l0b_startPosY - l2Up,
        l2_l1PosY - l2Up,
        l2_dcachePosY - l2Up,
        l2_icachePosY - l2Up,
        l2_ubPosY - l2Up,
        l2_aiv_dcachePosY - l2Up,
        l2_aiv_icachePosY - l2Up],
      rightInputs: [
        fixpipe_l2PosY - l2Up,
        ub_l2PosY - l2Up
      ],
      accentColor: '#3b82f6', textColor: 'text-orange-800',
    },
  },
  {
    id: 'l1',
    type: 'unifiedNode',
    position: { x: l1Left, y: l1Up },
    data: {
      showGrid: true,
      rows: l1Rows, cols: l1Cols,
      label: 'L1 Cache',
      accentColor: '#3b82f6', textColor: 'text-purple-800',
      leftInputs: [
        l2_l1PosY - l1Up
      ], rightOutputs: [
        l1_l0aPosY - l1Up,
        l1_l0bPosY - l1Up,
        l1_btPosY - l1Up,
        l1_fpPosY - l1Up
      ], bottomInputs: [106],
    },
  },
  {
    id: 'l0a',
    type: 'unifiedNode',
    position: { x: l0aLeft, y: l0aUp },
    data: {
      showGrid: true,
      rows: l0aRows, cols: l0aCols,
      label: 'L0A Buffer',
      width: gridBufferWidth, height: gridBufferHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        l2_l0aPosY - l0aUp,
        l1_l0aPosY - l0aUp
      ], rightOutputs: [
        l0a_cubePosY - l0aUp
      ]
    },
  },
  {
    id: 'l0b',
    type: 'unifiedNode',
    position: { x: l0bLeft, y: l0bUp },
    data: {
      showGrid: true,
      rows: l0bRows, cols: l0bCols,
      label: 'L0B Buffer',
      width: gridBufferWidth, height: gridBufferHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        l2_l0b_endPosY - l0bUp,
        l1_l0bPosY - l0bUp
      ], rightOutputs: [
        l0b_cubePosY - l0bUp,
      ]
    },
  },
  {
    id: 'bt',
    type: 'unifiedNode',
    position: { x: btLeft, y: btUp },
    data: {
      showGrid: true,
      rows: btRows, cols: btCols,
      label: 'BT Buffer',
      width: gridBufferWidth, height: gridBufferHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        l1_btPosY - btUp
      ], rightOutputs: [bt_cubePosY - btUp]
    },
  },
  {
    id: 'fp',
    type: 'unifiedNode',
    position: { x: fpLeft, y: fpUp },
    data: {
      showGrid: true,
      rows: fpRows, cols: fpCols,
      label: 'FP Buffer',
      width: gridBufferWidth, height: gridBufferHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        l1_fpPosY - fpUp
      ], rightOutputs: [
        fp_fixpipePosY - fpUp
      ],
    },
  },
  {
    id: 'cube',
    type: 'unifiedNode',
    position: { x: cubeLeft, y: cubeUp },
    data: {
      label: 'Cube',
      accentColor: '#10b981', textColor: 'text-black',
      backgroundFrameColor: '#ffffff',
      backgroundFrameWidth: COMPUTE_NODE_FRAME_WIDTH,
      backgroundColor: '#8ECC99',
      leftInputs: [
        l0a_cubePosY - cubeUp,
        l0b_cubePosY - cubeUp,
        bt_cubePosY - cubeUp,
      ], rightOutputs: [
        cube_l0cPosY - cubeUp
      ], bottomOutputs: [51],
      width: CUBE_NODE_WIDTH, height: cubeHeight,
      fanSize: COMPUTE_NODE_FAN_SIZE,
      showFan: true
    },
  },
  {
    id: 'l0c',
    type: 'unifiedNode',
    position: { x: l0cLeft, y: l0cUp },
    data: {
      showGrid: true,
      rows: l0cRows, cols: l0cCols,
      label: 'L0C Buffer',
      width: l0cWidth, height: l0cHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        cube_l0cPosY - l0cUp
      ], bottomOutputs: [l0c_fixpipeLeft - l0cLeft],
    },
  },
  {
    id: 'fixpipe',
    type: 'unifiedNode',
    position: { x: fixpipeLeft, y: fixpipeUp },
    data: {
      label: 'FixPipe',
      accentColor: '#fb923c', textColor: 'text-orange-800',
      backgroundFrameColor: hexToRgba('#FFA73D', 0.34),
      backgroundFrameWidth: 5,
      backgroundColor: '#FFA73D',
      leftInputs: [fp_fixpipePosY - fixpipeUp],
      bottomOutputs: [505.81 + 1106.65 - fixpipeLeft, 505.81 + 1106.65113 - fixpipeLeft],
      topInputs: [l0c_fixpipeLeft - fixpipeLeft],
      width: fixpipeWidth, height: fixpipeHeight,
      borderRadius: 12,
      labelStyle: FIXPIPE_LABEL_STYLE,
    },
  },
  {
    id: 'icache',
    type: 'unifiedNode',
    position: { x: icacheLeft, y: icacheUp },
    data: {
      label: 'ICache',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        l2_icachePosY - icacheUp
      ], rightOutputs: [
        icache_scalarPosY - icacheUp
      ],
      width: icacheWidth, height: icacheHeight ,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'dcache',
    type: 'unifiedNode',
    position: { x: dcacheLeft, y: dcacheUp },
    data: {
      label: 'DCache',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        l2_dcachePosY - dcacheUp
      ], rightOutputs: [
        dcache_scalarPosY - dcacheUp
      ],
      width: dcacheWidth, height: icacheHeight,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'scalar',
    type: 'unifiedNode',
    position: { x: scalarLeft, y: scalarUp },
    data: {
      label: 'Scalar',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        dcache_scalarPosY - scalarUp,
        icache_scalarPosY - scalarUp
      ], rightOutputs: [
        scalar_iqPosY - scalarUp
      ],
      width: scalarWidth, height: scalarHeight,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'iq',
    type: 'unifiedNode',
    position: { x: instructqLeft, y: instructqUp },
    data: {
      label: '指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        scalar_iqPosY - instructqUp
      ], rightOutputs: [
        iq_rightOut - iq_cubePosY,
        iq_rightOut - iq_cubePosY,
        iq_rightOut - iq_cubePosY,
        iq_rightOut - iq_cubePosY,
      ],
      width: iqWidth, height: iqHeight,
      shape: 'diamond',
      borderRadius: 10,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },

  {
    id: 'cube-iq',
    type: 'unifiedNode',
    position: { x: cubeiqLeft, y: cubeiqUp },
    data: {
      label: 'Cube 指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        iq_cubePosY - cubeiqUp
      ],
      width: cubeIqWidth, height: cubeIqHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },

  {
    id: 'fixpipe-iq',
    type: 'unifiedNode',
    position: { x: fixpipeiqLeft, y: fixpipeiqUp },
    data: {
      label: 'FixPipe-指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        iq_fixpipePosY - fixpipeiqUp
      ],
      width: fixpipeIqWidth, height: fixpipeInstructionQueueHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'mte1-iq',
    type: 'unifiedNode',
    position: { x: mte1iqLeft, y: mte1iqUp },
    data: {
      label: 'MTE1-指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        iq_mte1PosY - mte1iqUp
      ],
      width: mteInstructionQueueWidth, height: mteInstructionQueueHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'mte2-iq',
    type: 'unifiedNode',
    position: { x: mte2iqLeft, y: mte2iqUp },
    data: {
      label: 'MTE2-指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        iq_mte2PosY - mte2iqUp
      ],
      width: mteInstructionQueueWidth, height: mteInstructionQueueHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'ub',
    type: 'unifiedNode',
    position: { x: ubLeft, y: ubUp },
    data: {
      showGrid: true,
      rows: ubRows, cols: ubCols,
      label: 'Unified Buffer',
      width: ubWidth, height: ubHeight,
      accentColor: '#3b82f6', textColor: 'text-emerald-800',
      leftInputs: [
        l2_ubPosY - ubUp
      ], rightOutputs: [
        ub_vectorPosY - ubUp
      ], rightInputs: [
        vector_ubPosY - ubUp
      ],
      leftOutputs: [
        ub_l2PosY - ubUp
      ], bottomOutputs: [ub_aivScalarLeft - ubLeft],
    },
  },
  {
    id: 'vector',
    type: 'unifiedNode',
    position: { x: vectorLeft, y: vectorUp },
    data: {
      label: 'Vector',
      accentColor: '#10b981', textColor: 'text-black',
      backgroundFrameColor: '#ffffff',
      backgroundFrameWidth: COMPUTE_NODE_FRAME_WIDTH,
      backgroundColor: '#8ECC99',
      leftInputs: [
        ub_vectorPosY - vectorUp
      ], leftOutputs: [
        vector_ubPosY - vectorUp
      ],
      width: vectorWidth, height: vectorHeight,
      borderRadius: 12,
      fanSize: COMPUTE_NODE_FAN_SIZE,
      showFan: true
    },
  },
  {
    id: 'aiv-icache',
    type: 'unifiedNode',
    position: { x: icacheLeft, y: aiv_icacheUp },
    data: {
      label: 'ICache',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        l2_aiv_icachePosY - aiv_icacheUp
      ], rightOutputs: [
        aiv_icache_scalarPosY - aiv_icacheUp
      ],
      width: icacheWidth, height: icacheHeight,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-dcache',
    type: 'unifiedNode',
    position: { x: dcacheLeft, y: aiv_dcacheUp },
    data: {
      label: 'DCache',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        l2_aiv_dcachePosY - aiv_dcacheUp
      ], rightOutputs: [
        aiv_dcache_scalarPosY - aiv_dcacheUp
      ],
      width: dcacheWidth, height: dcacheHeight,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-scalar',
    type: 'unifiedNode',
    position: { x: scalarLeft, y: aiv_scalarUp },
    data: {
      label: 'Scalar',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        aiv_dcache_scalarPosY - aiv_scalarUp,
        aiv_icache_scalarPosY - aiv_scalarUp
      ], rightOutputs: [
        aiv_scalar_iqPosY - aiv_scalarUp 
      ], topInputs: [ub_aivScalarLeft - scalarLeft],
      width: scalarWidth, height: scalarHeight,
      borderRadius: 12,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-iq',
    type: 'unifiedNode',
    position: { x: aiv_iqLeft, y: aiv_iqUp },
    data: {
      label: '指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        aiv_scalar_iqPosY - aiv_iqUp
      ], rightOutputs: [
        aiv_iq_rightOut - aiv_iqUp,
        aiv_iq_rightOut - aiv_iqUp,
        aiv_iq_rightOut - aiv_iqUp,
      ],
      width: iqWidth, height: iqHeight,
      shape: 'diamond',
      borderRadius: 10,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: CONTROL_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-vector-iq',
    type: 'unifiedNode',
    position: { x: aiv_vectoriqLeft, y: aiv_vectoriqUp },
    data: {
      label: 'Vector 指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        aiv_iq_vectorPosY - aiv_vectoriqUp
      ],
      width: aiv_vectoriqWidth, height: aiv_vectoriqHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-mte2-iq',
    type: 'unifiedNode',
    position: { x: aiv_mte2iqLeft, y: aiv_mte2qUp },
    data: {
      label: 'MTE2 指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        aiv_iq_mte2PosY - aiv_mte2qUp
      ],
      width: aiv_mte2iqWidth, height: aiv_mte2iqHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aiv-mte3-iq',
    type: 'unifiedNode',
    position: { x: aiv_mte3iqLeft, y: aiv_mte3qUp },
    data: {
      label: 'MTE3 指令序列',
      accentColor: '#A3A3A3', textColor: 'text-black',
      leftInputs: [
        aiv_iq_mte3PosY - aiv_mte3qUp
      ],
      width: aiv_mte3iqWidth, height: aiv_mte3iqHeight,
      borderRadius: 8,
      backgroundColor: MUTED_NODE_BACKGROUND,
      boxShadow: MUTED_NODE_SHADOW,
      labelStyle: INSTRUCTION_NODE_LABEL_STYLE,
    },
  },
  {
    id: 'aic-background',
    className: 'flow-background-node',
    data: { label: 'AIC' },
    position: { x: AICLeft, y: AICUp },
    style: {
      width: AICWidth,
      height: AICHeight,
      opacity: 0.85,
      background: '#F4F4F6',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#000',
      textAlign: 'left',
      padding: '10px',
      zIndex: -1,
    },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
  },
  {
    id: 'aiv-background',
    className: 'flow-background-node',
    data: { label: 'AIV' },
    position: { x: AIVLeft, y: AIVUp },
    style: {
      width: AIVWidth,
      height: AIVHeight,
      opacity: 0.85,
      background: '#F4F4F6',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#000',
      textAlign: 'left',
      padding: '10px',
      zIndex: -1,
    },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
  },
];

const HARDWARE_OVERVIEW_SUMMARY_PLACEHOLDER = 'NODE INFO TO BE DONE';
const HARDWARE_SCALAR_SUMMARY = 'Scalar负责各类型的标量数据运算和程序的流程控制。功能上可以看做一个小CPU，完成整个程序的循环控制、分支判断、Cube/Vector等指令的地址和参数计算以及基本的算术运算，并且可以通过在事件同步模块中插入同步符的方式来控制AI Core中其他执行单元的流水。相对于Host CPU，AI Core中的Scalar计算能力较弱，重点用于发射指令，所以在实际应用场景中应尽量减少Scalar计算，比如性能调优时尽量减少if/else等分支判断及变量运算。';
const HARDWARE_VECTOR_SUMMARY = 'Vector负责执行向量运算。向量计算单元执行向量指令，类似于传统的单指令多数据（Single Instruction Multiple Data，SIMD）指令，每个向量指令可以完成多个操作数的同一类型运算。向量计算单元可以快速完成两个FP16类型的向量相加或者相乘。向量指令支持多次迭代执行，也支持对带有间隔的向量直接进行运算。';
const HARDWARE_CUBE_SUMMARY = 'Cube计算单元负责执行矩阵运算，一次执行即可完成A矩阵（M * K）与B矩阵（K * N）的矩阵乘。L0A存储左矩阵，L0B存储右矩阵，L0C存储矩阵乘的结果和中间结果。';
const HARDWARE_L2_SUMMARY = 'L2 cache';
const HARDWARE_L1_SUMMARY = 'L1缓冲区，通用内部存储，是AI Core内比较大的一块数据中转区，可暂存Cube计算单元需要反复使用的一些数据从而减少从总线读写的次数。';
const HARDWARE_L0AB_SUMMARY = 'Cube指令的输入。';
const HARDWARE_L0C_SUMMARY = 'Cube指令的输出，但进行累加计算的时候，也是输入的一部分。';
const HARDWARE_UB_SUMMARY = '统一缓冲区，向量和标量计算的输入和输出。';
const HARDWARE_BT_SUMMARY = 'BiasTable Buffer，存放Bias。';
const HARDWARE_FP_SUMMARY = 'Fixpipe Buffer，存放量化参数、Relu参数等。';
const HARDWARE_FIXPIPE_SUMMARY = '只有分离架构支持，负责如下通路的数据搬运，搬运过程中可以完成随路数据格式/类型转换：\n\nL0C->{GM/L1}\nL1->FP Buffer';
const HARDWARE_GLOBAL_MEMORY_SUMMARY = 'AI Core能够访问的外部存储称之为Global Memory，对应的数据类型为GlobalTensor。';
const HARDWARE_ICACHE_SUMMARY = 'ICache(Instruction Cache)用于缓存代码段，缓存大小与硬件规格相关，比如为16K或32K，以2K为单位加载；';
const HARDWARE_DCACHE_SUMMARY = 'DCache(Data Cache)用于缓存数据段，大小也与硬件规格相关，比如为16K，以cacheline（64Byte）为单位加载。';
const HARDWARE_INSTRUCTION_QUEUE_SUMMARY = '除了scalar指令外, 其他指令会被Scalar单元调度到5个独立的分类队列（Vector指令队列、Cube指令队列、MTE1/MTE2/MTE3指令队列），然后再被对应执行单元执行。\n同一个指令队列中的指令是按照进入指令队列的顺序执行的，不同指令队列之间可以并行执行，通过多个指令队列的并行执行可以提升整体执行效率。对于并行执行过程中可能出现的数据依赖，通过事件同步模块插入同步指令来控制流水线的同步，提供PipeBarrier、SetFlag/WaitFlag两种指令，保证队列内部以及队列之间按照逻辑关系执行。';
const HARDWARE_CUBE_IQ_SUMMARY = 'Cube指令队列。同一个队列里的指令顺序执行，不同队列之间可以并行执行。';
const HARDWARE_VECTOR_IQ_SUMMARY = 'Vector指令队列。同一个队列里的指令顺序执行，不同队列之间可以并行执行。';
const HARDWARE_MTE_IQ_SUMMARY = 'MTE指令队列。同一个队列里的指令顺序执行，不同队列之间可以并行执行。';
const HARDWARE_AIC_AIV_SUMMARY = '分离架构将AI Core拆成矩阵计算（AI Cube，AIC）和向量计算（AI Vector，AIV）两个独立的核，每个核都有自己的Scalar单元，能独立加载自己的代码段，从而实现矩阵计算与向量计算的解耦，在系统软件的统一调度下互相配合达到计算效率优化的效果。AIV与AIC之间通过Global Memory进行数据传递，另外分离架构相比耦合架构，增加了两个Buffer：BT Buffer(BiasTable Buffer，存放Bias)和FP Buffer(Fixpipe Buffer，存放量化参数、Relu参数等)。';
const hardwareOverviewSummaryByNodeId = {
  'aic-background': HARDWARE_AIC_AIV_SUMMARY,
  'aiv-background': HARDWARE_AIC_AIV_SUMMARY,
  gm: HARDWARE_GLOBAL_MEMORY_SUMMARY,
  l2: HARDWARE_L2_SUMMARY,
  l1: HARDWARE_L1_SUMMARY,
  l0a: HARDWARE_L0AB_SUMMARY,
  l0b: HARDWARE_L0AB_SUMMARY,
  bt: HARDWARE_BT_SUMMARY,
  fp: HARDWARE_FP_SUMMARY,
  cube: HARDWARE_CUBE_SUMMARY,
  l0c: HARDWARE_L0C_SUMMARY,
  fixpipe: HARDWARE_FIXPIPE_SUMMARY,
  icache: HARDWARE_ICACHE_SUMMARY,
  dcache: HARDWARE_DCACHE_SUMMARY,
  scalar: HARDWARE_SCALAR_SUMMARY,
  iq: HARDWARE_INSTRUCTION_QUEUE_SUMMARY,
  'cube-iq': HARDWARE_CUBE_IQ_SUMMARY,
  'mte1-iq': HARDWARE_MTE_IQ_SUMMARY,
  'mte2-iq': HARDWARE_MTE_IQ_SUMMARY,
  ub: HARDWARE_UB_SUMMARY,
  vector: HARDWARE_VECTOR_SUMMARY,
  'aiv-icache': HARDWARE_ICACHE_SUMMARY,
  'aiv-dcache': HARDWARE_DCACHE_SUMMARY,
  'aiv-scalar': HARDWARE_SCALAR_SUMMARY,
  'aiv-iq': HARDWARE_INSTRUCTION_QUEUE_SUMMARY,
  'aiv-vector-iq': HARDWARE_VECTOR_IQ_SUMMARY,
  'aiv-mte2-iq': HARDWARE_MTE_IQ_SUMMARY,
  'aiv-mte3-iq': HARDWARE_MTE_IQ_SUMMARY,
};
const hardwareOverviewDetailContentByNodeId = Object.fromEntries(
  hardwareNodes
    .map((node) => [
      node.id,
      {
        summary: hardwareOverviewSummaryByNodeId[node.id] ?? HARDWARE_OVERVIEW_SUMMARY_PLACEHOLDER,
      },
    ])
);

// init-edges
const hardwareEdges = [
  makeEdge('gm-l2', 'gm', "right-out-0", "l2", "left-in-0", 'capsule'),
  makeEdge('l2-gm', "l2", "left-out-0", 'gm', "right-in-0", 'capsule'),
  makeEdge(
    'l2-l0a',
    'l2',
    'right-out-0',
    'l0a',
    'left-in-0',
    'capsule',
    'MTE2',
    { labelPosition: { x: l1SharedLabelPosX } }
  ),
  makeEdge(
    'l2-l0b',
    'l2',
    'right-out-1',
    'l0b',
    'left-in-0',
    'capsule',
    'MTE2',
    {
      pathOptions: { turnX: l2_l0bTurnX },
      labelPosition: { x: l2SharedLabelPosX, 
                        y: l2_l0b_startPosY},
    }
  ),
  makeEdge('l2-l1', 'l2', 'right-out-2', 'l1', 'left-in-0', 'capsule', "MTE2", {
    labelPosition: { x: l2SharedLabelPosX}
  }),
  makeEdge(
    'l1-l0a',
    'l1',
    'right-out-0',
    'l0a',
    'left-in-1',
    'capsule',
    'MTE1',
    { labelPosition: { x: l1SharedLabelPosX } }
  ),
  makeEdge(
    'l1-l0b',
    'l1',
    'right-out-1',
    'l0b',
    'left-in-1',
    'capsule',
    'MTE1',
    { labelPosition: { x: l1SharedLabelPosX } }
  ),
  makeEdge(
    'l1-bt',
    'l1',
    'right-out-2',
    'bt',
    'left-in-0',
    'capsule',
    'MTE1',
    { labelPosition: { x: l1SharedLabelPosX } }
  ),
  makeEdge(
    'l1-fp',
    'l1',
    'right-out-3',
    'fp',
    'left-in-0',
    'capsule',
    'fixpipe',
    { labelPosition: { x: l1SharedLabelPosX } }
  ),
  makeEdge('fp-fixpipe', 'fp', 'right-out-0', 'fixpipe', 'left-in-0', 'capsule'),
  makeEdge('l0a-cube', 'l0a', 'right-out-0', 'cube', 'left-in-0', 'capsule'),
  makeEdge('l0b-cube', 'l0b', 'right-out-0', 'cube', 'left-in-1', 'capsule'),
  makeEdge('bt-cube', 'bt', 'right-out-0', 'cube', 'left-in-2', 'capsule'),
  makeEdge('cube-l0c', 'cube', 'right-out-0', 'l0c', 'left-in-0', 'capsule'),
  makeEdge('l0c-fixpipe', 'l0c', 'bottom-out-0', 'fixpipe', 'top-in-0', 'capsule'),
  makeEdge('fixpipe-l1', 'fixpipe', 'bottom-out-1', 'l1', 'bottom-in-0', 'capsule'),
  makeEdge('fixpipe-l2', 'fixpipe', 'bottom-out-0', 'l2', 'right-in-0', 'capsule'),
  makeEdge('l2-dcache', 'l2', 'right-out-3', 'dcache', 'left-in-0', 'capsule'),
  makeEdge(
    'l2-icache',
    'l2',
    'right-out-4',
    'icache',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge('dcache-scalar', 'dcache', 'right-out-0', 'scalar', 'left-in-0', 'capsule'),
  makeEdge(
    'icache-scalar',
    'icache',
    'right-out-0',
    'scalar',
    'left-in-1',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'scalar-iq',
    'scalar',
    'right-out-0',
    'iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'iq-cube',
    'iq',
    'right-out-0',
    'cube-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'iq-fixpipe',
    'iq',
    'right-out-1',
    'fixpipe-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'iq-mte1',
    'iq',
    'right-out-2',
    'mte1-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'iq-mte2',
    'iq',
    'right-out-3',
    'mte2-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'l2-ub',
    'l2',
    'right-out-5',
    'ub',
    'left-in-0',
    'capsule',
    'MTE2',
    { labelPosition: { x: l2SharedLabelPosX } }
  ),
  makeEdge(
    'ub-l2',
    'ub',
    'left-out-0',
    'l2',
    'right-in-1',
    'capsule',
    'MTE3',
    { labelPosition: { x: l2SharedLabelPosX } }
  ),
  makeEdge('ub-vector', 'ub', 'right-out-0', 'vector', 'left-in-0', 'capsule'),
  makeEdge('vector-ub', 'vector', 'left-out-0', 'ub', 'right-in-0', 'capsule'),
  makeEdge('ub-aiv-scalar', 'ub', 'bottom-out-0', 'aiv-scalar', 'top-in-0', 'capsule'),
  makeEdge('l2-aiv-dcache', 'l2', 'right-out-6', 'aiv-dcache', 'left-in-0', 'capsule'),
  makeEdge(
    'l2-aiv-icache',
    'l2',
    'right-out-7',
    'aiv-icache',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge('aiv-dcache-scalar', 'aiv-dcache', 'right-out-0', 'aiv-scalar', 'left-in-0', 'capsule'),
  makeEdge(
    'aiv-icache-scalar',
    'aiv-icache',
    'right-out-0',
    'aiv-scalar',
    'left-in-1',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'aiv-scalar-iq',
    'aiv-scalar',
    'right-out-0',
    'aiv-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'aiv-iq-cube',
    'aiv-iq',
    'right-out-0',
    'aiv-vector-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'aiv-iq-mte2',
    'aiv-iq',
    'right-out-1',
    'aiv-mte2-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
  makeEdge(
    'aiv-iq-mte3',
    'aiv-iq',
    'right-out-2',
    'aiv-mte3-iq',
    'left-in-0',
    'capsule',
    undefined,
    { style: dottedEdgeStyle }
  ),
];

const getDataColor = (colorMap, datatag, stage) => {
  const dashIndex = datatag.indexOf('-');
  const tag = dashIndex === -1 ? datatag : datatag.slice(0, dashIndex);
  return colorMap?.[tag]?.[stage];
};

const buildCellColorsFromItems = (items, colorMap) => {
  const nextColors = {};
  let cellOffset = 0;

  items.forEach((item) => {
    if (!('size' in item)) return;

    if ('dataStage' in item) {
      const limit = Math.min(item.size, item.dataStage.length);

      for (let index = 0; index < limit; index += 1) {
        const color = getDataColor(colorMap, item.tag, item.dataStage[index]);

        if (color !== undefined) {
          nextColors[cellOffset + index] = color;
        }
      }
    }

    cellOffset += item.size;
  });

  return nextColors;
};

const buildCellNumbersFromItems = (items) => {
  const nextNumbers = {};
  let cellOffset = 0;

  items.forEach((item) => {
    if (!('data' in item)) return;

    item.data.forEach((value, index) => {
      nextNumbers[cellOffset + index] = value;
    });

    cellOffset += item.data.length;
  });

  return nextNumbers;
};

const increaseHexOpacity = (hexColor, opacityBoost = 0.25) => {
  if (typeof hexColor !== 'string' || !hexColor.startsWith('#')) return hexColor;

  const normalizedHex = hexColor.slice(1);

  if (normalizedHex.length === 8) {
    const rgbHex = normalizedHex.slice(0, 6);
    const alphaHex = normalizedHex.slice(6, 8);
    const alpha = Number.parseInt(alphaHex, 16) / 255;

    if (Number.isNaN(alpha)) return hexColor;

    const nextAlpha = Math.min(alpha + opacityBoost, 1);
    const nextAlphaHex = Math.round(nextAlpha * 255).toString(16).padStart(2, '0').toUpperCase();

    return `#${rgbHex}${nextAlphaHex}`;
  }

  return hexColor;
};

const DEFAULT_PAGE='headware';
const DEFAULT_OPERATOR="cube";
const SHOW_OPERATOR_BOTTOM_BANNER = false;
const DEFAULT_API_OPERATION_ID = 'mul';
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

const getApiParameterValueAtPath = (parameterValues, parameterPath) =>
  parameterPath.reduce(
    (currentValue, parameterId) => currentValue?.[parameterId],
    parameterValues
  );

const updateApiParameterValueAtPath = (parameterValues, parameterPath, nextValue) => {
  if (parameterPath.length === 0) return parameterValues;

  const [currentParameterId, ...restParameterPath] = parameterPath;

  if (restParameterPath.length === 0) {
    return {
      ...parameterValues,
      [currentParameterId]: nextValue,
    };
  }

  return {
    ...parameterValues,
    [currentParameterId]: updateApiParameterValueAtPath(
      parameterValues?.[currentParameterId] ?? {},
      restParameterPath,
      nextValue
    ),
  };
};

const normalizeApiParameterValue = (parameterDefinition, nextValue) => {
  const parameterType = parameterDefinition.type ?? 'number';

  if (parameterType === 'text') {
    return nextValue;
  }

  const fallbackValue = parameterDefinition.defaultValue ?? parameterDefinition.min ?? 0;
  const parsedValue = Number.parseInt(nextValue, 10);

  if (!Number.isFinite(parsedValue)) return fallbackValue;

  const min = parameterDefinition.min ?? Number.MIN_SAFE_INTEGER;
  const max = parameterDefinition.max ?? Number.MAX_SAFE_INTEGER;

  return Math.max(min, Math.min(max, parsedValue));
};

const defaultApiParameterValues = buildApiParameterValues(
  getApiOperationDefinition(DEFAULT_API_OPERATION_ID).parameterDefinitions ?? defaultApiParameterDefinitions
);

// define-api-nodes
const AdditionAPINode = ({ data }) => {
  const paintedCount = clampApiPaintCount(Number.parseInt(data.paintCount ?? 0, 10));
  const cellNumbers = data.cellNumbers || {};
  const cellColors = data.cellColors || {};
  const baseCellClassName = 'flex items-center justify-center w-10 h-10 text-xs font-semibold rounded-md border';
  const emptyCellClassName = 'bg-slate-50 text-slate-300 border-[#E3E7EA]';
  const numberOnlyCellClassName = 'bg-white text-slate-700 border-[#E3E7EA]';

  return (
    <div className="bg-white p-6 border-2 border-gray-200 rounded-xl shadow-lg nodrag nopan min-w-[460px]">
      <div className="flex items-start gap-5">
        <div className="min-w-[150px] pt-1">
          <div className="text-2xl font-bold text-slate-800 leading-tight">{data.title}</div>
          <div className="text-base text-slate-500 mt-2 leading-tight">{data.subtitle}</div>
        </div>

        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${API_GRID_COLUMNS}, minmax(0, 1fr))`,
            width: 'max-content',
          }}
        >
          {Array.from({ length: API_GRID_TOTAL_CELLS }).map((_, index) => {
            const customValue = cellNumbers[index];
            const customColor = cellColors[index];
            const hasNumber = customValue !== undefined && customValue !== null;
            const hasCustomColor = customColor !== undefined && customColor !== null;
            const hasPaintFill = index < paintedCount;
            const className = hasCustomColor
              ? baseCellClassName
              : `${baseCellClassName} ${hasPaintFill
                ? data.paintedCellClassName
                : hasNumber
                  ? numberOnlyCellClassName
                  : emptyCellClassName
              }`;
            const style = hasCustomColor
              ? {
                backgroundColor: customColor,
                borderColor: hexToRgba(customColor, 0.7),
                color: getReadableTextColor(customColor),
              }
              : undefined;

            return (
              <div
                key={index}
                className={className}
                style={style}
              >
                {hasNumber ? customValue : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const apiNodeTypes = { apiNode: AdditionAPINode };
const EMPTY_API_EDGES = [];
const FLOW_FIT_VIEW_OPTIONS = { padding: 0.02 };
const REACT_FLOW_CANVAS_STYLE = { backgroundColor: '#f8fafc' };
const CONTENT_PAGE_CANVAS_STYLE = { backgroundColor: '#ffffff' };
const HARDWARE_CHIP_PANEL_STYLE = { top: 16, right: 16 };
const FLOATING_CANVAS_BAR_SURFACE_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr) max-content',
  alignItems: 'center',
  gap: '16px',
  width: '100%',
  height: '100%',
  padding: '0 20px',
  borderRadius: '999px',
  border: '1px solid rgba(226, 232, 240, 0.95)',
  backgroundColor: 'rgba(255,255,255,0.92)',
  boxShadow: '0 18px 42px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
  backdropFilter: 'blur(10px)',
  boxSizing: 'border-box',
};
const API_FLOATING_CANVAS_BAR_STYLE = {
  width: apiFloatingbarWidth,
  height: apiFloatingbarHeight,
};
const TOOLBAR_SECTION_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '10px',
};
const TOOLBAR_ACTIONS_STYLE = {
  ...TOOLBAR_SECTION_STYLE,
  justifyContent: 'flex-end',
};
const OPERATOR_TOOLBAR_CENTER_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
};
const TOOLBAR_BUTTON_BASE_STYLE = {
  width: '90px',
  height: '40px',
  padding: 0,
  color: 'white',
  border: 'none',
  borderRadius: '55px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontWeight: 'bold',
  fontSize: '15px',
};
const OPERATOR_RUN_BUTTON_STYLE = {
  ...TOOLBAR_BUTTON_BASE_STYLE,
  backgroundColor: '#3b82f6',
};
const OPERATOR_RESET_BUTTON_STYLE = {
  ...TOOLBAR_BUTTON_BASE_STYLE,
  backgroundColor: '#ef4444',
};
const OPERATOR_DIAGRAM_BUTTON_STYLE = {
  ...TOOLBAR_BUTTON_BASE_STYLE,
  width: '110px',
  height: '36px',
  borderRadius: '10px',
  background: '#0A59F719',
  color: '#0f172a',
};
const API_TOOLBAR_INPUTS_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  alignItems: 'center',
};
const API_INPUT_LABEL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: apiFloatingbarParamControllerHeight,
  padding: '0 10px',
  borderRadius: '12px',
  background: '#0000000C',
  color: '#475569',
  fontSize: '15px',
  fontWeight: 700,
  boxSizing: 'border-box',
};
const API_COMPACT_INPUT_SHELL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  height: apiFloatingBarParamInputboxHeight,
  boxSizing: 'border-box',
};
const API_PARAMETER_GROUP_STYLE = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  height: apiFloatingbarParamControllerHeight,
  padding: '0 8px',
  borderRadius: '12px',
  background: '#d4d4d8',
  color: '#334155',
  fontSize: '14px',
  fontWeight: 700,
  boxSizing: 'border-box',
};
const API_PARAMETER_GROUP_TITLE_STYLE = {
  paddingLeft: '2px',
  lineHeight: 1.1,
  whiteSpace: 'nowrap',
};
const API_PARAMETER_GROUP_BODY_STYLE = {
  display: 'flex',
  flexWrap: 'nowrap',
  gap: '6px',
  alignItems: 'center',
  height: apiFloatingBarParamInputboxHeight,
};
const API_INPUT_STYLE = {
  width: '100%',
  minWidth: '100%',
  height: '100%',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.92)',
  padding: '4px 6px',
  fontSize: '15px',
  fontWeight: 700,
  color: '#0f172a',
  backgroundColor: 'rgba(255,255,255,0.92)',
  boxShadow: 'none',
  boxSizing: 'border-box',
};
const API_COMPACT_INPUT_STYLE = {
  width: '100%',
  minWidth: '100%',
  height: '100%',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.92)',
  padding: '4px 6px',
  fontSize: '13px',
  fontWeight: 700,
  textAlign: 'center',
  color: '#0f172a',
  backgroundColor: 'rgba(255,255,255,0.92)',
  boxShadow: 'none',
  boxSizing: 'border-box',
};
const OPERATOR_DIMENSION_INPUT_STYLE = {
  ...API_INPUT_STYLE,
  border: '1px solid #C2C2C2',
  boxShadow: 'inset 0 0 0 1px #C2C2C2',
};
const API_INPUT_WRAP_STYLE = {
  display: 'flex',
  alignItems: 'center',
  width: apiFloatingBarParamInputboxWidth,
  minWidth: apiFloatingBarParamInputboxWidth,
  height: apiFloatingBarParamInputboxHeight,
};
const API_COMPACT_INPUT_WRAP_STYLE = {
  display: 'flex',
  alignItems: 'center',
  width: apiFloatingBarParamInputboxWidth,
  minWidth: apiFloatingBarParamInputboxWidth,
  height: apiFloatingBarParamInputboxHeight,
};

const getAutoplayButtonStyle = (isActive) => ({
  ...TOOLBAR_BUTTON_BASE_STYLE,
  backgroundColor: isActive ? '#f59e0b' : '#0ea5e9',
});

const primaryNavigationItems = [
  { id: 'hardware', label: '硬件架构', hint: '节点高亮与部件详情', icon: 'chip' },
  { id: 'operator', label: '算子流程', hint: '沿用现有流程展示', icon: 'layout' },
  { id: 'api', label: 'api', hint: '空白页面预留', icon: 'menu' },
];

const hardwareFilterItems = [
  { id: 'overview', label: '基本架构', hint: '展示完整构视图', icon: 'layout', accent: '#2563eb' },
  { id: 'compute', label: '计算单元', hint: '高亮执行计算的部件', icon: 'cpu', accent: '#10b981' },
  { id: 'storage', label: '存储单元', hint: '高亮缓存与 Buffer', icon: 'database', accent: '#3b82f6' },
  { id: 'control', label: '控制单元', hint: '高亮 Scalar 与指令队列', icon: 'sliders', accent: '#f59e0b' },
];

const chipOptions = ['Ascend 910B', 'Ascend 910A', 'Ascend 310P'];
const chipSelectOptions = chipOptions.map((chip) => ({ value: chip, label: chip }));
const operatorSelectOptions = operatorProcessItems.map((process) => ({
  value: process.id,
  label: process.label,
}));
const operatorDimensionInputDefinitions = [
  { id: 'm', label: 'M=' },
  { id: 'n', label: 'N=' },
  { id: 'k', label: 'K=' },
];
const apiSelectOptions = apiOperationItems.map((operation) => ({
  value: operation.id,
  label: operation.label,
}));

const hardwareNodeCategories = {
  gm: 'storage',
  l2: 'storage',
  l1: 'storage',
  l0a: 'storage',
  l0b: 'storage',
  bt: 'storage',
  fp: 'storage',
  l0c: 'storage',
  fixpipe: 'storage',
  cube: 'compute',
  icache: 'storage',
  dcache: 'storage',
  scalar: 'control',
  iq: 'control',
  'cube-iq': 'control',
  'fixpipe-iq': 'control',
  'mte1-iq': 'control',
  'mte2-iq': 'control',
  ub: 'storage',
  vector: 'compute',
  'aiv-icache': 'storage',
  'aiv-dcache': 'storage',
  'aiv-scalar': 'control',
  'aiv-iq': 'control',
  'aiv-vector-iq': 'control',
  'aiv-mte2-iq': 'control',
  'aiv-mte3-iq': 'control',
  'aic-background': 'frame',
  'aiv-background': 'frame',
};

const hardwareHighlightGroups = {
  compute: Object.keys(hardwareNodeCategories).filter((nodeId) => hardwareNodeCategories[nodeId] === 'compute'),
  storage: Object.keys(hardwareNodeCategories).filter((nodeId) => hardwareNodeCategories[nodeId] === 'storage'),
  control: Object.keys(hardwareNodeCategories).filter((nodeId) => hardwareNodeCategories[nodeId] === 'control'),
};

const hardwareDetailSections = [
  { id: 'summary', label: '摘要', icon: 'layout', placeholder: '待补充' },
  { id: 'highlights', label: '要点', icon: 'grid', placeholder: '待补充' },
];
const hardwareOverviewDetailSections = hardwareDetailSections.filter((section) => section.id !== 'highlights');

const hardwareFilterDetailPanels = {
  compute: {
    title: '计算单元',
    sections: {
      summary: 'Vector负责执行向量运算。向量计算单元执行向量指令，类似于传统的单指令多数据（Single Instruction Multiple Data，SIMD）指令，每个向量指令可以完成多个操作数的同一类型运算。向量计算单元可以快速完成两个FP16类型的向量相加或者相乘。向量指令支持多次迭代执行，也支持对带有间隔的向量直接进行运算。', 
      highlights: 'Scalar负责各类型的标量数据运算和程序的流程控制。功能上可以看做一个小CPU，完成整个程序的循环控制、分支判断、Cube/Vector等指令的地址和参数计算以及基本的算术运算，并且可以通过在事件同步模块中插入同步符的方式来控制AI Core中其他执行单元的流水。相对于Host CPU，AI Core中的Scalar计算能力较弱，重点用于发射指令，所以在实际应用场景中应尽量减少Scalar计算，比如性能调优时尽量减少if/else等分支判断及变量运算。Scalar执行标量运算指令时，执行标准的ALU(Arithmetic Logic Unit)语句，ALU需要的代码段和数据段（栈空间）都来自于GM，ICache(Instruction Cache)用于缓存代码段，缓存大小与硬件规格相关，比如为16K或32K，以2K为单位加载；DCache(Data Cache)用于缓存数据段，大小也与硬件规格相关，比如为16K，以cacheline（64Byte）为单位加载。\nVector负责执行向量运算。向量计算单元执行向量指令，类似于传统的单指令多数据（Single Instruction Multiple Data，SIMD）指令，每个向量指令可以完成多个操作数的同一类型运算。向量计算单元可以快速完成两个FP16类型的向量相加或者相乘。向量指令支持多次迭代执行，也支持对带有间隔的向量直接进行运算。' ,
    },
  },
  storage: {
    title: '存储单元',
    sections: {
      summary: 'AI处理器中的计算资源要想发挥强劲算力，必要条件是保证输入数据能够及时准确地出现在计算单元中，需要精心设计存储系统，保证计算单元所需的数据供应。',
      highlights: 'AI Core中包含多级内部存储，AI Core需要把外部存储中的数据加载到内部存储中，才能完成相应的计算。AI Core的主要内部存储包括：L1 Buffer（L1缓冲区），L0 Buffer（L0缓冲区），Unified Buffer（统一缓冲区）等。为了配合AI Core中的数据传输和搬运，AI Core中还包含MTE（Memory Transfer Engine，存储转换引擎）搬运单元，在搬运过程中可执行随路数据格式/类型转换。',
    },
  },
  control: {
    title: '控制单元',
    sections: {
      summary: '控制单元为整个计算过程提供了指令控制，负责整个AI Core的运行。',
      highlights: '多条指令从系统内存通过总线接口进入到ICache(Instruction Cache)中，后续的指令执行过程，根据指令的类型，有两种可能：\n如果指令是Scalar指令，指令会被Scalar单元直接执行。\n其他指令会被Scalar单元调度到5个独立的分类队列（Vector指令队列、Cube指令队列、MTE1/MTE2/MTE3指令队列），然后再被对应执行单元执行。\n同一个指令队列中的指令是按照进入指令队列的顺序执行的，不同指令队列之间可以并行执行，通过多个指令队列的并行执行可以提升整体执行效率。对于并行执行过程中可能出现的数据依赖，通过事件同步模块插入同步指令来控制流水线的同步，提供PipeBarrier、SetFlag/WaitFlag两种指令，保证队列内部以及队列之间按照逻辑关系执行。',
    },
  },
};

const HARDWARE_MEMORY_NODE_BACKGROUND = '#B5CCEF';
const HARDWARE_MEMORY_NODE_FRAME_WIDTH = 10;

const buildHardwareNodes = () =>
  hardwareNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      detailSections: hardwareOverviewDetailContentByNodeId[node.id] ?? {},
      cellColors: {},
      unitCategory: hardwareNodeCategories[node.id] ?? null,
      isHighlighted: false,
      isSelected: false,
      isDimmed: false,
      focusColor: node.data.accentColor || '#3b82f6',
      isStructuralFrame: node.id.endsWith('-background'),
    },
  }));

const buildHardwarePageNodes = () =>
  buildHardwareNodes().map((node) => {
    if (!node.data.showGrid) return node;

    return {
      ...node,
      data: {
        ...node.data,
        showGrid: false,
        width: node.data.width ?? getGridNodeDimension(node.data.cols ?? DEFAULT_GRID_COLS),
        height: node.data.height ?? getGridNodeDimension(node.data.rows ?? DEFAULT_GRID_ROWS),
        backgroundColor: HARDWARE_MEMORY_NODE_BACKGROUND,
        backgroundFrameColor: DEFAULT_NODE_BACKGROUND,
        backgroundFrameWidth: HARDWARE_MEMORY_NODE_FRAME_WIDTH,
      },
    };
  });

const buildHardwareEdges = () =>
  hardwareEdges.map((edge) => {
    const baseStyle = getEdgeBaseStyle(edge);

    return {
      ...edge,
      animated: false,
      style: { ...baseStyle },
      markerStart: edge.markerStart?.type ? { ...edge.markerStart } : edge.markerStart,
      markerEnd: edge.markerEnd?.type ? { ...edge.markerEnd } : edge.markerEnd,
      data: {
        ...(edge.data ?? {}),
        baseStyle: { ...baseStyle },
      },
    };
  });

const PATTERN_950_SOURCE_URL =
  'https://www.hiascend.com/document/detail/zh/canncommercial/900/programug/Ascendcopdevg/atlas_ascendc_10_00065.html';
const PATTERN_950_NODE_BACKGROUND = '#182033';
const PATTERN_950_NODE_FRAME = '#0f172a';
const PATTERN_950_TEXT_STYLE = {
  width: '100%',
  color: '#e5edf8',
  fontFamily: 'Inter, Source Han Sans SC, PingFang SC, Noto Sans SC, sans-serif',
  fontWeight: 700,
  lineHeight: '18px',
  letterSpacing: '0px',
};
const PATTERN_950_MUTED_TEXT_STYLE = {
  ...PATTERN_950_TEXT_STYLE,
  color: '#cbd5e1',
  fontWeight: 600,
  fontSize: '12px',
};
const PATTERN_950_BASE_EDGE_STYLE = {
  stroke: '#64748b',
  strokeWidth: 2,
};
const PATTERN_950_CONTROL_EDGE_STYLE = {
  ...PATTERN_950_BASE_EDGE_STYLE,
  stroke: '#94a3b8',
  strokeDasharray: '5 5',
};
const PATTERN_950_TRANSPORT_EDGE_STYLE = {
  ...PATTERN_950_BASE_EDGE_STYLE,
  stroke: '#f5b342',
};
const PATTERN_950_DIRECT_EDGE_STYLE = {
  ...PATTERN_950_BASE_EDGE_STYLE,
  stroke: '#38bdf8',
};
const PATTERN_950_RETURN_EDGE_STYLE = {
  ...PATTERN_950_BASE_EDGE_STYLE,
  stroke: '#22c55e',
};
const PATTERN_950_HIGHLIGHT_EDGE_STYLE = {
  stroke: '#facc15',
  strokeWidth: 4,
  opacity: 1,
};
const PATTERN_950_DIMMED_EDGE_OPACITY = 0.22;

const getPattern950Route = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('view') === '950-pattern';

const pattern950Port = (size, ratios = [0.5]) => ratios.map((ratio) => Math.round(size * ratio));

const createPattern950Node = ({
  id,
  label,
  x,
  y,
  width,
  height,
  rows,
  cols,
  tone = 'storage',
  showGrid = false,
  handles = {},
  labelStyle,
  backgroundColor,
  backgroundFrameColor,
  backgroundFrameWidth = 4,
  borderRadius = 10,
}) => ({
  id,
  type: 'unifiedNode',
  position: { x, y },
  data: {
    label,
    width,
    height,
    rows,
    cols,
    showGrid,
    cellColors: {},
    borderRadius,
    backgroundColor: backgroundColor ?? PATTERN_950_NODE_BACKGROUND,
    backgroundFrameColor: backgroundFrameColor ?? PATTERN_950_NODE_FRAME,
    backgroundFrameWidth,
    accentColor:
      tone === 'compute' ? '#22c55e' :
        tone === 'control' ? '#fb923c' :
          tone === 'transport' ? '#f5b342' : '#60a5fa',
    textColor: '',
    labelStyle: labelStyle ?? PATTERN_950_TEXT_STYLE,
    isHighlighted: false,
    isSelected: false,
    isDimmed: false,
    focusColor:
      tone === 'compute' ? '#22c55e' :
        tone === 'control' ? '#fb923c' :
          tone === 'transport' ? '#f5b342' : '#60a5fa',
    leftInputs: handles.leftInputs ?? pattern950Port(height, [0.5]),
    leftOutputs: handles.leftOutputs ?? pattern950Port(height, [0.5]),
    rightInputs: handles.rightInputs ?? pattern950Port(height, [0.5]),
    rightOutputs: handles.rightOutputs ?? pattern950Port(height, [0.5]),
    topInputs: handles.topInputs ?? pattern950Port(width, [0.5]),
    topOutputs: handles.topOutputs ?? pattern950Port(width, [0.5]),
    bottomInputs: handles.bottomInputs ?? pattern950Port(width, [0.5]),
    bottomOutputs: handles.bottomOutputs ?? pattern950Port(width, [0.5]),
  },
});

const createPattern950FrameNode = ({ id, label, x, y, width, height, accent = '#60a5fa' }) => ({
  id,
  className: 'flow-background-node pattern-950-frame-node',
  data: { label },
  position: { x, y },
  style: {
    width,
    height,
    background: 'rgba(15, 23, 42, 0.72)',
    border: `1px solid ${hexToRgba(accent, 0.38)}`,
    borderRadius: '14px',
    color: '#dbeafe',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: 0,
    padding: '10px 12px',
    zIndex: -1,
  },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
});

const pattern950Nodes = [
  createPattern950Node({
    id: 'gm',
    label: 'Global Memory',
    x: 48,
    y: 82,
    width: 104,
    height: 572,
    rows: 32,
    cols: 5,
    showGrid: true,
    handles: {
      rightOutputs: pattern950Port(572, [0.16, 0.28, 0.42, 0.56, 0.70, 0.84]),
      rightInputs: pattern950Port(572, [0.34, 0.66]),
    },
  }),
  createPattern950Node({
    id: 'l2',
    label: 'L2 Cache',
    x: 192,
    y: 82,
    width: 88,
    height: 572,
    rows: 32,
    cols: 3,
    showGrid: true,
    handles: {
      leftInputs: pattern950Port(572, [0.18]),
      leftOutputs: pattern950Port(572, [0.34]),
      rightOutputs: pattern950Port(572, [0.10, 0.17, 0.24, 0.34, 0.45, 0.58, 0.68, 0.79, 0.89]),
      rightInputs: pattern950Port(572, [0.30, 0.62, 0.82]),
    },
  }),
  createPattern950FrameNode({
    id: 'mem950-aiv1',
    label: 'AIV 1',
    x: 340,
    y: 58,
    width: 390,
    height: 280,
    accent: '#60a5fa',
  }),
  createPattern950FrameNode({
    id: 'mem950-aic',
    label: 'AIC',
    x: 340,
    y: 386,
    width: 804,
    height: 306,
    accent: '#22c55e',
  }),
  createPattern950FrameNode({
    id: 'mem950-aiv2',
    label: 'AIV 2',
    x: 1010,
    y: 58,
    width: 390,
    height: 280,
    accent: '#60a5fa',
  }),
  createPattern950Node({
    id: 'aiv1-dcache',
    label: 'DCache',
    x: 370,
    y: 102,
    width: 86,
    height: 42,
    tone: 'storage',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#253044',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aiv1-icache',
    label: 'ICache',
    x: 370,
    y: 162,
    width: 86,
    height: 42,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#28303b',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aiv1-scalar',
    label: 'Scalar',
    x: 484,
    y: 102,
    width: 92,
    height: 54,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#3a2b21',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [18, 36], rightOutputs: [27], bottomInputs: [46] },
  }),
  createPattern950Node({
    id: 'aiv1-ub',
    label: 'UB',
    x: 484,
    y: 188,
    width: 166,
    height: 74,
    rows: 4,
    cols: 12,
    showGrid: true,
    handles: {
      leftInputs: [24, 50],
      leftOutputs: [56],
      rightOutputs: [24, 50],
      rightInputs: [56],
      bottomOutputs: [83],
    },
  }),
  createPattern950Node({
    id: 'aiv1-simt',
    label: 'SIMT',
    x: 604,
    y: 92,
    width: 72,
    height: 44,
    tone: 'compute',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#123327',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [22], rightOutputs: [22] },
  }),
  createPattern950Node({
    id: 'aiv1-simd',
    label: 'SIMD',
    x: 604,
    y: 146,
    width: 72,
    height: 44,
    tone: 'compute',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#123327',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [22], rightOutputs: [22] },
  }),
  createPattern950Node({
    id: 'aiv1-vector',
    label: 'Vector',
    x: 680,
    y: 112,
    width: 34,
    height: 116,
    tone: 'compute',
    backgroundColor: '#1f8f55',
    backgroundFrameColor: '#e2e8f0',
    backgroundFrameWidth: 4,
    labelStyle: { ...PATTERN_950_TEXT_STYLE, fontSize: '12px', writingMode: 'vertical-rl' },
    handles: { leftInputs: [34, 80], leftOutputs: [58] },
  }),
  createPattern950Node({
    id: 'aic-l1',
    label: 'L1',
    x: 374,
    y: 430,
    width: 146,
    height: 156,
    rows: 10,
    cols: 8,
    showGrid: true,
    handles: { leftInputs: [55, 102], rightOutputs: [34, 64, 94, 124], bottomInputs: [73] },
  }),
  createPattern950Node({
    id: 'aic-l0a',
    label: 'L0A',
    x: 560,
    y: 422,
    width: 98,
    height: 48,
    rows: 3,
    cols: 6,
    showGrid: true,
    handles: { leftInputs: [24], rightOutputs: [24] },
  }),
  createPattern950Node({
    id: 'aic-l0b',
    label: 'L0B',
    x: 560,
    y: 486,
    width: 98,
    height: 48,
    rows: 3,
    cols: 6,
    showGrid: true,
    handles: { leftInputs: [24], rightOutputs: [24] },
  }),
  createPattern950Node({
    id: 'aic-bt',
    label: 'BT',
    x: 560,
    y: 550,
    width: 98,
    height: 48,
    rows: 3,
    cols: 6,
    showGrid: true,
    handles: { leftInputs: [24], rightOutputs: [24] },
  }),
  createPattern950Node({
    id: 'aic-fp',
    label: 'FP',
    x: 560,
    y: 614,
    width: 98,
    height: 48,
    rows: 3,
    cols: 6,
    showGrid: true,
    handles: { leftInputs: [24], rightOutputs: [24] },
  }),
  createPattern950Node({
    id: 'aic-cube',
    label: 'Cube',
    x: 706,
    y: 468,
    width: 108,
    height: 108,
    tone: 'compute',
    backgroundColor: '#1f8f55',
    backgroundFrameColor: '#e2e8f0',
    backgroundFrameWidth: 8,
    handles: { leftInputs: [26, 54, 82], rightOutputs: [54] },
  }),
  createPattern950Node({
    id: 'aic-l0c',
    label: 'L0C',
    x: 862,
    y: 442,
    width: 118,
    height: 114,
    rows: 7,
    cols: 7,
    showGrid: true,
    handles: { leftInputs: [54], rightOutputs: [40, 74], bottomOutputs: [59] },
  }),
  createPattern950Node({
    id: 'aic-fixpipe',
    label: 'FixPipe',
    x: 1008,
    y: 468,
    width: 82,
    height: 82,
    tone: 'transport',
    backgroundColor: '#a85917',
    backgroundFrameColor: hexToRgba('#f59e0b', 0.36),
    backgroundFrameWidth: 5,
    handles: { leftInputs: [28, 54], rightOutputs: [41], bottomOutputs: [41] },
  }),
  createPattern950Node({
    id: 'aic-dcache',
    label: 'DCache',
    x: 374,
    y: 614,
    width: 86,
    height: 42,
    tone: 'storage',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#253044',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aic-icache',
    label: 'ICache',
    x: 476,
    y: 614,
    width: 70,
    height: 42,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#28303b',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aic-scalar',
    label: 'Scalar',
    x: 690,
    y: 614,
    width: 96,
    height: 54,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#3a2b21',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [18, 36], rightOutputs: [27] },
  }),
  createPattern950Node({
    id: 'aic-dispatch',
    label: 'Dispatch',
    x: 816,
    y: 614,
    width: 96,
    height: 54,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#3a2b21',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [27], rightOutputs: [18, 36] },
  }),
  createPattern950Node({
    id: 'aiv2-dcache',
    label: 'DCache',
    x: 1040,
    y: 102,
    width: 86,
    height: 42,
    tone: 'storage',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#253044',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aiv2-icache',
    label: 'ICache',
    x: 1040,
    y: 162,
    width: 86,
    height: 42,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#28303b',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createPattern950Node({
    id: 'aiv2-scalar',
    label: 'Scalar',
    x: 1154,
    y: 102,
    width: 92,
    height: 54,
    tone: 'control',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#3a2b21',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [18, 36], rightOutputs: [27], bottomInputs: [46] },
  }),
  createPattern950Node({
    id: 'aiv2-ub',
    label: 'UB',
    x: 1154,
    y: 188,
    width: 166,
    height: 74,
    rows: 4,
    cols: 12,
    showGrid: true,
    handles: {
      leftInputs: [24, 50],
      leftOutputs: [56],
      rightOutputs: [24, 50],
      rightInputs: [56],
      bottomOutputs: [83],
    },
  }),
  createPattern950Node({
    id: 'aiv2-simt',
    label: 'SIMT',
    x: 1274,
    y: 92,
    width: 72,
    height: 44,
    tone: 'compute',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#123327',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [22], rightOutputs: [22] },
  }),
  createPattern950Node({
    id: 'aiv2-simd',
    label: 'SIMD',
    x: 1274,
    y: 146,
    width: 72,
    height: 44,
    tone: 'compute',
    labelStyle: PATTERN_950_MUTED_TEXT_STYLE,
    backgroundColor: '#123327',
    backgroundFrameWidth: 0,
    handles: { leftInputs: [22], rightOutputs: [22] },
  }),
  createPattern950Node({
    id: 'aiv2-vector',
    label: 'Vector',
    x: 1350,
    y: 112,
    width: 34,
    height: 116,
    tone: 'compute',
    backgroundColor: '#1f8f55',
    backgroundFrameColor: '#e2e8f0',
    backgroundFrameWidth: 4,
    labelStyle: { ...PATTERN_950_TEXT_STYLE, fontSize: '12px', writingMode: 'vertical-rl' },
    handles: { leftInputs: [34, 80], leftOutputs: [58] },
  }),
];

const pattern950Edges = [
  makeEdge('gm-l2', 'gm', 'right-out-0', 'l2', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('l2-gm', 'l2', 'left-out-0', 'gm', 'right-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('l2-to-aiv1-dcache', 'l2', 'right-out-0', 'aiv1-dcache', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('l2-to-aiv1', 'l2', 'right-out-1', 'aiv1-ub', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aiv1-to-l2', 'aiv1-ub', 'left-out-0', 'l2', 'right-in-0', 'capsule', 'MTE3', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aiv1-dcache-ub', 'aiv1-dcache', 'right-out-0', 'aiv1-ub', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv1-icache-scalar', 'aiv1-icache', 'right-out-0', 'aiv1-scalar', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv1-scalar-simt', 'aiv1-scalar', 'right-out-0', 'aiv1-simt', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv1-ub-simd', 'aiv1-ub', 'right-out-0', 'aiv1-simd', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv1-ub-simt', 'aiv1-ub', 'right-out-1', 'aiv1-simt', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv1-simt-vector', 'aiv1-simt', 'right-out-0', 'aiv1-vector', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv1-simd-vector', 'aiv1-simd', 'right-out-0', 'aiv1-vector', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv1-vector-ub', 'aiv1-vector', 'left-out-0', 'aiv1-ub', 'right-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('l2-to-aic-dcache', 'l2', 'right-out-2', 'aic-dcache', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('l2-to-aic', 'l2', 'right-out-3', 'aic-l1', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-l1-l0a', 'aic-l1', 'right-out-0', 'aic-l0a', 'left-in-0', 'capsule', 'MTE1', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-l1-l0b', 'aic-l1', 'right-out-1', 'aic-l0b', 'left-in-0', 'capsule', 'MTE1', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-l1-bt', 'aic-l1', 'right-out-2', 'aic-bt', 'left-in-0', 'capsule', 'MTE1', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-l1-fp', 'aic-l1', 'right-out-3', 'aic-fp', 'left-in-0', 'capsule', 'FixPipe', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-l0a-cube', 'aic-l0a', 'right-out-0', 'aic-cube', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-l0b-cube', 'aic-l0b', 'right-out-0', 'aic-cube', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-bt-cube', 'aic-bt', 'right-out-0', 'aic-cube', 'left-in-2', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-cube-l0c', 'aic-cube', 'right-out-0', 'aic-l0c', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-l0c-fixpipe', 'aic-l0c', 'right-out-0', 'aic-fixpipe', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-fp-fixpipe', 'aic-fp', 'right-out-0', 'aic-fixpipe', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-fixpipe-l2', 'aic-fixpipe', 'bottom-out-0', 'l2', 'right-in-2', 'capsule', undefined, { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aic-dcache-scalar', 'aic-dcache', 'right-out-0', 'aic-scalar', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aic-icache-scalar', 'aic-icache', 'right-out-0', 'aic-scalar', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aic-scalar-dispatch', 'aic-scalar', 'right-out-0', 'aic-dispatch', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aic-to-aiv1', 'aic-l0c', 'right-out-1', 'aiv1-ub', 'right-in-0', 'capsule', 'L0C→UB', { style: PATTERN_950_DIRECT_EDGE_STYLE }),
  makeEdge('l2-to-aiv2-dcache', 'l2', 'right-out-4', 'aiv2-dcache', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('l2-to-aiv2', 'l2', 'right-out-5', 'aiv2-ub', 'left-in-0', 'capsule', 'MTE2', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aiv2-to-l2', 'aiv2-ub', 'left-out-0', 'l2', 'right-in-1', 'capsule', 'MTE3', { style: PATTERN_950_TRANSPORT_EDGE_STYLE }),
  makeEdge('aiv2-dcache-ub', 'aiv2-dcache', 'right-out-0', 'aiv2-ub', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv2-icache-scalar', 'aiv2-icache', 'right-out-0', 'aiv2-scalar', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv2-scalar-simt', 'aiv2-scalar', 'right-out-0', 'aiv2-simt', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv2-ub-simd', 'aiv2-ub', 'right-out-0', 'aiv2-simd', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv2-ub-simt', 'aiv2-ub', 'right-out-1', 'aiv2-simt', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_CONTROL_EDGE_STYLE }),
  makeEdge('aiv2-simt-vector', 'aiv2-simt', 'right-out-0', 'aiv2-vector', 'left-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv2-simd-vector', 'aiv2-simd', 'right-out-0', 'aiv2-vector', 'left-in-1', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv2-vector-ub', 'aiv2-vector', 'left-out-0', 'aiv2-ub', 'right-in-0', 'capsule', undefined, { style: PATTERN_950_BASE_EDGE_STYLE }),
  makeEdge('aiv2-to-aic', 'aiv2-ub', 'bottom-out-0', 'aic-l1', 'bottom-in-0', 'capsule', 'UB→L1', { style: PATTERN_950_RETURN_EDGE_STYLE }),
];

const official950MemoryNodeFrameWidth = 8;
const official950CanvasY = 36;
const official950CanvasHeight = 1266;
const official950AicY = 76;
const official950AicHeight = 440;
const official950Aiv1Y = 548;
const official950Aiv2Y = 914;
const official950AivHeight = 334;
const official950FrameStyle = {
  background: '#F4F4F6',
  border: '1px solid #a8adb7',
  borderRadius: '12px',
  boxSizing: 'border-box',
  color: '#000',
  fontSize: '16px',
  fontWeight: 'bold',
  textAlign: 'left',
  padding: '10px',
  zIndex: -2,
};
const official950AiCoreFrameStyle = {
  background: 'transparent',
  border: '2px solid #111827',
  borderRadius: '14px',
  boxSizing: 'border-box',
  color: '#111827',
  fontSize: '16px',
  fontWeight: 'bold',
  textAlign: 'left',
  padding: '10px',
  zIndex: -3,
};
const official950SubgroupFrameStyle = {
  background: 'rgba(255, 255, 255, 0.36)',
  border: '1px dashed #6b7280',
  borderRadius: '10px',
  boxSizing: 'border-box',
  color: '#111827',
  fontSize: '13px',
  fontWeight: 'bold',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0 12px',
  zIndex: -1,
};
const official950SimtFrameStyle = {
  ...official950SubgroupFrameStyle,
  background: 'rgba(224, 231, 255, 0.42)',
  border: '1px dashed #334155',
};
const official950SimdFrameStyle = {
  ...official950SubgroupFrameStyle,
  background: 'rgba(220, 252, 231, 0.34)',
  border: '1px dashed #6b7280',
};
const official950QueueStyle = {
  ...INSTRUCTION_NODE_LABEL_STYLE,
  color: '#111827',
};
const official950SmallLabelStyle = {
  ...CONTROL_NODE_LABEL_STYLE,
  color: '#111827',
};
const official950VerticalLabelStyle = {
  ...PATTERN_950_TEXT_STYLE,
  color: '#111827',
  writingMode: 'vertical-rl',
  fontSize: '12px',
};
const official950EdgeStyle = createEdgeBaseStyle();
const official950InstructionEdgeStyle = createEdgeBaseStyle(dottedEdgeStyle);
const official950TransportEdgeStyle = createEdgeBaseStyle({ stroke: '#FFA73D', strokeWidth: 2.2 });
const official950DirectEdgeStyle = createEdgeBaseStyle({ stroke: '#0ea5e9', strokeWidth: 2.2 });
const official950ReturnEdgeStyle = createEdgeBaseStyle({ stroke: '#22c55e', strokeWidth: 2.2 });

const createOfficial950Node = ({
  id,
  label,
  x,
  y,
  width,
  height,
  rows,
  cols,
  showGrid = false,
  tone = 'memory',
  shape,
  handles = {},
  labelStyle,
  backgroundColor,
  backgroundFrameColor,
  backgroundFrameWidth,
  borderRadius = 12,
  zIndex,
}) => ({
  id,
  type: 'unifiedNode',
  position: { x, y },
  zIndex,
  data: {
    label,
    width,
    height,
    rows,
    cols,
    showGrid,
    shape,
    borderRadius,
    backgroundColor:
      backgroundColor ??
      (tone === 'compute' ? '#8ECC99' :
        tone === 'control' ? MUTED_NODE_BACKGROUND :
          tone === 'transport' ? '#FFA73D' : DEFAULT_NODE_BACKGROUND),
    backgroundFrameColor:
      backgroundFrameColor ??
      (tone === 'compute' ? '#ffffff' :
        tone === 'transport' ? hexToRgba('#FFA73D', 0.34) : DEFAULT_NODE_BACKGROUND),
    backgroundFrameWidth:
      backgroundFrameWidth ??
      (tone === 'compute' ? COMPUTE_NODE_FRAME_WIDTH :
        tone === 'transport' ? 5 :
          showGrid ? official950MemoryNodeFrameWidth : 0),
    accentColor:
      tone === 'compute' ? '#10b981' :
        tone === 'control' ? '#A3A3A3' :
          tone === 'transport' ? '#fb923c' : '#3b82f6',
    textColor: tone === 'compute' ? 'text-black' : '',
    labelStyle:
      labelStyle ??
      (tone === 'control' ? official950SmallLabelStyle :
        tone === 'transport' ? FIXPIPE_LABEL_STYLE : undefined),
    isHighlighted: false,
    isSelected: false,
    isDimmed: false,
    focusColor:
      tone === 'compute' ? '#10b981' :
        tone === 'control' ? '#A3A3A3' :
          tone === 'transport' ? '#fb923c' : '#3b82f6',
    leftInputs: handles.leftInputs ?? [Math.round(height / 2)],
    leftOutputs: handles.leftOutputs ?? [Math.round(height / 2)],
    rightInputs: handles.rightInputs ?? [Math.round(height / 2)],
    rightOutputs: handles.rightOutputs ?? [Math.round(height / 2)],
    topInputs: handles.topInputs ?? [Math.round(width / 2)],
    topOutputs: handles.topOutputs ?? [Math.round(width / 2)],
    bottomInputs: handles.bottomInputs ?? [Math.round(width / 2)],
    bottomOutputs: handles.bottomOutputs ?? [Math.round(width / 2)],
  },
});

const createOfficial950FrameNode = ({ id, label, x, y, width, height, variant = 'section' }) => ({
  id,
  className: 'flow-background-node',
  data: { label },
  position: { x, y },
  zIndex: variant === 'ai-core' ? -3 : variant === 'subgroup' ? -1 : -2,
  style: {
    ...(variant === 'ai-core' ? official950AiCoreFrameStyle :
      variant === 'subgroup-simt' ? official950SimtFrameStyle :
        variant === 'subgroup-simd' ? official950SimdFrameStyle :
          variant === 'subgroup' ? official950SubgroupFrameStyle : official950FrameStyle),
    width,
    height,
  },
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
});

const buildOfficial950AivNodes = (prefix, label, y) => [
  createOfficial950FrameNode({ id: `mem950-${prefix}`, label, x: 322, y, width: 1216, height: official950AivHeight }),
  createOfficial950Node({
    id: `${prefix}-dcache`,
    label: 'DCache',
    x: 510,
    y: y + 34,
    width: 92,
    height: 42,
    tone: 'control',
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createOfficial950Node({
    id: `${prefix}-icache`,
    label: 'ICache',
    x: 510,
    y: y + 88,
    width: 92,
    height: 42,
    tone: 'control',
    handles: { leftInputs: [21], rightOutputs: [21] },
  }),
  createOfficial950Node({
    id: `${prefix}-scalar`,
    label: 'Scalar',
    x: 690,
    y: y + 46,
    width: 96,
    height: 64,
    tone: 'compute',
    handles: { leftInputs: [24, 44], rightOutputs: [32], topInputs: [48], bottomInputs: [48], bottomOutputs: [48] },
  }),
  createOfficial950Node({
    id: `${prefix}-iq`,
    label: '指令序列',
    x: 842,
    y: y + 46,
    width: 68,
    height: 68,
    tone: 'transport',
    shape: 'diamond',
    labelStyle: { ...official950QueueStyle, fontSize: '12px' },
    handles: { leftInputs: [34], rightOutputs: [18, 30, 42, 54] },
  }),
  createOfficial950Node({
    id: `${prefix}-mte2-iq`,
    label: 'MTE2指令序列',
    x: 980,
    y: y + 16,
    width: 138,
    height: 30,
    tone: 'control',
    labelStyle: official950QueueStyle,
    handles: { leftInputs: [15] },
  }),
  createOfficial950Node({
    id: `${prefix}-mte3-iq`,
    label: 'MTE3指令序列',
    x: 980,
    y: y + 52,
    width: 138,
    height: 30,
    tone: 'control',
    labelStyle: official950QueueStyle,
    handles: { leftInputs: [15] },
  }),
  createOfficial950Node({
    id: `${prefix}-simd-iq`,
    label: 'SIMD VF指令序列',
    x: 980,
    y: y + 88,
    width: 138,
    height: 30,
    tone: 'control',
    labelStyle: official950QueueStyle,
    handles: { leftInputs: [15] },
  }),
  createOfficial950Node({
    id: `${prefix}-simt-iq`,
    label: 'SIMT VF指令序列',
    x: 980,
    y: y + 124,
    width: 138,
    height: 30,
    tone: 'control',
    labelStyle: official950QueueStyle,
    handles: { leftInputs: [15] },
  }),
  createOfficial950Node({
    id: `${prefix}-ndma`,
    label: 'ND-DMA Cache',
    x: 438,
    y: y + 230,
    width: 92,
    height: 48,
    tone: 'control',
    labelStyle: official950SmallLabelStyle,
    handles: { leftInputs: [24], rightOutputs: [24] },
  }),
  createOfficial950Node({
    id: `${prefix}-ub`,
    label: 'Unified Buffer',
    x: 548,
    y: y + 198,
    width: 214,
    height: 104,
    rows: 5,
    cols: 14,
    showGrid: true,
    handles: {
      leftInputs: [32, 68],
      leftOutputs: [72],
      rightOutputs: [28, 52, 74],
      rightInputs: [48],
      topInputs: [107],
      bottomInputs: [107],
      bottomOutputs: [107],
    },
  }),
  createOfficial950Node({
    id: `${prefix}-simt-dcache`,
    label: 'SIMT DCache',
    x: 566,
    y: y + 176,
    width: 138,
    height: 34,
    tone: 'control',
    labelStyle: official950SmallLabelStyle,
    handles: { leftInputs: [17], rightOutputs: [17] },
    zIndex: 8,
  }),
  createOfficial950FrameNode({
    id: `${prefix}-simt-frame`,
    label: 'SIMT',
    x: 790,
    y: y + 136,
    width: 340,
    height: 108,
    variant: 'subgroup-simt',
  }),
  createOfficial950FrameNode({
    id: `${prefix}-simd-frame`,
    label: 'SIMD',
    x: 790,
    y: y + 246,
    width: 340,
    height: 84,
    variant: 'subgroup-simd',
  }),
  createOfficial950Node({
    id: `${prefix}-warp`,
    label: 'Warp Scheduler',
    x: 912,
    y: y + 154,
    width: 132,
    height: 36,
    tone: 'compute',
    labelStyle: { ...official950SmallLabelStyle, color: '#111827' },
    handles: { leftInputs: [18], rightOutputs: [18] },
  }),
  createOfficial950Node({
    id: `${prefix}-simt-rf`,
    label: 'SIMT Register File',
    x: 846,
    y: y + 202,
    width: 196,
    height: 34,
    tone: 'control',
    labelStyle: official950SmallLabelStyle,
    handles: { leftInputs: [17], rightOutputs: [17] },
  }),
  createOfficial950Node({
    id: `${prefix}-vector-rf`,
    label: 'Vector Register File',
    x: 846,
    y: y + 246,
    width: 196,
    height: 34,
    tone: 'control',
    labelStyle: official950SmallLabelStyle,
    handles: { leftInputs: [17], rightOutputs: [17] },
  }),
  createOfficial950Node({
    id: `${prefix}-aux-scalar`,
    label: 'Aux Scalar',
    x: 912,
    y: y + 288,
    width: 132,
    height: 36,
    tone: 'compute',
    labelStyle: { ...official950SmallLabelStyle, color: '#111827' },
    handles: { leftInputs: [18], rightOutputs: [18] },
  }),
  createOfficial950Node({
    id: `${prefix}-vector`,
    label: 'Vector',
    x: 1190,
    y: y + 208,
    width: 82,
    height: 112,
    tone: 'compute',
    handles: { leftInputs: [38, 76], leftOutputs: [56] },
  }),
];

const officialPattern950Nodes = [
  createOfficial950Node({
    id: 'gm',
    label: 'Global Memory',
    x: 30,
    y: official950CanvasY,
    width: 104,
    height: official950CanvasHeight,
    rows: 64,
    cols: 5,
    showGrid: true,
    handles: {
      rightOutputs: [202, 782, 1148],
      rightInputs: [302, 790, 1156],
    },
  }),
  createOfficial950Node({
    id: 'l2',
    label: 'L2 Cache',
    x: 158,
    y: official950CanvasY,
    width: 104,
    height: official950CanvasHeight,
    rows: 64,
    cols: 5,
    showGrid: true,
    handles: {
      leftInputs: [202, 782, 1148],
      leftOutputs: [302, 790, 1156],
      rightOutputs: [202, 369, 419, 567, 621, 742, 933, 987, 1108],
      rightInputs: [260, 300, 782, 1148],
    },
  }),
  createOfficial950FrameNode({
    id: 'mem950-ai-core',
    label: 'AI Core',
    x: 292,
    y: official950CanvasY,
    width: 1292,
    height: official950CanvasHeight,
    variant: 'ai-core',
  }),
  createOfficial950FrameNode({ id: 'mem950-aic', label: 'AIC', x: 322, y: official950AicY, width: 1216, height: official950AicHeight }),
  createOfficial950Node({
    id: 'aic-l1',
    label: 'L1 Buffer',
    x: 512,
    y: 126,
    width: 142,
    height: 222,
    rows: 15,
    cols: 8,
    showGrid: true,
    handles: { leftInputs: [112], rightOutputs: [36, 82, 128, 174], bottomInputs: [52, 70, 96], bottomOutputs: [70] },
  }),
  createOfficial950Node({ id: 'aic-l0a', label: 'L0A Buffer', x: 730, y: 140, width: 128, height: 44, rows: 3, cols: 7, showGrid: true, handles: { leftInputs: [22], rightOutputs: [22] } }),
  createOfficial950Node({ id: 'aic-l0b', label: 'L0B Buffer', x: 730, y: 186, width: 128, height: 44, rows: 3, cols: 7, showGrid: true, handles: { leftInputs: [22], rightOutputs: [22] } }),
  createOfficial950Node({ id: 'aic-bt', label: 'BT Buffer', x: 730, y: 232, width: 128, height: 44, rows: 3, cols: 7, showGrid: true, handles: { leftInputs: [22], rightOutputs: [22] } }),
  createOfficial950Node({ id: 'aic-fp', label: 'FP Buffer', x: 730, y: 278, width: 128, height: 44, rows: 3, cols: 7, showGrid: true, handles: { leftInputs: [22], rightOutputs: [22], bottomOutputs: [64] } }),
  createOfficial950Node({
    id: 'aic-cube',
    label: 'Cube',
    x: 940,
    y: 110,
    width: 96,
    height: 172,
    tone: 'compute',
    handles: { leftInputs: [52, 98, 144], rightOutputs: [86] },
  }),
  createOfficial950Node({ id: 'aic-l0c', label: 'L0C Buffer', x: 1168, y: 128, width: 104, height: 90, rows: 5, cols: 6, showGrid: true, handles: { leftInputs: [68], rightOutputs: [45], bottomOutputs: [36, 68] } }),
  createOfficial950Node({
    id: 'aic-fixpipe',
    label: 'FixPipe',
    x: 1232,
    y: 246,
    width: 42,
    height: 88,
    tone: 'transport',
    labelStyle: official950VerticalLabelStyle,
    handles: { topInputs: [21], bottomOutputs: [21], leftInputs: [54], rightOutputs: [44] },
  }),
  createOfficial950Node({ id: 'aic-dcache', label: 'DCache', x: 512, y: 384, width: 92, height: 42, tone: 'control', handles: { leftInputs: [21], rightOutputs: [21], rightInputs: [28] } }),
  createOfficial950Node({ id: 'aic-icache', label: 'ICache', x: 512, y: 434, width: 92, height: 42, tone: 'control', handles: { leftInputs: [21], rightOutputs: [21] } }),
  createOfficial950Node({ id: 'aic-scalar', label: 'Scalar', x: 690, y: 384, width: 96, height: 64, tone: 'compute', handles: { leftInputs: [24, 44], rightOutputs: [32], bottomOutputs: [48] } }),
  createOfficial950Node({ id: 'aic-iq', label: '指令序列', x: 842, y: 382, width: 68, height: 68, tone: 'transport', shape: 'diamond', labelStyle: { ...official950QueueStyle, fontSize: '12px' }, handles: { leftInputs: [34], rightOutputs: [18, 30, 42, 54] } }),
  createOfficial950Node({ id: 'aic-cube-iq', label: 'Cube 指令序列', x: 980, y: 344, width: 138, height: 30, tone: 'control', labelStyle: official950QueueStyle, handles: { leftInputs: [15] } }),
  createOfficial950Node({ id: 'aic-fixpipe-iq', label: 'FixPipe指令序列', x: 980, y: 382, width: 138, height: 30, tone: 'control', labelStyle: official950QueueStyle, handles: { leftInputs: [15] } }),
  createOfficial950Node({ id: 'aic-mte1-iq', label: 'MTE1指令序列', x: 980, y: 420, width: 138, height: 30, tone: 'control', labelStyle: official950QueueStyle, handles: { leftInputs: [15] } }),
  createOfficial950Node({ id: 'aic-mte2-iq', label: 'MTE2指令序列', x: 980, y: 458, width: 138, height: 30, tone: 'control', labelStyle: official950QueueStyle, handles: { leftInputs: [15] } }),
  createOfficial950Node({ id: 'ssbuffer', label: 'SSBuffer', x: 690, y: 484, width: 104, height: 42, tone: 'control', handles: { topInputs: [52], topOutputs: [52], bottomInputs: [52], bottomOutputs: [36, 68] } }),
  ...buildOfficial950AivNodes('aiv1', 'AIV 1', official950Aiv1Y),
  ...buildOfficial950AivNodes('aiv2', 'AIV 2', official950Aiv2Y),
];

const buildOfficial950AivEdges = (prefix, l2Handles) => [
  makeEdge(`l2-to-${prefix}-dcache`, 'l2', l2Handles.dcacheOut, `${prefix}-dcache`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`l2-to-${prefix}-icache`, 'l2', l2Handles.icacheOut, `${prefix}-icache`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`l2-to-${prefix}`, 'l2', l2Handles.ubOut, `${prefix}-ub`, 'left-in-0', 'capsule', 'MTE2', { style: official950TransportEdgeStyle }),
  makeEdge(`${prefix}-to-l2`, `${prefix}-ub`, 'left-out-0', 'l2', l2Handles.ubIn, 'capsule', 'MTE3', { style: official950TransportEdgeStyle }),
  makeEdge(`${prefix}-ndma-ub`, `${prefix}-ndma`, 'right-out-0', `${prefix}-ub`, 'left-in-1', 'capsule', 'MTE2', { style: official950TransportEdgeStyle }),
  makeEdge(`${prefix}-dcache-scalar`, `${prefix}-dcache`, 'right-out-0', `${prefix}-scalar`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-scalar-dcache`, `${prefix}-scalar`, 'left-out-0', `${prefix}-dcache`, 'right-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-icache-scalar`, `${prefix}-icache`, 'right-out-0', `${prefix}-scalar`, 'left-in-1', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-scalar-iq`, `${prefix}-scalar`, 'right-out-0', `${prefix}-iq`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-iq-mte2`, `${prefix}-iq`, 'right-out-0', `${prefix}-mte2-iq`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-iq-mte3`, `${prefix}-iq`, 'right-out-1', `${prefix}-mte3-iq`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-iq-simd`, `${prefix}-iq`, 'right-out-2', `${prefix}-simd-iq`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-iq-simt`, `${prefix}-iq`, 'right-out-3', `${prefix}-simt-iq`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-ub-simt-dcache`, `${prefix}-ub`, 'right-out-0', `${prefix}-simt-dcache`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-ub-simt-rf`, `${prefix}-ub`, 'right-out-1', `${prefix}-simt-rf`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-ub-vector-rf`, `${prefix}-ub`, 'right-out-2', `${prefix}-vector-rf`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-warp-simt-rf`, `${prefix}-warp`, 'right-out-0', `${prefix}-simt-rf`, 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge(`${prefix}-simt-rf-vector`, `${prefix}-simt-rf`, 'right-out-0', `${prefix}-vector`, 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-vector-rf-vector`, `${prefix}-vector-rf`, 'right-out-0', `${prefix}-vector`, 'left-in-1', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge(`${prefix}-vector-ub`, `${prefix}-vector`, 'left-out-0', `${prefix}-ub`, 'right-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
];

const officialPattern950Edges = [
  makeEdge('gm-l2', 'gm', 'right-out-0', 'l2', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('l2-gm', 'l2', 'left-out-0', 'gm', 'right-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('l2-to-aic', 'l2', 'right-out-0', 'aic-l1', 'left-in-0', 'capsule', 'MTE2', { style: official950TransportEdgeStyle }),
  makeEdge('l2-to-aic-dcache', 'l2', 'right-out-1', 'aic-dcache', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('l2-to-aic-icache', 'l2', 'right-out-2', 'aic-icache', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-l1-l0a', 'aic-l1', 'right-out-0', 'aic-l0a', 'left-in-0', 'capsule', 'MTE1', { style: official950TransportEdgeStyle }),
  makeEdge('aic-l1-l0b', 'aic-l1', 'right-out-1', 'aic-l0b', 'left-in-0', 'capsule', 'MTE1', { style: official950TransportEdgeStyle }),
  makeEdge('aic-l1-bt', 'aic-l1', 'right-out-2', 'aic-bt', 'left-in-0', 'capsule', 'MTE1', { style: official950TransportEdgeStyle }),
  makeEdge('aic-l1-fp', 'aic-l1', 'right-out-3', 'aic-fp', 'left-in-0', 'capsule', 'FixPipe', { style: official950TransportEdgeStyle }),
  makeEdge('aic-l0a-cube', 'aic-l0a', 'right-out-0', 'aic-cube', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-l0b-cube', 'aic-l0b', 'right-out-0', 'aic-cube', 'left-in-1', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-bt-cube', 'aic-bt', 'right-out-0', 'aic-cube', 'left-in-2', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-cube-l0c', 'aic-cube', 'right-out-0', 'aic-l0c', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-l0c-fixpipe', 'aic-l0c', 'bottom-out-0', 'aic-fixpipe', 'top-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-fp-fixpipe', 'aic-fp', 'right-out-0', 'aic-fixpipe', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-fixpipe-l2', 'aic-fixpipe', 'bottom-out-0', 'l2', 'right-in-1', 'capsule', undefined, { style: official950TransportEdgeStyle }),
  makeEdge('aic-fixpipe-l1', 'aic-fixpipe', 'right-out-0', 'aic-l1', 'bottom-in-1', 'capsule', undefined, { style: official950TransportEdgeStyle }),
  makeEdge('aic-dcache-scalar', 'aic-dcache', 'right-out-0', 'aic-scalar', 'left-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-scalar-dcache', 'aic-scalar', 'left-out-0', 'aic-dcache', 'right-in-0', 'capsule', undefined, { style: official950EdgeStyle }),
  makeEdge('aic-icache-scalar', 'aic-icache', 'right-out-0', 'aic-scalar', 'left-in-1', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-scalar-iq', 'aic-scalar', 'right-out-0', 'aic-iq', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-iq-cube', 'aic-iq', 'right-out-0', 'aic-cube-iq', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-iq-fixpipe', 'aic-iq', 'right-out-1', 'aic-fixpipe-iq', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-iq-mte1', 'aic-iq', 'right-out-2', 'aic-mte1-iq', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-iq-mte2', 'aic-iq', 'right-out-3', 'aic-mte2-iq', 'left-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('aic-scalar-ssbuffer', 'aic-scalar', 'bottom-out-0', 'ssbuffer', 'top-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('ssbuffer-aiv1-scalar', 'ssbuffer', 'bottom-out-0', 'aiv1-scalar', 'top-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  makeEdge('ssbuffer-aiv2-scalar', 'ssbuffer', 'bottom-out-1', 'aiv2-scalar', 'top-in-0', 'capsule', undefined, { style: official950InstructionEdgeStyle }),
  ...buildOfficial950AivEdges('aiv1', {
    dcacheOut: 'right-out-3',
    icacheOut: 'right-out-4',
    ubOut: 'right-out-5',
    ubIn: 'right-in-2',
  }),
  ...buildOfficial950AivEdges('aiv2', {
    dcacheOut: 'right-out-6',
    icacheOut: 'right-out-7',
    ubOut: 'right-out-8',
    ubIn: 'right-in-3',
  }),
  makeEdge('aic-to-aiv1', 'aic-l0c', 'bottom-out-0', 'aiv1-ub', 'top-in-0', 'capsule', 'L0C→UB', {
    style: official950DirectEdgeStyle,
    labelPosition: { x: 1198, y: 534 },
  }),
  makeEdge('aic-to-aiv2', 'aic-l0c', 'bottom-out-1', 'aiv2-ub', 'top-in-0', 'capsule', 'L0C→UB', {
    style: official950DirectEdgeStyle,
    labelPosition: { x: 1198, y: 900 },
  }),
  makeEdge('aiv1-to-aic', 'aiv1-ub', 'bottom-out-0', 'aic-l1', 'bottom-in-0', 'capsule', 'UB→L1', {
    style: official950ReturnEdgeStyle,
    labelPosition: { x: 630, y: 534 },
  }),
  makeEdge('aiv2-to-aic', 'aiv2-ub', 'bottom-out-0', 'aic-l1', 'bottom-in-2', 'capsule', 'UB→L1', {
    style: official950ReturnEdgeStyle,
    labelPosition: { x: 630, y: 900 },
  }),
];

const getPattern950SourceNodes = () => officialPattern950Nodes.length ? officialPattern950Nodes : pattern950Nodes;
const getPattern950SourceEdges = () => officialPattern950Edges.length ? officialPattern950Edges : pattern950Edges;

const buildPattern950Nodes = () =>
  getPattern950SourceNodes().map((node) => ({
    ...node,
    data: node.data ? { ...node.data } : node.data,
    style: node.style ? { ...node.style } : node.style,
  }));

const buildPattern950Edges = () =>
  getPattern950SourceEdges().map((edge) => {
    const baseStyle = getEdgeBaseStyle(edge);

    return {
      ...edge,
      animated: false,
      style: { ...baseStyle },
      markerEnd: edge.markerEnd?.type ? { ...edge.markerEnd } : edge.markerEnd,
      data: {
        ...(edge.data ?? {}),
        baseStyle: { ...baseStyle },
      },
    };
  });

const PATTERN_950_SELECTOR_NODE_MAP = {
  '[data-mem950-node="rail:GM"]': ['gm'],
  '[data-mem950-node="rail:L2"]': ['l2'],
  '#mem950-aiv1': ['mem950-aiv1'],
  '#mem950-aiv2': ['mem950-aiv2'],
  '#mem950-aic': ['mem950-aic'],
  '#mem950-aiv1 [data-aiv-node="buffer:UB"]': ['aiv1-ub'],
  '#mem950-aiv1 [data-aiv-node="cache:DCache"]': ['aiv1-dcache'],
  '#mem950-aiv1 [data-aiv-node="cache:ICache"]': ['aiv1-icache'],
  '#mem950-aiv1 [data-aiv-node="vector:Vector"]': ['aiv1-vector'],
  '#mem950-aiv1 [data-aiv-node="scalar:Scalar"]': ['aiv1-scalar'],
  '#mem950-aiv1 [data-aiv-node="exec:SIMT"]': ['aiv1-simt-dcache', 'aiv1-warp', 'aiv1-simt-rf'],
  '#mem950-aiv1 [data-aiv-node="exec:SIMD"]': ['aiv1-vector-rf', 'aiv1-aux-scalar'],
  '#mem950-aiv2 [data-aiv-node="buffer:UB"]': ['aiv2-ub'],
  '#mem950-aiv2 [data-aiv-node="cache:DCache"]': ['aiv2-dcache'],
  '#mem950-aiv2 [data-aiv-node="cache:ICache"]': ['aiv2-icache'],
  '#mem950-aiv2 [data-aiv-node="vector:Vector"]': ['aiv2-vector'],
  '#mem950-aiv2 [data-aiv-node="scalar:Scalar"]': ['aiv2-scalar'],
  '#mem950-aiv2 [data-aiv-node="exec:SIMT"]': ['aiv2-simt-dcache', 'aiv2-warp', 'aiv2-simt-rf'],
  '#mem950-aiv2 [data-aiv-node="exec:SIMD"]': ['aiv2-vector-rf', 'aiv2-aux-scalar'],
  '#mem950-aic [data-aic-node="buffer:L1"]': ['aic-l1'],
  '#mem950-aic [data-aic-node="buffer:L0A"]': ['aic-l0a'],
  '#mem950-aic [data-aic-node="buffer:L0B"]': ['aic-l0b'],
  '#mem950-aic [data-aic-node="buffer:BT"]': ['aic-bt'],
  '#mem950-aic [data-aic-node="buffer:FP"]': ['aic-fp'],
  '#mem950-aic [data-aic-node="buffer:L0C"]': ['aic-l0c'],
  '#mem950-aic [data-aic-node="cube:CUBE"]': ['aic-cube'],
  '#mem950-aic [data-aic-node="cache:DCache"]': ['aic-dcache'],
  '#mem950-aic [data-aic-node="cache:ICache"]': ['aic-icache'],
  '#mem950-aic [data-aic-node="scalar:Scalar"]': ['aic-scalar'],
};

const PATTERN_950_ROUTE_EDGE_MAP = {
  'l2-to-aiv1': ['l2-to-aiv1'],
  'aiv1-to-l2': ['aiv1-to-l2'],
  'l2-to-aiv1-dcache': ['l2-to-aiv1-dcache'],
  'l2-to-aic': ['l2-to-aic'],
  'l2-to-aic-dcache': ['l2-to-aic-dcache'],
  'aic-to-aiv1': ['aic-to-aiv1'],
  'aiv2-to-aic': ['aiv2-to-aic'],
  'l2-to-aiv2': ['l2-to-aiv2'],
  'aiv2-to-l2': ['aiv2-to-l2'],
  'l2-to-aiv2-dcache': ['l2-to-aiv2-dcache'],
};

const expandPattern950Ids = (items, lookup, fallbackIds) => {
  const resolved = new Set();

  (items || []).forEach((item) => {
    if (!item) return;
    if (lookup[item]) {
      lookup[item].forEach((id) => resolved.add(id));
      return;
    }
    if (fallbackIds.has(item)) resolved.add(item);
  });

  return resolved;
};

const derivePattern950NodeIdsFromEdges = (edgeIds) => {
  const nodeIds = new Set();
  getPattern950SourceEdges().forEach((edge) => {
    if (!edgeIds.has(edge.id)) return;
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  });
  return nodeIds;
};

const createPattern950Focus = ({ selectors = [], routes = [] } = {}) => {
  const nodeIdFallbacks = new Set(getPattern950SourceNodes().map((node) => node.id));
  const edgeIdFallbacks = new Set(getPattern950SourceEdges().map((edge) => edge.id));
  const edgeIds = expandPattern950Ids(routes, PATTERN_950_ROUTE_EDGE_MAP, edgeIdFallbacks);
  const nodeIds = expandPattern950Ids(selectors, PATTERN_950_SELECTOR_NODE_MAP, nodeIdFallbacks);

  derivePattern950NodeIdsFromEdges(edgeIds).forEach((nodeId) => nodeIds.add(nodeId));

  return { nodeIds, edgeIds };
};

const hasPattern950Focus = (focus) => focus.nodeIds.size > 0 || focus.edgeIds.size > 0;

const updatePattern950FrameStyle = (style, isActive, isDimmed) => ({
  ...style,
  opacity: isDimmed ? 0.34 : 1,
  border: isActive
    ? '1px solid rgba(250, 204, 21, 0.88)'
    : style.border,
  boxShadow: isActive
    ? '0 0 0 2px rgba(250, 204, 21, 0.16), 0 18px 48px rgba(15, 23, 42, 0.26)'
    : 'none',
});

const applyPattern950FocusToNodes = (nodes, focus) => {
  const hasFocus = hasPattern950Focus(focus);

  return nodes.map((node) => {
    const isActive = focus.nodeIds.has(node.id);
    const isDimmed = hasFocus && !isActive;

    if (!node.type) {
      const baseFrameStyle = getPattern950SourceNodes().find((patternNode) => patternNode.id === node.id)?.style ?? node.style ?? {};
      return {
        ...node,
        style: updatePattern950FrameStyle(baseFrameStyle, isActive, isDimmed),
      };
    }

    return {
      ...node,
      data: {
        ...node.data,
        isHighlighted: isActive,
        isDimmed,
      },
    };
  });
};

const applyPattern950FocusToEdges = (edges, focus) => {
  const hasFocus = hasPattern950Focus(focus);

  return edges.map((edge) => {
    const baseStyle = edge.data?.baseStyle ?? getEdgeBaseStyle(edge);
    const isActive = focus.edgeIds.has(edge.id);

    return {
      ...edge,
      animated: isActive,
      style: {
        ...baseStyle,
        ...(isActive ? PATTERN_950_HIGHLIGHT_EDGE_STYLE : null),
        opacity: hasFocus && !isActive ? PATTERN_950_DIMMED_EDGE_OPACITY : 1,
      },
    };
  });
};

const sendPattern950Ready = () => {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({
    type: 'hardware-ready',
    source: 'cannvision-950-pattern',
    reference: PATTERN_950_SOURCE_URL,
  }, '*');
};

const Hardware950PatternPage = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(buildPattern950Nodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildPattern950Edges());

  const applyFocus = useCallback((message = {}) => {
    const focus = createPattern950Focus(message);
    setNodes((currentNodes) => applyPattern950FocusToNodes(currentNodes, focus));
    setEdges((currentEdges) => applyPattern950FocusToEdges(currentEdges, focus));
  }, [setEdges, setNodes]);

  useEffect(() => {
    const handleMessage = (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      if (message.type === 'hardware-focus') {
        applyFocus(message);
      }
    };

    window.addEventListener('message', handleMessage);
    sendPattern950Ready();
    const readyTimer = window.setTimeout(sendPattern950Ready, 120);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(readyTimer);
    };
  }, [applyFocus]);

  return (
    <main style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.07, includeHiddenNodes: false }}
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        preventScrolling={false}
        style={REACT_FLOW_CANVAS_STYLE}
      />
    </main>
  );
};

const apiDataLeft = 300
const apiDataRowGap = 400
// init-api-nodes
const buildApiNodes = (operationId = DEFAULT_API_OPERATION_ID) => {
  const { apiNodeDefinitions = [] } = getApiOperationDefinition(operationId);

  return apiNodeDefinitions.map((node, index) => ({
    id: node.id,
    type: 'apiNode',
    position: { x: apiDataLeft, y: index * apiDataRowGap },
    data: {
      title: node.title,
      subtitle: node.subtitle,
      paintCount: 0,
      paintedCellClassName: node.paintedCellClassName,
      cellNumbers: {},
      cellColors: {},
    },
  }));
};

const SelectField = ({
  value,
  onChange,
  ariaLabel,
  options,
  rootClassName = '',
  selectClassName = '',
  rootStyle,
  selectStyle,
}) => {
  return (
    <div className={`chip-select-root ${rootClassName}`.trim()} style={rootStyle}>
      <select
        className={`chip-select ${selectClassName}`.trim()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        style={selectStyle}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="chip-select-arrow" aria-hidden="true">▾</span>
    </div>
  );
};

const FloatingCanvasBar = ({ left, center, right, className = '', style }) => {
  return (
    <div className={`floating-canvas-bar ${className}`.trim()} style={style}>
      <div className="floating-canvas-bar-surface" style={FLOATING_CANVAS_BAR_SURFACE_STYLE}>
        <div className="floating-canvas-bar-section floating-canvas-bar-section--left">
          {left}
        </div>
        <div className="floating-canvas-bar-section floating-canvas-bar-section--center">
          {center}
        </div>
        <div className="floating-canvas-bar-section floating-canvas-bar-section--right">
          {right}
        </div>
      </div>
    </div>
  );
};

const AppBanner = () => (
  <header className="app-banner">
    <div className="app-banner-slot">
      <img className="app-banner-logo" src={cannLogoPng} alt="CANN logo" />
    </div>
  </header>
);

const NavigationBar = ({
  activePageId,
  onNavigate,
}) => {
  return (
    <nav className="nevigation-bar" aria-label="Primary navigation">
      <div className="nevigation-bar-rail">
        {/* <div className="nevigation-bar-badge">
          <NavigationIcon icon="spark" />
        </div> */}

        <div className="nevigation-bar-rail-nav">
          {primaryNavigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nevigation-bar-rail-button ${activePageId === item.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-label={item.label}
            >
              <NavigationIcon icon={item.icon} />
              <span className="nevigation-bar-tooltip" role="presentation">
                <span className="nevigation-bar-tooltip-label">{item.label}</span>
                <span className="nevigation-bar-tooltip-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="nevigation-bar-spacer" />
      </div>
    </nav>
  );
};

const AppSidebar = ({ activePageId, onNavigate }) => (
  <aside className="app-sidebar">
    <NavigationBar activePageId={activePageId} onNavigate={onNavigate} />
  </aside>
);

const PageLayer = ({ children, className = '' }) => (
  <div className={`app-page-layer ${className}`.trim()}>
    {children}
  </div>
);

const HardwareNavigationPanel = ({
  activeHardwareFilterId,
  onHardwareFilterChange,
}) => {
  return (
    <section className="nevigation-bar-panel hardware-navigation-panel" aria-label="Hardware navigation">
      <div className="nevigation-bar-header">
        <div className="nevigation-bar-heading">
          <p className="nevigation-bar-brand">CANN Vision</p>
          <h1 className="nevigation-bar-title">硬件架构</h1>
        </div>
      </div>

      <div className="nevigation-bar-group">
        <div className="nevigation-bar-group-title">
          架构导航
        </div>
        <div className="nevigation-bar-nav">
          {hardwareFilterItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nevigation-bar-nav-button ${activeHardwareFilterId === item.id ? 'is-active' : ''}`}
              onClick={() => onHardwareFilterChange(item.id)}
            >
              <span className="nevigation-bar-nav-copy">
                <span className="nevigation-bar-nav-label">{item.label}</span>
                <span className="nevigation-bar-nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

const HardwareDetailSections = ({ sectionContentById = {}, sectionDefinitions = hardwareDetailSections }) => (
  <div className="hardware-detail-sections">
    {sectionDefinitions.map((section) => (
      <section key={section.id} className="hardware-detail-section">
        <div className="hardware-detail-section-title">
          <NavigationIcon icon={section.icon} />
          <span>{section.label}</span>
        </div>
        <div className="hardware-detail-placeholder">
          {sectionContentById[section.id] ?? section.placeholder}
        </div>
      </section>
    ))}
  </div>
);

const HardwareFilterDetailPanel = ({
  detail,
  accentColor,
  isCollapsed,
  onToggleCollapse,
}) => {
  if (!detail) return null;

  const collapseLabel = isCollapsed ? `展开${detail.title}面板` : `收起${detail.title}面板`;

  return (
    <aside
      className={`hardware-info-panel hardware-side-panel hardware-filter-panel ${isCollapsed ? 'is-collapsed' : ''}`.trim()}
      style={{ '--hardware-detail-accent': accentColor }}
      aria-label={`${detail.title}信息面板`}
    >
      <div className={`hardware-detail-header ${isCollapsed ? 'is-collapsed' : ''}`.trim()}>
        {isCollapsed ? (
          <div className="hardware-filter-panel-collapsed-copy" aria-hidden="true">
            <span className="hardware-filter-panel-collapsed-title">{detail.title}</span>
          </div>
        ) : (
          <div>
            <h3 className="hardware-detail-title">{detail.title}</h3>
          </div>
        )}
        <div className="hardware-detail-actions">
          <button
            type="button"
            className="hardware-detail-icon-button"
            onClick={onToggleCollapse}
            aria-label={collapseLabel}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? '>' : '<'}
          </button>
        </div>
      </div>

      {!isCollapsed ? <HardwareDetailSections sectionContentById={detail.sections} /> : null}
    </aside>
  );
};

const HardwareNodeGraph = ({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  allowNodeSelection,
  onNodeSelect,
  onClearSelection,
  selectedChip,
  onChipChange,
  chipOptions,
  selectedHardwareNode,
  onDetailClose,
  filterDetail,
  isFilterDetailCollapsed,
  onFilterDetailCollapseToggle,
}) => {
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const graphCanvasRef = useRef(null);
  const hasFilterDetail = Boolean(filterDetail);
  const hasSelectedHardwareNode = Boolean(selectedHardwareNode);
  const hasSidePanel = hasFilterDetail || hasSelectedHardwareNode;
  const isSidePanelCollapsed = hasFilterDetail && isFilterDetailCollapsed;

  useEffect(() => {
    if (!reactFlowInstance || !graphCanvasRef.current) return;

    let frameId = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        reactFlowInstance.fitView(FLOW_FIT_VIEW_OPTIONS);
      });
    });

    resizeObserver.observe(graphCanvasRef.current);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [reactFlowInstance]);

  useEffect(() => {
    if (!reactFlowInstance) return;

    const frameId = window.requestAnimationFrame(() => {
      reactFlowInstance.fitView(FLOW_FIT_VIEW_OPTIONS);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [filterDetail?.title, hasFilterDetail, isFilterDetailCollapsed, reactFlowInstance]);

  return (
    <section
      className={`flow-wrapper flow-wrapper--hardware hardware-node-graph ${hasSidePanel ? 'has-side-panel' : ''} ${isSidePanelCollapsed ? 'is-side-panel-collapsed' : ''}`.trim()}
      aria-label="Hardware node graph"
    >
      <div ref={graphCanvasRef} className="hardware-node-graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={allowNodeSelection ? (_, node) => onNodeSelect(node.id) : undefined}
          onPaneClick={onClearSelection}
          onInit={setReactFlowInstance}
          fitView
          fitViewOptions={FLOW_FIT_VIEW_OPTIONS}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          style={REACT_FLOW_CANVAS_STYLE}
        >
          <Panel position="top-right" style={HARDWARE_CHIP_PANEL_STYLE}>
            <SelectField
              value={selectedChip}
              onChange={onChipChange}
              ariaLabel="选择芯片型号"
              options={chipOptions}
            />
          </Panel>
        </ReactFlow>
      </div>
      {filterDetail ? (
        <HardwareFilterDetailPanel
          detail={filterDetail}
          accentColor={filterDetail.accentColor ?? '#8b5cf6'}
          isCollapsed={isFilterDetailCollapsed}
          onToggleCollapse={onFilterDetailCollapseToggle}
        />
      ) : (
        <HardwareDetailPanel
          node={selectedHardwareNode}
          onClose={onDetailClose}
        />
      )}
    </section>
  );
};

const HardwareDetailPanel = ({ node, onClose }) => {
  if (!node) return null;

  return (
    <aside
      className="hardware-info-panel hardware-side-panel hardware-detail-panel"
      style={{ '--hardware-detail-accent': node.data.focusColor || node.data.accentColor || '#8b5cf6' }}
    >
      <div className="hardware-detail-header">
        <div>
          <h3 className="hardware-detail-title">{node.data.label}</h3>
        </div>
        <div className="hardware-detail-actions">
          <button type="button" className="hardware-detail-icon-button" onClick={onClose} aria-label="关闭硬件详情">
            ×
          </button>
        </div>
      </div>

      <HardwareDetailSections
        sectionContentById={node.data.detailSections ?? {}}
        sectionDefinitions={hardwareOverviewDetailSections}
      />
    </aside>
  );
};

const isStorageNode = (nodeId) => hardwareNodeCategories[nodeId] === 'storage';
const isComputeNode = (nodeId) => hardwareNodeCategories[nodeId] === 'compute';

// app
export default function App() {
  if (getPattern950Route()) {
    return <Hardware950PatternPage />;
  }

  return <CANNVisionApp />;
}

function CANNVisionApp() {
  const [operatorNodes, setOperatorNodes, onOperatorNodesChange] = useNodesState(buildHardwareNodes());
  const [operatorEdges, setOperatorEdges, onOperatorEdgesChange] = useEdgesState(buildHardwareEdges());
  const [hardwareNodes, setHardwareNodes] = useNodesState(buildHardwarePageNodes());
  const [hardwareEdges, setHardwareEdges] = useEdgesState(buildHardwareEdges());
  const [apiNodes, setApiNodes, onApiNodesChange] = useNodesState(buildApiNodes(DEFAULT_API_OPERATION_ID));

  const [currentOperatorState, setCurrentOperatorState] = useState('init');
  const [selectedOperator, setSelectedOperator] = useState(DEFAULT_OPERATOR);
  const [selectedApiOperation, setSelectedApiOperation] = useState(DEFAULT_API_OPERATION_ID);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isOperatorDiagramVisible, setIsOperatorDiagramVisible] = useState(false);
  const [apiExecutionState, setApiExecutionState] = useState('init');
  const [isApiPlaying, setIsApiPlaying] = useState(false);

  const [activePageId, setActivePageId] = useState(DEFAULT_PAGE);
  const [activeHardwareFilterId, setActiveHardwareFilterId] = useState('overview');
  const [selectedHardwareNodeId, setSelectedHardwareNodeId] = useState(null);
  const [isHardwareFilterPanelCollapsed, setIsHardwareFilterPanelCollapsed] = useState(false);
  const [selectedChip, setSelectedChip] = useState(chipOptions[0]);
  const [currentApiState, setCurrentApiState] = useState('init');
  const [apiParameterValues, setApiParameterValues] = useState(defaultApiParameterValues);
  const [operatorDimensionValues, setOperatorDimensionValues] = useState({
    m: '',
    n: '',
    k: '',
  });

  const activeHardwareFilter = hardwareFilterItems.find((item) => item.id === activeHardwareFilterId) ?? hardwareFilterItems[0];
  const activeHardwareFilterDetail = hardwareFilterDetailPanels[activeHardwareFilterId]
    ? {
      ...hardwareFilterDetailPanels[activeHardwareFilterId],
      accentColor: activeHardwareFilter.accent,
    }
    : null;
  const selectedHardwareNode = hardwareNodes.find((node) => node.id === selectedHardwareNodeId) ?? null;
  const isHardwarePage = activePageId === 'hardware';
  const isOperatorPage = activePageId === 'operator';
  const currentOperatorDefinition = getOperatorDefinition(selectedOperator);
  const currentApiDefinition = getApiOperationDefinition(selectedApiOperation);
  const currentApiParameterDefinitions = currentApiDefinition.parameterDefinitions ?? defaultApiParameterDefinitions;
  const currentOperatorControlStates = currentOperatorDefinition.createControlStates();
  const currentApiControlStates = currentApiDefinition.createControlStates(apiParameterValues);
  const currentOperatorDataColors = currentOperatorDefinition.dataColors;
  const currentApiDataColors = currentApiDefinition.dataColors;

  const onConnect = useCallback((params) => setOperatorEdges((eds) => addEdge(params, eds)), [setOperatorEdges]);
  const handleOperatorDimensionChange = useCallback((dimensionId, nextValue) => {
    setOperatorDimensionValues((currentValues) => ({
      ...currentValues,
      [dimensionId]: nextValue,
    }));
  }, []);
  const handleApiParameterChange = useCallback((parameterDefinition, parameterPath, nextValue) => {
    const normalizedValue = normalizeApiParameterValue(parameterDefinition, nextValue);

    setApiParameterValues((currentValues) =>
      updateApiParameterValueAtPath(currentValues, parameterPath, normalizedValue)
    );
  }, []);

  const resetApiFlow = (operationId = selectedApiOperation) => {
    setCurrentApiState('init');
    setApiExecutionState('init');
    setIsApiPlaying(false);
    setApiNodes(buildApiNodes(operationId));
    apiMemStates.reset();
  };

  const changeApiOperation = (operationId) => {
    if (operationId === selectedApiOperation) return;

    const nextApiDefinition = getApiOperationDefinition(operationId);

    setSelectedApiOperation(operationId);
    setApiParameterValues(
      buildApiParameterValues(nextApiDefinition.parameterDefinitions ?? defaultApiParameterDefinitions)
    );
    resetApiFlow(operationId);
  };

  const resetHardwarePage = () => {
    setActiveHardwareFilterId('overview');
    setSelectedHardwareNodeId(null);
    setIsHardwareFilterPanelCollapsed(false);
    setHardwareNodes(buildHardwarePageNodes());
    setHardwareEdges(buildHardwareEdges());
  };

  useEffect(() => {
    const activeNodeIds = new Set(hardwareHighlightGroups[activeHardwareFilterId] ?? []);
    const hasGroupHighlight = activeHardwareFilterId !== 'overview';
    const accentColor = activeHardwareFilter.accent;

    setHardwareNodes((nds) =>
      nds.map((nd) => {
        const isSelected = nd.id === selectedHardwareNodeId;
        const isHighlighted = hasGroupHighlight && activeNodeIds.has(nd.id);
        const isStructuralFrame = Boolean(nd.data.isStructuralFrame);

        return {
          ...nd,
          data: {
            ...nd.data,
            cellColors: {},
            isSelected,
            isHighlighted,
            isDimmed: hasGroupHighlight && !isStructuralFrame && !activeNodeIds.has(nd.id) && !isSelected,
            focusColor: isSelected ? '#8b5cf6' : accentColor,
          },
        };
      })
    );

    setHardwareEdges((eds) =>
      eds.map((edge) => {
        const touchesSelected =
          selectedHardwareNodeId !== null &&
          (edge.source === selectedHardwareNodeId || edge.target === selectedHardwareNodeId);
        const isHighlighted =
          hasGroupHighlight &&
          activeNodeIds.has(edge.source) &&
          activeNodeIds.has(edge.target);
        const edgeColor = touchesSelected ? '#8b5cf6' : isHighlighted ? accentColor : '#b1b1b7';
        const baseStyle = getEdgeBaseStyle(edge);

        return {
          ...edge,
          animated: touchesSelected,
          markerStart: edge.markerStart?.type ? { ...edge.markerStart, color: edgeColor } : edge.markerStart,
          markerEnd: edge.markerEnd?.type ? { ...edge.markerEnd, color: edgeColor } : edge.markerEnd,
          style: {
            ...baseStyle,
            stroke: edgeColor,
            strokeWidth: edgeStrokeWidth,
            strokeDasharray: touchesSelected ? '10 6' : (baseStyle.strokeDasharray ?? 'none'),
            strokeLinecap: touchesSelected ? 'round' : (baseStyle.strokeLinecap ?? 'butt'),
            opacity: hasGroupHighlight && !isHighlighted && !touchesSelected ? 0.16 : 1,
            transition: 'all 0.25s',
          },
        };
      })
    );
  }, [activeHardwareFilter, activeHardwareFilterId, selectedHardwareNodeId, setHardwareEdges, setHardwareNodes]);

  const renderOperatorEdges = (activeEdges) => {
    setOperatorEdges((edges) =>
      edges.map((edge) => {
        const isActive = activeEdges.includes(edge.id);
        const markerColor = isActive ? '#ef4444' : '#b1b1b7';
        const baseStyle = getEdgeBaseStyle(edge);

        return {
          ...edge,
          animated: isActive,
          markerStart: edge.markerStart?.type ? { ...edge.markerStart, color: markerColor } : edge.markerStart,
          markerEnd: edge.markerEnd?.type ? { ...edge.markerEnd, color: markerColor } : edge.markerEnd,
          style: {
            ...baseStyle,
            stroke: markerColor,
            strokeWidth: edgeStrokeWidth,
            strokeDasharray: isActive ? '4 3' : (baseStyle.strokeDasharray ?? 'none'),
            strokeLinecap: isActive ? 'round' : (baseStyle.strokeLinecap ?? 'butt'),
            transition: 'all 0.3s',
          },
        };
      })
    );
  };

  const renderOperatorNodes = (activeNodeIds) => {
    setOperatorNodes((nodes) =>
      nodes.map((node) => {
        if (isStorageNode(node.id)) {
          if (!activeNodeIds.includes(node.id)) return node;

          const dataItems = Object.values(memStates[node.id] ?? {});

          return {
            ...node,
            data: {
              ...node.data,
              cellColors: buildCellColorsFromItems(dataItems, currentOperatorDataColors),
            },
          };
        }

        if (isComputeNode(node.id)) {
          return {
            ...node,
            data: {
              ...node.data,
              isRunning: activeNodeIds.includes(node.id),
            },
          };
        }

        return node;
      })
    );
  };

  const renderApiNodes = (activeNodeIds) => {
    setApiNodes((nodes) =>
      nodes.map((node) => {
        if (!activeNodeIds.includes(node.id)) return node;

        const dataItems = Object.values(apiMemStates[node.id] ?? {});

        return {
          ...node,
          data: {
            ...node.data,
            cellNumbers: buildCellNumbersFromItems(dataItems),
            cellColors: buildCellColorsFromItems(dataItems, currentApiDataColors),
          },
        };
      })
    );
  };

  const runSelectedOperatorStep = () => {
    const nextState = currentOperatorControlStates[currentOperatorState].next();

    const activated = currentOperatorControlStates[nextState].transfer();
    renderOperatorEdges(activated.edges);
    renderOperatorNodes(activated.nodes);

    setCurrentOperatorState(nextState);
  };

  const autoplayOperatorStep = useEffectEvent(() => {
    runSelectedOperatorStep();
  });

  const resetOperatorFlow = () => {
    setIsAutoPlaying(false);
    setCurrentOperatorState('init');
    setOperatorNodes((nodes) =>
      nodes.map((node) => {
        if (!node.data) return node;

        return {
          ...node,
          data: {
            ...node.data,
            cellColors: {},
            isRunning: false,
          },
        };
      })
    );
    memStates.reset();

    renderOperatorEdges([]);
  };

  const changeOperator = (processId) => {
    if (processId === selectedOperator) return;

    resetOperatorFlow();
    setSelectedOperator(processId);
  };

  useEffect(() => {
    if (!isAutoPlaying) return;

    const timerId = window.setInterval(() => {
      autoplayOperatorStep();
    }, 800);

    return () => window.clearInterval(timerId);
  }, [isAutoPlaying]);

  const runSelectedApiStep = () => {
    if (currentApiState === 'final') {
      setIsApiPlaying(false);
      return;
    }

    const nextState = currentApiControlStates[currentApiState].next();
    const activated = currentApiControlStates[nextState].transfer();

    renderApiNodes(activated.nodes);

    setApiExecutionState((state) => (state === 'init' ? 'running' : state));
    setCurrentApiState(nextState);

    if (nextState === 'final') {
      setIsApiPlaying(false);
    }
  };

  const autoplayApiStep = useEffectEvent(() => {
    runSelectedApiStep();
  });

  useEffect(() => {
    if (!isApiPlaying || currentApiState === 'final') return;

    const timerId = window.setInterval(() => {
      autoplayApiStep();
    }, 800);

    return () => window.clearInterval(timerId);
  }, [currentApiState, isApiPlaying]);


  const handleApiPlay = () => {
    if (isApiPlaying) {
      setIsApiPlaying(false);
      return;
    }

    if (currentApiState === 'final') {
      return;
    }

    setApiExecutionState((state) => (state === 'init' ? 'running' : state));
    setIsApiPlaying(true);
  };

  const handleHardwareFilterChange = (filterId) => {
    setActiveHardwareFilterId(filterId);
    setSelectedHardwareNodeId(null);
    setIsHardwareFilterPanelCollapsed(false);
  };

  const handlePrimaryNavigation = (pageId) => {
    if (pageId === 'hardware') {
      resetHardwarePage();
    } else {
      setSelectedHardwareNodeId(null);
    }

    setActivePageId(pageId);
  };

  const operatorAutoPlayButtonStyle = getAutoplayButtonStyle(isAutoPlaying);
  const apiAutoPlayButtonStyle = getAutoplayButtonStyle(isApiPlaying);

  const renderApiParameterController = (parameterDefinition, parentPath = [], isCompact = false) => {
    const parameterPath = [...parentPath, parameterDefinition.id];
    const parameterType = parameterDefinition.type ?? 'number';

    if (parameterType === 'group') {
      if (isCompact) {
        throw new Error(`Nested API parameter groups are not supported: ${parameterPath.join('.')}`);
      }

      const groupChildren = getApiLeafGroupChildren(parameterDefinition);

      return (
        <div
          key={parameterPath.join('.')}
          className="nodrag nopan"
          style={API_PARAMETER_GROUP_STYLE}
        >
          <div style={API_PARAMETER_GROUP_TITLE_STYLE}>{parameterDefinition.label}</div>
          <div style={API_PARAMETER_GROUP_BODY_STYLE}>
            {groupChildren.map((childDefinition) =>
              renderApiParameterController(childDefinition, parameterPath, true)
            )}
          </div>
        </div>
      );
    }

    const parameterValue = getApiParameterValueAtPath(apiParameterValues, parameterPath) ?? '';

    return (
      <label
        key={parameterPath.join('.')}
        className="nodrag nopan"
        style={isCompact ? API_COMPACT_INPUT_SHELL_STYLE : API_INPUT_LABEL_STYLE}
      >
        {!isCompact ? <span>{parameterDefinition.label}</span> : null}
        <div style={isCompact ? API_COMPACT_INPUT_WRAP_STYLE : API_INPUT_WRAP_STYLE}>
          <input
            type={parameterType === 'text' ? 'text' : 'number'}
            inputMode={parameterDefinition.inputMode ?? (parameterType === 'text' ? 'text' : 'numeric')}
            min={parameterType === 'number' ? parameterDefinition.min : undefined}
            max={parameterType === 'number' ? parameterDefinition.max : undefined}
            step={parameterType === 'number' ? parameterDefinition.step ?? '1' : undefined}
            className="nodrag nopan api-parameter-input"
            value={parameterValue}
            onChange={(event) =>
              handleApiParameterChange(parameterDefinition, parameterPath, event.target.value)
            }
            aria-label={parameterDefinition.label}
            title={parameterDefinition.label}
            placeholder={parameterDefinition.placeholder}
            style={isCompact ? API_COMPACT_INPUT_STYLE : API_INPUT_STYLE}
          />
        </div>
      </label>
    );
  };

  const renderHardwarePage = () => (
    <PageLayer className="hardware-page-layout">
      <HardwareNavigationPanel
        activeHardwareFilterId={activeHardwareFilterId}
        onHardwareFilterChange={handleHardwareFilterChange}
      />
        <HardwareNodeGraph
          nodes={hardwareNodes}
          edges={hardwareEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          allowNodeSelection={activeHardwareFilterId === 'overview'}
          onNodeSelect={setSelectedHardwareNodeId}
          onClearSelection={() => setSelectedHardwareNodeId(null)}
          selectedChip={selectedChip}
          onChipChange={setSelectedChip}
        chipOptions={chipSelectOptions}
        selectedHardwareNode={selectedHardwareNode}
        onDetailClose={() => setSelectedHardwareNodeId(null)}
        filterDetail={activeHardwareFilterDetail}
        isFilterDetailCollapsed={isHardwareFilterPanelCollapsed}
        onFilterDetailCollapseToggle={() => setIsHardwareFilterPanelCollapsed((currentValue) => !currentValue)}
      />
    </PageLayer>
  );

  const renderOperatorPage = () => (
    <PageLayer className="content-page-layer operator-page-layout">
      <div className="operator-page-toolbar-container">
        <FloatingCanvasBar
          className="floating-canvas-bar--inline"
          left={(
            <div style={TOOLBAR_SECTION_STYLE}>
              <SelectField
                value={selectedOperator}
                onChange={changeOperator}
                ariaLabel="选择算子类型"
                options={operatorSelectOptions}
                rootClassName="chip-select-root--operator"
                selectClassName="chip-select--operator"
              />
              <SelectField
                value={selectedChip}
                onChange={setSelectedChip}
                ariaLabel="选择芯片型号"
                options={chipSelectOptions}
              />
            </div>
          )}
          center={(
            <div style={OPERATOR_TOOLBAR_CENTER_STYLE}>
              <button
                type="button"
                onClick={() => setIsOperatorDiagramVisible((visible) => !visible)}
                style={OPERATOR_DIAGRAM_BUTTON_STYLE}
                aria-pressed={isOperatorDiagramVisible}
              >
                示意图
              </button>
              <div style={API_TOOLBAR_INPUTS_STYLE}>
                {operatorDimensionInputDefinitions.map((parameterDefinition) => (
                  <label
                    key={parameterDefinition.id}
                    className="nodrag nopan"
                    style={API_INPUT_LABEL_STYLE}
                  >
                    <span>{parameterDefinition.label}</span>
                    <div style={API_INPUT_WRAP_STYLE}>
                      <input
                        type="number"
                        inputMode="numeric"
                        step="1"
                        className="nodrag nopan api-parameter-input"
                        value={operatorDimensionValues[parameterDefinition.id]}
                        onChange={(event) =>
                          handleOperatorDimensionChange(parameterDefinition.id, event.target.value)
                        }
                        aria-label={parameterDefinition.label}
                        title={parameterDefinition.label}
                        style={OPERATOR_DIMENSION_INPUT_STYLE}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
          right={(
            <div style={TOOLBAR_ACTIONS_STYLE}>
              <button
                onClick={runSelectedOperatorStep}
                style={OPERATOR_RUN_BUTTON_STYLE}
              >
                {currentOperatorState === 'init' ? '单步执行' : '下一步'}
              </button>
              <button
                onClick={() => setIsAutoPlaying((playing) => !playing)}
                style={operatorAutoPlayButtonStyle}
              >
                {isAutoPlaying ? '停止动画' : '播放动画'}
              </button>
              <button
                onClick={resetOperatorFlow}
                style={OPERATOR_RESET_BUTTON_STYLE}
              >
                重置
              </button>
            </div>
          )}
          />
      </div>
      {isOperatorDiagramVisible ? (
        <div className="operator-diagram-window" role="dialog" aria-label="Matmul 示意图">
          <img
            className="operator-diagram-window-image"
            src={matmulPng}
            alt="Matmul 示意图"
          />
        </div>
      ) : null}
      <div className="operator-page-canvas-container">
        <div className="flow-canvas">
          <ReactFlow
            key="operator-flow"
            nodes={operatorNodes}
            edges={operatorEdges}
            minZoom={0.2}
            onNodesChange={onOperatorNodesChange}
            onEdgesChange={onOperatorEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            fitView
            fitViewOptions={FLOW_FIT_VIEW_OPTIONS}
            style={CONTENT_PAGE_CANVAS_STYLE}
          />
        </div>
      </div>
      {SHOW_OPERATOR_BOTTOM_BANNER ? <div className="operator-page-bottom-bar" /> : null}
    </PageLayer>
  );

  const renderApiPage = () => (
    <PageLayer className="content-page-layer">
      <div className="flow-wrapper">
        <FloatingCanvasBar
          style={API_FLOATING_CANVAS_BAR_STYLE}
          left={(
            <div style={TOOLBAR_SECTION_STYLE}>
              <SelectField
                value={selectedApiOperation}
                onChange={changeApiOperation}
                ariaLabel="选择 API 类型"
                options={apiSelectOptions}
                rootClassName="chip-select-root--auto"
                selectClassName="chip-select--auto"
                selectStyle={{
                  height: apiFloatingbarAPISelectorHeight,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          center={(
            <div style={API_TOOLBAR_INPUTS_STYLE}>
              {currentApiParameterDefinitions.map((parameterDefinition) =>
                renderApiParameterController(parameterDefinition)
              )}
            </div>
          )}
          right={(
            <div style={TOOLBAR_ACTIONS_STYLE}>
              <button
                onClick={runSelectedApiStep}
                style={OPERATOR_RUN_BUTTON_STYLE}
              >
                {apiExecutionState === 'init' ? '单步执行' : '下一步'}
              </button>
              <button
                onClick={handleApiPlay}
                style={apiAutoPlayButtonStyle}
              >
                {isApiPlaying ? '停止播放' : '播放'}
              </button>
              <button
                onClick={() => resetApiFlow()}
                style={OPERATOR_RESET_BUTTON_STYLE}
              >
                重置
              </button>
            </div>
          )}
        />
        <div className="flow-canvas flow-canvas--with-top-bar">
          <ReactFlow
            key={`api-flow-${selectedApiOperation}`}
            nodes={apiNodes}
            edges={EMPTY_API_EDGES}
            onNodesChange={onApiNodesChange}
            nodeTypes={apiNodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            fitView
            fitViewOptions={FLOW_FIT_VIEW_OPTIONS}
            style={CONTENT_PAGE_CANVAS_STYLE}
          />
        </div>
      </div>
    </PageLayer>
  );

  const renderCurrentPage = () => {
    if (isHardwarePage) return renderHardwarePage();
    if (isOperatorPage) return renderOperatorPage();

    return renderApiPage();
  };

  return (
    <div className="app-root">
      <AppBanner />
      <div className="app-shell">
        <AppSidebar
          activePageId={activePageId}
          onNavigate={handlePrimaryNavigation}
        />
        <main className="app-main">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}
