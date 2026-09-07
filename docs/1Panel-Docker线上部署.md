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
- 在 1Panel 中确认 Redis 的宿主机访问端口和密码。Redis 端口不得向公网开放。
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
    REDIS_URL="redis://host.docker.internal:6379/2"
    APP_ORIGIN="https://你的域名"
    WEB_PORT=8080
    SMTP_USER="发信邮箱"
    SMTP_PASS="SMTP授权码"
    SMTP_FROM="发信邮箱"

若数据库密码含有 @、#、/、?、: 等字符，必须先对用户名和密码做 URL 编码。.env 不能提交到 Git。

host.docker.internal 通过 Compose 的 host-gateway 映射访问当前服务器宿主机。
API 和 Worker 位于容器内，所以不能使用 127.0.0.1；它指向的是容器自身。
末尾的 /2 表示为 WeChatSend 使用 Redis 逻辑库 2，避免与其他应用键名冲突。

Redis 没有密码时：

    REDIS_URL="redis://host.docker.internal:6379/2"

Redis 有密码时：

    REDIS_URL="redis://:URL编码后的密码@host.docker.internal:6379/2"

如果 1Panel 映射的 Redis 宿主机端口不是 6379，应替换为实际端口。不要填写 Redis
容器的 172.x 临时 IP。密码中的 @、#、/、?、: 等字符同样需要 URL 编码。

构建镜像、执行数据库迁移并启动：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env config
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate npm run connections:check
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

build 命令只构建 wechatsend-web 和 wechatsend-backend 两个自有镜像，
API 与 Worker 从同一个后端镜像分别创建容器。connections:check 必须同时显示
PostgreSQL: OK 和 Redis: OK，才能继续迁移和启动。

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

环境变量示例在项目更新后可能增加字段，但 git pull 不会覆盖现有 .env。检查本次新增的非敏感字段：

    grep -E '^(REDIS_URL|WEB_PORT)=' .env

缺少 REDIS_URL 的已部署项目，应填写 1Panel Redis 的实际端口、逻辑库及密码：

    REDIS_URL="redis://host.docker.internal:6379/2"

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

## 7. 回滚

部署前记录当前提交：

    git rev-parse HEAD

出现问题时切换到已知可用提交并重建：

    git checkout 已知可用的提交哈希
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans

数据库迁移默认只向前执行。涉及数据库结构的版本，回滚代码前应先核对迁移兼容性并备份数据库。
