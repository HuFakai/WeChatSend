import { Check, Clock, Send } from 'lucide-react';
import { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/states';
import { cn } from '@/lib/utils';
import type { CustomVariable, MessageTemplate, Segment } from '@/types';
import { builtInVariables, localDateTimeValue, type Preview, type Selection, type Timing } from './types';

export function BuilderProgress({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return <ol className="grid grid-cols-4 overflow-hidden rounded-xl border border-neutral-300 bg-white">{['写文案', '选好友', '定时间', '确认'].map((label, index) => {
    const number = index + 1; const active = step === number; const complete = number < step;
    return <li key={label}><button type="button" disabled={!complete} onClick={() => onStep(number)} className={cn('flex w-full items-center justify-center border-r border-neutral-200 px-2 py-3 text-xs last:border-0 sm:text-sm', active ? 'bg-neutral-950 text-white' : complete ? 'text-neutral-950 hover:bg-neutral-100' : 'text-neutral-400')}><span className="mr-1.5 font-mono text-[10px]">0{number}</span>{label}</button></li>;
  })}</ol>;
}

export function ContentStep({ title, content, templateId, templates, variables, onTitle, onContent, onTemplate, onVariable }: { title: string; content: string; templateId: string | null; templates: MessageTemplate[]; variables: CustomVariable[]; onTitle: (value: string) => void; onContent: (value: string) => void; onTemplate: (id: string) => void; onVariable: (name: string, start?: number, end?: number) => void }) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const insert = (name: string) => {
    const start = editorRef.current?.selectionStart ?? content.length;
    const end = editorRef.current?.selectionEnd ?? start;
    onVariable(name, start, end);
    const cursor = start + name.length + 4;
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(cursor, cursor); });
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
    <Card><CardHeader><CardTitle>消息内容</CardTitle></CardHeader><CardContent className="space-y-5"><label><span className="field-label">任务名称</span><Input value={title} onChange={(event) => onTitle(event.target.value)} maxLength={100} placeholder="例如：中秋客户问候" /></label><label><span className="field-label">选择模板</span><select className="select" value={templateId ?? ''} onChange={(event) => onTemplate(event.target.value)}><option value="">不使用模板</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.scope === 'PLATFORM' ? '平台精选 · ' : '我的模板 · '}{item.title}</option>)}</select></label><label><span className="field-label">微信消息</span><Textarea ref={editorRef} className="min-h-72" value={content} onChange={(event) => onContent(event.target.value)} maxLength={10000} placeholder="输入要发送给好友的消息…" /><span className="field-help block">变量会插入当前光标位置；提交时为每位好友冻结最终文案。</span></label></CardContent></Card>
    <Card><CardHeader><CardTitle>插入变量</CardTitle></CardHeader><CardContent><VariableGroup label="内置变量" items={builtInVariables} onSelect={insert} /><div className="my-5 border-t border-neutral-100" /><VariableGroup label="我的变量" items={variables.map((item) => ({ name: item.name, label: item.displayName }))} onSelect={insert} empty="尚未创建自定义变量" /></CardContent></Card>
  </div>;
}

function VariableGroup({ label, items, onSelect, empty }: { label: string; items: Array<{ name: string; label: string }>; onSelect: (name: string) => void; empty?: string }) {
  return <div><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</p><div className="flex flex-wrap gap-2">{items.map((item) => <button type="button" key={item.name} onClick={() => onSelect(item.name)} className="rounded-lg border border-neutral-200 px-3 py-2 text-left text-xs transition-colors hover:border-neutral-950 hover:bg-neutral-50"><b className="block font-mono text-[11px]">{`{{${item.name}}}`}</b><span className="text-neutral-400">{item.label}</span></button>)}{!items.length ? <p className="text-xs text-neutral-400">{empty}</p> : null}</div></div>;
}

