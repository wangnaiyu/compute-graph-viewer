# AGENTS.md

## 模块说明

这是 PTO 训练可视化模块，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `train/index.html`
- `train/training-run-twin.html`
- `train/training-mental-model.html`
- `train/training-transformer-explainer.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

在 `http://127.0.0.1:8765/train/...` 下打开目标页面。

## 本地规则

- shell 命令使用 `rtk` 前缀。
- 本目录是 PTO 工作区里的一个模块。除非任务明确只限定当前目录，否则用 `/Users/yin/pto` 作为完整项目根目录。
- 静态页面从 PTO 根目录服务，例如 `cd /Users/yin/pto && python3 -m http.server 8765`，再打开 `http://127.0.0.1:8765/train/index.html` 或具体 train 页面。
- 不要假设本目录是独立导出包；父级启动页、共享 assets、设计系统引用都可能相关。
- 本目录是静态 PTO Train 模块，优先直接改 HTML、CSS、JS；没有构建步骤。
- 复用 PTO 设计系统 tokens 和组件。非图形 UI 的颜色、间距、边框、字体和圆角应来自 token。
- train 模块顶部 header 默认保持透明。不要添加填充背景，也不要在 header 下方添加页面级 margin/gap；间距放到 pane 或内容 shell 内。
- 保持 `training-mental-model.html`、`training-mental-model.css`、`training-mental-model.js` 对齐：nav 的 `data-visual-target`、section 的 `data-visual-section` 和 `visuals` key 必须匹配。
- 训练事实优先参考 Ascend 官方文档和本地 `MindSpeed-LLM-master/examples` 脚本。新增模型参数时，加简短的用户可读注释说明其意义。
- 布局修改后，在桌面和移动宽度下验证 `training-mental-model.html` 静态页面。
