import { ArrowLeft, Save, UsersRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorState, LoadingState, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { AudienceStep, BuilderProgress, ContentStep, ReviewStep, ScheduleStep } from '@/features/task-builder/steps';
import { useTaskBuilder } from '@/features/task-builder/use-task-builder';

export function TaskNewPage() {
  const [params] = useSearchParams();
  const builder = useTaskBuilder({ draftId: params.get('draft'), templateParam: params.get('template'), contentParam: params.get('content') });

  if (!builder.accounts) return <LoadingState label="正在准备任务创建器" />;
  if (!builder.accounts.length) return <EmptyState title="没有可用的发送账号" detail="创建任务前，需要至少一个启用且邮箱已验证的发送账号。" action={{ label: '配置发送账号', onClick: () => window.location.assign('/accounts') }} />;

  return <div className="page-enter">
    <header className="mb-6 flex flex-wrap items-center gap-3 border-b border-neutral-300 pb-6">
      <Button asChild variant="ghost" size="icon"><Link to="/tasks" aria-label="返回任务列表"><ArrowLeft className="h-4 w-4" /></Link></Button>
      <div className="mr-auto"><p className="font-mono text-[10px] uppercase tracking-[.24em] text-neutral-400">New dispatch</p><h1 className="mt-1 text-2xl font-semibold tracking-[-.035em]">{builder.savedDraftId ? '继续编辑草稿' : '创建发送任务'}</h1></div>
      <Button type="button" variant="outline" disabled={builder.busy} onClick={() => void builder.saveDraft()}><Save className="h-4 w-4" />保存草稿</Button>
    </header>
    <BuilderProgress step={builder.step} onStep={builder.setStep} />
    {builder.error ? <div className="mt-5"><ErrorState message={builder.error} /></div> : null}
    <div className="mt-6">
      {builder.step === 1 ? <ContentStep title={builder.title} content={builder.content} templateId={builder.templateId} templates={builder.templates} variables={builder.variables} onTitle={builder.setTitle} onContent={builder.setContent} onTemplate={builder.chooseTemplate} onVariable={builder.insertVariable} /> : null}
      {builder.step === 2 ? <AudienceStep selections={builder.selections} onFriend={builder.toggleFriend} onSegment={builder.toggleSegment} /> : null}
      {builder.step === 3 ? <ScheduleStep timing={builder.timing} scheduledAt={builder.scheduledAt} selections={builder.selectedAccounts} onTiming={builder.setTiming} onScheduledAt={builder.setScheduledAt} onDelay={builder.updateDelay} /> : null}
      {builder.step === 4 ? <ReviewStep preview={builder.preview} total={builder.total} accountCount={builder.selectedAccounts.length} /> : null}
    </div>
    <footer className="sticky bottom-4 mt-6 flex items-center justify-between rounded-2xl border border-neutral-300 bg-white/95 p-3 shadow-[0_12px_35px_rgba(0,0,0,.08)] backdrop-blur-xl">
      <Button type="button" variant="outline" disabled={builder.step === 1 || builder.busy} onClick={() => builder.setStep((value) => value - 1)}>上一步</Button>
      <div className="flex items-center gap-2 text-xs text-neutral-500"><UsersRound className="h-4 w-4" />已选 {builder.total} 位</div>
      {builder.step < 4 ? <Button type="button" disabled={builder.busy} onClick={() => void builder.next()}>{builder.busy ? '处理中' : '下一步'}</Button> : <Button type="button" disabled={builder.busy || !builder.preview} onClick={() => void builder.submit()}>{builder.busy ? '正在创建' : '确认并提交'}</Button>}
    </footer>
  </div>;
}
