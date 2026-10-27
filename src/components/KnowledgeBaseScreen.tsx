'use client';

import React, { useState } from 'react';
import type { MemberRole } from '@/lib/supabase/database.types';
import { RuleDetailModal } from './RuleDetailModal';
import { Plus, ExternalLink, BookOpen, AlertCircle, Check } from 'lucide-react';

interface KnowledgeBaseScreenProps {
  rules: any[];
  workspaceId: string;
  activeRole: MemberRole;
  onRefresh: () => void;
}

export function KnowledgeBaseScreen({
  rules,
  workspaceId,
  activeRole,
  onRefresh,
}: KnowledgeBaseScreenProps) {
  const [selectedRule, setSelectedRule] = useState<any | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New rule form state
  const [formData, setFormData] = useState({
    rule_id: '',
    type: 'TERM',
    owner: '',
    effective_date: new Date().toISOString().slice(0, 10),
    version: 1,
    rule_text: '',
    source_name: '',
    source_url: '',
    status: 'ACTIVE',
  });

  const canEditRules = activeRole === 'manager' || activeRole === 'reviewer';

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/kb/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          workspace_id: workspaceId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save rule');
      }

      setSuccess(`Rule ${formData.rule_id} saved and versioned successfully.`);
      setIsAddingRule(false);
      setFormData({
        rule_id: '',
        type: 'TERM',
        owner: '',
        effective_date: new Date().toISOString().slice(0, 10),
        version: 1,
        rule_text: '',
        source_name: '',
        source_url: '',
        status: 'ACTIVE',
      });
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 bg-white p-4 rounded shadow-subtle">
        <div>
          <h1 className="font-heading text-lg font-bold text-navy">Brand Knowledge Base</h1>
          <p className="text-xs text-teal">
            Active versioned guidelines, accessibility standards, and terminology rules.
          </p>
        </div>

        {canEditRules ? (
          <button
            type="button"
            onClick={() => setIsAddingRule(!isAddingRule)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-navy text-white rounded hover:bg-navy/90 focus-visible:outline-navy"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isAddingRule ? 'Cancel' : 'Add new rule'}</span>
          </button>
        ) : (
          <div className="text-xs text-teal italic">
            Creator role is read-only. Switch to Reviewer or Manager to edit rules.
          </div>
        )}
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 bg-white border border-border rounded text-xs text-navy font-medium">
          <Check className="h-4 w-4 text-teal" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-white border border-border rounded text-xs text-navy font-medium">
          <AlertCircle className="h-4 w-4 text-navy" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Add Rule Form */}
      {isAddingRule && (
        <div className="bg-white border border-border rounded p-4 shadow-subtle">
          <h2 className="font-heading text-sm font-bold text-navy mb-3">Define Knowledge Base Rule</h2>
          <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="rule_id" className="block font-semibold text-navy mb-1">
                  Rule ID (e.g. BRAND-CLAIM-01)
                </label>
                <input
                  id="rule_id"
                  type="text"
                  required
                  placeholder="BRAND-NAME-01"
                  value={formData.rule_id}
                  onChange={(e) => setFormData({ ...formData, rule_id: e.target.value.toUpperCase() })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy font-mono"
                />
              </div>

              <div>
                <label htmlFor="type" className="block font-semibold text-navy mb-1">
                  Type
                </label>
                <select
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                >
                  <option value="TERM">TERM</option>
                  <option value="TONE">TONE</option>
                  <option value="FACT">FACT</option>
                  <option value="VISUAL">VISUAL</option>
                  <option value="ACCESSIBILITY">ACCESSIBILITY</option>
                </select>
              </div>

              <div>
                <label htmlFor="owner" className="block font-semibold text-navy mb-1">
                  Owner / Team
                </label>
                <input
                  id="owner"
                  type="text"
                  required
                  placeholder="e.g. Legal & Brand Team"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="effective_date" className="block font-semibold text-navy mb-1">
                  Effective Date
                </label>
                <input
                  id="effective_date"
                  type="date"
                  required
                  value={formData.effective_date}
                  onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                />
              </div>

              <div>
                <label htmlFor="version" className="block font-semibold text-navy mb-1">
                  Version
                </label>
                <input
                  id="version"
                  type="number"
                  min={1}
                  required
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: parseInt(e.target.value, 10) || 1 })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rule_text" className="block font-semibold text-navy mb-1">
                Rule Standard Text
              </label>
              <textarea
                id="rule_text"
                rows={3}
                required
                placeholder="Explicit wording of the standard..."
                value={formData.rule_text}
                onChange={(e) => setFormData({ ...formData, rule_text: e.target.value })}
                className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="source_name" className="block font-semibold text-navy mb-1">
                  Source Citation Name
                </label>
                <input
                  id="source_name"
                  type="text"
                  required
                  placeholder="e.g. Corporate Voice Handbook 2026"
                  value={formData.source_name}
                  onChange={(e) => setFormData({ ...formData, source_name: e.target.value })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                />
              </div>

              <div>
                <label htmlFor="source_url" className="block font-semibold text-navy mb-1">
                  Source URL
                </label>
                <input
                  id="source_url"
                  type="url"
                  required
                  placeholder="https://brand.internal.test/standards"
                  value={formData.source_url}
                  onChange={(e) => setFormData({ ...formData, source_url: e.target.value })}
                  className="w-full p-2 border border-border rounded bg-white text-navy focus-visible:outline-navy"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsAddingRule(false)}
                className="px-3 py-1.5 border border-border rounded text-navy hover:bg-beige"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-navy text-white rounded font-semibold hover:bg-navy/90 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save & version rule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules Table */}
      {rules.length === 0 ? (
        <div className="bg-white border border-border rounded p-8 text-center">
          <BookOpen className="h-8 w-8 text-teal mx-auto mb-2" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold text-navy">No brand rules configured yet</h2>
          <p className="text-xs text-teal mt-1 max-w-sm mx-auto">
            This workspace currently has no active guidelines. Click &quot;Add new rule&quot; above to create guidelines or reload the sample rules.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white border border-border rounded shadow-subtle">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-beige/60 text-navy font-semibold">
                <th scope="col" className="p-3">Rule ID</th>
                <th scope="col" className="p-3">Type</th>
                <th scope="col" className="p-3">Version</th>
                <th scope="col" className="p-3">Standard description</th>
                <th scope="col" className="p-3">Owner</th>
                <th scope="col" className="p-3">Effective</th>
                <th scope="col" className="p-3">Source citation</th>
                <th scope="col" className="p-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-beige/30 transition-colors">
                  <td className="p-3 font-mono font-semibold text-navy">
                    <button
                      type="button"
                      onClick={() => setSelectedRule(rule)}
                      className="text-navy hover:text-teal underline focus-visible:outline-navy"
                    >
                      {rule.rule_id}
                    </button>
                  </td>
                  <td className="p-3">
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase bg-sky-blue/30 text-navy">
                      {rule.type}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-teal font-medium">v{rule.version}</td>
                  <td className="p-3 text-navy max-w-xs truncate" title={rule.rule_text}>
                    {rule.rule_text}
                  </td>
                  <td className="p-3 text-teal">{rule.owner}</td>
                  <td className="p-3 font-mono text-teal text-[11px]">{rule.effective_date}</td>
                  <td className="p-3">
                    <a
                      href={rule.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-teal hover:text-navy underline truncate max-w-[150px]"
                      title={rule.source_name}
                    >
                      <span className="truncate">{rule.source_name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedRule(rule)}
                      className="px-2.5 py-1 text-xs font-medium border border-border rounded text-navy hover:bg-sky-blue/20 focus-visible:outline-navy"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Rule Detail Modal */}
      {selectedRule && (
        <RuleDetailModal
          rule={selectedRule}
          workspaceId={workspaceId}
          onClose={() => setSelectedRule(null)}
        />
      )}
    </div>
  );
}
