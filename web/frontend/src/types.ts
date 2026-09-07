export type Account = {
  id: string;
  name: string;
  recipientEmail: string;
  subject: string;
  minDelay: number;
  maxDelay: number;
  emailVerifiedAt: string | null;
  status: 'ACTIVE' | 'DISABLED';
  configVersion: number;
  _count: { friends: number };
};

export type Friend = {
  id: string;
  accountId: string;
  remark: string;
  status: 'ACTIVE' | 'DISABLED';
};

export type Task = {
  id: string;
  title: string;
  content: string;
  status: string;
  scheduledAt: string;
  createdAt: string;
  _count?: { messages: number };
  messages?: TaskMessage[];
};

export type TaskMessage = {
  id: string;
  messageId: string;
  friendRemark: string;
  status: string;
  readyAt: string;
  acceptedAt: string | null;
  feedbackStatus: 'SUCCESS' | 'FAILED' | null;
  feedbackReceivedAt: string | null;
  feedbackError: string | null;
  errorMessage: string | null;
  attempts: Array<{
    id: string;
    sequence: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
};
