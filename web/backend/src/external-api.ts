import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiIntegration, ApiIntegrationVariable, HttpMethod } from '@prisma/client';
import { config } from './config';
import { FrozenVariable } from './content';
import { parseSecretJson } from './secrets';
import { PrismaService } from './prisma.service';

type IntegrationWithVariables = ApiIntegration & { variables: ApiIntegrationVariable[] };

function pathParts(path: string) {
  return path.replace(/^\$\.?/, '').replace(/\[(['"]?)([^'"\]]+)\1\]/g, '.$2').split('.').filter(Boolean);
}

export function pickPath(input: unknown, path: string): unknown {
  return pathParts(path).reduce<unknown>((value, part) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[part];
  }, input);
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringValue(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

@Injectable()
export class ExternalApiService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveVariables(names: string[]): Promise<FrozenVariable[]> {
    if (!names.length) return [];
    const rows = await this.prisma.apiIntegrationVariable.findMany({
      where: { name: { in: names }, integration: { enabled: true } },
      include: { integration: true },
      orderBy: { updatedAt: 'desc' },
    });
    const uniqueNames = new Set(rows.map((row) => row.name));
    if (!uniqueNames.size) return [];
    const integrations = new Map<string, IntegrationWithVariables>();
    for (const row of rows) {
      const current = integrations.get(row.integrationId) ?? { ...row.integration, variables: [] };
      current.variables.push(row);
      integrations.set(row.integrationId, current);
    }
    const values = new Map<string, string | undefined>();
    for (const integration of integrations.values()) {
      const response = await this.execute(integration);
      for (const variable of integration.variables) values.set(variable.name, stringValue(pickPath(response, variable.responsePath)));
    }
    return rows
      .filter((row, index, all) => all.findIndex((candidate) => candidate.name === row.name) === index)
      .map((row) => ({
        id: `api:${row.id}`,
        name: row.name,
        displayName: row.displayName,
        mode: 'FIXED' as const,
        version: Math.floor(row.updatedAt.getTime() / 1000),
        values: values.get(row.name) === undefined ? [] : [values.get(row.name)!],
      }));
  }

  async execute(integration: IntegrationWithVariables | ApiIntegration) {
    const headers = { ...parseSecretJson(integration.encryptedHeaders), accept: 'application/json' };
    let url = integration.url;
    const params = jsonObject(integration.requestParams);
    const method = integration.method as HttpMethod;
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(config().AI_REQUEST_TIMEOUT_MS) };
    if (method === 'GET') {
      const target = new URL(url);
      for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
      url = target.toString();
    } else {
      init.headers = { ...headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(params);
    }
    const response = await fetch(url, init);
    const raw = await response.text();
    if (!response.ok) throw new BadRequestException(`外部 API 请求失败（${response.status}）`);
    try { return JSON.parse(raw) as unknown; } catch { throw new BadRequestException('外部 API 未返回有效 JSON'); }
  }
}
