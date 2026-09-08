import { BadRequestException } from '@nestjs/common';
import { createHash, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
const parser=new XMLParser({parseTagValue:false,ignoreAttributes:true,processEntities:false});
function parse(s:string):Record<string,any>{const p=s.trimStart().startsWith('{')?JSON.parse(s):parser.parse(s);return p.xml||p;}
function same(a:string,b:string){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function decryptWechatPush(encrypted:string,keyText:string,appId:string){
  const key=Buffer.from(keyText+'=','base64');
  if(key.length!==32)throw new BadRequestException('微信推送密钥长度错误');
  const cipher=createDecipheriv('aes-256-cbc',key,key.subarray(0,16));cipher.setAutoPadding(false);
  const padded=Buffer.concat([cipher.update(Buffer.from(encrypted,'base64')),cipher.final()]);
  const n=padded[padded.length-1];
  if(!n||n>32||!padded.subarray(-n).every(v=>v===n))throw new BadRequestException('微信推送填充错误');
  const raw=padded.subarray(0,-n);
  if(raw.length<20)throw new BadRequestException('微信推送内容错误');
  const size=raw.readUInt32BE(16);
  if(size>raw.length-20||raw.subarray(20+size).toString()!==appId)throw new BadRequestException('微信推送接收方错误');
  return raw.subarray(20,20+size).toString('utf8');
}
export function parseWechatPush(raw:string,query:Record<string,string>,cfg:{token:string;appId:string;mode:string;aesKey?:string}){
  const outer=parse(raw),encrypted=outer.Encrypt||outer.encrypt;
  if(!query.timestamp||!query.nonce)throw new BadRequestException('推送缺少签名参数');
  if(cfg.mode==='SECURE'&&!encrypted)throw new BadRequestException('安全模式拒绝明文推送');
  const parts=[cfg.token,query.timestamp,query.nonce,...(encrypted?[String(encrypted)]:[])];
  const signature=createHash('sha1').update(parts.sort().join('')).digest('hex');
  if(!same(encrypted?query.msg_signature:query.signature,signature))throw new BadRequestException('微信推送签名无效');
  if(!encrypted)return outer;
  if(!cfg.aesKey)throw new BadRequestException('缺少推送解密密钥');
  return parse(decryptWechatPush(encrypted,cfg.aesKey,cfg.appId));
}
