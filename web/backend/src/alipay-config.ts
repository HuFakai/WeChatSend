import { BadRequestException, Body, Controller, Get, Injectable, Patch, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AlipaySdk } from 'alipay-sdk';
import { assertAdmin, AuthGuard, AuthRequest } from './auth';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { decryptSecret, encryptSecret } from './secrets';
import { ZodPipe } from './zod.pipe';

export const alipayConfigSchema = z.object({
  appId: z.string().regex(/^\d{16}$/),
  privateKey: z.string().trim().min(100).max(16000).optional(), publicKey: z.string().trim().min(100).max(8000).optional(),
  notifyUrl: z.string().url().refine((s) => s.startsWith('https://'), '回调必须使用 HTTPS'),
  expireMinutes: z.number().int().min(5).max(120), enabled: z.boolean(),
});
export type AlipaySettings = Omit<z.infer<typeof alipayConfigSchema>, 'privateKey' | 'publicKey'> & {
  privateKey: string;
  publicKey: string;
  sellerId: string;
  gateway: 'https://openapi.alipay.com/gateway.do';
  keyType: 'PKCS1';
};
export const ALIPAY_GATEWAY = 'https://openapi.alipay.com/gateway.do' as const;
export const ALIPAY_KEY_TYPE = 'PKCS1' as const;
@Injectable()
export class AlipayConfigService {
  constructor(private readonly prisma: PrismaService) {}
  async settings(): Promise<AlipaySettings> {
    const row = await this.prisma.alipayConfig.findUnique({ where: { id: 'default' } });
    const c = config();
    if (row) return { ...row, sellerId:c.ALIPAY_SELLER_ID||'', privateKey: decryptSecret(row.encryptedPrivateKey), gateway: ALIPAY_GATEWAY, keyType: ALIPAY_KEY_TYPE };
    return { appId:c.ALIPAY_APP_ID||'',sellerId:c.ALIPAY_SELLER_ID||'',gateway:ALIPAY_GATEWAY,privateKey:c.ALIPAY_PRIVATE_KEY||'',publicKey:c.ALIPAY_PUBLIC_KEY||'',keyType:ALIPAY_KEY_TYPE,notifyUrl:c.ALIPAY_NOTIFY_URL||'',expireMinutes:c.ALIPAY_ORDER_EXPIRE_MINUTES,enabled:Boolean(c.ALIPAY_APP_ID&&c.ALIPAY_PRIVATE_KEY&&c.ALIPAY_PUBLIC_KEY&&c.ALIPAY_NOTIFY_URL) };
  }
  async view() {
    const c=await this.settings();
    return {appId:c.appId,notifyUrl:c.notifyUrl,expireMinutes:c.expireMinutes,enabled:c.enabled,hasPrivateKey:Boolean(c.privateKey),hasPublicKey:Boolean(c.publicKey)};
  }
  async save(body:z.infer<typeof alipayConfigSchema>) {
    const previous=await this.settings();
    if(body.appId!==previous.appId&&(!body.privateKey||!body.publicKey)) throw new BadRequestException('更换 AppID 时请同时提供新应用私钥和支付宝公钥');
    const privateKey=body.privateKey||previous.privateKey,publicKey=body.publicKey||previous.publicKey;
    if(!privateKey||!publicKey) throw new BadRequestException('请完整配置应用私钥和支付宝公钥');
    const data={appId:body.appId,sellerId:previous.sellerId,gateway:ALIPAY_GATEWAY,keyType:ALIPAY_KEY_TYPE,notifyUrl:body.notifyUrl,expireMinutes:body.expireMinutes,enabled:body.enabled,encryptedPrivateKey:encryptSecret(privateKey),publicKey};
    await this.prisma.alipayConfig.upsert({where:{id:'default'},create:data,update:data});
    return this.view();
  }
  sdk(c:AlipaySettings) {
    if(!c.appId||!c.privateKey||!c.publicKey||!c.notifyUrl) throw new BadRequestException('支付宝支付配置不完整，请联系管理员');
    return new AlipaySdk({appId:c.appId,privateKey:c.privateKey,alipayPublicKey:c.publicKey,gateway:c.gateway,keyType:c.keyType,signType:'RSA2',timeout:15000});
  }
  async forOrder(order:{encryptedConfig:string|null}):Promise<AlipaySettings>{return order.encryptedConfig?JSON.parse(decryptSecret(order.encryptedConfig)):this.settings();}
}
@UseGuards(AuthGuard)
@Controller('admin/alipay')
export class AlipayAdminController {
  constructor(private readonly settings:AlipayConfigService){}
  @Get('config') view(@Req() r:AuthRequest){assertAdmin(r);return this.settings.view();}
  @Patch('config') save(@Req() r:AuthRequest,@Body(new ZodPipe(alipayConfigSchema)) b:z.infer<typeof alipayConfigSchema>){assertAdmin(r);return this.settings.save(b);}
}
