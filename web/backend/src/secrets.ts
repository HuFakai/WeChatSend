import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { config } from './config';

function key() {
  const value = config().APP_ENCRYPTION_KEY;
  if (!value) throw new BadRequestException('服务端未配置 APP_ENCRYPTION_KEY，暂时不能保存密钥');
  return createHash('sha256').update(value).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('密钥格式无效');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}

export function normalizeSecretJson(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return encryptSecret(JSON.stringify(value));
}

export function parseSecretJson(value: string | null) {
  if (!value) return {} as Record<string, string>;
  const parsed = JSON.parse(decryptSecret(value)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('密钥 JSON 格式无效');
  return parsed as Record<string, string>;
}
