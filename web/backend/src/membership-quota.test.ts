import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { TasksService } from './tasks';

function harness(grants: Array<{id:string;quotaTotal:number;quotaUsed:number;expiresAt:Date}>, enabled=true) {
  const updates: Array<{id:string;amount:number}> = [], usages: any[] = [];
  const tx:any = {
    featureFlag:{findUnique:async()=>({enabled})},
    $queryRaw:vi.fn().mockResolvedValue([]),
    membershipGrant:{
      findMany:async()=>grants,
      update:vi.fn(async({where,data}:any)=>{const g=grants.find(x=>x.id===where.id)!;g.quotaUsed+=(data.quotaUsed.increment||0)-(data.quotaUsed.decrement||0);updates.push({id:g.id,amount:(data.quotaUsed.increment||0)-(data.quotaUsed.decrement||0)});}),
    },
    membershipUsage:{create:vi.fn(async({data}:any)=>{usages.push({...data,id:`u${usages.length}`,refunded:0,createdAt:new Date()});}),findMany:async()=>usages,update:vi.fn(async({where,data}:any)=>{const u=usages.find(x=>x.id===where.id);u.refunded+=data.refunded.increment;})},
  };
  return {service:new TasksService({} as any,{} as any) as any,tx,grants,updates,usages};
}

describe('membership quota reservations',()=>{
  it('does not enforce quota while the monetization flag is disabled',async()=>{const h=harness([],false);await h.service.reserveMembership(h.tx,'user','task',100);expect(h.tx.$queryRaw).not.toHaveBeenCalled();});
  it('rejects users without an active entitlement',async()=>{const h=harness([]);await expect(h.service.reserveMembership(h.tx,'user','task',1)).rejects.toThrow('有效会员权益');});
  it('locks and allocates across expiring finite grants without overuse',async()=>{const h=harness([{id:'first',quotaTotal:5,quotaUsed:4,expiresAt:new Date()},{id:'second',quotaTotal:10,quotaUsed:2,expiresAt:new Date()}]);await h.service.reserveMembership(h.tx,'user','task',5);expect(h.tx.$queryRaw).toHaveBeenCalled();expect(h.updates).toEqual([{id:'first',amount:1},{id:'second',amount:4}]);expect(h.usages.map(x=>x.amount)).toEqual([1,4]);});
  it('rejects an over-quota task before writing usage rows',async()=>{const h=harness([{id:'g',quotaTotal:5,quotaUsed:4,expiresAt:new Date()}]);await expect(h.service.reserveMembership(h.tx,'user','task',2)).rejects.toThrow('当前可用 1');expect(h.usages).toHaveLength(0);});
  it('unlimited grants authorize without incrementing a finite counter',async()=>{const h=harness([{id:'g',quotaTotal:0,quotaUsed:0,expiresAt:new Date()}]);await h.service.reserveMembership(h.tx,'user','task',999);expect(h.updates).toHaveLength(0);expect(h.usages[0].amount).toBe(0);});
  it('cancelling pending recipients refunds only their reserved quantity once',async()=>{const h=harness([{id:'g',quotaTotal:10,quotaUsed:5,expiresAt:new Date()}]);h.usages.push({id:'u',taskId:'task',grantId:'g',amount:5,refunded:0,createdAt:new Date()});await h.service.releaseMembership(h.tx,'task',3);expect(h.grants[0].quotaUsed).toBe(2);expect(h.usages[0].refunded).toBe(3);await h.service.releaseMembership(h.tx,'task',3);expect(h.grants[0].quotaUsed).toBe(0);expect(h.usages[0].refunded).toBe(5);});
});
