import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from './config';

@Injectable()
export class WechatAccessService {
  private cached?: { value: string; until: number };
  private pending?: Promise<string>;
  async token(): Promise<string> {
    if (this.cached && this.cached.until > Date.now()) return this.cached.value;
    if (this.pending) return this.pending;
    this.pending = this.fetchToken();
    try { return await this.pending; } finally { this.pending = undefined; }
  }
  private async fetchToken() {
    const cfg = config();
    if (!cfg.WECHAT_MINI_APPID || !cfg.WECHAT_MINI_SECRET) throw new BadRequestException('请配置小程序 AppID 和 Secret');
    const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ grant_type: 'client_credential', appid: cfg.WECHAT_MINI_APPID, secret: cfg.WECHAT_MINI_SECRET }),
    });
    const result = await response.json() as { access_token?: string; expires_in?: number };
    if (!response.ok || !result.access_token) throw new BadRequestException('获取小程序凭据失败，请检查 AppID、Secret 和服务器 IP 白名单');
    this.cached = { value: result.access_token, until: Date.now() + Math.max(1, (result.expires_in || 7200) - 300) * 1000 };
    return result.access_token;
  }
  async code(scene: string) {
    const cfg = config();
    const token = await this.token();
    const result = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene, page: 'pages/scan/index', env_version: cfg.WECHAT_MINI_ENV_VERSION, check_path: cfg.WECHAT_MINI_ENV_VERSION === 'release', width: 320 }),
    });
    if (!result.ok || !result.headers.get('content-type')?.startsWith('image/')) throw new BadRequestException('生成小程序码失败，请检查小程序版本、页面路径与发布状态');
    return `data:image/png;base64,${Buffer.from(await result.arrayBuffer()).toString('base64')}`;
  }
}
