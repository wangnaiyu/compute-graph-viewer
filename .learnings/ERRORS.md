## [ERR-20260306-001] sample-path-validation

**Logged**: 2026-03-06T18:08:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: docs

### Summary
手工验证聚合分组时使用了不存在的样本路径，导致 Node 读文件失败。

### Error
```
Error: ENOENT: no such file or directory, open '/Users/yin/pto/deepseek_out_pass/sample_computation_graph.json'
```

### Context
- Command/operation: Node 脚本读取样本 JSON 统计可聚合簇数量
- Input path: `/Users/yin/pto/deepseek_out_pass/sample_computation_graph.json`
- 实际情况: 该文件不在当前目录，需先 `ls`/`rg --files` 校验样本路径

### Suggested Fix
在手工验证脚本前增加文件存在性检查，或统一使用 `rg --files deepseek_out_pass | head` 选取可用样本。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md

---

## [ERR-20260624-002] liquid-glass-list-card-refract-overload

**Logged**: 2026-06-24T15:17:00+08:00  
**Priority**: high  
**Status**: resolved  
**Area**: frontend

### Summary
Applying `@samasante/liquid-glass` `refract` copy mode to many launch cards at page load can overload Chrome rendering and crash or hang the page.

### Error
```
Chrome headless emitted tile memory limit warnings when many cards rendered SVG displacement filters and full-viewport background copies at once.
User report: opening launch_test crashes immediately.
```

### Context
- Operation attempted: matching liquid-glass examples by rendering a `Glass` lens beneath every visible launch card.
- Environment: `/Users/yin/pto/launch_test.html`, Chrome, static React page.
- Root cause: each card created its own SVG displacement filter, map image, and viewport-sized `refract` background copy on initial render.

### Suggested Fix
For lists/grids, do not instantiate `refract` mode for every item on load. Keep base cards lightweight and enable a single true refraction lens only on hover/focus, or centralize the effect in one shared surface.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/launch_test.html

### Resolution
- **Resolved**: 2026-06-24T15:17:00+08:00
- **Notes**: `launch_test.html` now only creates the card `Glass` refraction lens while a card is hovered/focused; initial page load stays lightweight.

---

## [ERR-20260624-002] shell-node-e-template-string

**Logged**: 2026-06-24T14:12:00+08:00
**Priority**: low
**Status**: pending
**Area**: tooling

### Summary
An inline `node -e` verification command failed because a JavaScript template string was interpreted by the shell.

### Error
```
zsh:1: command not found: rank:r:v0
SyntaxError: Unexpected token ')'
```

### Context
- Command/operation attempted: palette verification with `node -e`
- Cause: unescaped backticks in a JavaScript template string inside a shell command
- Environment: zsh via `rtk`

### Suggested Fix
Use string concatenation or escape backticks when writing inline JavaScript in shell commands.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/pangu-moe-trainviz/pangu-palette.js

---

## [ERR-20260624-002] browser-plugin-node-repl-sandbox-meta

**Logged**: 2026-06-24T04:03:00Z  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
The in-app Browser skill bootstrap failed in the Node REPL because the tool call lacked sandbox state metadata expected by the runtime.

### Error
```
Mcp error: -32602: js: codex/sandbox-state-meta: missing field `sandboxPolicy`
```

### Context
- Operation attempted: Browser plugin bootstrap via `setupBrowserRuntime({ globals: globalThis })`
- Page being verified: `http://127.0.0.1:8765/pangu-moe-trainviz/op-rank-time.html`
- Environment: Codex MCP `mcp__node_repl__js`

### Suggested Fix
If this recurs, avoid repeated browser-client bootstrap attempts in the same session and use an already authorized Chrome debugging path or static validation fallback.

### Metadata
- Reproducible: unknown
- Related Files: /Users/yin/pto/pangu-moe-trainviz/op-rank-time.html

---

## [ERR-20260622-001] npm-pack-animejs-proxy-eperm

**Logged**: 2026-06-22T12:01:00+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: tooling

### Summary
`rtk npm pack animejs@3.2.2` failed because npm attempted to connect through local proxy `127.0.0.1:8890` and was blocked.

### Error
```
npm error FetchError: request to https://registry.npmjs.org/animejs failed, reason: connect EPERM 127.0.0.1:8890
```

