# PC 与移动端同步恢复修复

## 目标与范围

修复设备间记录更新迟缓，保留单一数据空间、口令、TinyBase CRDT、IndexedDB 和 Cloudflare Durable Object。包含帖子、收藏、追加、每日目标与图片上传恢复；不改变 X / Obsidian 投递规则，不迁移用户数据。

项目实际采用 React 19 / Vite 8，不是 Next.js；package.json 与当前运行代码已核实，AGENTS.md 中遗留的 Next.js 文档要求没有对应依赖。

## 查实的问题

1. 前台健康检查及短暂切回时只调用 `load()`，没有重新向其他设备和服务器公布本机数据哈希。丢失一次自动发送后，没有后续编辑就不能补发。修复前本地真实双端模拟：正常发帖约 197ms；丢弃一个 TinyBase ContentDiff 后，发送端仍显示在线，触发 focus 并等待 12 秒，接收端仍无该条记录。
2. 离开不足 20 秒时复用旧连接。手机暂停后 WebSocket 可能仍显示打开，恢复依赖 30 秒一次的检查和最长 15 秒的单次同步请求超时。
3. `/api/session` 请求未设置超时，TinyBase 建立 WebSocket 也没有等待 open 的超时。网络请求挂起时可能长期停在正在连接。
4. `flushUploads()` 的异步 IIFE 在队列为空时不经过 await，内部 finally 提前设置 flushing=null，随后外部赋值又将已完成的 Promise 保存回 flushing。之后新增图片会复用这个 Promise，永远不启动上传。图片失败原先也只在首次同步或浏览器触发 online 时重试。

这是可复现的恢复缺陷；不据此推断用户每一次延迟都来自相同网络场景。

## 实现与依据

- 前台每 10 秒执行 `save()` + `load()`，`save()` 发送 CRDT 哈希供其他端补拉缺失变化，不上传完整数据快照。成功核对后重试图片队列。
- 从后台回到前台、网络恢复、BFCache 恢复和手动同步时重建 WebSocket，并重新执行 TinyBase 初始双向合并。暂停期间停止定期检查。
- 会话校验与 WebSocket 建立各设 10 秒超时；取消过期的会话请求，避免旧请求覆盖新连接或注销新令牌。正常数据合并仍保留每次请求 15 秒的容错时间。
- 图片锁在 Promise.finally 中释放；同一上传过程继续处理后来加入的图片。单次 PUT 最长等待 30 秒，失败保留队列并记录降级日志。
- 设置 → 数据增加“同步最新记录”；设备列表中的本机状态随真实连接变化。

调查并实际阅读了已安装 TinyBase 10.0.1 的 WebSocket 客户端、Durable Object 服务端和 Persister 关键代码。继续使用它的原因是已有 CRDT 冲突处理和增量协议足以完成修复，库采用 MIT 许可证，官方仓库仍维护当前 v10 系列。本次无需新依赖；连接生命周期、超时、补发触发和图片重试由项目负责。

来源：[TinyBase GitHub](https://github.com/tinyplex/tinybase)、[startSync 双向自动同步文档](https://tinybase.org/api/synchronizer-ws-client/interfaces/synchronizer/wssynchronizer/methods/synchronization/startsync/)、[load 文档](https://tinybase.org/api/synchronizer-ws-client/interfaces/synchronizer/wssynchronizer/methods/load/load/)。

## 验证

- 83 项 Vitest 测试通过。新增真实 TinyBase 协议测试验证丢失编辑及删除的恢复；连接测试覆盖短暂停、请求挂起、过期鉴权请求、旧健康检查挂起、BFCache、手动恢复与后台停止检查；图片测试覆盖空队列锁、失败重试、离线及上传期间追加图片。
- 类型检查、lint、生产构建通过。原有大于 500KB 的前端 chunk 和 PWA 插件弃用提示仍存在，与同步逻辑无关。
- 实际 Vite + 本地 Worker，Chrome 1440×1000 与 WebKit 390×844 独立浏览器空间：最终一轮 PC UI 发帖到移动端约 290ms，收藏回传约 31ms，离线双向补齐约 836ms，短暂后台且旧连接无响应后约 330ms 恢复。此前一轮对应为 258ms / 13ms / 859ms / 225ms，均为本地测试。
- 丢弃一次出站变化、不再编辑：约 10 秒的下一次定期核对补齐；编辑、追加、目标完成、手动同步以及空白第三设备读取服务器已保存记录均通过。两个视口没有横向溢出或 JavaScript 错误。
- 首次同步时图片队列为空，随后添加真实 PNG：上传后从另一端读取 `/api/blob/<hash>` 返回 200 与 image/png。
- 测试只在本地数据空间进行，测试新帖与追加均关闭 X；没有向真实 X 账号发布样例。没有 iPhone 真机网络耗时结论。

正式部署与线上检查的结果见最终交付。已打开的 PWA 需要加载新前端：点击首页“有新版本”，或离开至少一分钟后重新打开。
