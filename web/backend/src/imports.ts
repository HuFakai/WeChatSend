import { BadRequestException, Body, Controller, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { AuthGuard, AuthRequest } from './auth';
import { AiService } from './ai';
import { BUILT_IN_VARIABLES } from './content';
import { assertSafeTagValue } from './lib';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const fileSchema = z.object({ fileName: z.string().min(1).max(200), base64: z.string().min(1).max(15_000_000) });
const friendCommitSchema = z.object({ accountId: z.string().uuid(), remarks: z.array(z.string().trim().min(1).max(200)).min(1).max(5000) });
const imageSchema = z.object({ modelId: z.string().uuid().optional(), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), imageData: z.string().min(100).max(12_000_000) });
const variableFileSchema = fileSchema.extend({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{1,63}$/), displayName: z.string().trim().min(1).max(100), mode: z.enum(['FIXED', 'RANDOM', 'SEQUENCE']) });

function parseRows(fileName: string, base64: string) {
  const lower = fileName.toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].some((extension) => lower.endsWith(extension))) throw new BadRequestException('只支持 CSV、XLSX 或 XLS 文件');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new BadRequestException('文件内容为空');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellNF: false, cellText: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new BadRequestException('文件没有可读取的工作表');
  for (const cell of Object.values(sheet) as Array<{ f?: unknown }>) if (cell?.f) throw new BadRequestException('文件包含公式，请先粘贴为纯值后再导入');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  const values = rows.map((row) => Array.isArray(row) ? String(row[0] ?? '').trim() : '').filter(Boolean);
  const first = values[0]?.toLowerCase();
  const headers = new Set(['name', 'remark', 'remarks', '好友', '好友备注', '备注', 'value', '值']);
  return (first && headers.has(first) ? values.slice(1) : values).slice(0, 5000);
}

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService, private readonly ai: AiService) {}

  parseFile(body: z.infer<typeof fileSchema>) {
    const values = parseRows(body.fileName, body.base64);
    return { values, count: values.length, warnings: [] };
  }

  async commitFriends(ownerId: string, body: z.infer<typeof friendCommitSchema>) {
    const account = await this.prisma.wechatAccount.findFirst({ where: { id: body.accountId, ownerId } });
    if (!account) throw new BadRequestException('发送账号不存在');
    const unique = [...new Set(body.remarks.map((remark) => remark.trim()).filter(Boolean))];
    const existing = await this.prisma.friend.findMany({ where: { accountId: account.id, remarkKey: { in: unique.map((remark) => remark.toLocaleLowerCase()) } }, select: { remark: true, remarkKey: true } });
    const existingKeys = new Set(existing.map((friend) => friend.remarkKey));
    const toCreate = unique.filter((remark) => !existingKeys.has(remark.toLocaleLowerCase()));
    if (toCreate.length) await this.prisma.friend.createMany({ data: toCreate.map((remark) => ({ ownerId, accountId: account.id, remark, remarkKey: remark.toLocaleLowerCase() })) });
    return { imported: toCreate.length, skipped: unique.length - toCreate.length, duplicates: existing.map((friend) => friend.remark) };
  }

  async parseAndSaveVariable(ownerId: string, body: z.infer<typeof variableFileSchema>) {
    if ((BUILT_IN_VARIABLES as readonly string[]).includes(body.name)) throw new BadRequestException('不能覆盖平台内置变量');
    const values = parseRows(body.fileName, body.base64);
    if (!values.length) throw new BadRequestException('文件中没有有效候选值');
    for (const value of values) assertSafeTagValue(value);
    const current = await this.prisma.customVariable.findFirst({ where: { ownerId, name: body.name }, include: { values: true } });
    if (!current) {
      return this.prisma.customVariable.create({ data: { ownerId, name: body.name, displayName: body.displayName, mode: body.mode, values: { create: values.map((value, position) => ({ value, position })) } }, include: { values: { orderBy: { position: 'asc' } } } });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.customVariableValue.deleteMany({ where: { variableId: current.id } });
      return tx.customVariable.update({ where: { id: current.id }, data: { displayName: body.displayName, mode: body.mode, version: { increment: 1 }, values: { create: values.map((value, position) => ({ value, position })) } }, include: { values: { orderBy: { position: 'asc' } } } });
    });
  }

  parseImage(body: z.infer<typeof imageSchema>) { return this.ai.parseFriendImage(body.modelId, body.imageData, body.mimeType); }
}

@Controller('imports')
@UseGuards(AuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportService) {}

  @Post('friends/file/parse')
  parseFriends(@Body(new ZodPipe(fileSchema)) body: z.infer<typeof fileSchema>) { return this.imports.parseFile(body); }

  @Post('friends/file/commit')
  commitFriends(@Req() request: AuthRequest, @Body(new ZodPipe(friendCommitSchema)) body: z.infer<typeof friendCommitSchema>) { return this.imports.commitFriends(request.user.id, body); }

  @Post('friends/image/parse')
  parseImage(@Body(new ZodPipe(imageSchema)) body: z.infer<typeof imageSchema>) { return this.imports.parseImage(body); }

  @Post('variables/file/import')
  importVariable(@Req() request: AuthRequest, @Body(new ZodPipe(variableFileSchema)) body: z.infer<typeof variableFileSchema>) { return this.imports.parseAndSaveVariable(request.user.id, body); }
}