export function AudienceStep({ selections, onFriend, onSegment }: { selections: Record<string, Selection>; onFriend: (accountId: string, friendId: string) => void; onSegment: (accountId: string, segment: Segment) => void }) {
  return <div className="space-y-4">{Object.values(selections).map((selection) => <Card key={selection.account.id}>
    <CardHeader className="flex-row items-center justify-between"><div><CardTitle>{selection.account.name}</CardTitle><p className="mt-1 text-xs text-neutral-500">{selection.account.recipientEmail}</p></div><span className="font-mono text-xs">{selection.selected.size} / {selection.friends.length}</span></CardHeader>
    <CardContent>{selection.groups.length || selection.tags.length ? <div className="mb-5 border-b border-neutral-100 pb-5"><p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">分组与标签快捷选择</p><div className="flex flex-wrap gap-2">{selection.groups.map((item) => <SegmentButton key={item.id} prefix="分组" item={item} onClick={() => onSegment(selection.account.id, item)} />)}{selection.tags.map((item) => <SegmentButton key={item.id} prefix="#" item={item} dashed onClick={() => onSegment(selection.account.id, item)} />)}</div></div> : null}
      {!selection.friends.length ? <p className="py-8 text-center text-sm text-neutral-500">该账号没有可用好友</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{selection.friends.map((friend) => { const selected = selection.selected.has(friend.id); return <button type="button" key={friend.id} onClick={() => onFriend(selection.account.id, friend.id)} className={cn('flex min-w-0 items-center rounded-xl border px-3 py-3 text-left text-sm transition-colors', selected ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 hover:border-neutral-500')}><span className={cn('mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded border', selected ? 'border-white' : 'border-neutral-300')}>{selected ? <Check className="h-3 w-3" /> : null}</span><span className="min-w-0"><span className="block truncate">{friend.remark}</span>{friend.salutation ? <small className="block truncate opacity-60">称呼：{friend.salutation}</small> : null}</span></button>; })}</div>}
    </CardContent>
  </Card>)}</div>;
}

function SegmentButton({ prefix, item, dashed, onClick }: { prefix: string; item: Segment; dashed?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('rounded-full border border-neutral-400 px-3 py-1.5 text-xs hover:border-neutral-950 hover:bg-neutral-100', dashed && 'border-dashed')}>{prefix}{prefix === '#' ? '' : ' · '}{item.name} · {item.friendIds.length}</button>;
}

export function ScheduleStep({ timing, scheduledAt, selections, onTiming, onScheduledAt, onDelay }: { timing: Timing; scheduledAt: string; selections: Selection[]; onTiming: (value: Timing) => void; onScheduledAt: (value: string) => void; onDelay: (accountId: string, field: 'minDelay' | 'maxDelay', value: number) => void }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <Card><CardHeader><CardTitle>开始时间</CardTitle></CardHeader><CardContent className="space-y-3"><Choice active={timing === 'now'} icon={Send} title="立即发送" detail="提交后进入服务端队列" onClick={() => onTiming('now')} /><Choice active={timing === 'later'} icon={Clock} title="单次定时" detail="到达时间后开始排队" onClick={() => onTiming('later')} />{timing === 'later' ? <label className="block pt-2"><span className="field-label">计划开始时间</span><Input type="datetime-local" min={localDateTimeValue()} value={scheduledAt} onChange={(event) => onScheduledAt(event.target.value)} /></label> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>发送间隔</CardTitle></CardHeader><CardContent className="space-y-5">{selections.map((selection) => <div key={selection.account.id}><p className="mb-2 text-sm font-medium">{selection.account.name}<span className="ml-2 text-xs font-normal text-neutral-400">{selection.selected.size} 人</span></p><div className="grid grid-cols-2 gap-3"><label><span className="field-label">最小秒数</span><Input type="number" min="10" value={selection.minDelay} onChange={(event) => onDelay(selection.account.id, 'minDelay', Number(event.target.value))} /></label><label><span className="field-label">最大秒数</span><Input type="number" min="10" value={selection.maxDelay} onChange={(event) => onDelay(selection.account.id, 'maxDelay', Number(event.target.value))} /></label></div></div>)}<p className="rounded-lg bg-neutral-100 p-3 text-xs leading-5 text-neutral-500">同一个发送账号严格串行，最小间隔为 10 秒；不同账号可以并行。</p></CardContent></Card>
  </div>;
}

function Choice({ active, icon: Icon, title, detail, onClick }: { active: boolean; icon: typeof Send; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex w-full items-center rounded-xl border p-4 text-left transition-colors', active ? 'border-neutral-950 bg-neutral-50 ring-1 ring-neutral-950' : 'border-neutral-200 hover:border-neutral-400')}><Icon className="mr-3 h-4 w-4" /><span><b className="block text-sm">{title}</b><small className="text-neutral-500">{detail}</small></span></button>;
}

export function ReviewStep({ preview, total, accountCount }: { preview?: Preview; total: number; accountCount: number }) {
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,.5fr)]">
    <Card><CardHeader><CardTitle>最终文案预览</CardTitle></CardHeader><CardContent className="space-y-3">{preview ? preview.recipients.slice(0, 8).map((item, index) => <div key={`${item.friendRemark}-${index}`} className="rounded-xl border border-neutral-200 p-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{item.friendRemark}</p><p className="whitespace-pre-wrap text-sm leading-7">{item.content}</p></div>) : <LoadingState label="正在生成逐人预览" />}{preview && preview.recipients.length > 8 ? <p className="text-center text-xs text-neutral-400">另有 {preview.recipients.length - 8} 位好友未展开显示</p> : null}</CardContent></Card>
    <Card><CardHeader><CardTitle>发送确认</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p className="flex justify-between"><span className="text-neutral-500">接收好友</span><b>{total} 人</b></p><p className="flex justify-between"><span className="text-neutral-500">发送账号</span><b>{accountCount} 个</b></p><div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">预览与发送使用同一个随机种子，模板和变量候选值会在提交时冻结。</div></CardContent></Card>
  </div>;
}
