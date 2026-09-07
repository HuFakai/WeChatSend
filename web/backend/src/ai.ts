import { BadRequestException, Body, Controller, Get, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { decryptSecret } from './secrets';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

export const AI_FEATURES = ['mini_ai_copy', 'mini_ai_template', 'mini_ai_task'] as const;
export type AiMode = 'COPY' | 'TEMPLATE' | 'TASK';

const modeFeature: Record<AiMode, typeof AI_FEATURES[number]> = {
  COPY: 'mini_ai_copy', TEMPLATE: 'mini_ai_template', TASK: 'mini_ai_task',
};

const generateSchema = z.object({
  mode: z.enum(['COPY', 'TEMPLATE', 'TASK']),
  prompt: z.string().trim().min(2).max(5000),
  modelId: z.string().uuid().optional(),
  context: z.string().max(10_000).optional(),
});

type ChatMessage = { role: 'system' | 'user'; content: unknown };

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async options() {
    const [models, flags] = await Promise.all([
      this.prisma.aiModel.findMany({ where: { isActive: true, channel: { isActive: true } }, include: { channel: true }, orderBy: [{ channel: { name: 'asc' } }, { name: 'asc' }] }),
      this.prisma.featureFlag.findMany({ where: { key: { in: [...AI_FEATURES] } } }),
    ]);
    const enabled = new Map(flags.map((flag) => [flag.key, flag.enabled]));
    return {
      models: models.map((model) => ({ id: model.id, name: model.name, displayName: model.displayName || model.name, channelName: model.channel.name })),
      features: Object.fromEntries(AI_FEATURES.map((key) => [key, enabled.get(key) ?? false])),
    };
  }

  async generate(ownerId: string, body: z.infer<typeof generateSchema>, client: 'web' | 'mini' = 'web') {
    if (client === 'mini') await this.assertFeature(modeFeature[body.mode], true);
    const model = await this.resolveModel(body.modelId);
    const content = await this.chat(model, this.messages(body.mode, body.prompt, body.context));
    return { mode: body.mode, model: { id: model.id, name: model.name, displayName: model.displayName || model.name }, content, ownerId };
  }

  async createTaskDraft(ownerId: string, body: z.infer<typeof generateSchema>, client: 'web' | 'mini' = 'web') {
    if (body.mode !== 'TASK') throw new BadRequestException('任务草稿必须使用 TASK 模式');
    const result = await this.generate(ownerId, body, client);
    const title = body.prompt.length > 40 ? `${body.prompt.slice(0, 40)}…` : body.prompt;
    return this.prisma.taskDraft.create({
      data: {
        ownerId,
        title: `AI 草稿 · ${title}`,
        content: result.content,
        payload: { source: 'AI', mode: body.mode, prompt: body.prompt, modelId: result.model.id, selections: [], renderSeed: randomUUID() },
      },
    });
  }

  async parseFriendImage(modelId: string | undefined, imageData: string, mimeType: string) {
    const model = await this.resolveModel(modelId);
    const content = await this.chat(model, [
      { role: 'system', content: '你负责从微信通讯录截图中识别好友备注。只返回 JSON 数组，例如 ["客户A","客户B"]。不要猜测模糊或看不清的文字，不要返回手机号、头像文字或解释。' },
      { role: 'user', content: [
        { type: 'text', text: '请识别截图中清晰可见的微信好友备注，去重并保持从上到下顺序。' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageData}` } },
      ] },
    ]);
    const normalized = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not array');
      return [...new Set(parsed.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 5000);
    } catch { throw new BadRequestException('AI 未返回可确认的好友列表，请换一张清晰截图'); }
  }

  async assertFeature(key: typeof AI_FEATURES[number], required: boolean) {
    if (!required) return;
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag?.enabled) throw new BadRequestException(`管理员尚未开启功能：${key}`);
  }

  private async resolveModel(modelId?: string) {
    const model = modelId
      ? await this.prisma.aiModel.findFirst({ where: { id: modelId, isActive: true, channel: { isActive: true } }, include: { channel: true } })
      : await this.prisma.aiModel.findFirst({ where: { isActive: true, channel: { isActive: true } }, include: { channel: true }, orderBy: { createdAt: 'asc' } });
    if (!model) throw new BadRequestException('暂无可用 AI 模型，请先在管理后台配置');
    return model;
  }

  private messages(mode: AiMode, prompt: string, context?: string): ChatMessage[] {
    const task = mode === 'TASK'
      ? '你只负责生成发送任务草稿，不得执行发送。请返回一段可以直接作为微信文本消息的中文文案；不要擅自编造价格、时间、账号或好友。'
      : mode === 'TEMPLATE'
        ? '你是营销文案模板编辑。请生成可复用的中文模板，允许使用 {{friend_name}}、{{date}}、{{time}}、{{weekday}} 以及用户提供的变量占位符。只返回模板正文，不要解释。'
        : '你是客户运营文案助手。请生成自然、克制、适合微信私聊的中文文案。只返回文案正文，不要解释。';
    return [{ role: 'system', content: `${task}\n避免夸大承诺、诱导骚扰和违法违规内容。` }, { role: 'user', content: `${prompt}${context ? `\n\n补充上下文：${context}` : ''}` }];
  }

  private async chat(model: Awaited<ReturnType<AiService['resolveModel']>>, messages: ChatMessage[]) {
    const baseUrl = model.channel.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${decryptSecret(model.channel.encryptedApiKey)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.name, messages, temperature: 0.7 }),
      signal: AbortSignal.timeout(config().AI_REQUEST_TIMEOUT_MS),
    });
    const raw = await response.text();
    if (!response.ok) throw new BadRequestException(`AI 服务请求失败（${response.status}）`);
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new BadRequestException('AI 服务未返回有效 JSON'); }
    const content = (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new BadRequestException('AI 服务没有返回文案');
    return content.trim();
  }
}

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('options') options() { return this.ai.options(); }

  @Post('generate')
  generate(@Req() request: AuthRequest, @Body(new ZodPipe(generateSchema)) body: z.infer<typeof generateSchema>) {
    return this.ai.generate(request.user.id, body);
  }

  @Post('task-draft')
  taskDraft(@Req() request: AuthRequest, @Body(new ZodPipe(generateSchema)) body: z.infer<typeof generateSchema>) {
    return this.ai.createTaskDraft(request.user.id, body);
  }
}

@Controller('mini/ai')
@UseGuards(AuthGuard)
export class MiniAiController {
  constructor(private readonly ai: AiService) {}

  @Get('options') options() { return this.ai.options(); }

  @Post('generate')
  generate(@Req() request: AuthRequest, @Body(new ZodPipe(generateSchema)) body: z.infer<typeof generateSchema>) {
    return this.ai.generate(request.user.id, body, 'mini');
  }

  @Post('task-draft')
  taskDraft(@Req() request: AuthRequest, @Body(new ZodPipe(generateSchema)) body: z.infer<typeof generateSchema>) {
    return this.ai.createTaskDraft(request.user.id, body, 'mini');
  }
}
