# AGENTS.md

## 模块说明

这是 PTO 工作区里的静态内存查看器模块，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `cann-910b-mem-viewer/index.html`
- `cann-910b-mem-viewer/component-preview.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/cann-910b-mem-viewer/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 `styles.css`

## 给其他 Agent 的规则

- 保留指向父级设计系统的相对 import。
- 不要把本目录当作完整导出包。
- 视觉修改后通过根目录服务 URL 验证。
