export type User = {
  name: string;
  email: string;
  password: string;
};

export type AssetRecord = {
  id: number;
  name: string;
  provider: string;
  category: string;
  owner: string;
  accessLevel: string;
  contactName: string;
  rule: string;
  lastReview: string;
  status: string;
};

export type ContactRecord = {
  id: number;
  name: string;
  relation: string;
  email: string;
  phone: string;
  role: string;
  scope: string;
  verificationStatus: string;
  responseExpectation: string;
  status: string;
};

export type VaultRecord = {
  id: number;
  title: string;
  category: string;
  visibility: string;
  status: string;
  retention: string;
  updatedAt: string;
  summary: string;
};

export type RequestRecord = {
  id: number;
  label: string;
  requesterName: string;
  relation: string;
  scope: string;
  evidenceStatus: string;
  status: string;
  submittedAt: string;
  nextStep: string;
};

export type ChecklistRecord = {
  id: number;
  title: string;
  owner: string;
  dueLabel: string;
  status: string;
};

export type ActivityRecord = {
  id: number;
  kind: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type BootstrapPayload = {
  assets: AssetRecord[];
  contacts: ContactRecord[];
  vaultItems: VaultRecord[];
  requests: RequestRecord[];
  checklist: ChecklistRecord[];
  activities: ActivityRecord[];
};
