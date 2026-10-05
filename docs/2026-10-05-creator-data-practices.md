# 别人怎么用数据养号：保留什么、哪些有用、下一步还能拿到什么

调研日期：2026-10-05。本文补充 [冷启动调研与统计页重做](./2026-10-04-cold-start-redesign.md)，不改页面。重做说明里提到「将来取得真实主页访问与逐帖关注数据后，才分析『看见 → 主页 → 关注』的承接」，本文第 5 节给出现在就能拿到主页点击的办法和成本。

## 1. 结论

1. **平台和工具都不会替你保存历史。** X 的非公开指标只对 30 天内的帖子开放，各家工具都靠自己定时快照来留下历史。本项目的 `xmetrics`（30 分钟 / 2 小时 / 24 小时 / 48 小时）走的是同一条路。
2. **成熟工具的共同做法**：
   - 抓帖子的头几个小时；
   - 拿账号自己的基线比较；
   - 从「主页访问 → 关注」看转化；
   - 定期按内容类型复盘。

   其中「主页访问」和「逐帖关注」两项，只有 X 自己（Premium 分析、X API）能给。
3. **能改变下一步行动的数据**：
   - 同龄表现和自己的基线比，高了还是低了；
   - 哪些帖子收到了他人的具体互动；
   - 原创和回复两个入口，各自带来了什么；
   - 主页点击（目前拿不到）。

   **虚荣指标**：
   - 累计浏览、粉丝总数；
   - 行业平均互动率；
   - 通用的「最佳发帖时间」。
4. **最值得做的下一步**：用 X 按量计费 API 读取自己帖子的 `user_profile_clicks`。按现在的发帖量，每月约 2 美元，新账号的赠送额度可以覆盖头 3 个月。前提是开 X 开发者账号并充值，需要你来决定。

## 2. 别人保留了什么、保留多久

