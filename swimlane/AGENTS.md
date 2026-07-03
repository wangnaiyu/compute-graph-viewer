# AGENTS.md

## 模块说明

这是 PTO swimlane 执行视图，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `swimlane/index.html`
- `swimlane/preview.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/swimlane/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 `data.js`、`app.js`、`styles.css`、`samples/`、`render/`
- 指向 `../pass-ir/` 的兄弟模块链接

## 给其他 Agent 的规则

- 保持指向 Pass IR 的链接在 PTO 根目录下有效。
- 除非明确要求迁移，否则保留本地 swimlane renderer 契约。
- 修改布局时同时验证普通模式和 `?preview=1` 模式。
