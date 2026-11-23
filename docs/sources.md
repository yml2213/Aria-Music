# 音源与播放架构

## 分层

- 搜索适配负责获取歌曲、歌手、专辑、封面、时长和平台原始 ID。
- 洛雪音源只负责 `musicUrl`，即根据歌曲信息返回播放地址。
- 歌词适配独立请求，不依赖当前启用的播放音源。
- 前端继续使用统一的 `Track` 结构，不直接执行第三方脚本。

## 音源执行

每个音源由独立 Node 子进程加载：

- 初始化超时 8 秒。
- 单次取链超时 20 秒。
- 子进程使用 Node Permission Model，只允许读取音源宿主脚本和访问网络。
- 文件写入、子进程、Worker 线程、原生插件和 WASI 默认禁止。
- 子进程不继承服务端环境变量，敏感配置不会直接进入音源脚本。
- 只提供 `lx.on`、`lx.send`、`lx.request` 和必需的 `lx.utils`。
- 音源返回地址必须是 HTTP(S) URL。
- 音源异常、超时或运行超过 5 分钟后会终止对应子进程。

子进程和权限模型降低了脚本对主服务的影响，但自定义脚本仍属于可执行代码，不是强安全沙箱。生产环境应组合使用域名白名单、Basic Auth、容器权限限制和可信来源策略。

## 主备切换

播放解析顺序：

1. 当前主音源。
2. 用户勾选的备用音源，按界面顺序执行。
3. 当前音质失败时，按标准、无损、高解析度、母带能力逐档降级。
4. 返回已经失败过的 URL 会被排除。
5. 音频实际加载失败时，前端将旧 URL 加入排除列表并重新请求。

## 本地接口

- `GET /api/config`
- `GET /api/sources/catalog`
- `POST /api/sources/import`
- `POST /api/sources/:id/test`
- `DELETE /api/sources/:id`
- `PUT /api/sources/selection`
- `GET /api/search?provider=netease&q=晴天`
- `POST /api/track/resolve`
- `POST /api/track/lyric`
- `GET /api/media/:token`（可选同源媒体代理）
- `GET /api/playlists/netease/:id`

## 数据

音源脚本保存在 `data/sources.json`，可设置 `MUSIC_DATA_DIR` 修改数据目录。文件以 `0600` 权限写入，损坏的配置会被重命名为 `.corrupt-<时间戳>` 后启动空配置。
