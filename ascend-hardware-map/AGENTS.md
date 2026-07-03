# AGENTS.md

## 模块说明

这是 PTO 工作区里的 Ascend 硬件地图静态模块，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

主要页面：

- `ascend-hardware-map/ascend-hardware-map-v3.html`
- `ascend-hardware-map/ascend-950b-hardware-frame.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/ascend-hardware-map/ascend-hardware-map-v3.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- 兄弟模块 iframe/page 链接，例如 `../ascend-950-workbench-demo/`。
- 本地构建产物目录 `cannvision-950-pattern/`。

## 给其他 Agent 的规则

- 保持兄弟模块 iframe 链接在 PTO 根目录下有效。
- 复用 PTO hardware 和 memory architecture patterns。
- 不要假设本目录可以脱离共享依赖单独移动。
