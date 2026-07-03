# AGENTS.md

## 模块说明

这是 PTO 工作区里的独立 Vite/React/Three.js 子项目。

## 工作区根目录

需要理解 PTO 共享上下文时使用 `/Users/yin/pto`。运行本应用时进入 `/Users/yin/pto/hpc-topology-viewer-main`。

## 入口

`vite.config.ts` 中配置了多个 HTML 入口，包括：

- `index.html`
- `ub-fabric.html`
- `ub-fabric-reference.html`
- `training-topology-sample.html`
- `card-style-lab.html`

## 运行方式

```sh
cd /Users/yin/pto/hpc-topology-viewer-main
npm install
npm run dev
```

## 共享依赖

- 多个 CSS 文件通过 `../../vendor/...` 引入 `../vendor/pto-design-system/`。
- 本地 React/Three 依赖声明在 `package.json`。

## 给其他 Agent 的规则

- 把本目录当作 Vite 应用处理，不要当作普通静态文件夹。
- 保持 PTO 设计系统 import 相对于 `src/` 有效。
- 修改 3D 内容后，需要用浏览器在桌面和移动视口验证。
