import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { BUILT_IN_VARIABLES } from './content';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const variableSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,39}$/, '变量名需为 2-40 位英文、数字或下划线，并以英文字母开头'),
  displayName: z.string().trim().min(1).max(40),
  mode: z.enum(['FIXED', 'RANDOM', 'SEQUENCE']),
  values: z.array(z.string().trim().min(1).max(1000)).min(1).max(5000),
});
const patchVariableSchema = variableSchema.partial();

@Controller('variables')
@UseGuards(AuthGuard)
export class VariablesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() request: AuthRequest) {
    const [custom, external] = await Promise.all([
      this.prisma.customVariable.findMany({ where: { ownerId: request.user.id }, orderBy: { updatedAt: 'desc' }, include: { values: { orderBy: { position: 'asc' } } } }),
      this.prisma.apiIntegrationVariable.findMany({ where: { integration: { enabled: true } }, include: { integration: true }, orderBy: { updatedAt: 'desc' } }),
    ]);
    const names = new Set(custom.map((item) => item.name));
    return [...custom, ...external.filter((item, index, all) => !names.has(item.name) && all.findIndex((candidate) => candidate.name === item.name) === index).map((item) => ({
      id: `api:${item.id}`, name: item.name, displayName: `${item.displayName} · ${item.integration.name}`, mode: 'FIXED' as const, version: Math.floor(item.updatedAt.getTime() / 1000), values: [], source: 'API' as const,
    }))];
  }

  @Post()
  async create(@Req() request: AuthRequest, @Body(new ZodPipe(variableSchema)) body: z.infer<typeof variableSchema>) {
    this.validate(body.name, body.values);
    try {
      return await this.prisma.customVariable.create({ data: {
        ownerId: request.user.id, name: body.name, displayName: body.displayName, mode: body.mode,
        values: { create: body.values.map((value, position) => ({ value, position })) },
      }, include: { values: { orderBy: { position: 'asc' } } } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('变量名已存在');
      throw error;
    }
  }

  @Patch(':id')
  update(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchVariableSchema)) body: z.infer<typeof patchVariableSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  @Post(':id/update')
  updateFromMini(@Req() request: AuthRequest, @Param('id') id: string, @Body(new ZodPipe(patchVariableSchema)) body: z.infer<typeof patchVariableSchema>) {
    return this.updateOwned(request.user.id, id, body);
  }

  private async updateOwned(ownerId: string, id: string, body: z.infer<typeof patchVariableSchema>) {
    const item = await this.prisma.customVariable.findFirst({ where: { id, ownerId }, include: { values: true } });
    if (!item) throw new NotFoundException('变量不存在');
    const name = body.name ?? item.name;
    const values = body.values ?? item.values.sort((a, b) => a.position - b.position).map((value) => value.value);
    this.validate(name, values);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (body.values) {
          await tx.customVariableValue.deleteMany({ where: { variableId: id } });
          await tx.customVariableValue.createMany({ data: values.map((value, position) => ({ variableId: id, value, position })) });
        }
        return tx.customVariable.update({ where: { id }, data: {
          ...(body.name ? { name: body.name } : {}), ...(body.displayName ? { displayName: body.displayName } : {}), ...(body.mode ? { mode: body.mode } : {}), version: { increment: 1 },
        }, include: { values: { orderBy: { position: 'asc' } } } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('变量名已存在');
      throw error;
    }
  }

  private validate(name: string, values: string[]) {
    if ((BUILT_IN_VARIABLES as readonly string[]).includes(name)) throw new BadRequestException('不能覆盖平台内置变量');
    if (!values.length || values.some((value) => !value.trim())) throw new BadRequestException('变量候选值不能为空');
    try { values.forEach(assertSafeTagValue); } catch (error) { throw new BadRequestException((error as Error).message); }
  }
}
