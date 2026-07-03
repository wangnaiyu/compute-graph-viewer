# AGENTS.md

## 模块说明

这是 PTO swimlane 模块的静态 benchmark 伴随页面，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `swimlane-bench/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/swimlane-bench/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 指向 `../swimlane/` 的兄弟模块链接。
- 本地 `main.js` 和 `styles.css`。

## 给其他 Agent 的规则

- 不要把本目录当作完整 swimlane 实现。
- 保持到主 swimlane 模块的导航有效。
- 修改数据或渲染后验证 benchmark 输出。
