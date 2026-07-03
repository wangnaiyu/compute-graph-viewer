# AGENTS.md

## 模块说明

这是第二版 PTO 算子 IDE 助手静态原型。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

- `op-ide-assistant-v2/index.html`
- `op-ide-assistant-v2/existingUI_preview.html`

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

打开 `http://127.0.0.1:8765/op-ide-assistant-v2/index.html`。

## 共享依赖

- 本地 `css/` 和 `js/`。
- 预览页可能引用 `../vendor/pto-design-system/`。

## 给其他 Agent 的规则

- 不要假设本目录是完整独立仓库。
- 除非要求重构，否则保持本地 JS 文件边界。
- 用户问哪个入口，就验证哪个入口页面。
