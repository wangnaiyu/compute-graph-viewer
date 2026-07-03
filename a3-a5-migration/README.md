# A3/A5 算子迁移工作台

静态 PTO 工作台页面，按 `../a3-a5-migration-rebuild-task-prd.md` 重建。

## 文件

- `index.html`：PTO `ide-frame` 三栏 shell，并装载 design-system patterns。
- `content.js`：结构化内容、角色路径、检查清单、Diff 卡片和架构 focus 数据。
- `app.js`：导航联动、搜索、Diff overlay、Memory Architecture focus。
- `styles.css`：业务布局样式，使用 PTO tokens/components，不引入新的私有视觉系统。

## Design-system 执行记录

- 已读取 `pto-new-module-design-system`。
- 已读取 `pto-mem-architecture-diagram`。
- 三栏外壳使用 `data-ide-frame` / `data-ide-split` / `data-ide-pane`。
- 本页面使用可见的 `ide-frame` activity rail，保留顶层 frame 和 split/pane 结构。
- 右侧架构使用 `memory-architecture-layout` pattern，并由该 pattern 组合 `aic-core-object` 和 `aiv-core-object`。
- 右侧架构默认 40% 缩放居中，并提供基于现有 button/zoom-control token 的缩放控件和拖拽平移。
- 页面支持 dark/light mode，通过 `data-theme` 切换 PTO design-system token。
- IDE frame 启用 cursor tracking，鼠标移动时同步 `--ide-cursor-x/y`、aura 和 dot mask。
- 新增 Diff overlay 属于本 PRD 要求的数据可视化叠加，使用现有 token；没有发现需要 preview gate 的新通用组件。
