# AGENTS.md

## 模块说明

这是 PTO 工作区里的图布局原型实验室。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `graph-prototype-lab/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/graph-prototype-lab/index.html`。

## 共享依赖

- 本地 `vendor/` 布局库。
- 本地 `graph-ir.js`、`layout-engine.js`、`renderer.js`、`data-adapters.js`。

## 给其他 Agent 的规则

- 本模块有自己的本地图原型栈；除非明确要求，不要替换成根目录 Pass IR renderer。
- 保持本地 vendor 文件仍在本地使用。
- 如果把它接入其他 PTO 页面，保持链接在 `/Users/yin/pto` 下有效。
