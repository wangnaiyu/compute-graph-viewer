# AGENTS.md

## 模块说明

这是 PTO 算子 IDE 助手静态原型，默认不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `op-ide-assistant/index.html`
- `op-ide-assistant/indexer-prolog-demo.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/op-ide-assistant/index.html`。

## 共享依赖

- 部分页面引用 `../vendor/pto-design-system/`。
- 本地 `css/`、`js/`、`demo-data/`。

## 给其他 Agent 的规则

- 保持路径在从 `/Users/yin/pto` 启动服务时有效。
- 除非明确要求迁移到共享系统，否则保留本地 IDE 原型脚本。
- 如果修改共享 CSS/JS，需要同时验证主页面和 demo 页面。
