'use client';

import React, { useState } from 'react';
import type { MemberRole } from '@/lib/supabase/database.types';
import { GitCompare, CheckCircle, XCircle, AlertCircle, ShieldAlert } from 'lucide-react';

interface RevisionHistoryScreenProps {
  activeDraft: any | null;
  workspaceId: string;
  userId: string;
  activeRole: MemberRole;
  onRefresh: () => Promise<void>;
}

export function RevisionHistoryScreen({
  activeDraft,
  workspaceId,
  userId,
  activeRole,
  onRefresh,
}: RevisionHistoryScreenProps) {
  const [v1Index, setV1Index] = useState<number>(0);
  const [v2Index, setV2Index] = useState<number>(
    activeDraft?.versions?.length ? Math.max(0, activeDraft.versions.length - 1) : 0
  );
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  if (!activeDraft || !activeDraft.versions || activeDraft.versions.length === 0) {
    return (
      <div className="bg-white border border-border rounded p-8 text-center shadow-subtle">
        <GitCompare className="h-8 w-8 text-teal mx-auto mb-2" aria-hidden="true" />
        <h2 className="font-heading text-base font-bold text-navy">No revision history yet</h2>
        <p className="text-xs text-teal mt-1">
          Submit or apply a fix to a draft to generate revision snapshots and side-by-side diffs.
        </p>
      </div>
    );
  }

  const versions = activeDraft.versions;
  const v1 = versions[v1Index] || versions[0];
  const v2 = versions[v2Index] || versions[versions.length - 1];
  const isManager = activeRole === 'manager';

  const handleDecision = async (decision: 'APPROVED' | 'REJECTED') => {
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/drafts/${activeDraft.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          managerId: userId,
          decision,
          comment: approvalComment.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record decision');
      }

      setActionSuccess(`Draft ${activeDraft.title} successfully marked as ${decision}.`);
      setApprovalComment('');
      await onRefresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Version Selector */}
      <div className="bg-white border border-border rounded p-4 shadow-subtle flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-lg font-bold text-navy">
            Revision History & Diff: {activeDraft.title}
          </h1>
          <p className="text-xs text-teal">
            Compare content evolutions across draft versions before final approval.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div>
            <label htmlFor="baseline-version" className="text-navy font-semibold mr-1.5">
              Baseline:
            </label>
            <select
              id="baseline-version"
              value={v1Index}
              onChange={(e) => setV1Index(parseInt(e.target.value, 10))}
              className="p-1 border border-border rounded bg-white text-navy font-mono"
            >
              {versions.map((ver: any, i: number) => (
                <option key={ver.id} value={i}>
                  v{ver.version_number} ({new Date(ver.created_at).toLocaleTimeString()})
                </option>
              ))}
            </select>
          </div>

          <span className="text-teal font-bold">&rarr;</span>

          <div>
            <label htmlFor="comparison-version" className="text-navy font-semibold mr-1.5">
              Comparison:
            </label>
            <select
              id="comparison-version"
              value={v2Index}
              onChange={(e) => setV2Index(parseInt(e.target.value, 10))}
              className="p-1 border border-border rounded bg-white text-navy font-mono font-bold"
            >
              {versions.map((ver: any, i: number) => (
                <option key={ver.id} value={i}>
                  v{ver.version_number} ({new Date(ver.created_at).toLocaleTimeString()})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 bg-white border border-border rounded text-xs text-navy font-medium">
          <CheckCircle className="h-4 w-4 text-teal" aria-hidden="true" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-white border border-border rounded text-xs text-navy font-medium">
          <AlertCircle className="h-4 w-4 text-navy" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Side-by-Side Diff Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Baseline Pane */}
        <div className="bg-white border border-border rounded p-4 shadow-subtle min-h-[400px]">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
            <span className="font-heading text-sm font-bold text-navy">
              Baseline: Version {v1.version_number}
            </span>
            <span className="text-[11px] font-mono text-teal">
              {new Date(v1.created_at).toLocaleString()}
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs text-navy leading-relaxed bg-beige/40 p-3 rounded border border-border">
            {v1.content}
          </pre>
        </div>

        {/* Comparison Pane */}
        <div className="bg-white border border-border rounded p-4 shadow-subtle min-h-[400px]">
          <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
            <span className="font-heading text-sm font-bold text-navy">
              Comparison: Version {v2.version_number}
            </span>
            <span className="text-[11px] font-mono text-teal">
              {new Date(v2.created_at).toLocaleString()}
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-xs text-navy leading-relaxed bg-beige/40 p-3 rounded border border-border">
            {v2.content}
          </pre>
        </div>
      </div>

      {/* Manager Approval Controls */}
      <div className="bg-white border border-border rounded p-4 shadow-subtle">
        <h2 className="font-heading text-sm font-bold text-navy mb-2">Manager Approval Decision</h2>

        {isManager ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="approval-comment" className="block text-xs font-semibold text-navy mb-1">
                Approval or rejection notes:
              </label>
              <textarea
                id="approval-comment"
                rows={2}
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="e.g. Verified SLA figures against 2026 legal standards. Approved for publish."
                className="w-full text-xs p-2.5 rounded border border-border bg-white text-navy focus-visible:outline-navy"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleDecision('APPROVED')}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                <span>Approve draft for publication</span>
              </button>

              <button
                type="button"
                onClick={() => handleDecision('REJECTED')}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border border-border rounded text-navy hover:bg-beige focus-visible:outline-navy disabled:opacity-50"
              >
                <XCircle className="h-4 w-4 text-navy" aria-hidden="true" />
                <span>Reject draft</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-3 bg-sky-blue/20 rounded border border-border text-xs text-navy">
            <ShieldAlert className="h-4 w-4 text-navy shrink-0" aria-hidden="true" />
            <span>
              Manager approval controls are restricted to the <strong>Manager</strong> role. Switch your role using the top bar role switcher to exercise approval authority.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
