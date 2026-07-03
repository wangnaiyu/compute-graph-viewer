# AGENTS.md

## 模块说明

这是 PTO 工作区里的 execution-indexer 静态原型，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `indexer-exec/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/indexer-exec/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- `../js/colormap.js`
- 兄弟模块 iframe 链接，例如 `../model-architecture/`。
- 本原型可能使用外部 CDN 脚本。

## 给其他 Agent 的规则

- 保持兄弟模块链接在 `/Users/yin/pto` 下有效。
- 不要假设本目录自包含。
- 如果要替换 CDN 依赖，需要明确处理并记录这个变化。
