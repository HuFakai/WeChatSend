import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, patch, post } from '@/lib/api';
import type { Account, CustomVariable, Friend, MessageTemplate, Segment, Task, TaskDraft } from '@/types';
import { localDateTimeValue, type Preview, type ScheduleAvailability, type Selection, type TaskPayload, type Timing } from './types';

export function useTaskBuilder({ draftId, templateParam, contentParam }: { draftId: string | null; templateParam: string | null; contentParam: string | null }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [accounts, setAccounts] = useState<Account[]>();
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [variables, setVariables] = useState<CustomVariable[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [timing, setTiming] = useState<Timing>('now');
  const [scheduledAt, setScheduledAt] = useState(localDateTimeValue());
  const [renderSeed, setRenderSeed] = useState<string>(() => crypto.randomUUID());
  const [preview, setPreview] = useState<Preview>();
  const [scheduleAvailability, setScheduleAvailability] = useState<ScheduleAvailability>();
  const [checkingSchedule, setCheckingSchedule] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(draftId);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [accountData, templateData, variableData, draft] = await Promise.all([
          api<Account[]>('/accounts'),
          api<MessageTemplate[]>('/templates'),
          api<CustomVariable[]>('/variables'),
          draftId ? api<TaskDraft>(`/drafts/${draftId}`) : Promise.resolve(undefined),
        ]);
        const enabledAccounts = accountData.filter((account) => account.status === 'ACTIVE' && Boolean(account.emailVerifiedAt));
        const entries = await Promise.all(enabledAccounts.map(async (account) => {
          const [friends, groups, tags] = await Promise.all([
            api<Friend[]>(`/accounts/${account.id}/friends`),
            api<Segment[]>(`/accounts/${account.id}/groups`),
            api<Segment[]>(`/accounts/${account.id}/tags`),
          ]);
          return [account.id, { account, friends: friends.filter((friend) => friend.status === 'ACTIVE'), groups, tags, selected: new Set<string>(), minDelay: account.minDelay, maxDelay: account.maxDelay }] as const;
        }));
        if (!active) return;
        const nextSelections = Object.fromEntries(entries) as Record<string, Selection>;
        setAccounts(enabledAccounts); setTemplates(templateData); setVariables(variableData);

        const selectedTemplate = templateData.find((item) => item.id === templateParam);
        if (selectedTemplate) { setTemplateId(selectedTemplate.id); setContent(selectedTemplate.content); setTitle(selectedTemplate.title); }
        if (contentParam && !draft) setContent(contentParam);
        if (draft) {
          setTitle(draft.title); setContent(draft.content); setTemplateId(draft.payload.templateId ?? null);
          if (draft.payload.renderSeed) setRenderSeed(draft.payload.renderSeed);
          if (draft.scheduledAt) { setTiming('later'); setScheduledAt(localDateTimeValue(new Date(draft.scheduledAt))); }
          for (const saved of draft.payload.selections ?? []) {
            const current = nextSelections[saved.accountId];
            if (!current) continue;
            const activeIds = new Set(current.friends.map((friend) => friend.id));
            nextSelections[saved.accountId] = { ...current, selected: new Set(saved.friendIds.filter((id) => activeIds.has(id))), minDelay: saved.minDelay ?? current.minDelay, maxDelay: saved.maxDelay ?? current.maxDelay };
          }
        }
        setSelections(nextSelections);
      } catch (reason) { if (active) setError((reason as Error).message); }
    })();
    return () => { active = false; };
  }, [contentParam, draftId, templateParam]);

  const total = useMemo(() => Object.values(selections).reduce((sum, item) => sum + item.selected.size, 0), [selections]);
  const selectedAccounts = useMemo(() => Object.values(selections).filter((item) => item.selected.size > 0), [selections]);

  const toggleFriend = useCallback((accountId: string, friendId: string) => setSelections((current) => {
    const selection = current[accountId];
    if (!selection) return current;
    const selected = new Set(selection.selected);
    selected.has(friendId) ? selected.delete(friendId) : selected.add(friendId);
    return { ...current, [accountId]: { ...selection, selected } };
  }), []);

  const toggleSegment = useCallback((accountId: string, segment: Segment) => setSelections((current) => {
    const selection = current[accountId];
    if (!selection) return current;
    const friendIds = new Set(selection.friends.map((friend) => friend.id));
    const activeIds = segment.friendIds.filter((id) => friendIds.has(id));
    const selected = new Set(selection.selected);
    const allSelected = activeIds.length > 0 && activeIds.every((id) => selected.has(id));
    activeIds.forEach((id) => allSelected ? selected.delete(id) : selected.add(id));
    return { ...current, [accountId]: { ...selection, selected } };
  }), []);

  const updateDelay = useCallback((accountId: string, field: 'minDelay' | 'maxDelay', value: number) => setSelections((current) => current[accountId] ? { ...current, [accountId]: { ...current[accountId], [field]: value } } : current), []);

  const taskBody = useCallback((): TaskPayload => ({
    title: title.trim(), content: content.trim(), templateId, renderSeed,
    ...(timing === 'later' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    selections: selectedAccounts.map((selection) => ({ accountId: selection.account.id, friendIds: [...selection.selected], groupIds: [], tagIds: [], minDelay: selection.minDelay, maxDelay: selection.maxDelay })),
  }), [content, renderSeed, scheduledAt, selectedAccounts, templateId, timing, title]);

  const scheduleBody = useCallback(() => ({
    scheduledAt: new Date(scheduledAt).toISOString(),
    selections: selectedAccounts.map((selection) => ({
      accountId: selection.account.id,
      recipientCount: selection.selected.size,
      maxDelay: selection.maxDelay,
    })),
  }), [scheduledAt, selectedAccounts]);

  useEffect(() => {
    if (timing !== 'later' || !scheduledAt || new Date(scheduledAt) <= new Date() || !selectedAccounts.length
      || selectedAccounts.some((item) => item.maxDelay < 10 || item.minDelay > item.maxDelay)) {
      setScheduleAvailability(undefined);
      setCheckingSchedule(false);
      return;
    }
    setScheduleAvailability(undefined);
    setCheckingSchedule(true);
    let active = true;
    const timer = window.setTimeout(() => {
      void post<ScheduleAvailability>('/tasks/schedule-check', scheduleBody())
        .then((result) => { if (active) setScheduleAvailability(result); })
        .catch((reason) => { if (active) setError((reason as Error).message); })
        .finally(() => { if (active) setCheckingSchedule(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scheduleBody, scheduledAt, selectedAccounts, timing]);

  const validate = useCallback((targetStep = 4) => {
    if (targetStep >= 1 && (!title.trim() || !content.trim())) return '请填写任务名称和消息内容';
    if (targetStep >= 2 && !total) return '请至少选择一位好友';
    if (targetStep >= 3 && selectedAccounts.some((item) => item.minDelay < 10 || item.maxDelay < 10 || item.minDelay > item.maxDelay)) return '发送间隔至少 10 秒，且最小值不能大于最大值';
    if (targetStep >= 3 && timing === 'later' && (!scheduledAt || new Date(scheduledAt) <= new Date())) return '定时时间必须晚于当前时间';
    if (targetStep >= 3 && timing === 'later' && scheduleAvailability && !scheduleAvailability.available) {
      const conflict = scheduleAvailability.conflicts[0];
      return `所选时间与“${conflict.occupied.taskTitle}”的账号占用时间段冲突，请调整计划开始时间`;
    }
    return '';
  }, [content, scheduleAvailability, scheduledAt, selectedAccounts, timing, title, total]);

  const next = async () => {
    const issue = validate(step);
    if (issue) { setError(issue); return; }
    const nextStep = Math.min(4, step + 1);
    setError(''); setStep(nextStep);
    if (nextStep === 4) {
      try {
        setBusy(true);
        if (timing === 'later') {
          const availability = await post<ScheduleAvailability>('/tasks/schedule-check', scheduleBody());
          setScheduleAvailability(availability);
          if (!availability.available) {
            const conflict = availability.conflicts[0];
            setError(`所选时间与“${conflict.occupied.taskTitle}”的账号占用时间段冲突，请调整计划开始时间`);
            return;
          }
        }
        setPreview(await post<Preview>('/tasks/preview', taskBody()));
      }
      catch (reason) { setError((reason as Error).message); }
      finally { setBusy(false); }
    }
  };

  const saveDraft = async () => {
    setBusy(true); setError('');
    try { const draft = savedDraftId ? await patch<TaskDraft>(`/drafts/${savedDraftId}`, taskBody()) : await post<TaskDraft>('/drafts', taskBody()); setSavedDraftId(draft.id); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    const issue = validate();
    if (issue) { setError(issue); return; }
    if (!preview) { setError('请先生成最终文案预览'); return; }
    setBusy(true); setError('');
    try {
      const task = await post<Task>('/tasks', { ...taskBody(), previewFingerprint: preview.previewFingerprint, idempotencyKey: crypto.randomUUID() });
      if (savedDraftId) await post(`/drafts/${savedDraftId}/delete`).catch(() => undefined);
      navigate(`/tasks/${task.id}`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const chooseTemplate = (id: string) => {
    const item = templates.find((template) => template.id === id);
    setTemplateId(id || null);
    if (item) { setContent(item.content); if (!title) setTitle(item.title); }
    setPreview(undefined);
  };
  const insertVariable = (name: string, start?: number, end?: number) => {
    setContent((value) => {
      const from = start ?? value.length;
      const to = end ?? from;
      return `${value.slice(0, from)}{{${name}}}${value.slice(to)}`;
    });
    setPreview(undefined);
  };

  return { step, setStep, accounts, selections, templates, variables, templateId, title, setTitle, content, setContent, timing, setTiming, scheduledAt, setScheduledAt, preview, scheduleAvailability, checkingSchedule, error, setError, busy, savedDraftId, total, selectedAccounts, toggleFriend, toggleSegment, updateDelay, next, saveDraft, submit, chooseTemplate, insertVariable };
}
