# WeChatSend

通过服务端邮件队列触发 iPhone 快捷指令，向指定微信好友发送文本消息。当前版本支持 Web 邮箱登录、微信小程序登录、两种身份互相绑定，以及支付宝订单码和微信虚拟支付的订单、查单、回调、权益与额度闭环。

P2 新增好友分组/标签、平台及个人模板、收藏与复制、内置及自定义变量、稳定文案预览、任务草稿和历史任务复制。P3 支持 CSV/XLSX 好友/变量导入、截图多模态候选识别、随机语录/问候和管理员配置外部 API 变量。P4 支持 OpenAI 兼容 AI 通道、文案/模板/任务草稿和行业模板审核。P5 支持小程序微信身份登录、昵称头像绑定及扫码订单支付。Web 与微信小程序共享同一套业务接口和数据。

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

从旧版本升级到当前版本必须执行 `npm run db:deploy`，以创建邮箱身份、登录挑战、支付宝配置、订单快照和会员额度流水表。首次需要行业种子时，再执行 `npm run content:seed`；该命令可重复执行，不覆盖管理员已经修改的同名模板。

Web 默认运行于 `http://localhost:5173`，API 默认运行于 `http://localhost:3100/api/v1`。

会员支付：Web 端使用支付宝订单码支付；小程序端使用微信个人主体虚拟支付。支付与套餐配置、密钥边界、迁移和沙箱联调见[支付与会员套餐接入](docs/支付与会员套餐接入.md)。

## Docker 线上部署

项目提供 Web、API、Worker 的生产 Compose 配置，线上 PostgreSQL 和 Redis 使用 1Panel 已有服务。首次部署、更新、连接检查、日志与回滚命令见
[1Panel + Docker 线上部署](docs/1Panel-Docker线上部署.md)。

快捷指令微信发送结果回调：

```http
POST /api/v1/feedback
Content-Type: application/json

{"task_id":"邮件中的 TASK_ID","status":"success"}
```

`TASK_ID` 是每封好友邮件唯一的 UUID；同一批任务 ID 单独存放在 `BATCH_ID`。
邮件发送成功后 1 分钟仍未收到快捷指令反馈时，任务详情会将该好友标记为“微信发送失败”，并提示核对微信好友备注；迟到的有效反馈仍会覆盖超时显示。

## 安全提醒

生产数据库和 SMTP 授权码只能放在服务器环境变量或密钥管理服务中。任何曾出现在截图、聊天记录或日志中的密码/授权码都应立即重置。

## 目录

- `web/frontend`：React + Vite + shadcn/ui 风格组件
- `web/backend`：NestJS API、Prisma、BullMQ Worker
- `miniprogram`：原生微信小程序
- `docs`：产品、协议和阶段计划
- `UI`：黑白极简设计参考
