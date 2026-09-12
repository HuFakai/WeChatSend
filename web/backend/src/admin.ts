import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AiService, AI_FEATURES } from './ai';
import { assertAdmin, AuthGuard, AuthRequest } from './auth';
import { ExternalApiService, pickPath, stringValue } from './external-api';
import { assertSafeTagValue } from './lib';
import { encryptSecret } from './secrets';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const modelSchema = z.object({ name: z.string().trim().min(1).max(200), displayName: z.string().trim().max(200).optional(), contextWindow: z.number().int().positive().max(10_000_000).optional() });
const channelSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: z.string().url().max(500),
  apiKey: z.string().min(1).max(1000),
  models: z.array(modelSchema).max(100).default([]),
});
const patchChannelSchema = channelSchema.partial().extend({ isActive: z.boolean().optional() });
const patchModelSchema = modelSchema.partial().extend({ isActive: z.boolean().optional() });
const flagSchema = z.object({ enabled: z.boolean(), config: z.record(z.string(), z.unknown()).optional() });
const integrationVariableSchema = z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,63}$/), displayName: z.string().trim().min(1).max(100), responsePath: z.string().trim().min(1).max(200) });
const integrationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url().max(1000),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']),
  headers: z.record(z.string(), z.string()).default({}),
  requestParams: z.record(z.string(), z.unknown()).default({}),
  variables: z.array(integrationVariableSchema).min(1).max(50),
  enabled: z.boolean().default(true),
});
const patchIntegrationSchema = integrationSchema.partial();
const testAiSchema = z.object({ modelId: z.string().uuid(), prompt: z.string().trim().min(2).max(1000).default('请写一句简短的客户问候语') });
const platformTemplateSchema = z.object({ title: z.string().trim().min(1).max(100), content: z.string().min(1).max(10000), category: z.string().trim().max(40).optional().nullable(), isActive: z.boolean().default(true) });
const patchPlatformTemplateSchema = platformTemplateSchema.partial();

function assertSafeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('只支持 HTTP/HTTPS API 地址');
  if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(url.hostname)) throw new BadRequestException('不允许访问本机或云平台元数据地址');
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly externalApi: ExternalApiService) {}

  async flags() {
    const rows = await this.prisma.featureFlag.findMany({ where: { key: { in: [...AI_FEATURES] } } });
    const values = new Map(rows.map((row) => [row.key, row]));
    return AI_FEATURES.map((key) => values.get(key) ?? { key, enabled: false, config: null, updatedAt: null });
  }

  async upsertFlag(key: string, body: z.infer<typeof flagSchema>) {
    if (!AI_FEATURES.includes(key as typeof AI_FEATURES[number])) throw new NotFoundException('功能开关不存在');
    const data = { enabled: body.enabled, ...(body.config === undefined ? {} : { config: body.config as Prisma.InputJsonValue }) };
    return this.prisma.featureFlag.upsert({ where: { key }, create: { key, ...data }, update: data });
  }

  async channels() {
    const rows = await this.prisma.aiChannel.findMany({ where: { isActive: true }, include: { models: { where: { isActive: true }, orderBy: { name: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, baseUrl: channel.baseUrl, isActive: channel.isActive, hasApiKey: Boolean(channel.encryptedApiKey), models: channel.models }));
  }

  async createChannel(body: z.infer<typeof channelSchema>) {
    assertSafeUrl(body.baseUrl);
    const duplicate = new Set<string>();
    for (const model of body.models) { if (duplicate.has(model.name)) throw new BadRequestException('同一通道的模型名不能重复'); duplicate.add(model.name); }
    return this.prisma.aiChannel.create({ data: { name: body.name, baseUrl: body.baseUrl.replace(/\/+$/, ''), encryptedApiKey: encryptSecret(body.apiKey), models: { create: body.models } }, include: { models: true } });
  }

  async updateChannel(id: string, body: z.infer<typeof patchChannelSchema>) {
    const current = await this.prisma.aiChannel.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('AI 通道不存在');
    if (body.baseUrl) assertSafeUrl(body.baseUrl);
    return this.prisma.aiChannel.update({ where: { id }, data: {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.baseUrl === undefined ? {} : { baseUrl: body.baseUrl.replace(/\/+$/, '') }),
      ...(body.apiKey === undefined ? {} : { encryptedApiKey: encryptSecret(body.apiKey) }),
      ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
    }, include: { models: true } });
  }

  async addModel(channelId: string, body: z.infer<typeof modelSchema>) {
    if (!await this.prisma.aiChannel.count({ where: { id: channelId } })) throw new NotFoundException('AI 通道不存在');
    try { return await this.prisma.aiModel.create({ data: { channelId, ...body } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('模型已存在'); throw error; }
  }

  async updateModel(id: string, body: z.infer<typeof patchModelSchema>) {
    try { return await this.prisma.aiModel.update({ where: { id }, data: body }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('AI 模型不存在'); throw error; }
  }

  async deleteChannel(id: string) {
    const result = await this.prisma.aiChannel.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('AI 通道不存在');
    return { ok: true };
  }

  async deleteModel(id: string) {
    const result = await this.prisma.aiModel.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('AI 模型不存在');
    return { ok: true };
  }

  async testAi(body: z.infer<typeof testAiSchema>) {
    return this.externalAiTest(body.modelId, body.prompt);
  }

  private async externalAiTest(modelId: string, prompt: string) {
    const result = await this.prisma.aiModel.findFirst({ where: { id: modelId, isActive: true, channel: { isActive: true } } });
    if (!result) throw new NotFoundException('AI 模型不存在或不可用');
    // This is deliberately delegated to the public service by the controller.
    return { modelId: result.id, prompt };
  }

  async integrations() {
    const rows = await this.prisma.apiIntegration.findMany({ where: { enabled: true }, include: { variables: { orderBy: { name: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    return rows.map((item) => ({ id: item.id, name: item.name, url: item.url, method: item.method, requestParams: item.requestParams, enabled: item.enabled, headerKeys: Object.keys(item.encryptedHeaders ? { configured: true } : {}), variables: item.variables }));
  }

  async createIntegration(body: z.infer<typeof integrationSchema>) {
    assertSafeUrl(body.url);
    await this.assertVariableNames(body.variables.map((item) => item.name));
    return this.prisma.apiIntegration.create({ data: {
      name: body.name, url: body.url, method: body.method, enabled: body.enabled,
      encryptedHeaders: Object.keys(body.headers).length ? encryptSecret(JSON.stringify(body.headers)) : null,
      requestParams: body.requestParams as Prisma.InputJsonValue,
      variables: { create: body.variables },
    }, include: { variables: true } });
  }

  async updateIntegration(id: string, body: z.infer<typeof patchIntegrationSchema>) {
    const current = await this.prisma.apiIntegration.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('外部 API 不存在');
    if (body.url) assertSafeUrl(body.url);
    if (body.variables) await this.assertVariableNames(body.variables.map((item) => item.name), id);
    return this.prisma.$transaction(async (tx) => {
      if (body.variables) {
        await tx.apiIntegrationVariable.deleteMany({ where: { integrationId: id } });
        await tx.apiIntegrationVariable.createMany({ data: body.variables.map((item) => ({ integrationId: id, ...item })) });
      }
      return tx.apiIntegration.update({ where: { id }, data: {
        ...(body.name === undefined ? {} : { name: body.name }), ...(body.url === undefined ? {} : { url: body.url }), ...(body.method === undefined ? {} : { method: body.method }), ...(body.enabled === undefined ? {} : { enabled: body.enabled }),
        ...(body.requestParams === undefined ? {} : { requestParams: body.requestParams as Prisma.InputJsonValue }),
        ...(body.headers === undefined ? {} : { encryptedHeaders: Object.keys(body.headers).length ? encryptSecret(JSON.stringify(body.headers)) : null }),
      }, include: { variables: true } });
    });
  }

  async testIntegration(id: string) {
    const integration = await this.prisma.apiIntegration.findUnique({ where: { id }, include: { variables: true } });
    if (!integration) throw new NotFoundException('外部 API 不存在');
    const response = await this.externalApi.execute(integration);
    return {
      ok: true,
      preview: typeof response === 'object' ? response : String(response),
      variables: integration.variables.map((variable) => ({ name: variable.name, responsePath: variable.responsePath, value: stringValue(pickPath(response, variable.responsePath)) ?? null })),
    };
  }

  async deleteIntegration(id: string) {
    const result = await this.prisma.apiIntegration.deleteMany({ where: { id } });
    if (!result.count) throw new NotFoundException('外部 API 不存在');
    return { ok: true };
  }

  async templates() {
    return this.prisma.messageTemplate.findMany({ where: { scope: 'PLATFORM', isActive: true }, orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }] });
  }

  async createTemplate(body: z.infer<typeof platformTemplateSchema>) {
    this.validateTemplate(body.content);
    return this.prisma.messageTemplate.create({ data: { title: body.title, content: body.content, category: body.category || null, isActive: body.isActive, scope: 'PLATFORM', ownerId: null } });
  }

  async updateTemplate(id: string, body: z.infer<typeof patchPlatformTemplateSchema>) {
    const current = await this.prisma.messageTemplate.findFirst({ where: { id, scope: 'PLATFORM' } });
    if (!current) throw new NotFoundException('平台模板不存在');
    if (body.content) this.validateTemplate(body.content);
    return this.prisma.messageTemplate.update({ where: { id }, data: { ...body, ...(body.category === undefined ? {} : { category: body.category || null }), version: { increment: 1 } } });
  }

  async deleteTemplate(id: string) {
    const result = await this.prisma.messageTemplate.deleteMany({ where: { id, scope: 'PLATFORM' } });
    if (!result.count) throw new NotFoundException('平台模板不存在');
    return { ok: true };
  }

  private validateTemplate(content: string) {
    try { assertSafeTagValue(content); } catch (error) { throw new BadRequestException((error as Error).message); }
  }

  private async assertVariableNames(names: string[], currentId?: string) {
    if (new Set(names).size !== names.length) throw new BadRequestException('同一外部 API 的变量名不能重复');
    const existing = await this.prisma.apiIntegrationVariable.findMany({ where: { name: { in: names }, ...(currentId ? { integrationId: { not: currentId } } : {}) }, select: { name: true } });
    if (existing.length) throw new BadRequestException(`变量名已被其他 API 使用：${existing.map((item) => item.name).join('、')}`);
  }
}

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly ai: AiService) {}

  @Get('feature-flags')
  flags(@Req() request: AuthRequest) { assertAdmin(request); return this.admin.flags(); }

  @Patch('feature-flags/:key')
  updateFlag(@Req() request: AuthRequest, @Param('key') key: string, @Body(new ZodPipe(flagSchema)) body: z.infer<typeof flagSchema>) { assertAdmin(request); return this.admin.upsertFlag(key, body); }

  @Get('ai/channels')
  channels(@Req() request: AuthRequest) { assertAdmin(request); return this.admin.channels(); }

  @Post('ai/channels')
  createChannel(@Req() request: AuthRequest, @Body(new ZodPipe(channelSchema)) body: z.infer<typeof channelSchema>) { assertAdmin(request); return this.admin.createChannel(body); }

  @Patch('ai/channels/:id')
  updateChannel(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchChannelSchema)) body: z.infer<typeof patchChannelSchema>) { assertAdmin(request); return this.admin.updateChannel(id, body); }

  @Post('ai/channels/:id/delete')
  deleteChannel(@Req() request: AuthRequest, @Param('id') id: string) { assertAdmin(request); return this.admin.deleteChannel(id); }

  @Post('ai/channels/:id/models')
  addModel(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(modelSchema)) body: z.infer<typeof modelSchema>) { assertAdmin(request); return this.admin.addModel(id, body); }

  @Patch('ai/models/:id')
  updateModel(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchModelSchema)) body: z.infer<typeof patchModelSchema>) { assertAdmin(request); return this.admin.updateModel(id, body); }

  @Post('ai/models/:id/delete')
  deleteModel(@Req() request: AuthRequest, @Param('id') id: string) { assertAdmin(request); return this.admin.deleteModel(id); }

  @Post('ai/test')
  testAi(@Req() request: AuthRequest, @Body(new ZodPipe(testAiSchema)) body: z.infer<typeof testAiSchema>) { assertAdmin(request); return this.ai.generate(request.user.id, { mode: 'COPY', prompt: body.prompt, modelId: body.modelId }); }

  @Get('templates')
  templates(@Req() request: AuthRequest) { assertAdmin(request); return this.admin.templates(); }

  @Post('templates')
  createTemplate(@Req() request: AuthRequest, @Body(new ZodPipe(platformTemplateSchema)) body: z.infer<typeof platformTemplateSchema>) { assertAdmin(request); return this.admin.createTemplate(body); }

  @Patch('templates/:id')
  updateTemplate(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchPlatformTemplateSchema)) body: z.infer<typeof patchPlatformTemplateSchema>) { assertAdmin(request); return this.admin.updateTemplate(id, body); }

  @Post('templates/:id/delete')
  deleteTemplate(@Req() request: AuthRequest, @Param('id') id: string) { assertAdmin(request); return this.admin.deleteTemplate(id); }

  @Get('integrations')
  integrations(@Req() request: AuthRequest) { assertAdmin(request); return this.admin.integrations(); }

  @Post('integrations')
  createIntegration(@Req() request: AuthRequest, @Body(new ZodPipe(integrationSchema)) body: z.infer<typeof integrationSchema>) { assertAdmin(request); return this.admin.createIntegration(body); }

  @Patch('integrations/:id')
  updateIntegration(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchIntegrationSchema)) body: z.infer<typeof patchIntegrationSchema>) { assertAdmin(request); return this.admin.updateIntegration(id, body); }

  @Post('integrations/:id/test')
  testIntegration(@Req() request: AuthRequest, @Param('id') id: string) { assertAdmin(request); return this.admin.testIntegration(id); }

  @Post('integrations/:id/delete')
  deleteIntegration(@Req() request: AuthRequest, @Param('id') id: string) { assertAdmin(request); return this.admin.deleteIntegration(id); }
}
