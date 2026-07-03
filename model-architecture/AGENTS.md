# AGENTS.md

## 模块说明

这是 PTO 模型架构查看器，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `model-architecture/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/model-architecture/index.html`。

## 共享依赖

- 通过 CSS import 引用的 `../vendor/pto-design-system/`
- `../js/colormap.js`
- 本地 `x6.min.js`、`data.js`、`app.js`、`styles.css`

## 给其他 Agent 的规则

- 保持父级相对 import 在 `/Users/yin/pto` 下有效。
- 如果引用了父级资源，不要假设本目录可以单独运行。
- 保留兄弟 PTO 页面依赖的 embed 模式行为。
