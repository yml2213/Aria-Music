# Aria Music

支持洛雪自定义音源的多平台网页音乐播放器，内置网易云音乐、QQ 音乐、酷狗音乐和酷我音乐搜索。

## 功能

- 四平台歌曲搜索与歌词适配
- 洛雪自定义音源导入、主备切换、超时和自动降级
- 根据成功率、延迟、连续失败和媒体可用性动态调度播放线路
- 默认导入文章中的 15 个音源脚本，ChangQing 为主音源
- 播放失败后自动换源
- 播放队列、随机播放、循环播放和系统媒体控制
- Docker 可选同源媒体代理，兼容 HTTP 音源地址
- 网易云歌单导入
- 收藏、最近播放和 IndexedDB 本地持久化
- 响应式桌面及移动端界面
- 跟随系统、亮色和暗色主题切换
- Docker 非 root、只读根文件系统部署和 Basic Auth

## 本地开发

需要 Node.js 24 或更高版本。

```bash
npm install
npm run dev
```

开发服务器默认只监听 `127.0.0.1:5173`。如需在局域网调试，可显式设置：

```bash
VITE_DEV_HOST=0.0.0.0 npm run dev
```

点击右上角“添加音源”，从推荐音源添加一个，或粘贴可信的洛雪音源脚本地址。

## Docker 部署

```bash
cp .env.example .env
# 修改 .env 中的 ARIA_PASSWORD
docker compose up -d --build
```

默认访问 `http://服务器地址:8787`，用户名由 `ARIA_USERNAME` 指定，默认是 `aria`。

生产环境应放在 HTTPS 反向代理后，详细配置、备份和排障见 [docs/docker.md](docs/docker.md)。

## 架构

```text
React 前端       -> 搜索、播放队列、IndexedDB 音乐库
Node API         -> 搜索、歌词、歌单导入、播放地址解析
受限音源子进程   -> 执行洛雪音源脚本，网络允许、文件写入和子进程禁止
```

服务端数据：

- 音源脚本和主备顺序保存在 `MUSIC_DATA_DIR/sources.json`。
- 动态线路评分和最近调度日志保存在 `MUSIC_DATA_DIR/source-routing.json`。
- Docker Compose 使用 `aria-data` 持久卷。
- 收藏、最近播放和歌单保存在浏览器 IndexedDB。

## 安全边界

- Docker 镜像使用非 root 用户运行，Compose 默认启用只读根文件系统、`no-new-privileges` 和 `cap_drop: ALL`。
- `REQUIRE_AUTH=1` 时未设置 `AUTH_PASSWORD` 会直接拒绝启动。
- 除健康检查外，页面和 API 都受 HTTP Basic Auth 保护。
- 音源脚本在独立子进程中运行，启用 Node Permission Model，清空环境变量，并禁止文件写入、子进程、Worker 和原生插件。
- `SOURCE_ALLOWED_HOSTS` 用于限制可导入的音源域名，Docker Compose 默认只允许推荐源域名。
- 首次部署会自动导入默认音源；设置 `DEFAULT_SOURCES_ENABLED=0` 可关闭。
- Node 权限模型降低了脚本影响范围，但自定义音源仍应只导入可信来源。

## 构建与验证

```bash
npm run build
npm test
```

`npm run build` 会生成静态前端 `dist/` 和可直接由 Node 运行的服务端 `dist-server/`。

浏览器端 E2E 需要显式运行：

```bash
npm run test:e2e
```

音源和部署细节见 [docs/sources.md](docs/sources.md) 与 [docs/docker.md](docs/docker.md)。
