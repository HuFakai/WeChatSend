# WeChatSend

通过服务端邮件队列触发 iPhone 快捷指令，向指定微信好友发送文本消息。当前代码处于 P1 MVP。

## 本地启动

在仓库根目录执行：

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:deploy
npm run user:create -- --username admin --password "换成至少8位的密码"
npm run dev
```

启动前需编辑根目录 `.env`，填写 PostgreSQL、Redis 和 SMTP。不要提交 `.env`。

远程 PostgreSQL 建议保留默认的 `DB_CONNECTION_LIMIT=4` 和
`DB_POOL_TIMEOUT=20`。QQ SMTP 建议使用 `SMTP_MAX_CONNECTIONS=1`；同一微信
账号的实际发送间隔仍由任务中的最小/最大秒数控制。

如果没有现成 Redis，但电脑已安装 Docker，可只启动项目自带的 Redis：

```bash
docker compose -f web/deploy/docker-compose.yml up -d redis
```

开发数据库需要创建新迁移时使用 `npm run db:migrate -- --name 迁移名称`；普通部署只执行 `npm run db:deploy`。

Web 默认运行于 `http://localhost:5173`，API 默认运行于 `http://localhost:3100/api/v1`。

## Docker 线上部署

项目提供 Web、API、Worker、Redis 的生产 Compose 配置。1Panel 首次部署、更新、日志与回滚命令见
[1Panel + Docker 线上部署](docs/1Panel-Docker线上部署.md)。

快捷指令微信发送结果回调：

```http
POST /api/v1/feedback
Content-Type: application/json

{"task_id":"邮件中的 TASK_ID","status":"success"}
```

`TASK_ID` 是每封好友邮件唯一的 UUID；同一批任务 ID 单独存放在 `BATCH_ID`。

## 安全提醒

生产数据库和 SMTP 授权码只能放在服务器环境变量或密钥管理服务中。任何曾出现在截图、聊天记录或日志中的密码/授权码都应立即重置。

## 目录

- `web/frontend`：React + Vite + shadcn/ui 风格组件
- `web/backend`：NestJS API、Prisma、BullMQ Worker
- `miniprogram`：原生微信小程序
- `docs`：产品、协议和阶段计划
- `UI`：黑白极简设计参考
