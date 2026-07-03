# AGENTS.md

## 模块说明

这是 PTO 工作区里的性能分析产品区，默认不是可单独下载运行的完整项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

常用入口包括：

- `Profiling_Insight_and_Tool/AI_Profiling_Tool/MindStudioNext.html`
- `Profiling_Insight_and_Tool/AI_Profiling_Tool/graph-evidence-workbench.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

通过 `http://127.0.0.1:8765/...` 打开目标 HTML 路径。

## 共享依赖

- `../vendor/pto-design-system/`
- 通过相对路径引用的 profiling 数据和报告文件。
- 嵌套的 `AscendProfKit/skills/` 是本地 agent/工具参考文件。

## 给其他 Agent 的规则

- 如果页面引用了父级 PTO 资源或设计系统 pattern，不要假设本目录自包含。
- 保留报告和数据路径语义，不要随意重写证据文件路径。
- 修改 UI 时优先复用 PTO 设计系统 tokens 和 patterns。
