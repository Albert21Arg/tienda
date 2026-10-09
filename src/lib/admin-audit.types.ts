export const AUDIT_PAGE_SIZE = 5;

export type AuditCategory = "ALL" | "INVENTORY" | "PRODUCT" | "SALES" | "USERS" | "SETTINGS";

export type AuditEvent = {
  id: string;
  createdAt: Date;
  actorName: string;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string;
  subjectName: string;
  reference: string | null;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
};

export type AuditPage = {
  events: AuditEvent[];
  total: number;
  page: number;
  pageCount: number;
};
