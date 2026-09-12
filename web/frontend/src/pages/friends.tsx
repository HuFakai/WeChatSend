import { FileImage, FileSpreadsheet, FolderPlus, Pencil, Plus, Search, Tag, Trash2, UserRound, UsersRound } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader, SectionHeading } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { StatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Account, Friend, Segment } from '@/types';

type AudienceData = { friends: Friend[]; groups: Segment[]; tags: Segment[] };
type SegmentKind = 'groups' | 'tags';
type SegmentEditor = { kind: SegmentKind; item?: Segment; name: string };
const splitRemarks = (value: string) => value.split(/[，,；;\n\t]+/).map((item) => item.trim()).filter(Boolean);
const readBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('读取文件失败')); reader.readAsDataURL(file); });

export function FriendsPage() {
  const accounts = useResource(() => api<Account[]>('/accounts'), []);
  const [accountId, setAccountId] = useState('');
  useEffect(() => { if (!accountId && accounts.data?.[0]) setAccountId(accounts.data[0].id); }, [accountId, accounts.data]);
  const audience = useResource<AudienceData>(async () => {
    if (!accountId) return { friends: [], groups: [], tags: [] };
    const [friends, groups, tags] = await Promise.all([
      api<Friend[]>(`/accounts/${accountId}/friends`),
      api<Segment[]>(`/accounts/${accountId}/groups`),
      api<Segment[]>(`/accounts/${accountId}/tags`),
    ]);
    return { friends, groups, tags };
  }, [accountId]);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [raw, setRaw] = useState('');
  const [editing, setEditing] = useState<Friend>();
  const [editingRemark, setEditingRemark] = useState('');
  const [editingSalutation, setEditingSalutation] = useState('');
  const [editingGroups, setEditingGroups] = useState<Set<string>>(new Set());
  const [editingTags, setEditingTags] = useState<Set<string>>(new Set());
  const [segmentEditor, setSegmentEditor] = useState<SegmentEditor>();
  const [removingSegment, setRemovingSegment] = useState<{ kind: SegmentKind; item: Segment }>();
  const [busy, setBusy] = useState(false);
  const data = audience.data ?? { friends: [], groups: [], tags: [] };
  const visible = useMemo(() => data.friends.filter((item) => item.remark.toLowerCase().includes(search.toLowerCase())), [data.friends, search]);
  const parsed = splitRemarks(raw);
  const setError = (message: string) => audience.setError(message);

  const importFriends = async (event: FormEvent) => {
    event.preventDefault();
    if (!parsed.length) return;
    setBusy(true); setError('');
    try { await post(`/accounts/${accountId}/friends/bulk`, { remarks: parsed }); setRaw(''); setShowImport(false); await audience.reload(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const parseFile = async (event: ChangeEvent<HTMLInputElement>, kind: 'sheet' | 'image') => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const base64 = await readBase64(file);
      const result = kind === 'sheet'
        ? await post<{ values: string[] }>('/imports/friends/file/parse', { fileName: file.name, base64 })
        : { values: await post<string[]>('/imports/friends/image/parse', { mimeType: file.type, imageData: base64 }) };
      setRaw(result.values.join('\n')); setShowImport(true);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const openEdit = (friend: Friend) => {
    setEditing(friend); setEditingRemark(friend.remark); setEditingSalutation(friend.salutation ?? '');
    setEditingGroups(new Set(friend.groupMemberships?.map((item) => item.groupId) ?? []));
    setEditingTags(new Set(friend.tagMemberships?.map((item) => item.tagId) ?? []));
  };
  const saveFriend = async () => {
    if (!editing || !editingRemark.trim()) return;
    setBusy(true); setError('');
    try {
      await patch(`/friends/${editing.id}`, { remark: editingRemark.trim(), salutation: editingSalutation.trim() || null });
      await post(`/friends/${editing.id}/segments`, { groupIds: [...editingGroups], tagIds: [...editingTags] });
      setEditing(undefined); await audience.reload();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const toggleFriend = async (friend: Friend) => { try { await patch(`/friends/${friend.id}`, { status: friend.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }); await audience.reload(); } catch (reason) { setError((reason as Error).message); } };
  const saveSegment = async (event: FormEvent) => {
    event.preventDefault();
    if (!segmentEditor?.name.trim()) return;
    setBusy(true); setError('');
    try {
      if (segmentEditor.item) await patch(`/${segmentEditor.kind}/${segmentEditor.item.id}`, { name: segmentEditor.name.trim() });
      else await post(`/accounts/${accountId}/${segmentEditor.kind}`, { name: segmentEditor.name.trim() });
      setSegmentEditor(undefined); await audience.reload();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const deleteSegment = async () => {
    if (!removingSegment) return;
    setBusy(true); setError('');
    try { await post(`/${removingSegment.kind}/${removingSegment.item.id}/delete`); setRemovingSegment(undefined); await audience.reload(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const toggleSet = (current: Set<string>, id: string, setter: (next: Set<string>) => void) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); setter(next); };

  const actions = <><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium transition-colors hover:bg-neutral-100"><FileSpreadsheet className="h-4 w-4" />导入表格<input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void parseFile(event, 'sheet')} /></label><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium transition-colors hover:bg-neutral-100"><FileImage className="h-4 w-4" />截图识别<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void parseFile(event, 'image')} /></label><Button disabled={!accountId || busy} onClick={() => setShowImport(true)}><Plus className="h-4 w-4" />添加好友</Button></>;

  return <Page>
    <PageHeader eyebrow="Contacts" title="好友管理" description="好友通过微信备注精确匹配；同一发送账号下的备注必须唯一。" actions={actions} />
    {(accounts.error || audience.error) ? <ErrorState message={accounts.error || audience.error} retry={() => void Promise.all([accounts.reload(), audience.reload()])} /> : null}
    <Card className="flex flex-col gap-3 p-4 sm:flex-row"><select className="select sm:max-w-xs" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">选择发送账号</option>{accounts.data?.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索好友备注" /></label><Button variant="outline" disabled={!accountId} onClick={() => setSegmentEditor({ kind: 'groups', name: '' })}><FolderPlus className="h-4 w-4" />新建分组</Button><Button variant="outline" disabled={!accountId} onClick={() => setSegmentEditor({ kind: 'tags', name: '' })}><Tag className="h-4 w-4" />新建标签</Button></Card>

    {(data.groups.length > 0 || data.tags.length > 0) ? <Card className="p-5"><SectionHeading title="分组与标签" description="分组适合运营批次，标签适合描述客户属性。" /><div className="grid gap-5 md:grid-cols-2"><SegmentList title="好友分组" kind="groups" items={data.groups} onEdit={setSegmentEditor} onRemove={(kind, item) => setRemovingSegment({ kind, item })} /><SegmentList title="好友标签" kind="tags" items={data.tags} onEdit={setSegmentEditor} onRemove={(kind, item) => setRemovingSegment({ kind, item })} /></div></Card> : null}

    {(accounts.loading || (accountId && audience.loading && !audience.data)) ? <LoadingState /> : !accountId ? <EmptyState title="请先添加发送账号" detail="好友必须归属于一个发送账号。" /> : visible.length === 0 ? <EmptyState title={search ? '没有匹配的好友' : '还没有好友'} detail={search ? '换一个关键词试试。' : '可用逗号、分号或换行一次粘贴多个微信好友备注。'} action={!search ? { label: '添加好友', onClick: () => setShowImport(true) } : undefined} /> : <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map((friend) => <Card key={friend.id} className="flex items-center gap-4 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100"><UserRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{friend.remark}</p>{friend.salutation ? <p className="truncate text-xs text-neutral-400">称呼 · {friend.salutation}</p> : null}<div className="mt-2 flex flex-wrap gap-1">{data.groups.filter((group) => group.friendIds.includes(friend.id)).map((group) => <span key={group.id} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px]">{group.name}</span>)}{data.tags.filter((tag) => tag.friendIds.includes(friend.id)).map((tag) => <span key={tag.id} className="rounded border border-dashed px-1.5 py-0.5 text-[10px]">#{tag.name}</span>)}</div><div className="mt-2"><StatusBadge status={friend.status} /></div></div><div className="flex flex-col"><Button variant="ghost" size="sm" onClick={() => openEdit(friend)}>编辑</Button><Button variant="ghost" size="sm" onClick={() => void toggleFriend(friend)}>{friend.status === 'ACTIVE' ? '停用' : '启用'}</Button></div></Card>)}</section>}

    <Dialog open={showImport} onClose={() => setShowImport(false)} title="批量添加好友" description="中英文逗号、分号或换行均可识别；表格和截图也会先进入这里确认。">
      <form onSubmit={importFriends}><FormField label="微信好友备注"><textarea className="textarea min-h-44" value={raw} onChange={(event) => setRaw(event.target.value)} placeholder={'凯旋，宇航\n张经理；李老师'} /></FormField><div className="mt-4 flex items-center justify-between rounded-lg bg-neutral-100 px-4 py-3 text-sm"><span className="flex items-center gap-2"><UsersRound className="h-4 w-4" />已识别 {parsed.length} 个备注</span><span className="text-xs text-neutral-500">重复项自动跳过</span></div><Button className="mt-5 w-full" disabled={busy || !parsed.length}>{busy ? '正在导入…' : `确认导入 ${parsed.length} 位好友`}</Button></form>
    </Dialog>

    <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} title="编辑好友" description="微信备注用于匹配；好友称呼用于 {{friend_name}} 变量。">
      <div className="grid grid-cols-2 gap-3"><FormField label="微信好友备注"><Input value={editingRemark} onChange={(event) => setEditingRemark(event.target.value)} /></FormField><FormField label="好友称呼（选填）"><Input value={editingSalutation} onChange={(event) => setEditingSalutation(event.target.value)} placeholder="例如：王总" /></FormField></div><SegmentPicker title="分组" items={data.groups} selected={editingGroups} onToggle={(id) => toggleSet(editingGroups, id, setEditingGroups)} /><SegmentPicker title="标签" items={data.tags} selected={editingTags} onToggle={(id) => toggleSet(editingTags, id, setEditingTags)} tag /><div className="mt-6 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setEditing(undefined)}>取消</Button><Button className="flex-1" disabled={busy || !editingRemark.trim()} onClick={() => void saveFriend()}>保存</Button></div>
    </Dialog>

    <Dialog open={Boolean(segmentEditor)} onClose={() => setSegmentEditor(undefined)} title={`${segmentEditor?.item ? '重命名' : '新建'}${segmentEditor?.kind === 'tags' ? '标签' : '分组'}`}>
      {segmentEditor ? <form className="space-y-5" onSubmit={saveSegment}><FormField label="名称" required><Input autoFocus value={segmentEditor.name} onChange={(event) => setSegmentEditor({ ...segmentEditor, name: event.target.value })} /></FormField><Button className="w-full" disabled={busy || !segmentEditor.name.trim()}>保存</Button></form> : null}
    </Dialog>

    <Dialog open={Boolean(removingSegment)} onClose={() => setRemovingSegment(undefined)} title="确认删除" description={`删除后好友本身不会被删除，仅解除“${removingSegment?.item.name ?? ''}”关系。`} className="max-w-sm">
      <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setRemovingSegment(undefined)}>取消</Button><Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={busy} onClick={() => void deleteSegment()}>确认删除</Button></div>
    </Dialog>
  </Page>;
}

function SegmentList({ title, kind, items, onEdit, onRemove }: { title: string; kind: SegmentKind; items: Segment[]; onEdit: (editor: SegmentEditor) => void; onRemove: (kind: SegmentKind, item: Segment) => void }) {
  return <div><p className="field-label">{title}</p><div className="flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className={cn('inline-flex items-center overflow-hidden rounded-full border text-xs', kind === 'tags' && 'border-dashed')}><span className="px-3 py-1.5">{kind === 'tags' ? '#' : ''}{item.name} · {item.friendIds.length}</span><button type="button" className="border-l p-1.5 hover:bg-neutral-100" onClick={() => onEdit({ kind, item, name: item.name })} aria-label={`重命名${item.name}`}><Pencil className="h-3 w-3" /></button><button type="button" className="border-l p-1.5 hover:bg-red-50 hover:text-red-600" onClick={() => onRemove(kind, item)} aria-label={`删除${item.name}`}><Trash2 className="h-3 w-3" /></button></span>)}</div></div>;
}

function SegmentPicker({ title, items, selected, onToggle, tag = false }: { title: string; items: Segment[]; selected: Set<string>; onToggle: (id: string) => void; tag?: boolean }) {
  return <div className="mt-5"><p className="field-label">{title}</p><div className="flex flex-wrap gap-2">{items.map((item) => <button type="button" key={item.id} onClick={() => onToggle(item.id)} className={cn('rounded-full border px-3 py-1.5 text-xs', tag && 'border-dashed', selected.has(item.id) && 'border-neutral-950 bg-neutral-950 text-white')}>{tag ? '#' : ''}{item.name}</button>)}</div></div>;
}
