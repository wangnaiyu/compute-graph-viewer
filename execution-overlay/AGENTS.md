# AGENTS.md

## 模块说明

这是 PTO 工作区里的执行叠加静态原型，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `execution-overlay/index.html`
- `execution-overlay/component-preview.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/execution-overlay/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 父级 PTO 启动台可能会嵌入或链接本模块。

## 给其他 Agent 的规则

- 保持路径在从 `/Users/yin/pto` 启动服务时有效。
- 复用 PTO 设计系统组件。
- 除非明确要求做独立导出包，不要把共享依赖复制进本目录。
