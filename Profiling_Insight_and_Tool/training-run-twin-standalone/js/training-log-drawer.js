// 日志:右上角 #trainLogToggle 打开,默认收起(见 training-monitoring-v2.html 里的 #trainLogDrawer)。
// 日志数据是本页事故场景(问题一 router FP8 溢出触发 loss NaN、问题三 q_proj 溢出、问题五 HCCS 掉链路)
// 的固定重演脚本,时间线/step 与 js/training-run-twin.js 里的 INCIDENT_STEP=41230、diagnosisMarkers
// 保持一致,不是随机生成;SQL 搜索是前端对这份静态数组做的简化条件解析,不接真实查询引擎。
(function () {
  const $ = (id) => document.getElementById(id);

  // comp -> 所属页签("task"=训练任务本身，"system"=集群/硬件基础设施)
  const TASK_COMPONENTS = new Set(["trainer", "dataloader", "ckpt", "eval", "router"]);
  const SYSTEM_COMPONENTS = new Set(["scheduler", "npu-driver", "network", "node-health", "hccl"]);

  // t: "YYYY-MM-DD HH:mm:ss.SSS"；step: 关联的训练 step（用于 SQL 的 step 比较，无关联时为 null）
  const LOG_DATA = [
    { t: "2026-07-16 08:00:03.120", level: "INFO", comp: "scheduler", step: null, msg: "Volcano job pangu20flash-pretrain-7f3a2 submitted, requested npu=2048 (256 nodes × 8 Ascend 910B)" },
    { t: "2026-07-16 08:02:47.884", level: "INFO", comp: "scheduler", step: null, msg: "pods scheduled 256/256, waiting for NPU driver ready" },
    { t: "2026-07-16 08:04:12.033", level: "INFO", comp: "npu-driver", step: null, msg: "CANN 8.0.RC2 / driver 24.1.0 initialized on all 2048 devices" },
    { t: "2026-07-16 08:05:01.442", level: "INFO", comp: "network", step: null, msg: "HCCL rank_table_file loaded, 256 server groups, RoCEv2 fallback enabled" },
    { t: "2026-07-16 08:06:33.219", level: "INFO", comp: "trainer", step: null, msg: "init process group backend=hccl world_size=2048 rank=0 elapsed=91.2s" },
    { t: "2026-07-16 08:07:02.510", level: "INFO", comp: "dataloader", step: null, msg: "dataset shards resolved: 512 shards × 2048 samples, tokenizer=pangu-bpe-128k" },
    { t: "2026-07-16 08:07:45.771", level: "INFO", comp: "ckpt", step: null, msg: "no existing checkpoint under obs://pangu-ckpt/2.0-flash/, cold start from init weights" },
    { t: "2026-07-16 08:08:10.005", level: "INFO", comp: "trainer", step: 0, msg: "training loop started model=Pangu 2.0 flash task=pretrain total_steps=120000 tp=4 pp=8 ep=64 cp=2" },
    { t: "2026-07-16 08:12:44.332", level: "INFO", comp: "trainer", step: 100, msg: "step 100 | loss=8.214 grad_norm=3.11 lr=5.0e-6 mfu=0.410 tokens/s=298442" },
    { t: "2026-07-16 09:41:20.771", level: "INFO", comp: "trainer", step: 2000, msg: "step 2000 | loss=5.732 grad_norm=2.04 lr=8.4e-5 mfu=0.552 tokens/s=451820" },
    { t: "2026-07-16 13:58:02.410", level: "INFO", comp: "trainer", step: 8000, msg: "step 8000 | loss=3.918 grad_norm=1.63 lr=1.2e-4 mfu=0.579 tokens/s=479330" },
    { t: "2026-07-16 15:03:41.117", level: "WARN", comp: "router", step: 8500, msg: "layer33.q_proj input activation 3.2% of tokens exceed FP8 E4M3 max(448), auto-clamped" },
    { t: "2026-07-16 15:03:41.902", level: "WARN", comp: "trainer", step: 8500, msg: "step 8500 | loss=3.774 grad_norm=2.87(↑ from 1.63) lr=1.2e-4 mfu=0.561 — 已记入问题跟踪(问题三)" },
    { t: "2026-07-16 17:26:24.556", level: "INFO", comp: "ckpt", step: 8500, msg: "checkpoint step_8500 uploaded to obs://pangu-ckpt/2.0-flash/step_8500 (118.7GB, 214s)" },
    { t: "2026-07-16 22:14:09.203", level: "INFO", comp: "trainer", step: 14000, msg: "step 14000 | loss=3.201 grad_norm=1.58 lr=1.2e-4 mfu=0.583 tokens/s=483110" },
    { t: "2026-07-17 03:47:52.660", level: "INFO", comp: "trainer", step: 18500, msg: "step 18500 | loss=2.845 grad_norm=1.49 lr=1.2e-4 mfu=0.586 tokens/s=485224" },
    { t: "2026-07-17 06:11:40.018", level: "WARN", comp: "network", step: 20000, msg: "node002 NPU3 HCCS lane5 link flapping, retry 1/3" },
    { t: "2026-07-17 06:12:00.447", level: "ERROR", comp: "network", step: 20000, msg: "node002 NPU3 HCCS lane5 inactive, HCCL fallback to RoCE slow path for comm_group pp_group_2" },
    { t: "2026-07-17 06:12:00.981", level: "WARN", comp: "trainer", step: 20000, msg: "step 20000 | mfu=0.312(↓ from 0.586), throughput degraded on pp_group_2 — 已记入问题跟踪(问题五)" },
    { t: "2026-07-17 06:14:55.302", level: "INFO", comp: "node-health", step: 20000, msg: "node002 NPU3 physical link diagnostics dispatched to infra on-call" },
    { t: "2026-07-17 06:20:31.774", level: "INFO", comp: "network", step: 20010, msg: "HCCS lane5 recovered after port reset, HCCL comm_group pp_group_2 rebuilt" },
    { t: "2026-07-17 06:21:02.115", level: "INFO", comp: "trainer", step: 20050, msg: "step 20050 | mfu=0.581(recovered) tokens/s=480117" },
    { t: "2026-07-17 12:03:44.890", level: "INFO", comp: "trainer", step: 26000, msg: "step 26000 | loss=2.402 grad_norm=1.41 lr=1.2e-4 mfu=0.584" },
    { t: "2026-07-17 18:55:12.330", level: "INFO", comp: "eval", step: 30000, msg: "WPLC/LAMBADA eval @ step 30000: wplc_val_loss=2.61 lambada_val_loss=3.08" },
    { t: "2026-07-17 18:55:40.221", level: "INFO", comp: "ckpt", step: 30000, msg: "checkpoint step_30000 uploaded to obs://pangu-ckpt/2.0-flash/step_30000 (119.1GB, 209s)" },
    { t: "2026-07-18 01:12:03.556", level: "INFO", comp: "trainer", step: 36000, msg: "step 36000 | loss=2.198 grad_norm=1.38 lr=1.2e-4 mfu=0.585" },
    { t: "2026-07-18 04:30:18.902", level: "INFO", comp: "trainer", step: 40000, msg: "step 40000 | loss=2.150 grad_norm=1.40 lr=1.2e-4 mfu=0.583" },
    { t: "2026-07-18 05:40:02.114", level: "WARN", comp: "router", step: 41100, msg: "layer12.moe.router logits max drifting upward: p99=402.6 (E4M3 max 448), approaching saturation" },
    { t: "2026-07-18 05:44:18.667", level: "WARN", comp: "router", step: 41160, msg: "expert load imbalance detected: top1 expert(193) share=41.2% (threshold 25%)" },
    { t: "2026-07-18 05:47:02.330", level: "WARN", comp: "trainer", step: 41200, msg: "step 41200 | loss=2.184 grad_norm=2.87(↑) mfu=0.560 — 波动加剧" },
    { t: "2026-07-18 05:47:52.014", level: "ERROR", comp: "router", step: 41228, msg: "FP8 E4M3 softmax overflow at layer12.moe.router, logits max=512.7 (> E4M3 max 448), saturating to inf" },
    { t: "2026-07-18 05:47:53.228", level: "ERROR", comp: "router", step: 41229, msg: "token routing collapse: 98.3% tokens routed to expert193(rank12), capacity_factor exceeded, dropped_tokens=812441" },
    { t: "2026-07-18 05:48:00.406", level: "ERROR", comp: "hccl", step: 41230, msg: "HcclAllToAllV timeout on comm_group ep_group_3, rank=12 peer=45, elapsed=120000ms(> timeout 120000ms)" },
    { t: "2026-07-18 05:48:00.777", level: "ERROR", comp: "trainer", step: 41230, msg: "step 41230 | loss=nan grad_norm=inf — abort optimizer.step(), tensors dumped to /tmp/anomaly_dump/step_41230", focus: true },
    { t: "2026-07-18 05:48:01.115", level: "ERROR", comp: "npu-driver", step: 41230, msg: "device rank12(node012 NPU3) AICORE task timeout on stream14, HCCL watchdog killed pid=88213" },
    { t: "2026-07-18 05:48:01.560", level: "ERROR", comp: "scheduler", step: 41230, msg: "pod pangu20flash-pretrain-7f3a2-worker-12 CrashLoopBackOff restartCount=1" },
    { t: "2026-07-18 05:48:32.220", level: "WARN", comp: "node-health", step: 41230, msg: "node012 NPU3 temperature=78°C, ECC errors=0 — 硬件自检未见异常，判断为数值溢出触发的软件故障" },
    { t: "2026-07-18 05:49:10.004", level: "INFO", comp: "trainer", step: 41230, msg: "auto-recovery triggered: rollback to last stable checkpoint step_41200" },
    { t: "2026-07-18 05:51:42.881", level: "INFO", comp: "ckpt", step: 41200, msg: "restored optimizer/model state from obs://pangu-ckpt/2.0-flash/step_41200" },
    { t: "2026-07-18 05:52:03.556", level: "INFO", comp: "scheduler", step: 41230, msg: "worker-12 pod restarted, rejoined process group, rank12 healthy" },
    { t: "2026-07-18 05:52:30.017", level: "INFO", comp: "trainer", step: 41200, msg: "resuming training from step 41200, skipping corrupt optimizer state at step 41230" },
    { t: "2026-07-18 05:58:14.442", level: "INFO", comp: "trainer", step: 41260, msg: "step 41260 | loss=3.982 grad_norm=6.11(恢复期) mfu=0.402" },
    { t: "2026-07-18 06:20:07.330", level: "INFO", comp: "trainer", step: 41800, msg: "step 41800 | loss=2.910 grad_norm=2.44 mfu=0.498(恢复中)" },
    { t: "2026-07-18 07:15:52.229", level: "INFO", comp: "trainer", step: 43000, msg: "step 43000 | loss=2.301 grad_norm=1.55 mfu=0.571(趋于稳定)" },
    { t: "2026-07-18 09:02:41.006", level: "INFO", comp: "trainer", step: 45000, msg: "step 45000 | loss=2.077 grad_norm=1.44 mfu=0.582" },
    { t: "2026-07-18 10:47:23.884", level: "INFO", comp: "eval", step: 46000, msg: "WPLC/LAMBADA eval @ step 46000: wplc_val_loss=2.28 lambada_val_loss=2.74" },
    { t: "2026-07-18 11:30:05.220", level: "INFO", comp: "ckpt", step: 47000, msg: "checkpoint step_47000 uploaded to obs://pangu-ckpt/2.0-flash/step_47000 (119.4GB, 211s)" },
    { t: "2026-07-18 12:40:18.667", level: "INFO", comp: "trainer", step: 48000, msg: "step 48000 | loss=1.912 grad_norm=1.41 mfu=0.584 tokens/s=486003" },
    { t: "2026-07-18 13:35:40.230", level: "DEBUG", comp: "dataloader", step: 48200, msg: "prefetch queue depth=6, epoch=24 shard=337/512" },
    { t: "2026-07-18 13:36:00.812", level: "INFO", comp: "trainer", step: 48230, msg: "step 48230 | loss=1.897 grad_norm=1.39 lr=1.2e-4 mfu=0.585 tokens/s=486210" },
  ];

  let activeTab = "all"; // all | task | system
  // 默认展示这次事故的核心报错(问题一 loss=nan),用户点「清空」即可看回全部日志
  let activeQuery = "level='ERROR' AND message LIKE '%nan%'";

  function compTab(comp) {
    if (TASK_COMPONENTS.has(comp)) return "task";
    if (SYSTEM_COMPONENTS.has(comp)) return "system";
    return "task";
  }

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── 简化版 SQL WHERE 解析:支持 level/comp/message/step 列, = != > >= < <= LIKE IN 运算符,
  //    多条件用 AND 连接。解析不出任何列名时整体退化为对 "时间+级别+组件+消息" 的大小写不敏感子串匹配。──
  function parseQuery(raw) {
    const q = raw.trim();
    if (!q) return null;
    const body = q.replace(/^\s*SELECT\s+\*\s+FROM\s+logs\s*/i, "").replace(/^\s*WHERE\s+/i, "");
    const clauses = body.split(/\s+AND\s+/i).map((c) => c.trim()).filter(Boolean);

    const conds = [];
    let recognized = true;
    for (const clause of clauses) {
      let m;
      if ((m = clause.match(/^(\w+)\s+(NOT\s+)?LIKE\s+'?%?([^%']*)%?'?$/i))) {
        conds.push({ col: m[1].toLowerCase(), op: m[2] ? "not-like" : "like", val: m[3] });
      } else if ((m = clause.match(/^(\w+)\s+(NOT\s+)?IN\s*\(([^)]*)\)$/i))) {
        const vals = m[3].split(",").map((s) => s.trim().replace(/^'|'$/g, "").toLowerCase());
        conds.push({ col: m[1].toLowerCase(), op: m[2] ? "not-in" : "in", val: vals });
      } else if ((m = clause.match(/^(\w+)\s*(>=|<=|!=|>|<|=)\s*'?([^']*)'?$/))) {
        conds.push({ col: m[1].toLowerCase(), op: m[2], val: m[3].trim() });
      } else {
        recognized = false;
      }
    }
    if (!recognized || !conds.length) {
      return { fallback: q.toLowerCase() };
    }
    return { conds };
  }

  function rowMatchesConds(row, conds) {
    return conds.every((c) => {
      const col = c.col === "message" || c.col === "msg" ? "msg" : c.col;
      if (col === "level") {
        const v = row.level.toLowerCase();
        if (c.op === "in") return c.val.includes(v);
        if (c.op === "not-in") return !c.val.includes(v);
        if (c.op === "=") return v === String(c.val).toLowerCase();
        if (c.op === "!=") return v !== String(c.val).toLowerCase();
        return false;
      }
      if (col === "comp" || col === "component") {
        const v = row.comp.toLowerCase();
        if (c.op === "in") return c.val.includes(v);
        if (c.op === "not-in") return !c.val.includes(v);
        if (c.op === "=") return v === String(c.val).toLowerCase();
        if (c.op === "!=") return v !== String(c.val).toLowerCase();
        if (c.op === "like") return v.includes(String(c.val).toLowerCase());
        return false;
      }
      if (col === "step") {
        if (row.step == null) return false;
        const n = Number(c.val);
        if (Number.isNaN(n)) return false;
        if (c.op === "=") return row.step === n;
        if (c.op === "!=") return row.step !== n;
        if (c.op === ">") return row.step > n;
        if (c.op === ">=") return row.step >= n;
        if (c.op === "<") return row.step < n;
        if (c.op === "<=") return row.step <= n;
        return false;
      }
      if (col === "msg") {
        const v = row.msg.toLowerCase();
        if (c.op === "like") return v.includes(String(c.val).toLowerCase());
        if (c.op === "not-like") return !v.includes(String(c.val).toLowerCase());
        return v.includes(String(c.val).toLowerCase());
      }
      return true; // 无法识别的列名不参与过滤,避免因笔误把结果清空
    });
  }

  function filteredRows() {
    let rows = LOG_DATA.filter((r) => activeTab === "all" || compTab(r.comp) === activeTab);
    const parsed = parseQuery(activeQuery);
    if (!parsed) return rows;
    if (parsed.fallback) {
      const kw = parsed.fallback;
      rows = rows.filter((r) => (r.t + " " + r.level + " " + r.comp + " " + r.msg).toLowerCase().includes(kw));
    } else {
      rows = rows.filter((r) => rowMatchesConds(r, parsed.conds));
    }
    return rows;
  }

  function renderStatus(rows) {
    const el = $("trainLogStatus");
    if (!el) return;
    const errCount = rows.filter((r) => r.level === "ERROR").length;
    const warnCount = rows.filter((r) => r.level === "WARN").length;
    el.innerHTML =
      "共 <b>" + rows.length + "</b> 条" +
      (errCount ? " · <span class=\"lvl-error\">ERROR " + errCount + "</span>" : "") +
      (warnCount ? " · <span class=\"lvl-warn\">WARN " + warnCount + "</span>" : "") +
      "<span class=\"wzh-log-status-live\"><i></i>已同步至最新 step</span>";
  }

  function renderBody() {
    const body = $("trainLogBody");
    if (!body) return;
    const rows = filteredRows();
    renderStatus(rows);
    if (!rows.length) {
      body.innerHTML = "<div class=\"wzh-log-empty\">没有匹配的日志，试试清空搜索条件或切换页签。</div>";
      return;
    }
    body.innerHTML = rows.map((r) => {
      const full = r.t + "  [" + r.level + "]  " + r.comp + "  " + r.msg;
      const cls = "wzh-log-row lvl-" + r.level + (r.focus ? " is-focus-row" : "");
      return (
        "<div class=\"" + cls + "\" title=\"" + escHtml(full) + "\">" +
          "<span class=\"wzh-log-col-time\">" + escHtml(r.t) + "</span>" +
          "<span class=\"wzh-log-col-level lvl-" + r.level + "\">" + r.level + "</span>" +
          "<span class=\"wzh-log-col-comp\">" + escHtml(r.comp) + "</span>" +
          "<span class=\"wzh-log-col-msg\">" + escHtml(r.msg) + "</span>" +
        "</div>"
      );
    }).join("");
    scrollToRelevantRow(body);
  }

  // 自动滚动定位:优先跳到本次事故的关键报错行(问题一 loss=nan,见 LOG_DATA 里的 focus:true),
  // 该行被当前页签/搜索条件过滤掉时退化为跳到筛选结果里第一条 ERROR;完全没有 ERROR 时按
  // "实时日志尾随"惯例滚到最新一条。命中的行加一次红色脉冲高亮,把视线引导过去而不是让用户自己找。
  function scrollToRelevantRow(body) {
    const target = body.querySelector(".wzh-log-row.is-focus-row") || body.querySelector(".wzh-log-row.lvl-ERROR");
    if (!target) { body.scrollTop = body.scrollHeight; return; }
    target.scrollIntoView({ block: "center" });
    target.classList.add("is-flash");
    setTimeout(() => target.classList.remove("is-flash"), 1700);
  }

  function initTabs() {
    const seg = $("trainLogTabSeg");
    if (!seg) return;
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-log-tab]");
      if (!btn) return;
      activeTab = btn.dataset.logTab;
      seg.querySelectorAll(".segbtn").forEach((b) => {
        b.classList.toggle("on", b === btn);
        b.setAttribute("aria-selected", String(b === btn));
      });
      renderBody();
    });
  }

  function initSearch() {
    const input = $("trainLogSearchInput");
    const searchBtn = $("trainLogSearchBtn");
    const clearBtn = $("trainLogSearchClearBtn");
    if (!input) return;
    input.value = activeQuery; // 搜索框回显默认查询,和 activeQuery 保持同一份状态
    function runSearch() { activeQuery = input.value; renderBody(); }
    searchBtn?.addEventListener("click", runSearch);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });
    clearBtn?.addEventListener("click", () => { input.value = ""; activeQuery = ""; renderBody(); });
  }

  function getTrainingContext() {
    return typeof window.twinGetTrainingContext === "function" ? window.twinGetTrainingContext() : null;
  }

  function fmtContextLabel(ctx) {
    if (!ctx) return "训练态未就绪";
    const pct = ctx.totalSteps ? ((ctx.step / ctx.totalSteps) * 100).toFixed(1) : "--";
    return ctx.model.name + " · step " + ctx.step.toLocaleString() + "/" + ctx.totalSteps.toLocaleString() + "（" + pct + "%）";
  }

  function initPanelToggle() {
    const toggle = $("trainLogToggle");
    const panel = $("trainLogDrawer");
    const closeBtn = $("trainLogCloseBtn");
    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.classList.toggle("is-open", open);
      panel.setAttribute("aria-hidden", String(!open));
      toggle.classList.toggle("is-active", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-pressed", String(open));
      toggle.title = open ? "关闭日志" : "打开日志";
      toggle.setAttribute("aria-label", toggle.title);
      if (open) {
        const label = $("trainLogContext");
        if (label) label.textContent = fmtContextLabel(getTrainingContext());
        renderBody();
      }
    }

    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("is-open")));
    closeBtn?.addEventListener("click", () => setOpen(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panel.classList.contains("is-open")) setOpen(false);
    });

    setOpen(false); // 默认收起
  }

  function boot() {
    initTabs();
    initSearch();
    initPanelToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
