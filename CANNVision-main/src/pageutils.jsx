import { Handle, Position } from 'reactflow';
import { hexToRgba } from './colorUtils';

export const NavigationIcon = ({ icon }) => {
  const commonProps = {
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  switch (icon) {
    case 'spark':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" {...commonProps} />
          <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" {...commonProps} />
        </svg>
      );
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10.5L12 4l8 6.5" {...commonProps} />
          <path d="M6.5 9.5V20h11V9.5" {...commonProps} />
        </svg>
      );
    case 'chip':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="2.5" {...commonProps} />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" {...commonProps} />
        </svg>
      );
    case 'layout':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="4" width="17" height="16" rx="3" {...commonProps} />
          <path d="M9 4v16M9 11h11" {...commonProps} />
        </svg>
      );
    case 'cpu':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="2" {...commonProps} />
          <path d="M10 10h4v4h-4z" {...commonProps} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" {...commonProps} />
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="6" rx="6.5" ry="2.8" {...commonProps} />
          <path d="M5.5 6v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8V6" {...commonProps} />
          <path d="M5.5 11v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" {...commonProps} />
        </svg>
      );
    case 'sliders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6h14M5 12h14M5 18h14" {...commonProps} />
          <circle cx="9" cy="6" r="2" {...commonProps} />
          <circle cx="15" cy="12" r="2" {...commonProps} />
          <circle cx="11" cy="18" r="2" {...commonProps} />
        </svg>
      );
    case 'ruler':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 16.5L16.5 5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 20a2.1 2.1 0 0 1-3 0l-.5-.5a2.1 2.1 0 0 1 0-3z" {...commonProps} />
          <path d="M12 9l3 3M9 12l3 3M6.5 14.5l3 3" {...commonProps} />
        </svg>
      );
    case 'grid':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2.5" {...commonProps} />
          <path d="M12 4v16M4 12h16" {...commonProps} />
        </svg>
      );
    case 'menu':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 8h12M6 12h12M6 16h12" {...commonProps} />
        </svg>
      );
    default:
      return null;
  }
};

