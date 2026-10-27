'use client';

import React, { useEffect, useState } from 'react';
import { X, ExternalLink, History } from 'lucide-react';

interface RuleDetailModalProps {
  rule: any;
  workspaceId: string;
  onClose: () => void;
}

export function RuleDetailModal({ rule, workspaceId, onClose }: RuleDetailModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (showHistory && rule) {
      setLoadingHistory(true);
      fetch(`/api/kb/rules/${rule.rule_id}/history?workspaceId=${workspaceId}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setHistory(data);
        })
        .catch(console.error)
        .finally(() => setLoadingHistory(false));
    }
  }, [showHistory, rule, workspaceId]);

  if (!rule) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rule-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
    >
      <div className="w-full max-w-2xl rounded border border-border bg-white p-6 shadow-subtle max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="rule-modal-title" className="font-heading text-lg font-bold text-navy">
                {rule.rule_id}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-sky-blue/30 text-navy font-semibold uppercase">
                {rule.type}
              </span>
              <span className="text-xs px-2 py-0.5 rounded border border-border text-teal font-medium">
                v{rule.version}
              </span>
            </div>
            <p className="text-xs text-teal mt-0.5">Owner: {rule.owner}</p>
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

        {/* Rule Content */}
        <div className="mt-4 space-y-4 text-xs">
          <div>
            <span className="font-semibold text-navy block mb-1">Rule standard text:</span>
            <div className="p-3 bg-beige rounded border border-border text-navy leading-relaxed text-sm font-sans">
              {rule.rule_text}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <span className="font-semibold text-navy block">Effective date:</span>
              <span className="text-teal font-mono">{rule.effective_date}</span>
            </div>
            <div>
              <span className="font-semibold text-navy block">Origin:</span>
              <span className="text-teal capitalize">{rule.origin}</span>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <span className="font-semibold text-navy block mb-1">Source citation:</span>
            <div className="flex items-center justify-between p-2 bg-beige rounded border border-border">
              <span className="text-navy truncate font-medium">{rule.source_name}</span>
              <a
                href={rule.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-teal underline font-medium hover:text-navy ml-2 shrink-0"
              >
                <span>View source</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* History Toggle */}
          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-navy font-semibold hover:text-teal underline"
            >
              <History className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
              <span>{showHistory ? 'Hide version history' : 'View version history'}</span>
            </button>

            {showHistory && (
              <div className="mt-3 border border-border rounded p-3 bg-beige">
                <h3 className="font-semibold text-navy mb-2 text-xs">Version audit ledger:</h3>
                {loadingHistory ? (
                  <p className="text-teal">Loading history records...</p>
                ) : history.length === 0 ? (
                  <p className="text-teal">No previous versions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {history.map((ver) => (
                      <div key={ver.id} className="p-2 bg-white rounded border border-border text-xs">
                        <div className="flex items-center justify-between text-navy font-semibold">
                          <span>Version {ver.version}</span>
                          <span className="text-teal text-[11px] font-mono">
                            {new Date(ver.recorded_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-navy line-clamp-2">{ver.rule_text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
