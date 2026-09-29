# 重建方案（2026-09-29）

目标：保留现在的推特风格界面与交互，换掉底层，让「稳、流畅、不丢数据」成为结构上的保证，而不是靠补丁。
记账功能下线。旧版最后一个提交打了标签 `legacy-final`，随时可回退。

## 1. 为什么重建

| 问题 | 旧架构的根源 |
|---|---|
| 多设备会静默丢记录 | 整份快照按时间戳覆盖 |
| 点赞上传 865KB、加图后同步会永久失败 | 头像/背景/配图以 base64 塞在同一份快照里 |
| 返回丢位置、右滑返回失效 | Next 路由切页会卸载首页 |
| 切回前台不刷新 | 只在冷启动拉一次 |
| 构建部署脆弱 | 纯前端应用跑在为服务端渲染设计的 Next + OpenNext 上，Windows/中文路径问题 |

## 2. 新架构

```
iPhone / 桌面浏览器
  Vite + React + Tailwind（推特风格组件移植）
  Stackflow 页面栈（上一页常驻、iOS 转场、边缘右滑返回）
  TinyBase MergeableStore ──IndexedDB（离线可用）
        │  WebSocket（断线自动重连，回前台立即补同步）
        ▼
Cloudflare Worker（同一个 diary-app）
  /api/sync/:code   校验同步码 → Durable Object
  /api/blob/:code/:hash   图片（KV，按内容哈希）
  静态资源（SPA 回退）
        │
  Durable Object「DiarySpace」（每个同步码一个）
    TinyBase 服务端副本（DO SQLite 持久化）
    X（经 Buffer）投递账本 / Obsidian 投递账本（DO SQLite，同步写）
    Alarm：去抖后对账投递、失败退避重试、刷新 X 发布状态、每日备份到 KV
```

### 数据模型（TinyBase）

- `posts`：entryType, category, title, content, images（JSON 字符串，元素是 `blob:<sha256>`）, createdAt（ISO）, isLiked, xSync
- `replies`：postId, content, createdAt（ISO）, xSync —— 回复独立成表，两台设备同时追加不会互相覆盖
- `xposts`（服务端写，客户端只写 `command`）：state, link, error, kind, command，以及 Buffer 回报的曝光/点赞/回复/转发
- `goals`（每日目标）：day（本地日期 YYYY-MM-DD）, text, done, createdAt —— 按天建索引，一天的清单只在自己变化时重绘
- values：displayName, username, bio, avatar, banner, joinedDate, birthDate, xSyncEnabled（跟账号同步）
- 设备级偏好（主题、字号、字体）仍在 localStorage，首帧前由内联脚本应用

合并规则由 TinyBase 的 CRDT 保证：按单元格合并，两台设备改不同条目/不同字段都会保留；同一字段以后写者为准。

### 同步码与鉴权

同步码（沿用现在 localStorage 的 `diary-sync-id`）就是唯一凭据，入口 Worker 校验格式后才转发给对应的 Durable Object。库本身不做鉴权，这里自己做。

### 外部同步：至多一次、可对账

- **X**：新随想（`xSync`）和已同步帖子下的新回复进入 `x_ledger`。发送前先把状态同步写成 `sending`；Buffer 明确拒绝且属于限流/当日上限的，自动退避重试；结果不明的一律标失败，让用户确认，不自动重发。回复以「引用原帖」发出（`retweet.id + comment`，已线上证实）。状态镜像到 `xposts` 表，卡片上直接显示 X 标记、点开是推文。
- **Obsidian**：沿用原来的事件格式和版本哈希算法（保证与旧版一致），`obsidian_ledger` 记录每条已投递的版本，对账出差异才投递，失败退避。
- 两者都由 Durable Object 的 Alarm 驱动，不依赖 App 开着。

### 旧数据迁移（一次性、服务端）

某个同步码第一次连上时，Durable Object 从 KV `diary:{code}` 导入：
1. 帖子、回复、资料；头像/背景/配图从 base64 转存 KV 图片。
2. 旧的 `diary:x-posted:*` 标记导入 `x_ledger`（已发过的不会再发，引用回复能找到原推）；有 `xSync` 却没有标记的，记为失败待确认，绝不自动发。
3. 用当前内容的哈希给 `obsidian_ledger` 播种，Obsidian 不会被重推 164 条。

旧 KV 数据只读、不改，重建前另有一份不过期的备份。

### iOS 细节（沿用已验证的做法）

不透明状态栏 + `apple-mobile-web-app-capable`；禁双指缩放；`touch-action: pan-y` 禁横滑；滚动到边界不橡皮筋（触摸守卫移植）；输入框字号 ≥16px。
写作页全屏弹出，发布按钮在右上角，不会被键盘挡住。

### 下线与清理

记账、标签/心情（0 条使用、无入口）、首页「＋分类」、桌面右栏统计（改为左侧栏 + 居中单栏）。

### 2026-09-30 调整：只写随想

用户现在只在这里发随想，不再写日记、看英文。据此：

- 去掉「类型」这个概念：首页不再分 tab，帖子上不再有类型标签，写帖页没有随想/日记/分类选项；新帖一律是随想。
- 去掉英文阅读（阅读器、每日文章、`/api/article`、内置演讲数据）、搜索、自定义分类。
- 分类原来兼管「这条不发 X」，改为写帖页一个默认打开的 X 开关（默认值取设置里的总开关）。
- 旧数据原样保留：`entryType` / `category` / `title` 不迁移（Obsidian 的版本哈希依赖它们），旧日记照常显示标题、长文折叠为「阅读全文」，旧分类以灰色小字显示。
- 底部导航：首页 / 目标 / 发帖 / 日历 / 统计。「目标」是新加的每日目标：按天写清单、点圆圈打卡、周条上看每天的完成环、昨天没完成的可一键带到今天；统计页有完成率、全部完成天数、连续天数。
- 统计页新增每天发帖数（今天、日均、连续发帖、每天/每月柱状图）。
- 目标暂不同步 Obsidian：接收端虽支持 `daily_goal`，但会给每条目标单独起一个「## 每日目标」标题，笔记会很乱；需要时再开。

## 3. 步骤

1. 骨架：Vite 前端 + Worker + Durable Object + TinyBase 同步，本地两个标签页互相同步。
2. 本地端到端测试：假 Buffer / 假 Obsidian 服务，验证导入不重复投递、断线重连、离线编辑。
3. 移植全部界面：时间线（虚拟列表）、写作、详情/回复、日历/人生周历、每日目标、统计、我的记录/导出、设置/备份/X 卡片。
4. 部署到 staging（`diary-app-next`，独立数据，只读旧 KV，不配 X/Obsidian 密钥），用真实数据导入演练。
5. 用户 iPhone 真机验收：右滑返回、滚动、键盘、离线、两台设备同步。
6. 切换：新版部署到 `diary-app` 同名（网址不变、图标不用重装），核对条数、X 标记、Obsidian 无重复。

## 4. 回退

`git checkout legacy-final && npm run deploy` 即回到旧版；旧 KV 数据未动。切换后在新版里新写的内容需要先用「完整备份」导出再回退。
