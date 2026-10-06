# 同步到 Substack Notes

## 为什么经 Buffer

- Substack 没有对所有人开放的发布接口：2026 年初的官方 Developer API 只能按 LinkedIn 账号查创作者公开资料，且需人工审批；官方 MCP 只读。
- Substack 官方认可了两家代发 Notes 的工具：Typefully（今年夏天）和 Buffer（9 月 23 日宣布）。Buffer 的 GraphQL API 在 9 月 3 日加入 `Service.substack`，9 月 7 日加入 `metadata.substack`。
- 本应用发 X 本来就走 Buffer，同一个 API key、同一套投递账本规则即可接入。Buffer 免费版支持 Substack，可连 3 个频道；API 每 15 分钟 100 次、每天 250 次、每 30 天 3000 次。
- 带登录 cookie 调 Substack 网页接口的非官方做法没有采用：Substack 服务条款禁止反向工程和「未登录时运行的进程」，接口也会随时变。

## 行为

- 设置里新增「发到 X 的帖子也发到 Substack」，默认关闭。打开后，新帖如果同步到 X，会同时打上 `substackSync`，由服务器发成一条 Substack Note；暂不同步 X 的帖子也不会发到 Substack。
- 用 + 写的几条合成一条 Note（段落之间空一行）：一条 Note 可写 10,000 字，不需要串推。
- 追加在原帖的 Note 发出后单独发一条，附上指向原 Note 的链接卡片。原帖失败时追加也标为失败，不单独发出；Buffer 没返回原 Note 链接时，追加照常发，只是不带卡片。
- 保存后再点「同步到 X」的旧帖，如果 Substack 开关是打开的，会用同一个明确请求一并发到 Substack，因此不受「超过 3 天」的限制。
- 只发文字，不发图片和长文（Buffer 只支持 Notes）。在应用里编辑或删除，不会改动 Substack 上已发出的内容。
- 帖子、追加和设置页都会显示 Substack 状态。已发出的帖子详情里有「查看 Note」，失败可以重试或放弃。

## 投递规则（与 X 相同）

- `diary3_substack` 是账本，也是唯一的事实来源。发送前先提交 `sending`；请求结果不明一律标失败，请用户先到 Substack 确认，不自动重发。对已有 Buffer ID 的重试，先查询它在 Buffer 的状态，确认是草稿或失败才重新发。
- 账本镜像到同步表 `substackposts`。设备只能提交 `command`（send/retry/dismiss），状态和链接都由服务器写入。
- 超过 3 天的帖子不自动发，需要手动确认；限流或当天发帖上限这类明确的暂时拒绝会退避重试，并与 X 共用 `buffer_retry_at` 冷却（Buffer 的额度按 API key 计算）。
- 从备份恢复不会把帖子发到 Substack：和 X 一样，只保留账号里原本就有的标记。
- Substack 是独立的 D1 任务（`substack`），有自己的租约和下次运行时间。每次编辑都会唤醒它，但从没打开过开关、账本也为空时，它不读取整个日记库，直接结束。

## Substack 频道

- 不需要新的密钥或配置。服务器用现有的 `BUFFER_API_KEY` 找到 Buffer 里已连接、未锁定、未断开的 Substack 频道，并把频道 ID 缓存在 `diary3_meta.substack_channel`。
- 没找到频道时，待发的条目会标为失败，提示「Buffer 里还没有连接可用的 Substack 频道」；之后最多每小时自动再查一次，用户点重试会立即再查。查询本身失败时 5 分钟后再试。
- Buffer 明确拒绝一次发布时清除频道缓存，以便频道重新连接、ID 变了之后能重新找到。

## 上线步骤

1. 在 Buffer 网页里连接 Substack（先在同一个浏览器登录 Substack）。Buffer 的旧套餐需先升级才能连接 Substack。
2. 部署本版本。`diary3_substack` 表和 `substack` 任务由协调器首次运行时自动补齐，也已写进 `migrations/0001_diary.sql`；按惯例重新执行该文件同样安全。
3. 在 App 设置里打开「发到 X 的帖子也发到 Substack」，发一条新帖确认。

## 验证

- Vitest 24 个文件、222 项测试通过；类型检查、lint 和生产构建通过。
- 新增覆盖：整帖合成一条 Note 且只发一次、无关帖子不请求 Buffer、追加带原 Note 链接卡片、原帖失败时追加不单发、缺少频道的提示与重试后重新查找、旧帖需明确发送、发送前提交 `sending` 与中断不重发、限流冷却、旧数据库自动补表并作为独立任务运行、开关未使用时不读取日记库、备份恢复不触发发布、设备只上传命令字段，以及发帖、追加和补发时的标记。
- 用变异检查确认测试有效：去掉 `sending` 提交、丢掉 + 的段落、去掉链接卡片、重试后不再重新查频道，各有一项测试失败。
- 本地开发服务器（Vite + workerd + 本地 D1）实际走通：打开开关后写帖页同步按钮显示 X 与 Substack 图标；发布后服务器生成账本记录，并把状态回传到帖子和设置页（本地没有 Buffer key，按预期显示失败与重试）。未连接真实 Buffer/Substack 做线上发布。
