本文档旨在介绍算子（Operator）与 API 可视化模拟器的整体架构、核心设计理念以及新增组件的开发流程。

## 1. 项目目录结构

项目整体分为前端视图渲染与底层状态模拟两大部分。核心目录结构如下：

```Plaintext
src/
├── App.jsx            # 前端主入口：负责整体渲染、状态机挂载与用户交互（如按钮步进）
├── index.css          # 全局样式与渲染节点样式
├── api/               # API 模拟模块（以具体 API 命名子目录，如 datacopy）
│   └── memstates.js   # API 专用的内存状态抽象
└── operator/          # 算子模拟模块（以具体算子命名子目录，如 vector, exp）
    └── memstates.js   # 算子专用的内存状态抽象
```

> **注：** `api` 和 `operator` 各自拥有一套内存模拟机制（`memstates`），两者架构大体相同，但在数据处理粒度上存在细微差异。
---

## 2. 核心架构设计

### 2.1 功能目标与抽象模型

本系统旨在可视化算子/API 的底层数据流转与计算过程。为了实现这一目标，系统抽象出以下核心组件：

- **存储节点 (Memory Nodes)**：用于模拟不同层级的硬件存储单元（如 GM, L2, L1, L0A, L0B, L0C, UB 等）。
    
- **传输链路 (Edges)**：表示数据在不同存储节点间的流动路径。
    
- **步进触发 (Step-triggered)**：用户每次交互（如点击“下一步”），触发一次数据流动或计算，相应的节点状态发生变更。
    

### 2.2 状态机驱动 (State Machine Driven)

整个模拟过程被抽象为**状态机（State Machine）**模型。系统的运行即是状态机在不同状态（节点和边）间的迁移过程。

系统分为两套相互配合的抽象层：

1. **内存抽象 (Memory Abstraction)**：管理硬件存储的静态数据结构，记录数据所在位置、大小及处理阶段（Stage）。
    
2. **控制抽象 (Control Abstraction)**：定义状态机的流转逻辑。包含当前状态、下一状态（`next`），以及状态转移时触发的内存数据变更操作（`transfer`）。

---

## 3. 核心模块详解

### 3.1 内存抽象 (`memStates`)

无论是 `api/memstates.js` 还是 `operator/memstates.js`，都维护着一个全局的内存状态树。

- **节点划分**：包含 `gm`, `l2`, `l1`, `l0a`, `l0b`, `l0c`, `ub` 等。
    
- **数据对象 (Data Item)**：每个节点下挂载一个字典，Key 为数据标识（如 `A`, `B`），Value 为具体的数据描述对象。
    

**数据对象属性对照表：**

|**属性名**|**类型**|**说明**|
|---|---|---|
|`tag`|String|数据标签（如 "A", "C"）|
|`size`|UInt|数据整体大小（单位：可视化渲染的“格子”数）|
|`nStride`|UInt|分片（Tile）的总执行次数|
|`blockSize`|UInt|单次分片取用的数据量|
|`stride`|UInt|每个分片的步长大小|
|`dataStage`|`[UInt]`|记录每个数据块的处理阶段（如 0=加载, 1=使用中, 2=累加等），用于驱动前端渲染不同颜色|
|`data`|`[Number]`|**仅 API 模式存在**，用于存储具体的模拟数值|

### 3.2 控制抽象 (`controlStates`)

控制抽象负责定义业务逻辑流程。每个状态（如 `s0`, `s1`）必须实现以下两个方法：

- `next()`: 计算并返回下一个状态的标识符。
    
- `transfer()`: 执行内存数据操作，并返回当前处于激活状态的节点与边，供前端渲染。
    

**主事件循环机制 (`App.jsx` 伪代码)：**

```JavaScript
// 当用户触发步进操作时 (apiStep / operatorStep)
const next_state = controlStates[currentState].next();
const activated = controlStates[next_state].transfer();

render(activated); // 渲染高亮的节点与数据链路
setCurrentState(next_state); // 更新全局状态
```

