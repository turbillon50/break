export interface IdentityRow {
  id: number;
  key: string;
  content: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface RelationshipRow {
  id: number;
  entity: string;
  aspect: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type LessonSeverity = 'critical' | 'important' | 'note';

export interface LessonRow {
  id: number;
  title: string;
  context: string;
  lesson: string;
  severity: LessonSeverity;
  created_at: string;
}

export type DecisionStatus = 'active' | 'superseded' | 'reverted';

export interface DecisionRow {
  id: number;
  decision_date: string;
  title: string;
  decision_text: string;
  rationale: string;
  decided_by: string;
  status: DecisionStatus;
  created_at: string;
}

export interface TechnicalNoteRow {
  id: number;
  category: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionSnapshotRow {
  id: number;
  session_date: string;
  summary: string;
  key_events: string | null;
  pending: string | null;
  emotional_notes: string | null;
  created_at: string;
}

export interface FreeMemoryRow {
  id: number;
  tags: string | null;
  content: string;
  created_at: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
