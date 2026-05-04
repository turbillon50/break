import { z } from 'zod';

export const IdentityCreate = z.object({
  key: z.string().trim().min(1).max(60),
  content: z.string().min(1),
  priority: z.number().int().min(0).max(100).default(5),
});

export const IdentityUpdate = z.object({
  content: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export const RelationshipCreate = z.object({
  entity: z.string().trim().min(1).max(40),
  aspect: z.string().trim().min(1).max(60),
  content: z.string().min(1),
});

export const RelationshipUpdate = z.object({
  content: z.string().min(1),
});

export const LessonSeverityEnum = z.enum(['critical', 'important', 'note']);

export const LessonCreate = z.object({
  title: z.string().trim().min(1).max(120),
  context: z.string().min(1),
  lesson: z.string().min(1),
  severity: LessonSeverityEnum,
});

export const DecisionStatusEnum = z.enum(['active', 'superseded', 'reverted']);

export const DecisionCreate = z.object({
  title: z.string().trim().min(1).max(160),
  decision_text: z.string().min(1),
  rationale: z.string().min(1),
  decided_by: z.string().trim().min(1).max(40),
  status: DecisionStatusEnum.default('active'),
  decision_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
});

export const DecisionUpdate = z.object({
  status: DecisionStatusEnum.optional(),
  decision_text: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
});

export const TechnicalNoteCreate = z.object({
  category: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  content: z.string().min(1),
  is_active: z.boolean().default(true),
});

export const TechnicalNoteUpdate = z.object({
  category: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const SnapshotCreate = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  summary: z.string().min(1),
  key_events: z.string().optional(),
  pending: z.string().optional(),
  emotional_notes: z.string().optional(),
});

export const FreeMemoryCreate = z.object({
  content: z.string().min(1),
  tags: z.string().max(200).optional(),
});

export const SearchQuery = z.object({
  q: z.string().trim().min(2, 'q must be at least 2 chars'),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});
