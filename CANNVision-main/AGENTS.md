# AGENTS.md

## 模块说明

这是 PTO 工作区里的独立 Vite/React 子项目。

## 工作区根目录

需要理解 PTO 全局上下文时，使用 `/Users/yin/pto` 作为完整工作区根目录；运行本项目时进入 `/Users/yin/pto/CANNVision-main`。

## 入口

- `index.html`
- 主要源码目录：`src/`

## 运行方式

```sh
cd /Users/yin/pto/CANNVision-main
npm install
npm run dev
```

## 依赖关系

- 本项目依赖声明在 `package.json`。
- 不要默认认为 PTO 根目录的静态脚本属于这个 Vite 应用。

## 给其他 Agent 的规则

- 把这个目录当作 Vite 应用处理，不要当作普通静态 PTO 页面。
- 除非明确要求接入父级 PTO 启动台，否则改动尽量限制在本目录内。
- 如果修改面向 PTO 的构建产物，移动文件前先检查 `build:950-pattern` 脚本。
