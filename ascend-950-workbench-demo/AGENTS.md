# AGENTS.md

## 模块说明

这是 Ascend 950 硬件路径和算子迁移工作台，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

主要页面：

- `ascend-950-workbench-demo/index.html`
- `ascend-950-workbench-demo/feature_taxonomy.html`
- `ascend-950-workbench-demo/operator_developer_guide.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/ascend-950-workbench-demo/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 `kernels/`、`rules/` 和页面内嵌示例代码。
- 部分页面会链接到 PTO 兄弟模块。

## 给其他 Agent 的规则

- 保持路径在 `/Users/yin/pto` 根目录下有效。
- 复用 PTO 设计系统里的 workbench 和 hardware patterns。
- 除非明确要求做独立导出包，不要把共享 patterns 复制进本目录。
- 本模块有大量内联 UI 逻辑，重要 UI 修改后必须用浏览器验证。