---

## 4. 开发实战 I：算子开发 (以 Exp 为例)

算子的开发遵循以下标准化流程：

### 4.1 提取精简状态机

在编写代码前，需先梳理算子的物理执行步骤，并将其精简为状态机模型：

1. `init` -> `gm`：分配数据到 GM。
    
2. `gm` -> `l2`：数据从 GM 加载到 L2。
    
3. `l2` -> `ub`：L2 切片加载到 UB。
    
4. `ub` -> `vector`：UB 送入 Vector 单元计算。
    
5. `ub1`：Vector 结果写回 UB。
    
6. `l21`：UB 结果写回 L2（若未处理完则循环回到步骤 3）。
    
7. `gm1`：L2 所有分片完成，写回 GM（若 GM 未处理完则循环回到步骤 2）。
    
8. `final`：执行结束。
    

### 4.2 状态工厂实现

针对该算子，创建一个状态工厂函数 `createExpControlStates`。

```JavaScript
const createExpControlStates = () => ({
  init: {
    next: () => "gm",
    transfer: () => ({ nodes: [], edges: [] }),
  },
  // 状态：加载数据到 GM
  gm: {
    next: () => "l2",
    transfer: () => {
      stateLoadData("gm", "A", 8 * 16, 4 * 16); // 加载输入
      stateLoadData("gm", "C", 8 * 16, 4 * 16); // 预留输出空间
      return { nodes: ["gm"], edges: [] };
    },
  },
  // 状态：GM -> L2
  l2: {
    next: () => "ub",
    transfer: () => {
      stateLoadData("l2", "A", 8 * 4, 1 * 4);
      stateLoadData("l2", "C", 8 * 4, 1 * 4);
      stateProgress("gm", "A"); // 推进 GM 中 A 数据的使用阶段 (改变颜色)
      return { nodes: ["l2", "gm"], edges: ["ub-l2"] };
    },
  },
  // ... 省略 ub, vector, ub1 状态 ...
  
  // 状态：L2 接收计算结果，处理循环控制
  l21: {
    next: () => {
      // 通过状态判断进行跳转
      if (stateHasFinished("l2", "C")) return "gm1";
      return "ub"; 
    },
    transfer: () => {
      stateRemove("ub", "A");
      stateRemove("ub", "C");
      stateProgress("l2", "C"); // C 数据计算完成，推进 Stage
      return { nodes: ["ub", "l2"], edges: ["ub-l2"] };
    }
  },
  final: {
    next: () => "final",
    transfer: () => ({ nodes: [], edges: [] }),
  }
});
```

### 4.3 定义数据渲染主题 (`dataColors`)

通过定义 `stage` 与颜色的映射关系来体现数据生命周期。

- **数据 A (输入)**：`stage 0` (浅色，已加载) -> `stage 1` (深色，已计算/消耗)。
    
- **数据 C (输出)**：`stage 0` (透明，分配空间) -> `stage 1` (着色，结果生成)。
    

### 4.4 注册算子

将配置对象暴露并在 `src/operator/index.js` 中注册：

```JavaScript
export const expOperatorDefinition = {
  id: 'exp',
  label: 'Exp',
  createControlStates: createExpControlStates,
  dataColors,
};

// index.js
import { expOperatorDefinition } from './exp';
const operatorDefinitions = [..., expOperatorDefinition];
```

---

## 5. 开发实战 II：API 开发 (以 DataCopy 为例)

API 的抽象逻辑与算子基本一致，主要区别在于：**API 模拟器需要支持真实数值的传递与细粒度的参数控制。**

### 5.1 数值内存管理

API 需要处理多种节点组合（一元操作为 `src0`, `dst`；二元操作为 `src0`, `src1`, `dst`；三元操作为 `src0`, `src1`, `src2`, `dst`）。数据对象中会挂载 `data` 数组用于存放具体数值。

