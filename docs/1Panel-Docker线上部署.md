# 1Panel + Docker 线上部署

本文用于把 WeChatSend 的 Web、API、Worker 和 Redis 部署到同一台安装了 1Panel 的服务器。PostgreSQL 使用已有的远程数据库。

## 1. 上线前准备

- 服务器安装 Git、Docker 与 Docker Compose；1Panel 的“容器”功能可正常使用。
- 准备一个已解析到服务器的域名，并在 1Panel 中申请 HTTPS 证书。
- PostgreSQL 只向服务器 IP 放行 5432，生产环境不要向整个公网开放数据库。
- QQ 邮箱使用 SMTP 授权码，不是 QQ 登录密码。曾出现在截图或聊天记录里的授权码应先重置。

## 2. 首次部署

在 1Panel 的终端中执行：

    cd /opt
    git clone https://github.com/HuFakai/WeChatSend.git
    cd WeChatSend
    cp web/deploy/.env.production.example .env

编辑 /opt/WeChatSend/.env，至少填写：

    DATABASE_URL="postgresql://数据库用户:数据库密码@数据库地址:5432/wechatsend?schema=public"
    APP_ORIGIN="https://你的域名"
    SMTP_USER="发信邮箱"
    SMTP_PASS="SMTP授权码"
    SMTP_FROM="发信邮箱"

若数据库密码含有 @、#、/、?、: 等字符，必须先对用户名和密码做 URL 编码。.env 不能提交到 Git。

构建镜像、执行数据库迁移并启动：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

创建首个登录用户：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env exec api npm run user:create -- --username admin --password "替换为强密码"

本机验证：

    curl http://127.0.0.1:8080/api/v1/health
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env logs --tail=100 api worker

健康接口应返回 status: ok。

## 3. 1Panel 网站与 HTTPS

1. 在“网站”中新建反向代理网站并绑定域名。
2. 代理地址填写 http://127.0.0.1:8080。
3. 启用 HTTPS，并开启 HTTP 自动跳转 HTTPS。
4. 防火墙仅需公开 80/443；8080 可只允许本机访问。
5. 将小程序的 request 合法域名配置为同一 HTTPS 域名，并修改 miniprogram/services/api.ts 中的 API 地址后重新上传小程序。

快捷指令反馈接口也必须使用公网 HTTPS：

    POST https://你的域名/api/v1/feedback
    Content-Type: application/json

    {"task_id":"邮件中的 TASK_ID","status":"success"}

## 4. 日常更新

每次拉取新版本后按以下顺序执行：

    cd /opt/WeChatSend
    git pull --ff-only
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env --profile tools run --rm migrate
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env ps

查看日志：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env logs -f --tail=200 api worker web

仅修改 .env 后无需重新构建：

    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --force-recreate api worker

## 5. 数据与运行约束

- PostgreSQL 是业务事实来源；Redis 只保存队列，使用 Docker 卷持久化。
- api 与 worker 是两个独立进程，各自使用保守的 Prisma 连接池。
- 同一微信账号使用数据库锁串行发送。下一封邮件会在上一封 SMTP 尝试结束后，再等待任务设置的 10 秒以上间隔。
- 当前生产配置建议只运行一个 Worker 副本。数据库锁支持并发保护，但首版没有必要横向扩容。
- API 与 Worker 遇到 PostgreSQL 回收连接时会重建连接并有限重试；SMTP 结果不确定时不会盲目重复发送。

## 6. 回滚

部署前记录当前提交：

    git rev-parse HEAD

出现问题时切换到已知可用提交并重建：

    git checkout 已知可用的提交哈希
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env build
    docker compose -f web/deploy/docker-compose.prod.yml --env-file .env up -d --remove-orphans

数据库迁移默认只向前执行。涉及数据库结构的版本，回滚代码前应先核对迁移兼容性并备份数据库。
