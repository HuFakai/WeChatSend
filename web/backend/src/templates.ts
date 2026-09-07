import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const templateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  content: z.string().min(1).max(10000),
  category: z.string().trim().max(40).optional().nullable(),
});
const patchTemplateSchema = templateSchema.partial().extend({ isActive: z.boolean().optional() });

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

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
}