```JavaScript
memStates.l2.A.data = new Array(128); // 初始化数据空间
```

### 5.2 API 状态工厂实现

API 的工厂函数现在接收一个参数对象。每个 API 可以通过 `parameterDefinitions` 自定义自己的参数列表；简单数值参数可以直接声明，复合参数则可以用 `type: "group"` 组织子参数。

#### 5.2.1 参数系统总览

API 页面的参数栏会读取当前 API 定义对象上的 `parameterDefinitions` 字段：

- 如果定义了 `parameterDefinitions`，界面会按照该配置动态生成输入框。
- 如果未定义，则回退到 `src/api/memstates.js` 中的 `defaultApiParameterDefinitions`。
- `createControlStates` 接收到的是一个**参数对象**，而不再是固定顺序的位置参数。

一个参数定义对象常用的字段如下：

|字段|类型|说明|
|---|---|---|
|`id`|String|参数在状态工厂中的键名|
|`label`|String|界面展示名称|
|`type`|String|可选，默认是 `number`；目前支持 `number`、`text`、`group`|
|`defaultValue`|Any|默认值；初始化参数面板时使用|
|`min` / `max`|Number|数值输入框范围限制|
|`step`|Number/String|数值输入步长|
|`inputMode`|String|输入模式，如 `numeric`、`text`|
|`placeholder`|String|输入框占位提示|
|`children` / `fields`|Array|仅 `group` 类型使用，定义复合参数的子项|

#### 5.2.2 简单参数自定义

如果 API 只需要若干普通数值参数，可以直接声明一个平铺数组：

```JavaScript
export const parameterDefinitions = [
  { id: 'mask', label: 'mask', min: 1, max: 64, defaultValue: 64 },
  { id: 'repeatTimes', label: 'repeatTimes', min: 1, max: 255, defaultValue: 4 },
  { id: 'dstStride', label: 'dst-stride', min: 0, max: 65535, defaultValue: 0 },
];
```

此时状态工厂可以直接通过解构读取：

```JavaScript
const createExampleControlStates = ({
  mask = 64,
  repeatTimes = 4,
  dstStride = 0,
} = {}) => {
  // ...
};
```

#### 5.2.3 复合参数自定义

当参数本身是一组有结构的数据时，可以使用 `type: "group"`。例如 `BinaryRepeatParams` 可以包含 6 个子参数：

```JavaScript
export const parameterDefinitions = [
  { id: 'blockCount', label: 'block-count', min: 1, max: 4095, defaultValue: 4 },
  { id: 'blockLen', label: 'block-size', min: 1, max: 65535, defaultValue: 2 },
  { id: 'srcStride', label: 'src-stride', min: 0, max: 65535, defaultValue: 0 },
  { id: 'dstStride', label: 'dst-stride', min: 0, max: 65535, defaultValue: 0 },
  { id: 'mask', label: 'mask', min: 0, max: 255, defaultValue: 255 },
  {
    id: 'binaryRepeatParams',
    label: 'BinaryRepeatParams',
    type: 'group',
    children: [
      { id: 'src0BlkStride', label: 'src0BlkStride', min: 0, max: 65535, defaultValue: 1 },
      { id: 'src0RepeatStride', label: 'src0RepeatStride', min: 0, max: 65535, defaultValue: 1 },
      { id: 'src1BlkStride', label: 'src1BlkStride', min: 0, max: 65535, defaultValue: 1 },
      { id: 'src1RepeatStride', label: 'src1RepeatStride', min: 0, max: 65535, defaultValue: 1 },
      { id: 'dstBlkStride', label: 'dstBlkStride', min: 0, max: 65535, defaultValue: 1 },
      { id: 'dstRepeatStride', label: 'dstRepeatStride', min: 0, max: 65535, defaultValue: 1 },
    ],
  },
];
```

复合参数在界面上的表现形式如下：

