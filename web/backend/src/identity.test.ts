import 'reflect-metadata';
import {describe,it,expect,vi} from 'vitest';
import {hash} from 'bcryptjs';
import {IdentityService,showDevelopmentTicket} from './identity';
import {hashToken} from './lib';
import {MiniAuthController} from './mini-auth';
const cfg={AUTH_SHOW_DEV_TICKET:true,WECHAT_MINI_ENV_VERSION:'develop',SESSION_TTL_DAYS:30,WECHAT_MINI_APPID:'wx-test',WECHAT_MINI_SECRET:'test',APP_ENCRYPTION_KEY:'01234567890123456789012345678901'};
vi.mock('./config',()=>({config:()=>cfg}));
const id='11111111-1111-4111-8111-111111111111';
function harness(item:any){
 const state={id,attempts:0,consumedAt:null,userId:null,approvedId:null,expiresAt:new Date(Date.now()+60000),...item};
 const tx:any={$queryRaw:vi.fn().mockResolvedValue([]),authChallenge:{findUnique:vi.fn(async()=>state),update:vi.fn(async({data}:any)=>{if(data.attempts)state.attempts++;if(data.consumedAt)state.consumedAt=data.consumedAt;return state;})},user:{findUnique:vi.fn(async()=>({id:'u',status:'ACTIVE'}))},session:{create:vi.fn().mockResolvedValue({})}};
 const db={...tx,$transaction:async(fn:any)=>fn(tx),resilient:(fn:any)=>fn()};
 return {svc:new IdentityService(db as any,{} as any,{} as any),state,tx};
}
describe('identity challenges',()=>{
 it('release always hides development tickets',()=>{expect(showDevelopmentTicket()).toBe(true);cfg.WECHAT_MINI_ENV_VERSION='release';expect(showDevelopmentTicket()).toBe(false);cfg.WECHAT_MINI_ENV_VERSION='develop';});
 it('poll requires a separate browser secret',async()=>{const h=harness({kind:'SCAN',secretHash:hashToken('browser-secret'),approvedId:'u'});await expect(h.svc.poll(id,'wrong')).rejects.toThrow('无效');expect(h.tx.session.create).not.toHaveBeenCalled();});
 it('unapproved and expired tickets never issue sessions',async()=>{const h=harness({kind:'SCAN',secretHash:hashToken('secret')});expect(await h.svc.poll(id,'secret')).toEqual({status:'WAITING'});h.state.expiresAt=new Date(0);expect(await h.svc.poll(id,'secret')).toEqual({status:'EXPIRED'});expect(h.tx.session.create).not.toHaveBeenCalled();});
 it('approved ticket can be consumed only once',async()=>{const h=harness({kind:'SCAN',secretHash:hashToken('secret'),approvedId:'u'});expect((await h.svc.poll(id,'secret')).status).toBe('APPROVED');expect((await h.svc.poll(id,'secret')).status).toBe('EXPIRED');expect(h.tx.session.create).toHaveBeenCalledTimes(1);});
 it('wrong OTP attempts are persisted and exhausted after five tries',async()=>{const h=harness({kind:'EMAIL_LOGIN',subject:'a@example.com',secretHash:await hash('123456',4)});for(let n=0;n<5;n++)await expect(h.svc.verify({email:'a@example.com',challengeId:id,code:'000000'})).rejects.toThrow();expect(h.state.attempts).toBe(5);await expect(h.svc.verify({email:'a@example.com',challengeId:id,code:'123456'})).rejects.toThrow();expect(h.state.consumedAt).toBeNull();});
 it('bind code cannot be consumed by another logged-in account',async()=>{const h=harness({kind:'EMAIL_BIND',subject:'a@example.com',userId:'first',secretHash:await hash('123456',4)});await expect(h.svc.verify({email:'a@example.com',challengeId:id,code:'123456'},'second')).rejects.toThrow();expect(h.tx.authChallenge.update).not.toHaveBeenCalled();});
 it('OTP is consumed after successful verification',async()=>{const h=harness({kind:'EMAIL_LOGIN',subject:'a@example.com',secretHash:await hash('123456',4)});await h.svc.verify({email:'a@example.com',challengeId:id,code:'123456'});expect(h.state.consumedAt).not.toBeNull();await expect(h.svc.verify({email:'a@example.com',challengeId:id,code:'123456'})).rejects.toThrow();});
 it('mini silent login returns needsRegistration, not 404 for a new user',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({openid:'wx-id',session_key:'session'})}));const controller=new MiniAuthController({user:{findUnique:async()=>null}} as any);expect(await controller.silent({code:'code'})).toEqual({token:null,needsRegistration:true});vi.unstubAllGlobals();});
});
