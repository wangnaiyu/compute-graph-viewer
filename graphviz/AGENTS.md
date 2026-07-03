# AGENTS.md

## 模块说明

这个目录包含图可视化报告和生成型图页面，不是独立应用包。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

常用页面：

- `graphviz/torchvista_graphviz_deepseek_v4.html`
- `graphviz/deepseek_v32_report_overlay_demo.html`
- `graphviz/deepseek_v32_report_overlay_demo_v2.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

在 `http://127.0.0.1:8765/graphviz/...` 下打开目标页面。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 JSON 图数据。
- 部分生成文件可能包含本机源码路径注释。

## 给其他 Agent 的规则

- 如果存在生成脚本，不要默认把生成后的 HTML 当作唯一源码。
- 除非任务明确要求改某个大 HTML 文件，否则避免手工重写大型生成文件。
- 保持设计系统引用在 PTO 根目录下有效。
