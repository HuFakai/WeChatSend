import { Braces, FileSpreadsheet, Plus } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { FormField } from '@/components/form-field';
import { Page, PageHeader } from '@/components/page';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useResource } from '@/hooks/use-resource';
import { api, patch, post } from '@/lib/api';
import type { CustomVariable } from '@/types';

const modes = { FIXED: '固定值', RANDOM: '随机取值', SEQUENCE: '按好友顺序' } as const;
const builtIns = [{ name: 'friend_name', label: '好友称呼' }, { name: 'date', label: '日期' }, { name: 'time', label: '时间' }, { name: 'weekday', label: '星期' }, { name: 'random_quote', label: '随机语录' }, { name: 'warm_greeting', label: '温馨问候' }];
const splitValues = (value: string) => value.split(/[，,；;\n\t]+/).map((item) => item.trim()).filter(Boolean);
const readBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('读取文件失败')); reader.readAsDataURL(file); });
type VariableDraft = Partial<CustomVariable> & { rawValues?: string };
type ImportDraft = { file: File; name: string; displayName: string; mode: CustomVariable['mode'] };

export function VariablesPage() {
  const variables = useResource(() => api<CustomVariable[]>('/variables'), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<VariableDraft>();
  const [importing, setImporting] = useState<ImportDraft>();
  const [busy, setBusy] = useState(false);
  const open = (item?: CustomVariable) => { if (item?.source !== 'API') setEditing(item ? { ...item, rawValues: item.values.map((value) => value.value).join('\n') } : { name: '', displayName: '', mode: 'FIXED', rawValues: '' }); };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const values = splitValues(editing.rawValues ?? '');
    if (!editing.name?.trim() || !editing.displayName?.trim() || !values.length) { variables.setError('请完整填写变量名称、显示名称和候选值'); return; }
    setBusy(true); variables.setError('');
    try {
      const body = { name: editing.name.trim(), displayName: editing.displayName.trim(), mode: editing.mode, values };
      if (editing.id) await patch(`/variables/${editing.id}`, body);
      else await post('/variables', body);
      setEditing(undefined); await variables.reload();
    } catch (reason) { variables.setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) setImporting({ file, name: '', displayName: '', mode: 'FIXED' });
  };
  const importFile = async (event: FormEvent) => {
    event.preventDefault();
    if (!importing?.name.trim() || !importing.displayName.trim()) return;
    setBusy(true); variables.setError('');
    try {
      await post('/imports/variables/file/import', { fileName: importing.file.name, base64: await readBase64(importing.file), name: importing.name.trim(), displayName: importing.displayName.trim(), mode: importing.mode });
      setImporting(undefined); await variables.reload();
    } catch (reason) { variables.setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <Page>
    <PageHeader eyebrow="Variable studio" title="内容变量" description="固定、随机或按稳定好友顺序填充；任务提交后会冻结候选值，确保发送可追溯。" actions={<><input ref={inputRef} hidden type="file" accept=".csv,.xlsx,.xls" onChange={chooseFile} /><Button variant="outline" onClick={() => inputRef.current?.click()}><FileSpreadsheet className="h-4 w-4" />导入表格</Button><Button onClick={() => open()}><Plus className="h-4 w-4" />创建变量</Button></>} />
    {variables.error ? <ErrorState message={variables.error} retry={variables.reload} /> : null}
    <Card className="p-5"><p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Built-in variables</p><div className="mt-4 flex flex-wrap gap-2">{builtIns.map((item) => <span key={item.name} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs"><b>{`{{${item.name}}}`}</b><span className="ml-2 text-neutral-400">{item.label}</span></span>)}</div></Card>
    {variables.loading && !variables.data ? <LoadingState /> : !variables.data?.length ? <EmptyState title="还没有自定义变量" detail="例如创建 product_name，并录入多个产品名称候选值。" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{variables.data.map((item) => <Card key={item.id} className="p-5"><div className="flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-950 text-white"><Braces className="h-4 w-4" /></div><span className="font-mono text-[10px] text-neutral-400">{item.source === 'API' ? 'API' : `V${item.version}`}</span></div><p className="mt-5 font-mono text-sm">{`{{${item.name}}}`}</p><h2 className="mt-1 text-lg font-semibold">{item.displayName}</h2><p className="mt-2 text-xs text-neutral-500">{item.source === 'API' ? '外部 API 动态值 · 任务提交时获取' : `${modes[item.mode]} · ${item.values.length} 个候选值`}</p><div className="mt-4 flex flex-wrap gap-1.5">{item.values.slice(0, 4).map((value) => <span key={value.id} className="max-w-full truncate rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600">{value.value}</span>)}</div>{item.source === 'API' ? <p className="mt-5 text-center text-xs text-neutral-400">由管理员配置，只读</p> : <Button className="mt-5 w-full" variant="outline" onClick={() => open(item)}>编辑变量</Button>}</Card>)}</section>}

    <Dialog open={Boolean(editing)} onClose={() => setEditing(undefined)} title={editing?.id ? '编辑变量' : '创建变量'} description="变量名只使用英文、数字和下划线，便于在模板中引用。">
      {editing ? <form className="space-y-4" onSubmit={save}><div className="grid grid-cols-2 gap-3"><FormField label="变量名" required><Input value={editing.name ?? ''} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="product_name" /></FormField><FormField label="显示名称" required><Input value={editing.displayName ?? ''} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} placeholder="产品名称" /></FormField></div><FormField label="取值方式"><select className="select" value={editing.mode} onChange={(event) => setEditing({ ...editing, mode: event.target.value as CustomVariable['mode'] })}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField label="候选值" hint="支持换行、逗号或分号粘贴；空值会被过滤。" required><textarea className="textarea min-h-48" value={editing.rawValues ?? ''} onChange={(event) => setEditing({ ...editing, rawValues: event.target.value })} placeholder={'产品 A\n产品 B\n产品 C'} /></FormField><Button className="w-full" disabled={busy}>{busy ? '保存中…' : '保存变量'}</Button></form> : null}
    </Dialog>

    <Dialog open={Boolean(importing)} onClose={() => setImporting(undefined)} title="导入变量表格" description={importing ? `已选择 ${importing.file.name}，请先定义导入后的变量。` : undefined}>
      {importing ? <form className="space-y-4" onSubmit={importFile}><div className="grid grid-cols-2 gap-3"><FormField label="变量名" required><Input value={importing.name} onChange={(event) => setImporting({ ...importing, name: event.target.value })} placeholder="product_name" pattern="[A-Za-z][A-Za-z0-9_]*" /></FormField><FormField label="显示名称" required><Input value={importing.displayName} onChange={(event) => setImporting({ ...importing, displayName: event.target.value })} placeholder="产品名称" /></FormField></div><FormField label="取值方式"><select className="select" value={importing.mode} onChange={(event) => setImporting({ ...importing, mode: event.target.value as CustomVariable['mode'] })}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><Button className="w-full" disabled={busy}>{busy ? '导入中…' : '确认导入'}</Button></form> : null}
    </Dialog>
  </Page>;
}
