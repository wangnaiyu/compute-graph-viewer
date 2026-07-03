# CANN Vision — CANN 算子可视化

项目主页：https://cann-vision.gitcode.com/

## 昇腾（Ascend）系列硬件

昇腾（Ascend）是面向 AI 训练与推理场景的 NPU 处理器系列，围绕高吞吐矩阵计算、向量计算和片上多级存储组织进行设计。其典型硬件结构包含全局内存（GM）、片上缓存层级（L2、L1、L0A/L0B/L0C、UB）以及 Cube、Vector、Scalar、FixPipe 等计算与控制单元。

在昇腾硬件上，算子性能不仅取决于计算量，也高度依赖数据在不同存储层级之间的搬运方式、缓存复用策略和计算单元调度方式。因此，理解硬件架构与数据流是学习和优化昇腾算子的基础。

## CANN

CANN（Compute Architecture for Neural Networks）是华为昇腾 AI 计算平台的软件栈，向上支持深度学习框架、模型部署和应用开发，向下对接昇腾硬件的计算与存储能力。

在算子开发与性能优化中，CANN 提供了面向昇腾硬件的编程接口、算子执行模型和数据搬运能力。开发者需要关注数据如何从 GM 搬运到片上缓存、如何进入 Cube 或 Vector 等计算单元，以及结果如何写回目标缓冲区。

## 项目目的

CANN Vision 是一个基于 React + ReactFlow 的交互式可视化应用，目标是用图形化方式帮助理解昇腾硬件架构、CANN 算子执行流程以及 API 级数据搬运行为。

## 项目内容

- **硬件架构**：可视化展示昇腾芯片的存储层级（GM → L2 → L1 → L0A/L0B → L0C → UB）、计算单元（Cube、Vector、FixPipe）和控制单元（Scalar、指令队列），支持按类别筛选高亮。
- **算子流程**：以状态机驱动的动画方式，逐步展示 Cube（矩阵乘）、Vector（向量运算）、Fusion（融合算子）等算子在缓存层级间的数据搬运过程，包括数据着色和边动画。
- **API 数据搬运**：可视化展示 `add`、`datacopy` 等 API 级别的数据在 src/dst 缓冲区之间的搬运过程，支持自定义 block-count、block-size、stride 等参数。

## 本地部署

```bash
git clone https://gitcode.com/PASA_NJU/CANNVision.git
npm install
npm run dev
```

开发服务器启动后，按照终端输出的本地地址访问项目。需要生成生产构建时运行：

```bash
npm run build
npm run preview
```

## 贡献

欢迎围绕昇腾硬件结构、CANN 算子流程、API 数据搬运示例和可视化交互体验提交改进。提交前建议先运行本地构建，确保改动不会破坏现有页面。

## 可视化技术栈

React 19 · Vite 6 · ReactFlow 11 · Tailwind CSS v4