### Context
- Command/operation attempted: fetching Anime.js from npm for a local PTO preview page
- User clarified the intended source was the official GitHub repo `juliangarnier/anime`
- Resolution in this task: cloned official GitHub tag `v4.4.1` and vendored its ESM `src/` locally instead of relying on npm/CDN

### Suggested Fix
For small frontend vendor previews under PTO, prefer official GitHub tag sources when npm is blocked, or rerun npm/network fetch with explicit escalation if the published package `dist/` is required.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/pangu-moe-trainviz/vendor/animejs-v4.4.1

---

## [ERR-20260602-001] manual-symbol-typo-loop

**Logged**: 2026-06-02T14:30:40+08:00  
**Priority**: low  
**Status**: fixed  
**Area**: documentation

### Summary
Repeated manual `apply_patch` attempts failed to correct an Ascend C kernel symbol in the tiling spec, leaving `mmol_vec_custom` / `mma d_vec_custom` instead of the source-confirmed `mmad_vec_custom`.

### Error
```text
Erroneous text: __global__ __mix__(1, 2) void mmol_vec_custom(...)
Actual source: __global__ __mix__(1, 2) void mmad_vec_custom(GM_ADDR a, GM_ADDR b, GM_ADDR c)
```

### Context
- Command/operation attempted: manually patching one symbol in `/Users/yin/pto/tiling/docs/ascend-viz-puzzle-spec.md`
- Root cause: repeated manual transcription error after already verifying the source line.

### Suggested Fix
For exact source symbols, copy from `rg` / source output or use a narrow mechanical replacement after verification instead of retyping the symbol repeatedly.

### Metadata
- Reproducible: yes
- Related Files: `/Users/yin/pto/tiling/docs/ascend-viz-puzzle-spec.md`

---

## [ERR-20260530-001] chrome-headless-screenshot-signal-6

**Logged**: 2026-05-30T14:02:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: frontend

### Summary
Headless Chrome screenshot validation can abort with signal 6 in this local macOS session even when the page loads in the regular browser.

### Error
```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --disable-gpu --window-size=1600,1000 --screenshot=/private/tmp/ascend950_operator_guide.png http://127.0.0.1:8789/operator_developer_guide.html
process terminated by signal 6
```

### Context
- Command/operation attempted: visual screenshot verification for `/Users/yin/pto/ascend-950-workbench-demo/operator_developer_guide.html`
- Regular Chrome app state showed the page DOM and controls loaded; the abort appears specific to the headless screenshot command.

### Suggested Fix
Use browser accessibility state, DOM checks, or an installed Playwright/Chrome automation path for verification when this headless command aborts.

### Metadata
- Reproducible: unknown
- Related Files: /Users/yin/pto/ascend-950-workbench-demo/operator_developer_guide.html

---

## [ERR-20260530-002] chrome-headless-feature-taxonomy-signal-6

**Logged**: 2026-05-30T14:42:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: frontend

### Summary
Headless Chrome screenshot validation for the Ascend 950 feature taxonomy page still aborts with signal 6 in this local macOS session.

### Error
```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --disable-gpu --disable-dev-shm-usage --no-sandbox --window-size=1800,1000 --screenshot=/private/tmp/feature_taxonomy_ccu.png http://127.0.0.1:8790/ascend-950-workbench-demo/feature_taxonomy.html
process terminated by signal 6
```

### Context
- Command/operation attempted: visual screenshot verification after revising CCU placement and capability labels.
- HTTP checks for the target page and hardware frame both returned 200; inline script syntax checks passed.
- This appears to be the same local headless Chrome issue previously observed for the operator guide page.

### Suggested Fix
Use regular browser inspection, Computer Use, DOM checks, or an installed Playwright/WebDriver path for visual verification when this headless command aborts.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/ascend-950-workbench-demo/feature_taxonomy.html
- See Also: ERR-20260530-001

---

## [ERR-20260511-001] rg-default-regex-lookahead

**Logged**: 2026-05-11T10:25:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
`rg` 默认正则引擎不支持 lookahead，设计系统检查命令使用 `(?!...)` 会直接失败。

### Error
```
rg: regex parse error:
    (?:#[0-9a-fA-F]{3,8}|rgba\(|style="(?!width:))
                                       ^^^
error: look-around, including look-ahead and look-behind, is not supported
```

