'use client';

import React, { useState } from 'react';
import { Database, ShieldCheck, Eye, X } from 'lucide-react';

interface PayloadLogScreenProps {
  logs: any[];
  onRefresh: () => void;
}

export function PayloadLogScreen({ logs, onRefresh }: PayloadLogScreenProps) {
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 bg-white p-4 rounded shadow-subtle">
        <div>
          <h1 className="font-heading text-lg font-bold text-navy">Outbound Payload Audit Log</h1>
          <p className="text-xs text-teal">
            Trust layer audit trail of all payload data transmitted to external LLM providers post-redaction.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 text-xs font-semibold border border-border rounded text-navy hover:bg-beige focus-visible:outline-navy"
        >
          Refresh log
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="bg-white border border-border rounded p-8 text-center shadow-subtle">
          <Database className="h-8 w-8 text-teal mx-auto mb-2" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold text-navy">No outbound model calls logged yet</h2>
          <p className="text-xs text-teal mt-1 max-w-sm mx-auto">
            When you run a review on a draft, the pre-call redaction filter masks confidential emails, phone numbers, and codenames, logging every payload here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-border rounded shadow-subtle">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-beige/60 text-navy font-semibold">
                <th scope="col" className="p-3">Timestamp</th>
                <th scope="col" className="p-3">Endpoint</th>
                <th scope="col" className="p-3">Draft ID</th>
                <th scope="col" className="p-3">Redacted preview</th>
                <th scope="col" className="p-3">Tokens masked</th>
                <th scope="col" className="p-3 text-right">Inspect payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => {
                const payloadObj = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
                const tokenCount = payloadObj?.tokens?.length || 0;

                return (
                  <tr key={log.id} className="hover:bg-beige/30 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-teal whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-3 font-mono text-navy font-semibold">{log.endpoint}</td>
                    <td className="p-3 font-mono text-[11px] text-teal">
                      {log.draft_id ? `${log.draft_id.slice(0, 8)}...` : 'N/A'}
                    </td>
                    <td className="p-3 max-w-xs truncate text-navy" title={payloadObj?.redactedText}>
                      {payloadObj?.redactedText || 'N/A'}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy bg-sky-blue/30 px-1.5 py-0.5 rounded">
                        <ShieldCheck className="h-3 w-3 text-teal" aria-hidden="true" />
                        {tokenCount} tokens
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedPayload({ ...log, payloadObj })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-border rounded text-navy hover:bg-sky-blue/20 focus-visible:outline-navy"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payload Inspection Modal */}
      {selectedPayload && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payload-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
        >
          <div className="w-full max-w-2xl rounded border border-border bg-white p-6 shadow-subtle max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <h2 id="payload-modal-title" className="font-heading text-lg font-bold text-navy">
                  Post-Redaction Payload Inspection
                </h2>
                <p className="text-xs text-teal font-mono mt-0.5">
                  Logged at: {new Date(selectedPayload.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayload(null)}
                className="rounded p-1 text-navy hover:bg-sky-blue/30 focus-visible:outline-navy"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="font-semibold text-navy block mb-1">Masked tokens record:</span>
                {selectedPayload.payloadObj?.tokens?.length > 0 ? (
                  <div className="space-y-1">
                    {selectedPayload.payloadObj.tokens.map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 font-mono p-1.5 bg-beige rounded border border-border">
                        <span className="font-bold text-navy">{t.token}</span>
                        <span className="text-teal">&rarr;</span>
                        <span className="text-teal line-through">{t.original}</span>
                        <span className="text-[10px] text-teal font-sans uppercase ml-auto">({t.type})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-teal italic">No sensitive tokens detected in this payload.</p>
                )}
              </div>

              <div>
                <span className="font-semibold text-navy block mb-1">Raw JSON payload sent:</span>
                <pre className="p-3 bg-beige rounded border border-border text-[11px] font-mono text-navy overflow-x-auto whitespace-pre-wrap max-h-60">
                  {JSON.stringify(selectedPayload.payloadObj, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setSelectedPayload(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
