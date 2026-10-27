import { z } from 'zod';

// UUID Schema
export const uuidSchema = z.string().uuid({ message: 'Invalid UUID format' });

// 1. Roles & Enums
export const memberRoleSchema = z.enum(['creator', 'reviewer', 'manager']);
export const ruleTypeSchema = z.enum(['TONE', 'TERM', 'FACT', 'VISUAL', 'ACCESSIBILITY']);
export const ruleOriginSchema = z.enum(['public_sample', 'custom']);
export const ruleStatusSchema = z.enum(['ACTIVE', 'DEPRECATED', 'DRAFT']);
export const draftStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'NEEDS_RECHECK', 'REJECTED']);
export const findingEngineSchema = z.enum(['DETERMINISTIC', 'LLM_RAG']);
export const findingSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const findingStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'OVERRIDDEN']);
export const approvalDecisionSchema = z.enum(['APPROVED', 'REJECTED']);

// 2. Workspaces
export const workspaceSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1, 'Workspace name is required').max(100, 'Workspace name is too long'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const createWorkspaceSchema = workspaceSchema.pick({ name: true }).extend({
  id: uuidSchema.optional(),
});

export const updateWorkspaceSchema = workspaceSchema.pick({ name: true }).partial();

// 3. Members
export const memberSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  user_id: uuidSchema,
  role: memberRoleSchema,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const createMemberSchema = memberSchema.pick({
  workspace_id: true,
  user_id: true,
  role: true,
});

export const updateMemberRoleSchema = z.object({
  role: memberRoleSchema,
});

// 4. Knowledge Base Rules
export const kbRuleSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  rule_id: z
    .string()
    .trim()
    .min(2, 'Rule ID must have at least 2 characters')
    .max(50, 'Rule ID must not exceed 50 characters')
    .regex(/^[A-Z0-9_\-.]+$/, 'Rule ID must contain uppercase letters, numbers, hyphens, dots, or underscores'),
  type: ruleTypeSchema,
  owner: z.string().trim().min(1, 'Owner name is required').max(100),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Effective date must be YYYY-MM-DD'),
  version: z.number().int().min(1, 'Version must be at least 1'),
  rule_text: z.string().trim().min(3, 'Rule text must be at least 3 characters'),
  source_name: z.string().trim().min(1, 'Source citation name is required'),
  source_url: z.string().url('Source URL must be a valid URL'),
  origin: ruleOriginSchema,
  status: ruleStatusSchema,
  embedding: z.array(z.number()).length(1536).optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const createKbRuleSchema = kbRuleSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  version: z.number().int().min(1).default(1),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  status: ruleStatusSchema.default('ACTIVE'),
  origin: ruleOriginSchema.default('custom'),
  embedding: z.array(z.number()).length(1536).optional().nullable(),
});

export const updateKbRuleSchema = createKbRuleSchema.partial().extend({
  // Version bumping can be required when rule content or date changes
  version: z.number().int().min(1).optional(),
});

// 5. Drafts
export const draftSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  title: z.string().trim().min(1, 'Title is required').max(255),
  status: draftStatusSchema,
  created_by: uuidSchema,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const createDraftSchema = z.object({
  workspace_id: uuidSchema,
  title: z.string().trim().min(1, 'Title is required').max(255),
  content: z.string().min(1, 'Initial draft content is required'),
});

export const updateDraftSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  status: draftStatusSchema.optional(),
});

// 6. Draft Versions
export const draftVersionSchema = z.object({
  id: uuidSchema,
  draft_id: uuidSchema,
  workspace_id: uuidSchema,
  version_number: z.number().int().min(1),
  content: z.string().min(1, 'Content is required'),
  created_by: uuidSchema,
  created_at: z.string().datetime().optional(),
});

export const createDraftVersionSchema = draftVersionSchema.pick({
  draft_id: true,
  workspace_id: true,
  version_number: true,
  content: true,
});

// 7. Findings
export const findingSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  draft_id: uuidSchema,
  draft_version_id: uuidSchema,
  engine: findingEngineSchema,
  severity: findingSeveritySchema,
  source_rule_id: z.string().min(1),
  rule_version: z.number().int().min(1),
  flagged_span: z.string().min(1, 'Flagged span cannot be empty'),
  explanation: z.string().min(1, 'Explanation is required'),
  minimal_edit: z.string().optional().nullable(),
  status: findingStatusSchema,
  override_comment: z.string().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export const createFindingSchema = findingSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).extend({
  status: findingStatusSchema.default('PENDING'),
});

export const updateFindingStatusSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ACCEPTED'),
    override_comment: z.null().optional(),
  }),
  z.object({
    status: z.literal('OVERRIDDEN'),
    override_comment: z.string().trim().min(3, 'Override explanation comment is required when overriding a rule flag'),
  }),
  z.object({
    status: z.literal('PENDING'),
    override_comment: z.null().optional(),
  }),
]);

// 8. Comments
export const commentSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  draft_id: uuidSchema,
  finding_id: uuidSchema.optional().nullable(),
  user_id: uuidSchema,
  content: z.string().trim().min(1, 'Comment cannot be empty').max(2000),
  created_at: z.string().datetime().optional(),
});

export const createCommentSchema = commentSchema.omit({
  id: true,
  created_at: true,
  user_id: true,
});

// 9. Approvals
export const approvalSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  draft_id: uuidSchema,
  draft_version_id: uuidSchema,
  reviewer_id: uuidSchema,
  decision: approvalDecisionSchema,
  comment: z.string().trim().max(2000).optional().nullable(),
  created_at: z.string().datetime().optional(),
});

export const createApprovalSchema = approvalSchema.omit({
  id: true,
  created_at: true,
  reviewer_id: true,
});

// 10. Payload Log
export const payloadLogSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  user_id: uuidSchema,
  draft_id: uuidSchema.optional().nullable(),
  endpoint: z.string().min(1),
  payload: z.record(z.any()),
  created_at: z.string().datetime().optional(),
});

export const createPayloadLogSchema = payloadLogSchema.omit({
  id: true,
  created_at: true,
});

// 11. Audit Log
export const auditLogSchema = z.object({
  id: uuidSchema,
  workspace_id: uuidSchema,
  actor_id: uuidSchema,
  action: z.string().min(1),
  resource_type: z.string().min(1),
  resource_id: z.string().min(1),
  details: z.record(z.any()).default({}),
  created_at: z.string().datetime().optional(),
});

export const createAuditLogSchema = auditLogSchema.omit({
  id: true,
  created_at: true,
});