### Context
- Command attempted: `rg -n "#[0-9a-fA-F]{3,8}|rgba\(|style=\"(?!width:)" ...`
- Task: check the Ascend 950 demo HTML for hard-coded colors and inline styles.

### Suggested Fix
Use separate simple `rg` searches, or pass `--pcre2` when lookaround is actually needed.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/ascend-950-mode-select/index.html

---

## [ERR-20260316-001] rg-quote-pattern

**Logged**: 2026-03-16T03:42:32Z  
**Priority**: low  
**Status**: pending  
**Area**: docs

### Summary
在校验新写的 tiling 笔记标题和关键关键词时，`rg` 命令的引号拼接写错，导致 shell 直接报语法错误。

### Error
```
zsh:1: unmatched "
```

### Context
- Command/operation: 对 `/Users/yin/pto/业务理解/deepseek_910B_tiling_guide.md` 运行 `rg -n` 做标题和关键词校验
- Root cause: 模式字符串里混用了单双引号，导致 zsh 在命令解析阶段就中断，而不是 `rg` 本身执行失败
- Impact: 文档内容已成功写入，但多做了一次补充校验

### Suggested Fix
后续写包含反引号、中文和正则的 `rg` 模式时，优先统一用单引号包裹整个 pattern；如果 pattern 内必须含单引号，再拆成更简单的多个 `rg` 查询，避免一次命令里混合过多引号层级。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md, 业务理解/deepseek_910B_tiling_guide.md

---

## [ERR-20260316-002] shell-backtick-pattern

**Logged**: 2026-03-16T15:41:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: docs

### Summary
在用 `rg` 校验新重写的 loop/controlflow 文档时，把带反引号的搜索词直接放进 shell 命令，触发了命令替换。

### Error
```
zsh:1: command not found: 32
```

### Context
- Command/operation: 对 `业务理解/Pass_如何把前端IR变成Execute_Graph_研究笔记.md` 和 `业务理解/Loop_循环体与ControlFlow_研究笔记.md` 运行 `rg -n`
- Root cause: 搜索模式里直接包含了 Markdown 反引号内容，如 ``step `32```，zsh 先做了命令替换
- Impact: 只是最后一轮校验命令出错，文档文件本身已正常写入

### Suggested Fix
后续对包含反引号的 Markdown 文本做 `rg` 搜索时，优先使用单引号包裹整个模式，或拆成多个不含反引号的简单关键词，避免 shell 先解释 pattern。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md, 业务理解/Pass_如何把前端IR变成Execute_Graph_研究笔记.md, 业务理解/Loop_循环体与ControlFlow_研究笔记.md

---

## [ERR-20260310-001] node-check-html

**Logged**: 2026-03-10T11:31:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tests

### Summary
把 `node --check` 直接用于 `.html` 文件会失败，因为 Node 只支持检查 JavaScript 输入。

### Error
```
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".html" for /Users/yin/pto/launch.html
```

### Context
- Command/operation: `node --check launch.html`
- Goal: 校验 `launch.html` 内联脚本语法
- 实际情况: 需要先提取 `<script>` 内容，或改用浏览器级检查方式

### Suggested Fix
对 HTML 页面使用脚本提取方式做语法校验，例如先抽取最后一个 `<script>` 再交给 `node --check`。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md, launch.html, visual-test.html

---

## [ERR-20260311-001] safaridriver-enable

**Logged**: 2026-03-11T14:17:29+08:00  
**Priority**: medium  
**Status**: pending  
**Area**: tests

### Summary
尝试用 Safari WebDriver 做 `visual-test.html` 截图验收时，`safaridriver` 因未启用远程自动化而无法启动会话。

### Error
```
RuntimeError: safaridriver did not start
Password:
```

### Context
- Command/operation: 启动 `safaridriver -p 4445` 并通过 WebDriver 打开 `http://127.0.0.1:8123/visual-test.html`
- 实际情况: 本机需要先执行 `safaridriver --enable`，且该命令要求管理员密码交互
- 影响: 当前会话只能完成静态语法校验，不能完成浏览器截图验收

### Suggested Fix
在本机管理员已启用 Safari Remote Automation 后，再运行浏览器级截图/DOM 验收脚本；或安装无交互的 headless 浏览器工具链用于本地验收。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md, visual-test.html

---

## [ERR-20260311-002] qlmanage-svg-preview

**Logged**: 2026-03-11T16:32:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tests

