# 1Panel + Docker 线上部署

本文用于把 WeChatSend 的 Web、API 和 Worker 部署到安装了 1Panel 的服务器。
PostgreSQL 和 Redis 均使用 1Panel 中已经部署好的服务，不由本项目重复创建。

## 1. 为什么仍然有 3 个应用容器

Docker 镜像和运行中的容器不是同一个概念。本项目只构建两个自有镜像，并运行三个职责独立的应用容器：

| 容器 | 镜像 | 作用 | 是否开放宿主机端口 |
| --- | --- | --- | --- |
| wechatsend-web-1 | wechatsend-web | Nginx 托管 Web，并把 /api 请求转发给 API | 是，端口由 WEB_PORT 决定 |
| wechatsend-api-1 | wechatsend-backend | NestJS HTTP API | 否，只在 Compose 内部访问 |
| wechatsend-worker-1 | wechatsend-backend | 消费队列、按严格间隔发送邮件 | 否 |

API 和 Worker 共用同一个 wechatsend-backend 镜像，并没有重复构建两份后端代码。
执行数据库迁移时还会临时启动 migrate 容器；迁移结束后该容器自动删除，不会长期运行。
已有的 PostgreSQL 和 Redis 属于外部基础服务，因此不会出现在 wechatsend Compose 的容器列表中。

技术上可以把 Nginx、API 和 Worker 塞进一个容器，但不建议这样部署：

- Worker 异常或重启不应中断用户访问 API。
- API 请求不应与耗时邮件任务争抢同一个进程。
- 分开后可以只更新、重启或查看某一项服务，故障范围更小。

这三个容器共同组成一个名为 wechatsend 的 Compose 应用，应在 1Panel 中按一个编排项目管理，
而不是当成三套独立项目。对于当前 MVP，保留这三个应用容器是推荐方案。

## 2. 上线前准备

- 服务器安装 Git、Docker 与 Docker Compose；1Panel 的“容器”功能可正常使用。
- 准备一个已解析到服务器的域名，并在 1Panel 中申请 HTTPS 证书。
- PostgreSQL 只向服务器 IP 放行 5432，生产环境不要向整个公网开放数据库。
- 在 1Panel 中确认 Redis 的容器名、所在 Docker 网络和密码。优先通过 1Panel 内部网络访问，Redis 端口不得向公网开放。
- QQ 邮箱使用 SMTP 授权码，不是 QQ 登录密码。曾出现在截图或聊天记录里的授权码应先重置。

## 3. 首次部署

在 1Panel 的终端中执行：

    cd /opt/1panel/apps
    git clone https://github.com/HuFakai/WeChatSend.git
    cd WeChatSend
    cp web/deploy/.env.production.example .env

如果仓库已经位于 /opt/1panel/apps/WeChatSend，就直接进入该目录，不要重复克隆。

编辑 /opt/1panel/apps/WeChatSend/.env，至少确认：

    DATABASE_URL="postgresql://数据库用户:数据库密码@数据库地址:5432/wechatsend?schema=public"
    ONEPANEL_NETWORK="1panel-network"
    REDIS_URL="redis://:URL编码后的密码@真实Redis容器名:6379/2"
    APP_ORIGIN="https://你的域名"
    WEB_PORT=8080
    SMTP_USER="发信邮箱"
    SMTP_PASS="SMTP授权码"
    SMTP_FROM="发信邮箱"

P3/P4/P5 还需要在服务端 `.env` 设置：

    APP_ENCRYPTION_KEY="至少32位随机字符串"
    WECHAT_MINI_APPID="小程序 AppID"
    WECHAT_MINI_SECRET="小程序 Secret"

