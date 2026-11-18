export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "team" | "client";
  client_id: string | null;
  disabled?: number;
};
export type PortfolioEntry = {
  id: string;
  title: string;
  category: string;
  summary: string;
  project_url: string;
  published: boolean;
  featured: boolean;
  image_url: string | null;
  image_version: string | null;
  created_at: string;
  updated_at: string;
};
export type Data = {
  name: string;
  status: string;
  notes: string;
  email?: string;
  phone?: string;
  due?: string;
  amount_cents?: number;
  direction?: string;
  value_cents?: number;
  invoice_number?: string;
  invoice_key?: string;
  invoice_url?: string;
  mautic_id?: number;
  mautic_synced_at?: string;
  approval_comment?: string;
  approval_decision?: string;
  approval_at?: string;
};
export type Entry = {
  id: string;
  client_id: string | null;
  data: Data;
  updated_at: string;
};
export type Kind =
  "clients" | "leads" | "projects" | "tasks" | "finance" | "campaigns";
export type Summary = {
  counts: Partial<Record<Kind, number>>;
  openProjects: number;
  openTasks: number;
  newLeads: number;
  pipelineValue: number;
  wonLeads: number;
  lostLeads: number;
  overdueTasks: number;
  finances: {
    incomePaid: number;
    expensePaid: number;
    incomePending: number;
    expensePending: number;
    pendingCount: number;
  };
  pipeline: { status: string; count: number; value: number }[];
  monthly: {
    month: string;
    incomePaid: number;
    expensePaid: number;
    incomePending: number;
    expensePending: number;
  }[];
  asOf: string;
};
