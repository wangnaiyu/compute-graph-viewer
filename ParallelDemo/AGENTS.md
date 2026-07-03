# AGENTS.md

## 模块说明

这是 PTO 工作区里的静态演示模块。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。不要把当前文件夹当作整个 PTO 项目。

## 入口

- `ParallelDemo/index.html`
- `ParallelDemo/dist.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/ParallelDemo/index.html`。

## 共享依赖

- 本目录内的 SVG/PNG 资源。
- 父级 PTO 启动台可能会链接到本模块。

## 给其他 Agent 的规则

- 保持路径在从 `/Users/yin/pto` 启动服务时有效。
- 除非明确要求做独立导出包，不要把父级资源复制进本目录。
- 保留本地演示资源和说明笔记。
