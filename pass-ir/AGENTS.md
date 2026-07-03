# AGENTS.md

## 模块说明

这是 PTO 核心 Pass IR 图工作台，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `pass-ir/index.html`
- `pass-ir/explain.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/pass-ir/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 根目录图渲染栈：`../js/colormap.js`、`../js/parser.js`、`../js/layout.js`、`../js/renderer.js`、`../js/app.js`、`../js/nav.js`
- 本地样本：`pass-ir/samples/`

## 给其他 Agent 的规则

- 保持根目录图渲染脚本的加载顺序。
- 不要手工编辑生成文件 `nav_index.json`。
- 如果修改图行为，需要检查 `mem_viewer/`、`source-flow/`、`model-architecture/` 等消费者。
- 修改后通过根目录服务 URL 验证。
