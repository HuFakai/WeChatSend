export type ScheduleWindow = {
  accountId: string;
  accountName: string;
  taskId: string | null;
  taskTitle: string | null;
  startAt: Date;
  endAt: Date;
  recipientCount: number;
  maxDelay: number;
};

export function createScheduleWindow(input: Omit<ScheduleWindow, 'endAt'>): ScheduleWindow {
  return {
    ...input,
    endAt: new Date(input.startAt.getTime() + input.recipientCount * input.maxDelay * 1000),
  };
}

export function scheduleWindowsOverlap(left: ScheduleWindow, right: ScheduleWindow) {
  return left.accountId === right.accountId
    && left.startAt.getTime() < right.endAt.getTime()
    && right.startAt.getTime() < left.endAt.getTime();
}

export function findScheduleConflicts(planned: ScheduleWindow[], occupied: ScheduleWindow[]) {
  return planned.flatMap((candidate) => occupied
    .filter((existing) => scheduleWindowsOverlap(candidate, existing))
    .map((existing) => ({ planned: candidate, occupied: existing })));
}
