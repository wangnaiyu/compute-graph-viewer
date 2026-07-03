# AGENTS.md

## 模块说明

这是 PTO 训练可视化产品区，不是独立项目。

## 工作区根目录

完整项目根目录是 `/Users/yin/pto`。

## 入口

常用页面：

- `pangu-moe-trainviz/index.html`
- `pangu-moe-trainviz/op-rank-time.html`
- `pangu-moe-trainviz/trainscope-live.html`
- `pangu-moe-trainviz/ep-expert-parallel-2d.html`

本目录里的白皮书页面是内容页；除非明确要求，不要加入白皮书专项流程。

## 运行方式

必须从 PTO 根目录启动本地服务：

```sh
cd /Users/yin/pto
python3 -m http.server 8765
```

在 `http://127.0.0.1:8765/pangu-moe-trainviz/...` 下打开目标页面。

## 共享依赖

- `../vendor/pto-design-system/`
- 本地 `css/`、`js/`、`data/` 和 `vendor/` 库。
- 部分文档引用本地研究路径，不要默认这些路径在其他机器上存在。

## 给其他 Agent 的规则

- 不要把本目录当作独立项目。
- 概念上区分产品页面和白皮书页面。
- 修改可视化时优先复用 PTO 设计系统 patterns。
- 本目录有很多实验页和副本，必须验证用户指定的准确页面。