### Summary
尝试用 `qlmanage -t` 将本地 SVG 设计稿转成 PNG 预览时，在当前 Codex 沙箱内失败。

### Error
```
sandbox initialization failed: Operation not permitted
```

### Context
- Command/operation: `qlmanage -t -s 1600 -o /tmp /Users/yin/Downloads/L2.svg`
- Goal: 把 `L2.svg` / `L2_attention_expand.svg` 转成位图，便于在会话中直接查看设计稿
- 实际情况: 当前环境不允许 `qlmanage` 初始化其所需沙箱能力，只能退回 SVG 源码坐标分析

### Suggested Fix
后续若需要在本地自动验收 SVG 设计稿，优先使用仓库内可执行的纯前端/Node 渲染方案，避免依赖 `qlmanage`。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md

---

## [ERR-20260319-001] parallel-mv-dir-race

**Logged**: 2026-03-19T10:07:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: config

### Summary
在同一轮并行工具调用里同时创建目录并执行 `mv`，会因为执行时序不确定导致部分移动命令先于 `mkdir` 运行。

### Error
```
mv: rename /Users/yin/pto/index.html to /Users/yin/pto/pass-ir/index.html: No such file or directory
```

### Context
- Command/operation: 使用并行工具同时执行 `mkdir -p /Users/yin/pto/pass-ir ...` 和多个 `mv`
- Root cause: 目录创建与依赖该目录的移动命令不应并行
- Impact: 只有 `pass-ir/index.html` 这一步失败，其他目录移动已完成

### Suggested Fix
后续涉及“先建目录再移动文件”的操作时，先顺序完成 `mkdir -p`，再批量执行 `mv`；不要把存在依赖关系的 shell 命令放进同一个并行调用。

### Metadata
- Reproducible: yes
- Related Files: .learnings/ERRORS.md

---
## [ERR-20260402-503] subagent_service_unavailable

**Logged**: 2026-04-02T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: tooling

### Summary
Remote subagent worker creation/execution returned 503 Service Unavailable during preview generation.

### Error


### Context
- Operation attempted: spawn/wait worker agents to generate existingUI_preview files
- Affected runs: three worker agents in one batch
- Environment: Codex collaboration agent service

### Suggested Fix
Fallback to local edits when collab worker service is unstable; reserve agents for analysis, not required-path writes.

### Metadata
- Reproducible: unknown
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260402-503] subagent_service_unavailable

Logged: 2026-04-02T00:00:00+08:00
Priority: medium
Status: pending
Area: tooling

Summary: Remote subagent worker execution returned 503 Service Unavailable during preview generation.
Error: unexpected status 503 Service Unavailable
Context: spawn/wait worker agents to generate existingUI_preview files.
Suggested Fix: fallback to local edits when collab worker service is unstable.

---

## [ERR-20260528-001] rtk-find-compound-predicate

**Logged**: 2026-05-28T14:39:39+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
`rtk find` does not support compound predicates such as grouped `-path` / `-o` expressions.

### Error
```
rtk: rtk find does not support compound predicates or actions (e.g. -not, -exec). Use `find` directly.
```

### Context
- Command/operation attempted: listing PTO design-system token/css files with a compound `find` predicate under `rtk`
- Environment: `/Users/yin/pto` planning task

### Suggested Fix
Use simple `rtk ls` / separate `rtk find` calls, or plain `find` only when compound predicates are necessary.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260528-002] rg-leading-dash-pattern

**Logged**: 2026-05-28T17:20:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
`rg` treats a search pattern that starts with `--` as a flag unless the pattern separator `--` is provided first.

### Error
```
rg: unrecognized flag --text-|--font-size|\.btn|\.badge|\.panel-shell|\.inspector-section|\.nav-
```

### Context
- Command/operation attempted: searching PTO design-system CSS for token and class names
- Root cause: the regex alternation began with `--text-`, so ripgrep parsed it as an option

### Suggested Fix
Use `rg -n -- '<pattern>' <paths>` whenever the pattern can start with a dash.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260617-001] rtk-test-file-check

**Logged**: 2026-06-17T17:21:18+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
`rtk test -f <path>` is not a reliable file-existence check in this environment; it can surface shell built-in usage output instead of a simple pass/fail.

