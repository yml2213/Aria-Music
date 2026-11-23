# Docker 部署

## 快速启动

```bash
cp .env.example .env
```

至少修改 `ARIA_PASSWORD`，然后启动：

```bash
docker compose up -d --build
docker compose ps
```

健康检查地址：

```text
GET /api/health
```

该接口不要求认证，其他页面和 API 都需要 Basic Auth。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | 镜像内 `0.0.0.0` | Node 服务监听地址 |
| `PORT` | `8787` | 容器内端口 |
| `MUSIC_DATA_DIR` | `/data` | 音源配置和脚本持久化目录 |
| `REQUIRE_AUTH` | 镜像入口默认 `1` | 为 `1` 时必须有密码 |
| `AUTH_USERNAME` | `aria` | Basic Auth 用户名 |
| `AUTH_PASSWORD` | 无 | Basic Auth 密码 |
| `SOURCE_ALLOWED_HOSTS` | 推荐源域名 | 允许导入音源脚本的域名，逗号分隔 |
| `MEDIA_PROXY` | Compose 中为 `1` | 通过同源接口流式代理音频，避免 HTTPS 混合内容 |
| `MEDIA_ALLOWED_HOSTS` | 空 | 可选的媒体 CDN 域名白名单 |
| `ALLOW_PRIVATE_SOURCE_URLS` | `0` | 为 `1` 时允许内网音源地址，需自行评估风险 |
| `DEBUG_HTTP` | `0` | 为 `1` 时输出上游请求和音源子进程阶段日志 |

Compose 默认只允许以下域名：

```text
raw.githubusercontent.com,gh-proxy.org
```

如果要导入自有音源，将对应域名加入 `SOURCE_ALLOWED_HOSTS`。显式加入白名单的域名会被视为运维已确认的来源。

Compose 默认开启媒体代理。音频会经过服务端流式转发，并支持 Range 请求；这会占用服务器带宽，但可以避免 HTTPS 页面播放 HTTP 音源时被浏览器拦截。

## HTTPS 反向代理

公网部署应使用 Caddy、Nginx、Traefik 等提供 TLS。使用 Nginx 时必须保留原始 Host，否则同源请求校验会拒绝写操作：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
}
```

建议在反向代理增加请求速率限制和 HSTS。Basic Auth 凭据只能通过 HTTPS 传输。

## 数据与备份

Compose 使用命名卷 `aria-data`。音源配置位于：

```text
/data/sources.json
```

查看卷名：

```bash
docker volume ls | grep aria
```

备份时停止写入并复制卷内容，或使用临时容器打包。恢复后确认 `/data` 仍可由容器内非 root 用户写入。

浏览器收藏、最近播放和歌单保存在 IndexedDB，不在 Docker 卷中。更换浏览器或域名前应自行备份对应站点的浏览器数据。

## 容器约束

- 运行阶段不安装 Node 模块，只复制编译后的 `dist/` 和 `dist-server/`。
- 容器以非 root 用户 `aria` 运行。
- Compose 默认使用只读根文件系统和 `/tmp` tmpfs。
- 音源子进程继承最小环境变量，并启用 Node Permission Model。
- 若修改 Dockerfile 的 Node 版本，仍需保持 Node.js 24 或更高版本。

## 更新

```bash
docker compose build --pull
docker compose up -d
docker image prune -f
```

升级后检查：

```bash
docker compose ps
docker compose logs --tail=100 aria-music
```
