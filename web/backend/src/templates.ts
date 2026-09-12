import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { FrozenVariable, referencedVariables, renderContent, unknownVariables } from './content';
import { ExternalApiService } from './external-api';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';
import { randomUUID } from 'node:crypto';

const templateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().min(1).max(10000),
  category: z.string().trim().max(40).optional().nullable(),
});
const patchTemplateSchema = templateSchema.partial().extend({ isActive: z.boolean().optional() });
const previewTemplateSchema = z.object({
  content: z.string().min(1).max(10000),
  friendRemark: z.string().trim().min(1).max(100).default('好友备注示例'),
  salutation: z.string().trim().max(100).optional().default('王总'),
});

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly prisma: PrismaService, private readonly externalApi: ExternalApiService) {}

  @Get()
  async list(@Req() request: AuthRequest) {
    const items = await this.prisma.messageTemplate.findMany({
      where: { isActive: true, OR: [{ scope: 'PLATFORM' }, { ownerId: request.user.id }] },
      orderBy: [{ scope: 'asc' }, { updatedAt: 'desc' }],
      include: { favorites: { where: { ownerId: request.user.id }, select: { ownerId: true } } },
    });
    return items.map(({ favorites, ...item }) => ({ ...item, favorite: favorites.length > 0 }));
  }

  @Post()
  create(@Req() request: AuthRequest, @Body(new ZodPipe(templateSchema)) body: z.infer<typeof templateSchema>) {
    this.validate(body.content);
    return this.prisma.messageTemplate.create({ data: { ...body, category: body.category || null, ownerId: request.user.id, scope: 'USER' } });
  }

  @Post('preview')
  async preview(@Req() request: AuthRequest, @Body(new ZodPipe(previewTemplateSchema)) body: z.infer<typeof previewTemplateSchema>) {
    this.validate(body.content);
    const [owner, variables] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: request.user.id }, select: { timezone: true } }),
      this.resolveVariables(request.user.id, body.content),
    ]);
    const rendered = renderContent({
      template: body.content,
      variables,
      friendRemark: body.friendRemark,
      salutation: body.salutation || null,
      scheduledAt: new Date(),
      timezone: owner.timezone,
      seed: randomUUID(),
      recipientOrder: 0,
    });
    return { content: rendered.content, resolved: rendered.resolved };
  }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchTemplateSchema)) body: z.infer<typeof patchTemplateSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  @Post(':id/update')
  updateFromMini(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchTemplateSchema)) body: z.infer<typeof patchTemplateSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  @Post(':id/favorite')
  async favorite(@Req() request: AuthRequest, @Param('id') id: string) {
    const item = await this.visible(request.user.id, id);
    const where = { ownerId_templateId: { ownerId: request.user.id, templateId: item.id } };
    const existing = await this.prisma.templateFavorite.findUnique({ where });
    if (existing) {
      await this.prisma.templateFavorite.delete({ where });
      return { favorite: false };
    }
    await this.prisma.templateFavorite.create({ data: { ownerId: request.user.id, templateId: item.id } });
    return { favorite: true };
  }

  @Post(':id/copy')
  async copy(@Req() request: AuthRequest, @Param('id') id: string) {
    const item = await this.visible(request.user.id, id);
    return this.prisma.messageTemplate.create({ data: {
      ownerId: request.user.id, scope: 'USER', title: `副本：${item.title}`.slice(0, 100), content: item.content, category: item.category,
    } });
  }

  @Post(':id/delete')
  async remove(@Req() request: AuthRequest, @Param('id') id: string) {
    const result = await this.prisma.messageTemplate.deleteMany({ where: { id, ownerId: request.user.id, scope: 'USER' } });
    if (!result.count) throw new NotFoundException('自建模板不存在');
    return { ok: true };
  }

  private async updateOwned(ownerId: string, id: string, body: z.infer<typeof patchTemplateSchema>) {
    const item = await this.prisma.messageTemplate.findFirst({ where: { id, ownerId, scope: 'USER' } });
    if (!item) throw new NotFoundException('自建模板不存在');
    if (body.content) this.validate(body.content);
    return this.prisma.messageTemplate.update({ where: { id }, data: {
      ...body,
      ...(body.category !== undefined ? { category: body.category || null } : {}),
      version: { increment: 1 },
    } });
  }

  private async visible(ownerId: string, id: string) {
    const item = await this.prisma.messageTemplate.findFirst({ where: { id, isActive: true, OR: [{ scope: 'PLATFORM' }, { ownerId }] } });
    if (!item) throw new NotFoundException('模板不存在');
    return item;
  }

  private validate(content: string) {
    try { assertSafeTagValue(content); } catch (error) { throw new BadRequestException((error as Error).message); }
  }

  private async resolveVariables(ownerId: string, content: string): Promise<FrozenVariable[]> {
    const names = referencedVariables(content);
    const rows = await this.prisma.customVariable.findMany({
      where: { ownerId, name: { in: names } },
      include: { values: { orderBy: { position: 'asc' } } },
    });
    const variables: FrozenVariable[] = rows.map((variable) => ({
      id: variable.id,
      name: variable.name,
      displayName: variable.displayName,
      mode: variable.mode,
      version: variable.version,
      values: variable.values.map((value) => value.value),
    }));
    const customNames = new Set(variables.map((variable) => variable.name));
    variables.push(...await this.externalApi.resolveVariables(names.filter((name) => !customNames.has(name))));
    const unknown = unknownVariables(content, variables);
    if (unknown.length) throw new BadRequestException(`未知变量：${unknown.map((name) => `{{${name}}}`).join('、')}`);
    if (variables.some((variable) => !variable.values.length)) throw new BadRequestException('变量候选值不能为空');
    return variables;
  }
}
