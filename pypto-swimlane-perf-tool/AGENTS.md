# AGENTS.md

## 模块说明

这是 PTO swimlane 性能分析静态工具，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `pypto-swimlane-perf-tool/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/pypto-swimlane-perf-tool/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 `js/`、`css/`、`samples/`。

## 给其他 Agent 的规则

- 修改 sample-data 和 parser 时保持与 UI 兼容。
- 除非明确要求做独立导出包，不要把设计系统文件复制到本地。
- 修改后用内置样本数据验证。
