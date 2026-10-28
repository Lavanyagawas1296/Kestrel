'use client';

import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface OverrideModalProps {
  finding: any;
  onConfirm: (comment: string) => Promise<void>;
  onClose: () => void;
}

export function OverrideModal({ finding, onConfirm, onClose }: OverrideModalProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      setError('An override comment is strictly required to justify bypassing this rule flag.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(comment.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit override');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
    >
      <div className="w-full max-w-lg rounded border border-border bg-white p-6 shadow-subtle">
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <h2 id="override-modal-title" className="font-heading text-lg font-bold text-navy">
              Override Rule Flag
            </h2>
            <p className="text-xs text-teal mt-0.5">
              Rule: <span className="font-semibold">{finding.source_rule_id}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-navy hover:bg-sky-blue/30 focus-visible:outline-navy"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <span className="text-xs font-semibold text-navy block mb-1">Flagged text span:</span>
            <div className="p-2.5 bg-beige rounded border border-border text-xs text-navy font-mono">
              &quot;{finding.flagged_span}&quot;
            </div>
          </div>

          <div>
            <label htmlFor="override-comment" className="block text-xs font-semibold text-navy mb-1">
              Justification comment <span className="text-navy font-normal">(required)</span>:
            </label>
            <textarea
              id="override-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Legal exception approved per ticket #402 by Brand Director"
              className="w-full text-xs p-2.5 rounded border border-border bg-white text-navy focus-visible:outline-navy"
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 p-2 rounded bg-sky-blue/20 text-xs text-navy border border-border">
              <AlertCircle className="h-4 w-4 text-navy shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-xs font-medium text-navy border border-border rounded hover:bg-beige focus-visible:outline-navy"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Confirm override'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
