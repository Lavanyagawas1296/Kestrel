'use client';

import React, { useState } from 'react';
import type { MemberRole } from '@/lib/supabase/database.types';
import { RuleDetailModal } from './RuleDetailModal';
import { OverrideModal } from './OverrideModal';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Play,
  Upload,
  Check,
  RotateCcw,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface ReviewWorkspaceScreenProps {
  drafts: any[];
  activeDraft: any | null;
  rules: any[];
  workspaceId: string;
  userId: string;
  activeRole: MemberRole;
  onDraftSelect: (draftId: string) => void;
  onRefreshDraft: () => Promise<void>;
  onCreateDraft: (title: string, content: string) => Promise<void>;
}

export function ReviewWorkspaceScreen({
  drafts,
  activeDraft,
  rules,
  workspaceId,
  userId,
  activeRole,
  onDraftSelect,
  onRefreshDraft,
  onCreateDraft,
}: ReviewWorkspaceScreenProps) {
  // Local state for editing/submitting
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [codenamesInput, setCodenamesInput] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [failedChecks, setFailedChecks] = useState<any[]>([]);

  // Modals & Inspection
  const [selectedRuleModal, setSelectedRuleModal] = useState<any | null>(null);
  const [overrideModalFinding, setOverrideModalFinding] = useState<any | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  const latestVersion = activeDraft?.versions?.[activeDraft?.versions?.length - 1];
  const findings: any[] = activeDraft?.findings || [];

  // Handle File Upload ingestion
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filename = file.name;
    const baseName = filename.replace(/\.[^/.]+$/, '');
    setNewTitle(baseName || 'Uploaded Draft');

    if (file.type === 'text/plain' || file.name.endsWith('.md')) {
      const text = await file.text();
      setNewContent(text);
    } else {
      // Read as base64 or array buffer for binary files
      const reader = new FileReader();
      reader.onload = async () => {
        // For demonstration & local tests, read text or notify
        if (typeof reader.result === 'string') {
          setNewContent(reader.result);
        }
      };
      reader.readAsText(file);
    }
    setIsCreatingNew(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    await onCreateDraft(newTitle.trim(), newContent.trim());
    setIsCreatingNew(false);
    setNewTitle('');
    setNewContent('');
  };

  const handleRunReview = async () => {
    if (!activeDraft) return;
    setReviewing(true);
    setReviewError(null);
    setFailedChecks([]);

    try {
      const codenames = codenamesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/drafts/${activeDraft.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          userId,
          codenames,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Review evaluation failed');
      }

      const result = await res.json();
      if (result.failedChecks && result.failedChecks.length > 0) {
        setFailedChecks(result.failedChecks);
      }
      await onRefreshDraft();
    } catch (err: any) {
      setReviewError(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const handleApplyFix = async (findingId: string) => {
    try {
      const res = await fetch(`/api/findings/${findingId}/apply-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply fix');
      }
      await onRefreshDraft();
    } catch (err: any) {
      alert(`Could not apply fix: ${err.message}`);
    }
  };

  const handleAccept = async (findingId: string) => {
    try {
      const res = await fetch(`/api/findings/${findingId}/accept`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to accept finding');
      }
      await onRefreshDraft();
    } catch (err: any) {
      alert(`Could not accept finding: ${err.message}`);
    }
  };

  const handleOverrideConfirm = async (comment: string) => {
    if (!overrideModalFinding) return;
    const res = await fetch(`/api/findings/${overrideModalFinding.id}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to override finding');
    }
    await onRefreshDraft();
  };

  // Render severity badge with icon + label (never color alone)
  const renderSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 font-bold text-navy border-2 border-navy px-2 py-0.5 rounded text-[11px] uppercase">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>CRITICAL</span>
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-navy border border-navy px-1.5 py-0.5 rounded text-[11px] uppercase">
            <AlertCircle className="h-3.5 w-3.5 text-navy" aria-hidden="true" />
            <span>HIGH</span>
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 font-medium text-teal border border-teal px-1.5 py-0.5 rounded text-[11px] uppercase">
            <Info className="h-3 w-3 text-teal" aria-hidden="true" />
            <span>MEDIUM</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 font-medium text-teal border border-border px-1.5 py-0.5 rounded text-[11px] uppercase">
            <CheckCircle className="h-3 w-3 text-teal" aria-hidden="true" />
            <span>LOW</span>
          </span>
        );
    }
  };

  // Highlights draft content with clickable spans for each finding
  const renderHighlightedContent = (rawText: string) => {
    if (!rawText) return <p className="text-teal italic">No text content available.</p>;

    const activeFindings = findings.filter(
      (f) => f.status === 'PENDING' && rawText.includes(f.flagged_span)
    );

    if (activeFindings.length === 0) {
      return (
        <pre className="whitespace-pre-wrap font-sans text-xs text-navy leading-relaxed">
          {rawText}
        </pre>
      );
    }

    // Segment text based on findings spans
    const segments: { text: string; finding?: any }[] = [];
    let currentIdx = 0;

    // Find all occurrences with start indices
    const matches: { start: number; end: number; finding: any }[] = [];
    for (const f of activeFindings) {
      let pos = rawText.indexOf(f.flagged_span);
      while (pos !== -1) {
        matches.push({ start: pos, end: pos + f.flagged_span.length, finding: f });
        pos = rawText.indexOf(f.flagged_span, pos + 1);
      }
    }

    matches.sort((a, b) => a.start - b.start);

    for (const m of matches) {
      if (m.start < currentIdx) continue; // skip overlapping
      if (m.start > currentIdx) {
        segments.push({ text: rawText.substring(currentIdx, m.start) });
      }
      segments.push({ text: rawText.substring(m.start, m.end), finding: m.finding });
      currentIdx = m.end;
    }

    if (currentIdx < rawText.length) {
      segments.push({ text: rawText.substring(currentIdx) });
    }

    return (
      <div className="whitespace-pre-wrap font-sans text-xs text-navy leading-relaxed">
        {segments.map((seg, i) => {
          if (!seg.finding) {
            return <span key={i}>{seg.text}</span>;
          }
          const isSelected = selectedFindingId === seg.finding.id;
          return (
            <mark
              key={i}
              onClick={() => setSelectedFindingId(seg.finding.id)}
              className={`flagged-span ${isSelected ? 'selected' : ''}`}
              title={`Flagged by ${seg.finding.source_rule_id}: click to view details`}
            >
              {seg.text}
            </mark>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* NEEDS_RECHECK Banner */}
      {activeDraft?.status === 'NEEDS_RECHECK' && (
        <div
          role="alert"
          className="flex items-start gap-2.5 p-3.5 bg-sky-blue/30 border-2 border-navy rounded text-navy"
        >
          <ShieldAlert className="h-5 w-5 text-navy shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs">
            <span className="font-bold block text-sm">Action required: Rules updated (NEEDS_RECHECK)</span>
            <p className="mt-0.5">
              One or more Knowledge Base rules cited in this draft have been updated or retired. Re-run the review engine below to verify compliance against the latest brand standards.
            </p>
          </div>
        </div>
      )}

      {/* Visible Failed-Check status banner (never silent pass) */}
      {failedChecks.length > 0 && (
        <div role="alert" className="p-3 bg-white border-2 border-navy rounded text-xs text-navy">
          <div className="flex items-center gap-2 font-bold mb-1">
            <AlertTriangle className="h-4 w-4 text-navy" aria-hidden="true" />
            <span>Check Evaluation Failure (Visible Alert)</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-teal">
            {failedChecks.map((fc, i) => (
              <li key={i}>
                <span className="font-semibold text-navy">{fc.engine}:</span> {fc.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reviewError && (
        <div role="alert" className="p-3 bg-white border border-border rounded text-xs text-navy flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-navy shrink-0" aria-hidden="true" />
          <span>{reviewError}</span>
        </div>
      )}

      {/* Main 3-Column Tool Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* COLUMN 1: Left Input & Draft Controls (3 cols) */}
        <div className="lg:col-span-3 space-y-3 bg-white border border-border rounded p-3.5 shadow-subtle">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="font-heading text-sm font-bold text-navy">Draft submissions</h2>
            <button
              type="button"
              onClick={() => setIsCreatingNew(!isCreatingNew)}
              className="text-xs text-teal hover:text-navy underline font-medium focus-visible:outline-navy"
            >
              {isCreatingNew ? 'Select existing' : '+ New draft'}
            </button>
          </div>

          {!isCreatingNew && (
            <div>
              <label htmlFor="draft-selector" className="block text-xs font-semibold text-navy mb-1">
                Select draft:
              </label>
              {drafts.length === 0 ? (
                <p className="text-xs text-teal italic">No drafts submitted yet.</p>
              ) : (
                <select
                  id="draft-selector"
                  value={activeDraft?.id || ''}
                  onChange={(e) => onDraftSelect(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-border bg-white text-navy focus-visible:outline-navy font-medium"
                >
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {isCreatingNew ? (
            <form onSubmit={handleCreateSubmit} className="space-y-3 pt-2">
              <div>
                <label htmlFor="file-upload" className="block text-xs font-semibold text-navy mb-1">
                  Ingest document or image:
                </label>
                <div className="border border-dashed border-border rounded p-2 text-center bg-beige">
                  <input
                    id="file-upload"
                    type="file"
                    accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="text-[11px] text-teal file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-border file:text-xs file:font-semibold file:bg-white file:text-navy hover:file:bg-sky-blue/20"
                  />
                  <p className="text-[10px] text-teal mt-1">Allowed: text, Markdown, DOCX, PDF, PNG/JPG</p>
                </div>
              </div>

              <div>
                <label htmlFor="new-draft-title" className="block text-xs font-semibold text-navy mb-1">
                  Draft title:
                </label>
                <input
                  id="new-draft-title"
                  type="text"
                  required
                  placeholder="e.g. Q3 Launch Announcement"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-border bg-white text-navy focus-visible:outline-navy"
                />
              </div>

              <div>
                <label htmlFor="new-draft-content" className="block text-xs font-semibold text-navy mb-1">
                  Draft content:
                </label>
                <textarea
                  id="new-draft-content"
                  rows={8}
                  required
                  placeholder="Paste or write draft copy here..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-border bg-white text-navy focus-visible:outline-navy font-sans"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-2.5 py-1 text-xs border border-border rounded text-navy hover:bg-beige"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-semibold bg-navy text-white rounded hover:bg-navy/90"
                >
                  Save draft
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3 pt-2">
              <div>
                <label htmlFor="codenames" className="block text-xs font-semibold text-navy mb-1">
                  Confidential codenames to redact:
                </label>
                <input
                  id="codenames"
                  type="text"
                  placeholder="e.g. Project Chimera, Falcon"
                  value={codenamesInput}
                  onChange={(e) => setCodenamesInput(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-border bg-white text-navy focus-visible:outline-navy font-mono text-[11px]"
                />
                <p className="text-[10px] text-teal mt-0.5">
                  Masks sensitive terms with tokens before any model call.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunReview}
                disabled={reviewing || !activeDraft}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy disabled:opacity-50 transition-colors shadow-subtle"
              >
                {reviewing ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Evaluating rules...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Run brand review</span>
                  </>
                )}
              </button>

              <div className="border-t border-border pt-2 text-[11px] text-teal">
                <span>Rules active: </span>
                <span className="font-semibold text-navy">{rules.length} standards</span>
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 2: Centre Draft Text with Highlighted Spans (5 cols) */}
        <div className="lg:col-span-5 space-y-2 bg-white border border-border rounded p-4 shadow-subtle min-h-[500px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
            <div>
              <h2 className="font-heading text-base font-bold text-navy truncate max-w-xs">
                {activeDraft?.title || 'No draft selected'}
              </h2>
              {latestVersion && (
                <span className="text-[11px] text-teal font-mono">
                  Version {latestVersion.version_number} &bull; {new Date(latestVersion.created_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {activeDraft && (
              <span className="px-2 py-0.5 rounded text-xs font-bold uppercase border border-border bg-beige text-navy">
                {activeDraft.status}
              </span>
            )}
          </div>

          <div className="pt-2">
            {latestVersion ? (
              renderHighlightedContent(latestVersion.content)
            ) : (
              <div className="p-8 text-center text-teal text-xs">
                <Upload className="h-6 w-6 mx-auto mb-1 text-teal" aria-hidden="true" />
                <span>Select or create a draft to inspect content.</span>
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 3: Right Findings List (4 cols) */}
        <div className="lg:col-span-4 space-y-3 bg-white border border-border rounded p-4 shadow-subtle min-h-[500px]">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading text-sm font-bold text-navy">Review Findings</h2>
              <span className="text-xs px-1.5 py-0.2 rounded bg-sky-blue/30 font-semibold text-navy">
                {findings.length}
              </span>
            </div>

            <span className="text-[11px] text-teal">Human decision required</span>
          </div>

          {findings.length === 0 ? (
            <div className="p-8 text-center text-teal text-xs border border-dashed border-border rounded bg-beige">
              <Check className="h-6 w-6 mx-auto mb-1.5 text-teal" aria-hidden="true" />
              <p className="font-semibold text-navy">No open issues found</p>
              <p className="mt-1">
                {activeDraft
                  ? 'Click "Run brand review" to evaluate this draft against the Brand Knowledge Base.'
                  : 'Submit a draft to begin pre-publication review.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
              {findings.map((f) => {
                const isSelected = selectedFindingId === f.id;
                const rule = rules.find((r) => r.rule_id === f.source_rule_id);

                return (
                  <div
                    key={f.id}
                    id={`finding-${f.id}`}
                    className={`p-3 rounded border transition-all text-xs ${
                      isSelected
                        ? 'border-navy bg-sky-blue/20 ring-1 ring-navy'
                        : f.status === 'OVERRIDDEN'
                        ? 'border-border bg-beige/40 opacity-75'
                        : f.status === 'ACCEPTED'
                        ? 'border-border bg-beige/30'
                        : 'border-border bg-white'
                    }`}
                  >
                    {/* Finding Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRuleModal(rule || { rule_id: f.source_rule_id, rule_text: f.explanation })}
                          className="font-mono text-xs font-bold text-navy hover:text-teal underline focus-visible:outline-navy"
                        >
                          {f.source_rule_id}
                        </button>
                        <span className="text-[10px] px-1 py-0.2 rounded border border-border text-teal uppercase">
                          {f.engine === 'DETERMINISTIC' ? 'Rule-based' : 'AI'}
                        </span>
                      </div>

                      {renderSeverityBadge(f.severity)}
                    </div>

                    {/* Flagged Span */}
                    <div className="mb-2 p-1.5 bg-beige rounded border border-border font-mono text-[11px] text-navy">
                      <span className="text-teal text-[10px] block font-sans font-medium">Flagged text:</span>
                      &quot;{f.flagged_span}&quot;
                    </div>

                    {/* Explanation */}
                    <p className="text-navy leading-normal mb-2 text-xs">{f.explanation}</p>

                    {/* Minimal Edit suggestion */}
                    {f.minimal_edit && (
                      <div className="p-2 mb-2.5 bg-sky-blue/20 rounded border border-border text-[11px] text-navy">
                        <span className="text-teal font-medium block text-[10px]">Minimal edit suggestion:</span>
                        <code className="font-mono text-navy font-semibold">&quot;{f.minimal_edit}&quot;</code>
                      </div>
                    )}

                    {/* Status & Action Buttons */}
                    <div className="border-t border-border pt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase text-teal">
                        Status: <span className="text-navy">{f.status}</span>
                      </span>

                      {f.status === 'PENDING' && (
                        <div className="flex items-center gap-1.5">
                          {f.minimal_edit && (
                            <button
                              type="button"
                              onClick={() => handleApplyFix(f.id)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy"
                              title="Replaces flagged span and creates new draft version"
                            >
                              <Sparkles className="h-3 w-3" aria-hidden="true" />
                              <span>Apply fix</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAccept(f.id)}
                            className="px-2 py-1 text-[11px] font-semibold border border-border rounded text-navy hover:bg-sky-blue/20 focus-visible:outline-navy"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => setOverrideModalFinding(f)}
                            className="px-2 py-1 text-[11px] font-semibold border border-border rounded text-navy hover:bg-beige focus-visible:outline-navy"
                          >
                            Override
                          </button>
                        </div>
                      )}

                      {f.status === 'OVERRIDDEN' && f.override_comment && (
                        <p className="text-[11px] text-teal italic w-full">
                          Override reason: &quot;{f.override_comment}&quot;
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {selectedRuleModal && (
        <RuleDetailModal
          rule={selectedRuleModal}
          workspaceId={workspaceId}
          onClose={() => setSelectedRuleModal(null)}
        />
      )}

      {overrideModalFinding && (
        <OverrideModal
          finding={overrideModalFinding}
          onConfirm={handleOverrideConfirm}
          onClose={() => setOverrideModalFinding(null)}
        />
      )}
    </div>
  );
}
