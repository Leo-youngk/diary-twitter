# 同步到 Substack Notes 与 Threads

## 为什么经 Buffer

- Substack 和 Threads 都没有对个人开放、可直接接入的发布接口。Substack 2026 年初的官方 Developer API 只能按 LinkedIn 账号查创作者公开资料，官方 MCP 只读；它官方认可的代发工具是 Typefully 和 Buffer（9 月 23 日宣布）。
- Buffer 的 GraphQL API 已支持两者：`Service.substack`（9 月 3 日）、`Service.threads`，以及 `metadata.substack` / `metadata.threads`（Threads 可发串、可附链接卡片）。本应用发 X 本来就走 Buffer，同一个 API key 即可。
- Buffer 免费版可连 3 个频道，正好是 X、Substack、Threads；API 每 15 分钟 100 次、每天 250 次、每 30 天 3000 次。
- 带登录 cookie 调网页接口的非官方做法没有采用：服务条款禁止，接口也随时会变。

## 三个平台互不干涉

- 每个平台有自己的「发帖时默认同步到 …」开关（X 默认开，Substack、Threads 默认关），写帖页有三个独立的开关，默认值各取各的设置。帖子上的 `xSync` / `substackSync` / `threadsSync` 分别记录，互不影响。
- 追加在每个平台上分别跟随原帖：原帖发到了这个平台、且这个平台的默认开关开着，追加才会发过去。
- 保存后的帖子可以在「…」菜单里分别「同步到 X / Substack / Threads」，各自是一个明确的请求，不受「超过 3 天」的限制。
- 服务器上每个平台是独立的 D1 任务（`x`、`substack`、`threads`），各自的账本（`diary3_x`、`diary3_substack`、`diary3_threads`）、同步表（`xposts`、`substackposts`、`threadsposts`）、冷却时间（`buffer_retry_at`、`substack_retry_at`、`threads_retry_at`）和数据表。一个平台失败、限流或没有连接，不会挡住另外两个。
- X 原有的投递代码没有改动；Substack 和 Threads 共用一个按平台参数化的模块（`worker/delivery/channel.ts`），平台之间只有发帖内容的组织方式不同。

## 各平台怎么发

- **Substack**：用 + 写的几条合成一条 Note（段落之间空一行；一条 Note 最多 10,000 字）。追加单独发一条，带指向原 Note 的链接卡片。
- **Threads**：每条最多 500 字（写帖页的计数器和提示会按 500 字提醒）。用 + 写的几条作为一个串发出，后一条回复前一条。追加单独发一条，带指向原帖的链接卡片。
- 都只发文字；原帖失败时追加也标为失败，不单独发；Buffer 没返回原帖链接时，追加照常发，只是不带卡片。

## 投递规则（与 X 相同）

- 账本是唯一的事实来源。发送前先提交 `sending`；结果不明一律标失败，请用户先到对应平台确认，不自动重发。对已有 Buffer ID 的重试，先查询它在 Buffer 的状态。
- 同步表里设备只能提交 `command`（send/retry/dismiss），状态、链接和数据都由服务器写入。
- 超过 3 天的帖子不自动发；限流和当天发帖上限这类明确的暂时拒绝会退避重试。
- 从备份恢复不会把帖子发到任何平台：只保留账号里原本就有的标记。
- 某个平台从没打开过开关、账本也为空时，它的任务不读取日记库，直接结束。

## 频道与数据

- 不需要新的密钥或配置。服务器用现有的 `BUFFER_API_KEY` 找到 Buffer 里已连接、未锁定、未断开的 Substack / Threads 频道，并把频道 ID 分别缓存在 `diary3_meta`。没找到时，待发条目标为失败并提示去 Buffer 连接；之后最多每小时自动再查一次，点重试会立即再查。Buffer 明确拒绝一次发布时清除缓存，以便频道重连后重新找到。
- 统计页顶部分为 X / Substack / Threads 三页。X 页保持原样（数据来自 X 的公开数字）。Substack、Threads 页显示所选时间段内发出的条数、浏览、赞、回复、转发（Threads 另有引用，Substack 另有 Note 带来的新订阅），以及逐条数据和链接。
- Substack、Threads 的数据来自 Buffer 的帖子数据接口：各平台的任务每 6 小时最多读一次，一次请求覆盖该频道最近 50 条已发帖子，只为最近 30 天发出的帖子更新，写入各自的 `substackmetrics` / `threadsmetrics`。Buffer 每天从平台读取一次，刚发出的帖子最多要 24 小时才有数据；平台没有提供的数字显示为 —，不会当成 0。

## 上线步骤

1. 在 Buffer 网页里连接 Substack 和 Threads（先在同一个浏览器登录对应账号）。Buffer 的旧套餐需先升级才能连接 Substack。
2. 部署本版本。`diary3_substack`、`diary3_threads` 表和对应任务由协调器首次运行时自动补齐，也已写进 `migrations/0001_diary.sql`。
3. 在 App 设置里打开「发帖时默认同步到 Substack」「发帖时默认同步到 Threads」，发一条新帖确认。

## 验证

- Vitest 25 个文件、230 项测试通过；类型检查、lint 和生产构建通过。
- D1 测试覆盖：Substack 整帖一条 Note、Threads 整帖一个串、追加带原帖链接卡片、原帖失败时追加不单发、缺少频道的提示与重试后重新查找、旧帖需明确发送、发送前提交 `sending` 与中断不重发、各平台只处理选了它的帖子、一个平台缺频道或限流不影响另一个、数据每 6 小时最多读一次并写入各自的表、旧数据库自动补表、未使用的平台不读取日记库。
- 客户端测试覆盖：发帖时三个开关各自生效、追加按平台分别跟随、保存后的帖子按平台单独补发、备份恢复不触发任何平台、设备只上传命令字段、统计汇总只累加平台报告过的数字。
- 本地开发服务器（Vite + workerd + 本地 D1）实际走通：设置里三个独立开关；写帖页关掉 X、保留 Substack 和 Threads 后，计数器按 500 字显示；发布后两个平台各自生成账本记录并回传状态（本地没有 Buffer key，按预期显示失败与重试），X 显示「未同步」；统计页三个平台可切换，X 页内容不变。