`APP_ENCRYPTION_KEY` 用于加密 AI/API 密钥，丢失后无法解密已保存的通道密钥；不要在前端、小程序或 Git 中使用它。微信支付 V3 只有在开通支付并准备好商户证书后再填写 `WECHAT_PAY_MCH_ID`、`WECHAT_PAY_SERIAL_NO`、`WECHAT_PAY_PRIVATE_KEY`、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_PLATFORM_CERT` 和 `WECHAT_PAY_NOTIFY_URL`。支付回调地址必须是公网 HTTPS。

若数据库或 Redis 密码含有 @、#、/、?、: 等字符，必须先对用户名和密码做 URL 编码。.env 不能提交到 Git。

### 3.1 确认 Redis 容器名和共享网络

先执行以下只读命令，不要凭 1Panel 页面标题猜容器名：

    docker ps --format 'table {{.Names}}\t{{.Networks}}\t{{.Ports}}' | grep -i redis
    docker network ls --format 'table {{.Name}}\t{{.Driver}}' | grep -i 1panel

把第一条命令显示的容器名原样放进 REDIS_URL。Docker 容器名只有在两个容器位于同一个网络时才能作为主机名解析。生产 Compose 会让 API、Worker 和临时 migrate 容器加入 ONEPANEL_NETWORK 指定的外部网络；1Panel 通常使用内置的 `1panel-network`。

继续确认 Redis 是否已经在这个网络中：

    docker network inspect 1panel-network --format '{{range .Containers}}{{println .Name}}{{end}}' | grep -i redis

如果没有输出，将真实 Redis 容器接入该网络：

    docker network connect 1panel-network 真实Redis容器名

如果 Redis 实际位于另一个 1Panel 网络，则不要重复连接，直接把 ONEPANEL_NETWORK 改为该网络名。不要填写 Redis 的 172.x 临时 IP。

Redis 没有密码时：

    REDIS_URL="redis://真实Redis容器名:6379/2"

Redis 有密码时：

    REDIS_URL="redis://:URL编码后的密码@真实Redis容器名:6379/2"

末尾的 /2 表示为 WeChatSend 使用 Redis 逻辑库 2，避免与其他应用键名冲突。此连接方式走 Docker 内网，不要求 Redis 映射宿主机端口。

如果确实要通过 Redis 的宿主机映射端口访问，也可使用保留的 host-gateway：

    REDIS_URL="redis://:URL编码后的密码@host.docker.internal:6379/2"

该备用方式要求 1Panel 已启用 Redis 端口外部访问；端口不是 6379 时应替换为实际宿主机端口。API 和 Worker 位于容器内，不能使用 127.0.0.1，它指向容器自身。

构建镜像、执行数据库迁移并启动：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env config
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate npm run connections:check
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate npm run content:seed
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

build 命令只构建 wechatsend-web 和 wechatsend-backend 两个自有镜像，
API 与 Worker 从同一个后端镜像分别创建容器。connections:check 必须同时显示
PostgreSQL: OK 和 Redis: OK，才能继续迁移和启动。

出现 `getaddrinfo ENOTFOUND Redis容器名` 时，说明 REDIS_URL 的主机名无法通过 Docker DNS 解析。优先检查容器名是否完全一致，以及 Redis 和临时 migrate 容器是否都在 ONEPANEL_NETWORK，而不是修改密码或逻辑库编号。

创建首个登录用户：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env exec api npm run user:create -- --username admin --password "替换为强密码"

本机验证：

    grep '^WEB_PORT=' .env
    curl http://127.0.0.1:5173/api/v1/health
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env logs --tail=100 api worker

上面的 5173 需要替换为 grep 显示的实际 WEB_PORT。健康接口应返回 status: ok。

## 4. 1Panel 网站与 HTTPS

1. 在“网站”中新建反向代理网站并绑定域名。
2. 代理地址填写 http://127.0.0.1:WEB_PORT。例如 .env 是 WEB_PORT=5173，就填写 http://127.0.0.1:5173。
3. 启用 HTTPS，并开启 HTTP 自动跳转 HTTPS。
4. 防火墙仅需公开 80/443；WEB_PORT 对应端口只允许本机或由防火墙禁止公网访问。
5. 将小程序的 request 合法域名配置为同一 HTTPS 域名，并修改 miniprogram/services/api.ts 中的 API 地址后重新上传小程序。

快捷指令反馈接口也必须使用公网 HTTPS：

    POST https://你的域名/api/v1/feedback
    Content-Type: application/json

    {"task_id":"邮件中的 TASK_ID","status":"success"}

## 5. 日常更新

每次拉取新版本后按以下顺序执行：

    cd /opt/1panel/apps/WeChatSend
    git pull --ff-only
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

查看日志：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env logs -f --tail=200 api worker web

仅修改 .env 后无需重新构建：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api worker

环境变量示例在项目更新后可能增加字段，但 git pull 不会覆盖现有 .env。检查本次新增的字段：

    grep -E '^(ONEPANEL_NETWORK|REDIS_URL|WEB_PORT)=' .env

缺少字段的已部署项目，应填写 1Panel 的共享网络、Redis 真实容器名、逻辑库及密码：

    ONEPANEL_NETWORK="1panel-network"
    REDIS_URL="redis://:URL编码后的密码@真实Redis容器名:6379/2"

修改后先验证连接，再重建：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env config
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate npm run connections:check
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans

最后一条命令会移除旧配置创建的 wechatsend-redis-1 容器，但不会删除旧的 Redis 数据卷。
不要执行 docker compose down -v。如果旧 Redis 中还有等待发送的队列任务，应先等待任务完成，
再切换到 1Panel Redis；Redis 队列数据不会自动迁移。

## 6. 数据与运行约束

- PostgreSQL 是业务事实来源；Redis 保存 BullMQ 队列和延迟任务，两者都由 1Panel 负责持久化、备份和监控。
- 建议为 WeChatSend 使用独立 Redis 逻辑库，并将 Redis 的 maxmemory-policy 设置为 noeviction，避免队列键被淘汰。
- api 与 worker 是两个独立进程，各自使用保守的 Prisma 连接池。
- 同一微信账号使用数据库锁串行发送。下一封邮件会在上一封 SMTP 尝试结束后，再等待任务设置的 10 秒以上间隔。
- 当前生产配置建议只运行一个 Worker 副本。数据库锁支持并发保护，但首版没有必要横向扩容。
- API 与 Worker 遇到 PostgreSQL 回收连接时会重建连接并有限重试；SMTP 结果不确定时不会盲目重复发送。

## 7. 当前环境变量核对

根据部署输出判断：PostgreSQL 已连接成功，迁移也已完成；API 健康和 Web 启动日志本身没有异常。Redis 的 `ENOTFOUND` 表示容器网络/DNS 配置错误，不能据此判断 Redis 密码错误。即使后续命令启动了 API、Worker 和 Web，只要连接检查没有显示 `Redis: OK`，Worker 就不能可靠消费邮件队列，部署仍未验收通过。

其余变量按以下规则核对：

- DB_CONNECTION_LIMIT=4、DB_POOL_TIMEOUT=20 和 WORKER_CONCURRENCY=4 可作为当前单 Worker 的保守起点。
- APP_ORIGIN 必须与浏览器实际访问的 HTTPS 源完全相同，不带路径。
- WEB_PORT 必须和 1Panel 反向代理的本机端口一致。
- SMTP_PORT=465 时 SMTP_SECURE=true；SMTP_PASS 必须是授权码。
- DEFAULT_TRIGGER_SUBJECT 必须与 iPhone 邮件自动化条件一致。

如果数据库密码、Redis 密码或 SMTP 授权码曾出现在截图、聊天或日志中，上线前应全部轮换，并只保存在服务器 `.env` 中。

## 8. 回滚

部署前记录当前提交：

    git rev-parse HEAD

出现问题时切换到已知可用提交并重建：

    git checkout 已知可用的提交哈希
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans

数据库迁移默认只向前执行。涉及数据库结构的版本，回滚代码前应先核对迁移兼容性并备份数据库。

## 9. P2 升级说明

P2 新增好友分组/标签、模板、变量、草稿及任务内容快照表。更新代码后必须先备份 PostgreSQL，再执行迁移并重建三个应用服务：

    git pull --ff-only
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

本次迁移不删除 P1 数据，会为已有任务补充可空的模板/变量快照字段，并写入首批平台精选模板。API、Worker、Web 仍是三个职责独立的应用容器；PostgreSQL 和 Redis 继续复用 1Panel 已有服务，不会额外创建数据库容器。

## 10. P3/P4/P5 升级与小程序配置

当前版本新增一份迁移 `20260908020000_p3_p5_platform_features`。更新时先备份数据库，再执行：

    git pull --ff-only
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate npm run content:seed
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans

小程序后台需要配置 API 合法域名为部署域名，并将 `miniprogram/services/api.ts` 中的 `API_BASE` 改为同一 HTTPS 域名。身份登录使用 `wx.login`，服务端通过 `jscode2session` 换取 openid；session_key 只停留在服务端，不写入小程序存储。

扫码支付流程是：Web/API 创建待支付订单并生成小程序码 → 用户扫码进入 `pages/pay/index` → 小程序完成身份授权 → 服务端以该 openid 创建 JSAPI 预支付订单 → 小程序调用 `wx.requestPayment` → 微信支付回调验签、解密并更新订单。没有微信支付商户号、商户私钥、平台证书和 API v3 Key 时，只能联调身份和二维码入口，不能宣称支付已上线。

AI 通道和外部 API 在管理员后台配置。AI/API 密钥由 `APP_ENCRYPTION_KEY` 加密保存；天气等动态变量配置为外部 API 的响应路径，例如 `data.weather.text`，任务提交时会请求并冻结变量值，API 失败会阻止发送，不会发送占位符。
