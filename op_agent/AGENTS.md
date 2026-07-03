# AGENTS.md

## 模块说明

这是 PTO 算子 agent 静态原型，默认不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `op_agent/index.html`
- `op_agent/existingUI_preview.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/op_agent/index.html`。

## 共享依赖

- 本地 `css/` 和 `js/`。
- 预览页可能引用 `../vendor/pto-design-system/`。

## 给其他 Agent 的规则

- 保持路径在从 `/Users/yin/pto` 启动服务时有效。
- 除非明确要求做独立导出包，不要把设计系统依赖复制到本目录。
- 先确认用户要改的是这个旧原型，还是 `op-ide-assistant-v2`。
