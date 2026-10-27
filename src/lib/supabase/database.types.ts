export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRole = 'creator' | 'reviewer' | 'manager';
export type RuleType = 'TONE' | 'TERM' | 'FACT' | 'VISUAL' | 'ACCESSIBILITY';
export type RuleOrigin = 'public_sample' | 'custom';
export type RuleStatus = 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
export type DraftStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'NEEDS_RECHECK' | 'REJECTED';
export type FindingEngine = 'DETERMINISTIC' | 'LLM_RAG';
export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type FindingStatus = 'PENDING' | 'ACCEPTED' | 'OVERRIDDEN';
export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface Database {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          role?: MemberRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'members_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      kb_rules: {
        Row: {
          id: string;
          workspace_id: string;
          rule_id: string;
          type: RuleType;
          owner: string;
          effective_date: string;
          version: number;
          rule_text: string;
          source_name: string;
          source_url: string;
          origin: RuleOrigin;
          status: RuleStatus;
          embedding: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          rule_id: string;
          type: RuleType;
          owner: string;
          effective_date?: string;
          version?: number;
          rule_text: string;
          source_name: string;
          source_url: string;
          origin: RuleOrigin;
          status?: RuleStatus;
          embedding?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          rule_id?: string;
          type?: RuleType;
          owner?: string;
          effective_date?: string;
          version?: number;
          rule_text?: string;
          source_name?: string;
          source_url?: string;
          origin?: RuleOrigin;
          status?: RuleStatus;
          embedding?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kb_rules_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      kb_rule_versions: {
        Row: {
          id: string;
          workspace_id: string;
          rule_id: string;
          version: number;
          type: RuleType;
          owner: string;
          effective_date: string;
          rule_text: string;
          source_name: string;
          source_url: string;
          origin: RuleOrigin;
          status: RuleStatus;
          created_at: string;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          rule_id: string;
          version: number;
          type: RuleType;
          owner: string;
          effective_date: string;
          rule_text: string;
          source_name: string;
          source_url: string;
          origin: RuleOrigin;
          status: RuleStatus;
          created_at?: string;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          rule_id?: string;
          version?: number;
          type?: RuleType;
          owner?: string;
          effective_date?: string;
          rule_text?: string;
          source_name?: string;
          source_url?: string;
          origin?: RuleOrigin;
          status?: RuleStatus;
          created_at?: string;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kb_rule_versions_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      drafts: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          status: DraftStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          title: string;
          status?: DraftStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          title?: string;
          status?: DraftStatus;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'drafts_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      draft_versions: {
        Row: {
          id: string;
          draft_id: string;
          workspace_id: string;
          version_number: number;
          content: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          draft_id: string;
          workspace_id: string;
          version_number: number;
          content: string;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          draft_id?: string;
          workspace_id?: string;
          version_number?: number;
          content?: string;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'draft_versions_draft_id_fkey';
            columns: ['draft_id'];
            referencedRelation: 'drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'draft_versions_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      findings: {
        Row: {
          id: string;
          workspace_id: string;
          draft_id: string;
          draft_version_id: string;
          engine: FindingEngine;
          severity: FindingSeverity;
          source_rule_id: string;
          rule_version: number;
          flagged_span: string;
          explanation: string;
          minimal_edit: string | null;
          status: FindingStatus;
          override_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          draft_id: string;
          draft_version_id: string;
          engine: FindingEngine;
          severity: FindingSeverity;
          source_rule_id: string;
          rule_version: number;
          flagged_span: string;
          explanation: string;
          minimal_edit?: string | null;
          status?: FindingStatus;
          override_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          draft_id?: string;
          draft_version_id?: string;
          engine?: FindingEngine;
          severity?: FindingSeverity;
          source_rule_id?: string;
          rule_version?: number;
          flagged_span?: string;
          explanation?: string;
          minimal_edit?: string | null;
          status?: FindingStatus;
          override_comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'findings_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'findings_draft_id_fkey';
            columns: ['draft_id'];
            referencedRelation: 'drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'findings_draft_version_id_fkey';
            columns: ['draft_version_id'];
            referencedRelation: 'draft_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          workspace_id: string;
          draft_id: string;
          finding_id: string | null;
          user_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          draft_id: string;
          finding_id?: string | null;
          user_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          draft_id?: string;
          finding_id?: string | null;
          user_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_draft_id_fkey';
            columns: ['draft_id'];
            referencedRelation: 'drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_finding_id_fkey';
            columns: ['finding_id'];
            referencedRelation: 'findings';
            referencedColumns: ['id'];
          },
        ];
      };
      approvals: {
        Row: {
          id: string;
          workspace_id: string;
          draft_id: string;
          draft_version_id: string;
          reviewer_id: string;
          decision: ApprovalDecision;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          draft_id: string;
          draft_version_id: string;
          reviewer_id: string;
          decision: ApprovalDecision;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          draft_id?: string;
          draft_version_id?: string;
          reviewer_id?: string;
          decision?: ApprovalDecision;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approvals_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approvals_draft_id_fkey';
            columns: ['draft_id'];
            referencedRelation: 'drafts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approvals_draft_version_id_fkey';
            columns: ['draft_version_id'];
            referencedRelation: 'draft_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      payload_log: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          draft_id: string | null;
          endpoint: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          draft_id?: string | null;
          endpoint: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          draft_id?: string | null;
          endpoint?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payload_log_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          workspace_id: string;
          actor_id: string;
          action: string;
          resource_type: string;
          resource_id: string;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          actor_id: string;
          action: string;
          resource_type: string;
          resource_id: string;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          actor_id?: string;
          action?: string;
          resource_type?: string;
          resource_id?: string;
          details?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_role: {
        Args: {
          p_workspace_id: string;
          p_user_id?: string;
        };
        Returns: string | null;
      };
      is_member_of: {
        Args: {
          p_workspace_id: string;
          p_user_id?: string;
        };
        Returns: boolean;
      };
    };
  };
}
