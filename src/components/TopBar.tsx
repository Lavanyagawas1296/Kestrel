'use client';

import React from 'react';
import type { MemberRole } from '@/lib/supabase/database.types';
import { ShieldCheck, UserCheck, FileText, BookOpen, GitCompare, Database, Sparkles } from 'lucide-react';

interface TopBarProps {
  activeRole: MemberRole;
  onRoleChange: (role: MemberRole) => void;
  activeTab: 'workspace' | 'kb' | 'history' | 'payloads';
  onTabChange: (tab: 'workspace' | 'kb' | 'history' | 'payloads') => void;
  workspaceId: string;
  isSampleWorkspace?: boolean;
  onLoadSample?: () => void;
}

export function TopBar({
  activeRole,
  onRoleChange,
  activeTab,
  onTabChange,
  workspaceId,
  isSampleWorkspace,
  onLoadSample,
}: TopBarProps) {
  const roles: MemberRole[] = ['creator', 'reviewer', 'manager'];

  return (
    <header className="border-b border-border bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Sandbox session indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-heading text-xl font-bold tracking-tight text-navy">
              Kestrel
            </span>
            <span className="text-xs uppercase tracking-wider text-teal font-medium border border-border px-1.5 py-0.5 rounded">
              Governance
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-navy border-l border-border pl-3">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            <span className="text-navy font-normal">Anonymous sandbox active:</span>
            <code className="text-[11px] font-mono text-teal bg-beige px-1.5 py-0.5 rounded">
              {workspaceId.slice(0, 8)}...
            </code>
          </div>
        </div>

        {/* Center: Navigation tabs */}
        <nav aria-label="Main application tabs" className="flex items-center gap-1 border border-border rounded p-0.5 bg-beige">
          <button
            type="button"
            onClick={() => onTabChange('workspace')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'workspace'
                ? 'bg-white text-navy shadow-subtle font-semibold'
                : 'text-navy hover:text-navy hover:bg-sky-blue/30'
            }`}
            aria-current={activeTab === 'workspace' ? 'page' : undefined}
          >
            <FileText className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            Review workspace
          </button>

          <button
            type="button"
            onClick={() => onTabChange('kb')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'kb'
                ? 'bg-white text-navy shadow-subtle font-semibold'
                : 'text-navy hover:text-navy hover:bg-sky-blue/30'
            }`}
            aria-current={activeTab === 'kb' ? 'page' : undefined}
          >
            <BookOpen className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            Knowledge Base
          </button>

          <button
            type="button"
            onClick={() => onTabChange('history')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'history'
                ? 'bg-white text-navy shadow-subtle font-semibold'
                : 'text-navy hover:text-navy hover:bg-sky-blue/30'
            }`}
            aria-current={activeTab === 'history' ? 'page' : undefined}
          >
            <GitCompare className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            Revision diff & approval
          </button>

          <button
            type="button"
            onClick={() => onTabChange('payloads')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'payloads'
                ? 'bg-white text-navy shadow-subtle font-semibold'
                : 'text-navy hover:text-navy hover:bg-sky-blue/30'
            }`}
            aria-current={activeTab === 'payloads' ? 'page' : undefined}
          >
            <Database className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            Payload log
          </button>
        </nav>

        {/* Right: Actions & Role Switcher */}
        <div className="flex items-center gap-3">
          {/* Optional Sample Workspace Loader */}
          {isSampleWorkspace ? (
            <span
              className="text-[11px] font-semibold text-navy bg-sky-blue/40 border border-teal/30 px-2 py-1 rounded"
              title="This workspace contains demonstration synthetic data only"
            >
              Synthetic sample, not real company data
            </span>
          ) : (
            onLoadSample && (
              <button
                type="button"
                onClick={onLoadSample}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-border bg-white text-navy hover:bg-sky-blue/30 transition-colors focus-visible:outline-navy"
                title="Load sample workspace: Synthetic sample, not real company data"
              >
                <Sparkles className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
                <span>Load sample workspace</span>
                <span className="text-[10px] text-teal border border-border px-1 rounded font-sans">
                  Synthetic
                </span>
              </button>
            )
          )}

          <div className="flex items-center gap-2">
            <label htmlFor="role-selector" className="text-xs font-medium text-navy flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
              <span>Role:</span>
            </label>
          <div
            id="role-selector"
            role="radiogroup"
            aria-label="Active role selector"
            className="inline-flex rounded border border-border bg-beige p-0.5"
          >
            {roles.map((r) => {
              const isSelected = activeRole === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onRoleChange(r)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize rounded transition-colors ${
                    isSelected
                      ? 'bg-navy text-white font-semibold'
                      : 'text-navy hover:bg-sky-blue/40'
                  }`}
                >
                  {r}
                </button>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
