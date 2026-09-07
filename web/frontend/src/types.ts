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
  salutation: string | null;
  status: 'ACTIVE' | 'DISABLED';
  groupMemberships?: Array<{ groupId: string }>;
  tagMemberships?: Array<{ tagId: string }>;
};

export type Segment = { id: string; accountId: string; name: string; friendIds: string[] };
export type MessageTemplate = { id: string; scope: 'PLATFORM' | 'USER'; title: string; content: string; category: string | null; version: number; favorite: boolean };
export type CustomVariable = { id: string; name: string; displayName: string; mode: 'FIXED' | 'RANDOM' | 'SEQUENCE'; version: number; values: Array<{ id: string; value: string; position: number }>; source?: 'API' };
export type TaskDraft = { id: string; title: string; content: string; scheduledAt: string | null; payload: { selections?: Array<{ accountId: string; friendIds: string[]; groupIds?: string[]; tagIds?: string[]; minDelay?: number; maxDelay?: number }>; templateId?: string | null; renderSeed?: string }; updatedAt: string };

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
  feedbackState: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'PENDING' | 'NOT_SENT';
  feedbackDeadlineAt: string | null;
  errorMessage: string | null;
  attempts: Array<{
    id: string;
    sequence: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
  }>;
};

export type AiOptions = {
  models: Array<{ id: string; name: string; displayName: string; channelName: string }>;
  features: Record<string, boolean>;
};

export type AiChannel = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
  models: Array<{ id: string; name: string; displayName: string | null; isActive: boolean }>;
};

export type ApiIntegration = {
  id: string;
  name: string;
  url: string;
  method: string;
  requestParams: Record<string, unknown> | null;
  enabled: boolean;
  variables: Array<{ id: string; name: string; displayName: string; responsePath: string }>;
};

export type PlatformTemplate = { id: string; title: string; content: string; category: string | null; isActive: boolean; version: number; updatedAt: string };
