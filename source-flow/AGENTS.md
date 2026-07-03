# AGENTS.md

## 模块说明

这是 PTO source-flow 静态实验模块，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `source-flow/index.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/source-flow/index.html`。

## 共享依赖

- `../vendor/pto-design-system/`
- `../js/` 下的根目录图渲染栈
- `../model-architecture/x6.min.js`
- 通过 `fetch()` 加载的源码/图 preset

## 给其他 Agent 的规则

- 保持父级相对脚本路径有效。
- 不要把本目录当作自包含项目。
- 如果修改图解析/渲染行为，需要检查根目录 `js/` 的其他消费者是否受影响。
