# AGENTS.md

## 模块说明

这是 PTO PMU 静态可视化模块，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `pmu/06-a5-pmu-visualization-group2-loop.html`
- `pmu/a5-pmu-visualization-report.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/pmu/06-a5-pmu-visualization-group2-loop.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- PTO swimlane 和 IDE-frame patterns。

## 给其他 Agent 的规则

- 保持设计系统 pattern import 指向父级目录。
- 不要把本目录当作完整独立应用。
- UI 修改后验证 PMU 时间线和交互状态。