- 组标题（如 `BinaryRepeatParams`）显示在左侧。
- 子参数以紧凑输入框排列在右侧。
- 为了节省空间，子参数本身不再显示长标签，但完整名称仍保留在输入框的悬停提示中。

状态工厂中可以将其作为嵌套对象读取：

```JavaScript
const createMulControlStates = ({
  mask = 8,
  repeatTimes = 4,
  binaryRepeatParams = {},
} = {}) => {
  const {
    dstBlkStride = 1,
    src0BlkStride = 1,
    src1BlkStride = 1,
    dstRepeatStride = 8,
    src0RepeatStride = 8,
    src1RepeatStride = 8,
  } = binaryRepeatParams;

  // ...
};
```

#### 5.2.4 在状态工厂中使用参数

定义好参数后，状态工厂只需要把这些值换算成内部使用的步长、块大小或索引规则即可。下面仍以 `DataCopy` 风格的 API 为例：

```JavaScript
const createDatacopyControlStates = ({
  blockCount,
  blockLen,
  srcStride,
  dstStride,
  mask,
  binaryRepeatParams,
}, elementSize = 2) => {
  // 参数单位换算：Byte -> 内部可视化格子单元
  blockLen = (blockCount * blockSizeUnit / elementSize) | 0;
  srcStride = ((srcStride * srcStrideUnit / elementSize) | 0) + blockLen;
  dstStride = ((dstStride * dstStrideUnit / elementSize) | 0) + blockLen;

  return ({
    init: { ... },
    // 加载真实数据进行模拟
    load: {
      next: () => "src",
      transfer: () => {
        let data = Array.from({ length: 32 * 8 }, () => (Math.random() * 256) | 0);
        apiLoad("src0", "X", 32 * 8, blockCount, blockLen, srcStride, data);
        return { nodes: ["src0"], edges: [] };
      },
    },
    // 处理阶段：模拟数值的实际拷贝
    process: {
      next: () => getNextDataAIdx() === blockCount ? "clean" : "src",
      transfer: () => {
        const strideIdx = getCurrentDataAIdx();
        
        // 执行数值级的 DataCopy 逻辑
        for (let i = 0; i < blockLen; i += 1) {
          memStates.dst.Z.data[strideIdx*dstStride+i] = memStates.src0.X.data[strideIdx*srcStride+i];
        }
        
        // 推进当前 Stride 的进度状态 (触发颜色变更)
        apiRangeProgress("dst", "Z", strideIdx*dstStride, blockLen);
        apiRangeProgress("src0", "X", strideIdx*srcStride, blockLen);
        
        return { nodes: ["src0", "dst"], edges: [] };
      },
    },
    final: { ... }
  });
};

export const datacopyApiDefinition = {
  id: 'datacopy',
  label: 'datacopy',
  parameterDefinitions,
  createControlStates: createDatacopyControlStates,
  dataColors,
  apiNodeDefinitions,
};
```

#### 5.2.5 参数设计建议

- 优先让 `id` 与状态工厂中的变量名保持一致，这样解构最直接。
- 通用 API 可以直接复用 `defaultApiParameterDefinitions`。
- 如果某个参数组合在语义上属于同一组，优先使用 `group`，避免把工具栏挤满。
- `defaultValue` 应尽量对应一个“开箱即用”的合法配置，便于新 API 注册后立刻演示。
- 如果后续需要布尔、下拉选择等控件，建议先扩展参数定义结构，再在 `App.jsx` 中补充对应渲染逻辑。

### 5.3 API 数据颜色映射

API 的 `dataStage` 设计通常更细腻，以表达当前处理的切片：
- `stage 0`: 透明 (无数据/仅分配空间)
- `stage 1`: 浅色 (当前被高亮选中的 Stride 待处理分片)
- `stage 2`: 深色 (正在执行处理/拷贝)
- `stage 3`: 恢复浅色/完成色 (当前分片处理完毕)