### Error
```
OUTPUT (last 5 lines):
  	--version
  	--wordexp
  Shell options:
  	-irsD or -c command or -O shopt_option		(invocation only)
  	-abefhkmnptuvxBCHP or -o option
```

### Context
- Command/operation attempted: verifying `/Users/yin/pto/vendor/pto-design-system/patterns/swimlane-task/pattern.js` exists after adding a whitepaper dependency
- Environment: Codex with RTK command prefix requirement

### Suggested Fix
Use `rtk ls -l <path>` or `rtk rg --files <root>` for existence checks instead of `rtk test -f`.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260618-001] shell-quoted-rg-pattern

**Logged**: 2026-06-18T11:18:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
An `rtk rg` line-number lookup failed because the shell command used an unmatched double quote while the search pattern also contained backticks and quotes.

### Error
```
zsh:1: unmatched "
```

### Context
- Command/operation attempted: final line-number lookup across UB Fabric files after UI edits
- Root cause: composing a broad regex with embedded quote-sensitive text directly inside a shell double-quoted command

### Suggested Fix
Use simpler separate `rg` calls, single-quoted patterns without embedded single quotes, or avoid quote-heavy fragments when the lookup is only for final references.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260618-002] rtk-find-compound-predicates

**Logged**: 2026-06-18T12:32:00+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
`rtk find` does not support ordinary `find` compound predicates or some flags, so design-system file discovery failed when using `-path`, `-o`, and similar expressions.

### Error
```
rtk find: unknown flag '-path', ignored
rtk: rtk find does not support compound predicates or actions (e.g. -not, -exec). Use `find` directly.
```

### Context
- Command/operation attempted: locating PTO design-system token files from `/Users/yin/pto`
- Environment: Codex with RTK command prefix requirement

### Suggested Fix
Use `rtk rg --files <root>` followed by `rtk rg '<filename-pattern>'`, or call plain `find` only when the RTK wrapper restrictions are acceptable for the task.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/.learnings/ERRORS.md

---

## [ERR-20260624-001] chrome-computer-use-apple-event-auth

**Logged**: 2026-06-24T03:45:09Z  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
Computer Use could not inspect Google Chrome after opening a local preview because macOS rejected the Apple event for authentication.

### Error
```
Apple event error -10000: Sender process is not authenticated
```

### Context
- Operation attempted: `mcp__computer_use.get_app_state` for `com.google.Chrome`
- Page being verified: `http://127.0.0.1:8788/launch_test.html`
- Environment: macOS Chrome automation through Codex Computer Use

### Suggested Fix
When this appears, rely on HTTP/static validation and direct browser opening, or use an already authorized browser automation surface if available.

### Metadata
- Reproducible: unknown
- Related Files: /Users/yin/pto/launch_test.html

---

## [ERR-20260701-001] playwright-cache-browser-missing

**Logged**: 2026-07-01T10:13:02+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
Playwright was importable from Node, but its cached Chromium executable was missing, so headless verification failed before page launch.

### Error
```
browserType.launch: Executable doesn't exist at /Users/yin/Library/Caches/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell
```

### Context
- Operation attempted: headless Playwright verification for `http://127.0.0.1:8779/ai-cpu-aicore/index.html`
- Environment: Codex Node REPL on macOS
- Impact: default Playwright browser launch failed even though the package was installed

### Suggested Fix
Prefer launching Playwright with the system Chrome executable when available, or explicitly install Playwright browsers before relying on the default cached executable.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/ai-cpu-aicore/index.html

---

## [ERR-20260701-002] shell-dollar-expansion-in-node-e

**Logged**: 2026-07-01T14:06:40+08:00  
**Priority**: low  
**Status**: pending  
**Area**: tooling

### Summary
An inline `rtk node -e` Playwright verification failed because zsh expanded `$eval` inside a double-quoted command string before Node received it.

### Error
```
Expected ident
SyntaxError: Unexpected token '('
```

### Context
- Command/operation attempted: Playwright page verification using `page.$eval(...)`
- Environment: zsh command passed through `rtk node -e`
- Impact: the generated JavaScript became `page.(...)`, so verification failed before opening the page

### Suggested Fix
Use `page.locator(selector).evaluate(...)`, escape `$`, or wrap the inline JavaScript so the shell cannot expand `$eval`.

### Metadata
- Reproducible: yes
- Related Files: /Users/yin/pto/ascend-hardware-map/ascend-hardware-map-v3.html

---
