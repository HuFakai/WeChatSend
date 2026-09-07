# 1Panel + Docker 线上部署

本文用于把 WeChatSend 的 Web、API、Worker 和 Redis 部署到同一台安装了 1Panel 的服务器。PostgreSQL 使用已有的远程数据库。

## 1. 为什么会看到 4 个容器

Docker 镜像和运行中的容器不是同一个概念。本项目只构建两个自有镜像，但会运行四个职责独立的容器：

| 容器 | 镜像 | 作用 | 是否开放宿主机端口 |
| --- | --- | --- | --- |
| wechatsend-web-1 | wechatsend-web | Nginx 托管 Web，并把 /api 请求转发给 API | 是，端口由 WEB_PORT 决定 |
| wechatsend-api-1 | wechatsend-backend | NestJS HTTP API | 否，只在 Compose 内部访问 |
| wechatsend-worker-1 | wechatsend-backend | 消费队列、按严格间隔发送邮件 | 否 |
| wechatsend-redis-1 | redis:8-alpine | 保存 BullMQ 队列和延迟任务 | 否 |

API 和 Worker 共用同一个 wechatsend-backend 镜像，并没有重复构建两份后端代码。
执行数据库迁移时还会临时启动 migrate 容器；迁移结束后该容器自动删除，不会长期运行。
PostgreSQL 使用外部数据库，因此这里没有数据库容器。

技术上可以把 Nginx、API、Worker、Redis 塞进一个容器，但不建议这样部署：

- Worker 异常或重启不应中断用户访问 API。
- API 请求不应与耗时邮件任务争抢同一个进程。
- Redis 需要独立持久化和健康检查。
- 分开后可以只更新、重启或查看某一项服务，故障范围更小。

这四个容器共同组成一个名为 wechatsend 的 Compose 应用，应在 1Panel 中按一个编排项目管理，
而不是当成四套独立项目。对于当前 MVP，保留这四个容器是推荐方案。

## 2. 上线前准备

- 服务器安装 Git、Docker 与 Docker Compose；1Panel 的“容器”功能可正常使用。
- 准备一个已解析到服务器的域名，并在 1Panel 中申请 HTTPS 证书。
- PostgreSQL 只向服务器 IP 放行 5432，生产环境不要向整个公网开放数据库。
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
    REDIS_URL="redis://redis:6379"
    APP_ORIGIN="https://你的域名"
    WEB_PORT=8080
    SMTP_USER="发信邮箱"
    SMTP_PASS="SMTP授权码"
    SMTP_FROM="发信邮箱"

若数据库密码含有 @、#、/、?、: 等字符，必须先对用户名和密码做 URL 编码。.env 不能提交到 Git。

REDIS_URL 中的 redis 是 Compose 内部服务名，不是公网域名。API 和 Worker 位于容器内，
所以不能把它改成 127.0.0.1。旧版环境变量示例没有这一行也能运行，是因为 Compose
曾直接注入同样的默认值；现在补充该变量是为了让配置完整，并支持以后切换到外部 Redis。

构建镜像、执行数据库迁移并启动：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env config
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

build 命令只构建 wechatsend-web 和 wechatsend-backend 两个自有镜像。Redis 使用官方镜像，
API 与 Worker 则从同一个后端镜像分别创建容器。

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

缺少 REDIS_URL 的已部署项目，直接在 .env 中增加下面一行后重建 API 和 Worker 即可：

    REDIS_URL="redis://redis:6379"

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api worker

## 6. 数据与运行约束

- PostgreSQL 是业务事实来源；Redis 只保存队列，使用 Docker 卷持久化。
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