| 谁 | 保留什么 | 多久 / 多频 | 来源 |
| --- | --- | --- | --- |
| X API | 公开指标随时可读；`non_public_metrics`（主页点击、链接点击、互动）和 `organic_metrics` 只对 30 天内、自己的帖子开放，需要账号本人授权 | 30 天 | [X 文档：Metrics](https://docs.x.com/x-api/fundamentals/metrics) |
| X 分析页 | 曝光、互动率、主页访问、视频、链接点击等。2024 年 6 月起只给 Premium 用户 | — | [Social Media Today](https://www.socialmediatoday.com/news/x-launches-advanced-analytics-for-premium-subscribers/718957/) |
| Typefully | 粉丝数每 45 分钟一次；单帖发出后 2 小时内每小时一次，2 天内每 6 小时一次，第 3 天最后一次；默认显示 30 天 | 30 天，更久要联系客服 | [Typefully 帮助中心](https://support.typefully.com/en/articles/8718148-analytics-page-metrics) |
| Buffer Analyze | 接入时回填 30 天；单帖指标 20 天后停止更新；数据来自 Gnip 和 X API v2 | 20 天 | [Buffer 帮助中心](https://support.buffer.com/article/522-twitter-metric-descriptions) |
| Social Blade | 曾提供 X 账号的每日粉丝变化、30/90/365 天曲线。据第三方报道，2025 年因 API 成本停止支持 X | 已停止 | [twtdata（第三方）](https://twtdata.com/blog/social-blade-alternative-twitter/) |
| Black Magic | 每条推文和账号平均对比，侧栏估算单帖带来的关注。2026 年 7 月 1 日关停 | 已关停 | [contentcreators.com](https://contentcreators.com/tools/blackmagic)、[blackmagic.so](https://blackmagic.so/tips) |

**共同的教训**：数据要在当时存下来，错过就补不回。粉丝曲线只能从开始记录那天画起，帖子在某个时点的数字也只能在那个时点读。重做说明里坚持「旧帖不补造历史」，和这一点一致。

**为什么是这些时点**：慕尼黑工业大学的研究显示，推文曝光半衰期的中位数约 80 分钟；约 95% 的推文在 24 小时后已没有可观的曝光（[The Half-Life of a Tweet](https://arxiv.org/abs/2302.09654)）。前 2 小时的密集读数和 24 小时、48 小时的同龄节点，能覆盖一条帖子的大部分生命周期。

## 3. 共同做法，以及对本项目是否适用

**和自己的基线比，不和别人比**
- YouTube 把一个视频和你最近 10 个相近时长视频的「典型表现」对比（[YouTube 帮助](https://support.google.com/youtube/answer/12942217)）。
- Black Magic 把新推文和账号平均对比。
- Dickie Bush 每周先发 8–10 条单条推试题目，展开互动最高的 2 条。他平常一条约 300 赞，某条拿到 1,600 赞时，他就把那条当成值得展开的信号（[Growth In Reverse](https://growthinreverse.com/dickie-bush/)）。
- **适用**：本项目的 24 小时同龄比较已经是这种做法。要注意比较的必须是同一时点的读数。

**主页转粉**
- Typefully 的「主页转粉率」= 新增关注 ÷ 主页访问，并注明只统计从推文进入主页的访客。
- 中文圈的复盘看三个指标：主页访问数、互动率、关注转化率，并每 7 天复盘一次（[52by 涨粉指南](https://www.52by.com/article/187623)）。
- 也有作者把改造主页列为发关键推文前的第一步（[X 文章](https://x.com/AI_Jasonyu/article/2025943474156249308)）。
- **适用但缺数据**：这个指标需要主页访问作分母，FxTwitter 给不了。见第 5 节。

**逐帖涨粉**
- Black Magic 侧栏的「Gained Followers」是估算。
- Tweet Hunter 列出「带来最多关注」的推文（[Niche Pursuits 评测](https://www.nichepursuits.com/tweet-hunter-review/)）。
- **不适用**：仅凭公开的粉丝净变化无法归因到某一条帖子，重做说明已明确不做。X API 也没有逐帖新增关注这个字段（见上面的 Metrics 文档），只有 X 自己的分析页才有。

**按内容类型复盘**
- Justin Welsh 每条内容记日期、链接、内容类型，按 1–10 分打分，高分内容每 6 个月复用一次（[Justin Welsh](https://www.justinwelsh.me/newsletter/build-a-content-library)）。
- **部分适用**：本项目试过人工分类和实验登记。在冷启动阶段，这些操作的收益不抵负担，已经删掉。现在「从有真实互动的帖子里挑素材」是更轻的版本。

**挑回复对象**
- ReplyWisely 的作者按五项给待回复的帖子打分：作者影响力、新鲜度、互动增长速度、已有回复的拥挤程度、是否同领域。他统计了 172 条回复：评分为绿的帖子下，回复平均每小时 0.6 个赞；其余接近 0（[ReplyWisely](https://replywisely.com/blog/x-follower-count-history)）。
- 这是工具方的自述，不是对照实验。重做说明里 Rakesh Reddy 的失败案例也说明，高浏览可能集中在极少数回复上。
- **可以低成本先存数据**，见第 5 节第 2 条。

## 4. 哪些数据有用，哪些是虚荣

**有用（能改变下一步）**

| 数据 | 改变什么决定 |
| --- | --- |
| 同龄浏览和互动，和自己的基线比 | 这个方向值不值得继续写 |
| 收到他人具体互动的帖子 | 下一条展开什么 |
| 原创和回复两个入口的浏览与互动 | 时间花在写原创上，还是花在参与讨论上 |
| 主页点击（缺） | 帖子把人带到主页之后，主页能不能接住 |

**虚荣或误导**
- **累计浏览、粉丝总数**：只说明结果，不说明下一条怎么写。
- **行业平均互动率**：Rival IQ 2025 年报告里，品牌在 X 上每帖互动率的中位数只有零点零几个百分点，而且按粉丝数计算（[Rival IQ](https://www.rivaliq.com/blog/social-media-industry-benchmark-report/)）。对几十粉的个人号没有参考意义。
- **通用的「最佳发帖时间」**：这是全平台的平均，不如自己的同龄数据。
- **粉丝净变化 ÷ 浏览**：看起来像转化率，实际不是。重做说明已明确不做。

## 5. 本项目能拿到什么，下一步

### 现有数据源

- **FxTwitter**（免费，在用）。2026-10-04 实际请求 `api.fxtwitter.com/2/profile/{handle}/statuses?with_replies=1` 时确认：
  - 返回浏览、赞、回复、转发、引用、收藏，以及媒体（`media.photos` / `media.videos`）、链接卡片（`card`）、引用（`quote`）、长文（`is_note_tweet`）、语言（`lang`）、社区笔记（`community_note`）、作者粉丝数（`author.followers`）。
  - 带回复的时间线**会把被回复的那条帖子也一起返回**，包括它的作者和粉丝数。
- **Buffer API**：帖子指标只能用个人 API key 读（[Buffer 文档](https://developers.buffer.com/guides/post-metrics.html)）。
  - 每天更新一次，新帖最长要 24 小时才出数。
  - X 帖子归一化后是赞、评论、转发、曝光、点击这一类，和 FxTwitter 重复；按帖归属的 `follows` 只有 Instagram 才有。
  - 免费版额度是每 24 小时 250 次请求（[限额](https://developers.buffer.com/guides/api-limits.html)）。**不值得接**。

### 下一步 1：用 X API 读取主页点击（需要你来决定）

- **能拿到什么**：自己 30 天内帖子的 `non_public_metrics`，包括 `user_profile_clicks`（从这条帖子点进主页的次数）、`url_link_clicks`、`engagements`（[X 文档](https://docs.x.com/x-api/fundamentals/metrics)）。拿不到逐帖新增关注。
- **价格**：按量计费，读自己的帖子每条 0.001 美元（[价格页](https://docs.x.com/x-api/getting-started/pricing)）。
  - 新账号保存第一张卡送 20 美元，第一次自动充值再按充值额最多送 50 美元；赠送额度 3 个月后过期（[免费额度](https://docs.x.com/x-api/getting-started/free-credits)）。
  - 据第三方报道，按量计费从 2026 年 2 月开始，旧的月费套餐已不再对新开发者开放（[Sorsa](https://api.sorsa.io/blog/twitter-api-pricing-2026)）。
- **成本估算**：重做说明里 2026-10-04 的观测是近 7 天 92 条原创、21 条对外回复，约每天 16 条。
  - 只在现有 4 个时点各读一次：每天约 65 次，约 0.065 美元，每月约 2 美元。
  - 一次请求最多可查 100 条，但按条计费。
- **认证**：在 [X 开发者后台](https://docs.x.com/fundamentals/developer-apps) 建应用，为自己的账号生成 Access Token & Secret（OAuth 1.0a，代表开发者本人的账号发请求，[说明](https://docs.x.com/fundamentals/authentication/oauth-1-0a/overview)）。连同 API Key & Secret 一起存成 Worker 密钥，服务器端用 HMAC-SHA1 签名请求。不需要做网页授权流程。
- **在本项目里怎么接**：
  - 在 `xmetrics` 现有的 m30、h2、h24、h48 观察点，同时读一次 X API，把 `profileClicks`、`linkClicks` 记进同一行，沿用有效位，缺失不当作 0。
  - 页面可以多一行「主页点击 / 浏览」的同龄比较。
  - 仍然不能断言哪条带来了关注；但能看出哪类帖子会把人带到主页。主页能不能接住，再看同一时段的关注变化，两者不串成因果。
- **风险**：
  - API 价格和规则近两年变动频繁；
  - 访问令牌泄露等于账号被代为读写，应用权限应只开「读」；
  - 赠送额度过期后需要持续付费。

### 下一步 2：记下回复的上下文（免费，事后补不回）

- **记什么**：服务器读带回复的时间线时，被回复的帖子已经在同一页里。可以在回复那一行顺便存下两项：被回复账号当时的粉丝数，以及原帖发出多久后你回复的。
  - 账号规模会变，原帖时间以后也要再查，所以只能在当时存。
  - 不多发请求，D1 写入几乎不变。
- **能回答什么**：去多大的号、多新的帖子下回复，更容易收到他人互动。
- **证据很弱**：ReplyWisely 是工具方的自述，Rakesh Reddy 的案例说明高浏览可能集中在个别回复上。所以建议先存，等有足够多「成熟回复」再决定要不要上页面。
- 这一项本次没有实现：重做后的页面刻意精简了，是否增加采集字段应由你决定。

### 不建议做

- **接 Buffer 指标**：和 FxTwitter 重复，而且一天才更新一次。
- **行业基准对比、通用最佳时间表**：理由见第 4 节。
- **用粉丝净变化给单帖记功**：理由见第 3 节。

## 6. 来源说明

文中链接即来源。工具功能以官方帮助文档为准；Black Magic、Social Blade 的信息部分来自第三方，已在表中注明。中文案例和 ReplyWisely 是作者自述，只作为做法参考，不作为效果证据。