const AscendNode = ({ data }) => {
  // --- 1. 节点基础参数 ---
  const showGrid = data.showGrid || false; // 小格子效果开关

  // --- 2. 内存格子参数 (开启 showGrid 时生效) ---
  const rows = data.rows || 4;
  const cols = data.cols || 8;
  const gridSize = data.gridSize || data.grid_side || 25; // 兼容 grid_side 写法
  const totalCells = rows * cols;

  // 新增：获取颜色映射表，格式如 { 0: '#ef4444', 5: '#22c55e' }
  const cellColors = data.cellColors || {};

  // --- 3. 动态计算节点宽高 ---
  const nodeWidth = showGrid ? cols * gridSize : (data.width || 208);
  const nodeHeight = showGrid ? rows * gridSize : (data.height || 'auto');

  // --- 4. 连线点参数 ---
  const leftInputs = data.leftInputs;
  const leftOutputs = data.leftOutputs;
  const rightInputs = data.rightInputs;
  const rightOutputs = data.rightOutputs;
  const bottomOutputs = data.bottomOutputs;
  const bottomInputs = data.bottomInputs;
  const topInputs = data.topInputs;
  const topOutputs = data.topOutputs;
  const isDimmed = Boolean(data.isDimmed);
  const isHighlighted = Boolean(data.isHighlighted);
  const isSelected = Boolean(data.isSelected);
  const focusColor = data.focusColor || data.accentColor || '#3b82f6';
  const baseNodeShadow = '4px 1px 38px 0px #00000019';
  const handleStyle = {
    background: 'transparent',
    border: 'none',
    width: '10px',
    height: '10px',
  };

  const nodeShadow = isSelected
    ? `0 0 0 6px ${hexToRgba(focusColor, 0.18)}, ${baseNodeShadow}`
    : isHighlighted
      ? `0 0 0 4px ${hexToRgba(focusColor, 0.14)}, ${baseNodeShadow}`
      : baseNodeShadow;

  const showFan = data.showFan;
  const isRunning = Boolean(data.isRunning);
  return (
    <div
      className={`relative bg-white rounded-xl font-mono select-none transition-all 
        ${showGrid ? 'flex items-center justify-center p-3' : 'p-4'}
      `}
      style={{
        width: nodeWidth,
        height: nodeHeight,
        opacity: isDimmed ? 0.24 : 1,
        boxShadow: nodeShadow,
        transform: isSelected ? 'translateY(-4px)' : isHighlighted ? 'translateY(-2px)' : 'none',
        filter: isDimmed ? 'saturate(0.8)' : 'none',
        cursor: 'pointer',
      }}
    >
      {showFan && (
        <div className="absolute right-2 bottom-2 z-20 pointer-events-none">
          <div className="p-1 flex items-center justify-center">
            <div className="relative w-18 h-18">
              <svg
                viewBox="0 0 24 24"
                className="w-18 h-18"
                style={{
                  transition: 'all 0.3s ease'
                }}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke={isRunning ? data.accentColor : '#94a3b8'}
                  strokeWidth="1.6"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="7.1"
                  fill="none"
                  stroke={isRunning ? `${data.accentColor}55` : '#cbd5e1'}
                  strokeWidth="0.8"
                />
              </svg>
              <svg
                viewBox="0 0 24 24"
                className={`absolute inset-0 w-18 h-18 ${isRunning ? 'animate-fan-spin' : ''}`}
                style={{
                  fill: isRunning ? data.accentColor : '#94a3b8',
                  transition: 'fill 0.3s ease'
                }}
              >
                <g>
                  <path d="M12 11.1 C13.7 8.6 15.4 6.8 17.8 5.7 C17.8 8.6 16.7 10.8 14 12.4 C13.1 12.8 12.3 12.5 12 11.1 Z" />
                  <path d="M12 11.1 C13.7 8.6 15.4 6.8 17.8 5.7 C17.8 8.6 16.7 10.8 14 12.4 C13.1 12.8 12.3 12.5 12 11.1 Z" transform="rotate(72 12 12)" />
                  <path d="M12 11.1 C13.7 8.6 15.4 6.8 17.8 5.7 C17.8 8.6 16.7 10.8 14 12.4 C13.1 12.8 12.3 12.5 12 11.1 Z" transform="rotate(144 12 12)" />
                  <path d="M12 11.1 C13.7 8.6 15.4 6.8 17.8 5.7 C17.8 8.6 16.7 10.8 14 12.4 C13.1 12.8 12.3 12.5 12 11.1 Z" transform="rotate(216 12 12)" />
                  <path d="M12 11.1 C13.7 8.6 15.4 6.8 17.8 5.7 C17.8 8.6 16.7 10.8 14 12.4 C13.1 12.8 12.3 12.5 12 11.1 Z" transform="rotate(288 12 12)" />
                </g>
                <circle cx="12" cy="12" r="2.2" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* grid */}
      {showGrid && (
        <div
          className="absolute inset-0 m-auto grid gap-1 p-3 pointer-events-none"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {Array.from({ length: totalCells }).map((_, i) => {
            // 检查当前索引是否有指定的颜色
            const customColor = cellColors[i];

            return (
              <div
                key={i}
                // 如果有自定义颜色，就去掉默认的 bg-indigo-100，改用较中性的边框
                className={`border rounded-sm w-full h-full opacity-80 transition-colors duration-200 ${customColor ? 'border-gray-300' : 'bg-indigo-100 border-indigo-200'
                  }`}
                // 应用自定义颜色
                style={customColor ? { backgroundColor: customColor } : {}}
              />
            );
          })}
        </div>
      )}

      {/* ================= 内容层：节点文字 ================= */}
      <div className={`relative z-10 text-center pointer-events-none ${showGrid ? 'drop-shadow-md' : ''}`}>
        <div className={`font-bold ${data.textColor || 'text-gray-800'} ${showGrid ? 'text-3xl tracking-wide' : 'text-2xl'}`}>
          {data.label}
        </div>

        {/* 如果没有开启格子，展示原来的分割线 */}
        {!showGrid && <div className="h-px bg-gray-100 my-2"></div>}

        {/* 如果没有开启格子，或者是开启了格子但特意传了 subText，则显示副标题 */}
        {(!showGrid || data.subText) && (
          <div className={`leading-tight ${showGrid ? 'text-sm text-gray-700 font-bold mt-1' : 'text-xs text-gray-400 mt-1'}`}>
            {data.subText || (showGrid ? '' : 'GENERIC UNIT')}
          </div>
        )}
      </div>

      {/* ================= 接口层：动态生成输入输出点 ================= */}
      {/* 左侧输入 */}
      {leftInputs && leftInputs.map((offset, i) => (
        <Handle
          key={`left-in-${i}`}
          type="target"
          position={Position.Left}
          id={`left-in-${i}`}
          style={{
            top: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}

      {/* 左侧输出 */}
      {leftOutputs && leftOutputs.map((offset, i) => (
        <Handle
          key={`left-out-${i}`}
          type="source"
          position={Position.Left}
          id={`left-out-${i}`}
          style={{
            top: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}

      {/* 右侧输出 */}
      {/* 假设 offsets = [10, 30, 55, 80] */}
      {rightOutputs && rightOutputs.map((offset, i) => (
        <Handle
          key={`right-out-${i}`}
          type="source"
          position={Position.Right}
          id={`right-out-${i}`}
          style={{
            // 直接使用数组中的元素作为 top 值
            // 如果数组里是数字 10 代表 10%，则用 `${offset}%`
            // 如果数组里是像素值，则用 `${offset}px`
            top: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}

      {/* 右侧输入 */}
      {rightInputs && rightInputs.map((offset, i) => (
        <Handle
          key={`right-in-${i}`}
          type="target"
          position={Position.Right}
          id={`right-in-${i}`}
          style={{
            top: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}

      {/* 底部与顶部 */}
      {bottomOutputs && bottomOutputs.map((offset, i) => (
        <Handle
          key={`bottom-out-${i}`}
          type="source"
          position={Position.Bottom}
          id={`bottom-out-${i}`}
          style={{
            left: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}
      {bottomInputs && bottomInputs.map((offset, i) => (
        <Handle
          key={`bottom-in-${i}`}
          type="target"
          position={Position.Bottom}
          id={`bottom-in-${i}`}
          style={{
            left: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}
      {topInputs && topInputs.map((offset, i) => (
        <Handle
          key={`top-in-${i}`}
          type="target"
          position={Position.Top}
          id={`top-in-${i}`}
          style={{
            left: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}
      {topOutputs && topOutputs.map((offset, i) => (
        <Handle
          key={`top-out-${i}`}
          type="source"
          position={Position.Top}
          id={`top-out-${i}`}
          style={{
            left: `${offset}px`,
            ...handleStyle,
          }}
        />
      ))}
    </div>
  );
};
