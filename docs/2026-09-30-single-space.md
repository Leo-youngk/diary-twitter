# 单一数据空间与口令（取代同步码）

## 为什么改

2026-09-30 查实：iPhone 主屏上装的是测试站 `diary-app-next`，切换正式站后一直没换。之后部署到正式站的滚动与 X 修复，手机都没拿到；测试站没有 Buffer 密钥，手机发的帖永远发不到 X。另外，旧设计里新设备会**静默生成一个新的同步码**，形成空的独立空间（正式站因此多出一个 `06…` 开头的空空间）。数据分裂靠用户手动抄同步码才能合回来。

## 现在的样子

- 整个部署只有**一个**数据空间，就是原来那个同步码对应的 Durable Object，名字存在 Worker 密钥 `SPACE_ID` 里。Obsidian 来源 ID、KV 备份和图片前缀都沿用它，不迁移数据。
- 新设备第一次打开时输入一次口令（`APP_PASSPHRASE`），换到一个设备令牌 `<deviceId>.<HMAC(SESSION_SECRET)>`，存在 localStorage。之后自动实时同步，不再询问。改 `SESSION_SECRET` 会让所有设备退出。
- 同步用的 WebSocket 把令牌放在子协议里（`diary-sync, <token>`），URL 里不带凭据。每次连接前先 `GET /api/session` 确认令牌有效：被拒绝就回到口令页；网络不通就按原来的退避重连。
- 图片按内容哈希公开读取（`GET /api/blob/<sha256>`，知道哈希的人才能读到帖子），上传要带令牌。
- 服务器在每次连接时写入同步表 `devices`（设备名、版本、最近连接时间）。设置 → 设备可以看到每台设备跑的是哪个版本。

## 运维

- 密钥放在 `.env.secrets.local`（已被 git 忽略），用 `npm run secrets` 推送。本地开发用 `.dev.vars` 里的测试值，与线上无关。
- 部署：`npm run deploy`。测试站已停用：`ops/retired-staging/` 部署的是停用页，带自删除的 Service Worker，同步接口返回 410；它的 Durable Object 数据保留，没有删除。
- 开启了 Workers Logs（`[observability]`），X、Obsidian、同步相关的 `console` 输出可以在 Cloudflare 后台查看。

## 合并记录（2026-09-30）

测试站同一空间比正式站多出 2 条随想和 3 个目标，已并入正式站。两条随想按用户决定设为 `xSync=false`，不发 X。头像保留正式站 02:29 之后的版本，没有覆盖。
