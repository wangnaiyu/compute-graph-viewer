# AGENTS.md

## 模块说明

这是 PTO 内存查看器，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `mem_viewer/index.html`
- `mem_viewer/index-v2.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/mem_viewer/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 根目录图渲染栈：`../js/colormap.js`、`../js/parser.js`、`../js/layout.js`、`../js/renderer.js`
- 本地数据：`mem_viewer/data/`

## 给其他 Agent 的规则

- 不要把本目录当作独立项目；它有意复用根目录 Pass IR 图渲染栈。
- 保持根目录图渲染脚本的加载顺序。
- 修改后通过根目录服务 URL 验证。
