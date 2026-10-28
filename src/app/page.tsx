'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { MemberRole } from '@/lib/supabase/database.types';
import { TopBar } from '@/components/TopBar';
import { ReviewWorkspaceScreen } from '@/components/ReviewWorkspaceScreen';
import { KnowledgeBaseScreen } from '@/components/KnowledgeBaseScreen';
import { RevisionHistoryScreen } from '@/components/RevisionHistoryScreen';
import { PayloadLogScreen } from '@/components/PayloadLogScreen';
import { Loader2, AlertCircle } from 'lucide-react';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function HomePage() {
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [activeRole, setActiveRole] = useState<MemberRole>('manager');
  const [activeTab, setActiveTab] = useState<'workspace' | 'kb' | 'history' | 'payloads'>('workspace');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rules, setRules] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [activeDraft, setActiveDraft] = useState<any | null>(null);
  const [payloadLogs, setPayloadLogs] = useState<any[]>([]);
  const [isSampleWorkspace, setIsSampleWorkspace] = useState<boolean>(false);

  const handleLoadSample = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/sample-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: UUID_REGEX.test(userId) ? userId : undefined }),
      });
      if (!res.ok) throw new Error('Failed to load synthetic sample workspace');
      const data = await res.json();
      setWorkspaceId(data.workspaceId);
      setIsSampleWorkspace(true);
      setActiveRole('manager');
      setActiveDraft(null);
      localStorage.setItem(
        'kestrel_judge_session',
        JSON.stringify({ workspaceId: data.workspaceId, userId: data.userId, isSample: true, token: data.token })
      );
    } catch (err: any) {
      alert(`Error loading sample workspace: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Anonymous Judge Sandbox Session
  useEffect(() => {
    async function initSession() {
      try {
        setLoading(true);
        setError(null);

        // Check if there's an existing session in local storage
        const savedSession = localStorage.getItem('kestrel_judge_session');
        let sessionPayload: any = null;
        if (savedSession) {
          try {
            sessionPayload = JSON.parse(savedSession);
          } catch {
            sessionPayload = null;
          }
        }

        const validUserId = sessionPayload?.userId && UUID_REGEX.test(sessionPayload.userId) ? sessionPayload.userId : undefined;
        const validWorkspaceId = sessionPayload?.workspaceId && UUID_REGEX.test(sessionPayload.workspaceId) ? sessionPayload.workspaceId : undefined;
        const validToken = sessionPayload?.token && typeof sessionPayload.token === 'string' && sessionPayload.token.length > 20 ? sessionPayload.token : undefined;

        const res = await fetch('/api/session/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: validUserId,
            workspaceId: validWorkspaceId,
            token: validToken,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to initialize anonymous sandbox session');
        }

        const data = await res.json();
        setWorkspaceId(data.workspaceId);
        setUserId(data.userId);
        setActiveRole(data.role);

        localStorage.setItem(
          'kestrel_judge_session',
          JSON.stringify({ workspaceId: data.workspaceId, userId: data.userId, token: data.token })
        );
      } catch (err: any) {
        setError(err.message || 'Session initialization error');
      } finally {
        setLoading(false);
      }
    }

    initSession();
  }, []);

  // Fetch Workspace Rules
  const refreshRules = useCallback(async () => {
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) return;
    try {
      const res = await fetch(`/api/kb/rules?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (err) {
      console.error('Failed to load rules:', err);
    }
  }, [workspaceId]);

  // Fetch Drafts
  const refreshDrafts = useCallback(async () => {
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) return;
    try {
      const res = await fetch(`/api/drafts?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
        if (data.length > 0 && !activeDraft) {
          // Select first draft by default
          const draftDetailRes = await fetch(`/api/drafts/${data[0].id}?workspaceId=${workspaceId}`);
          if (draftDetailRes.ok) {
            const detail = await draftDetailRes.json();
            setActiveDraft(detail);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load drafts:', err);
    }
  }, [workspaceId, activeDraft]);

  // Fetch Specific Draft Detail
  const selectDraft = useCallback(async (draftId: string) => {
    if (!workspaceId || !UUID_REGEX.test(workspaceId) || !draftId || !UUID_REGEX.test(draftId)) return;
    try {
      const res = await fetch(`/api/drafts/${draftId}?workspaceId=${workspaceId}`);
      if (res.ok) {
        const detail = await res.json();
        setActiveDraft(detail);
      }
    } catch (err) {
      console.error('Failed to select draft:', err);
    }
  }, [workspaceId]);

  // Refresh Active Draft
  const refreshActiveDraft = useCallback(async () => {
    if (!workspaceId || !activeDraft) return;
    await selectDraft(activeDraft.id);
    await refreshDrafts();
  }, [workspaceId, activeDraft, selectDraft, refreshDrafts]);

  // Create Draft
  const handleCreateDraft = async (title: string, content: string) => {
    if (!workspaceId || !userId || !UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(userId)) return;
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          userId,
          title,
          content,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create draft');
      }

      const created = await res.json();
      setActiveDraft(created);
      await refreshDrafts();
    } catch (err: any) {
      alert(`Could not create draft: ${err.message}`);
    }
  };

  // Fetch Payload Logs
  const refreshPayloadLogs = useCallback(async () => {
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) return;
    try {
      const res = await fetch(`/api/payload-log?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setPayloadLogs(data);
      }
    } catch (err) {
      console.error('Failed to load payload logs:', err);
    }
  }, [workspaceId]);

  // Switch Role
  const handleRoleChange = async (role: MemberRole) => {
    if (!workspaceId || !userId || !UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(userId)) return;
    try {
      const res = await fetch('/api/session/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, userId, role }),
      });
      if (res.ok) {
        setActiveRole(role);
      }
    } catch (err) {
      console.error('Role switch error:', err);
    }
  };

  // Trigger loads on workspaceId ready
  useEffect(() => {
    if (workspaceId && UUID_REGEX.test(workspaceId)) {
      refreshRules();
      refreshDrafts();
      refreshPayloadLogs();
    }
  }, [workspaceId, refreshRules, refreshDrafts, refreshPayloadLogs]);

  // Refresh tab data on tab switch
  useEffect(() => {
    if (activeTab === 'kb') refreshRules();
    if (activeTab === 'payloads') refreshPayloadLogs();
    if (activeTab === 'history') refreshActiveDraft();
  }, [activeTab, refreshRules, refreshPayloadLogs, refreshActiveDraft]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-beige p-4">
        <div className="flex flex-col items-center gap-2 text-navy text-xs">
          <Loader2 className="h-6 w-6 animate-spin text-teal" aria-hidden="true" />
          <span className="font-semibold">Initializing Kestrel Sandbox Session...</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-beige p-4">
        <div className="max-w-md w-full bg-white border border-border p-6 rounded shadow-subtle text-xs space-y-3">
          <div className="flex items-center gap-2 text-navy font-bold text-sm">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>Workspace Initialization Failed</span>
          </div>
          <p className="text-teal">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-navy text-white font-semibold rounded hover:bg-navy/90 focus-visible:outline-navy"
          >
            Retry session
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-beige text-navy">
      {/* Top Bar with Sandbox & Role Switcher */}
      <TopBar
        activeRole={activeRole}
        onRoleChange={handleRoleChange}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workspaceId={workspaceId}
        isSampleWorkspace={isSampleWorkspace}
        onLoadSample={handleLoadSample}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {activeTab === 'workspace' && (
          <ReviewWorkspaceScreen
            drafts={drafts}
            activeDraft={activeDraft}
            rules={rules}
            workspaceId={workspaceId}
            userId={userId}
            activeRole={activeRole}
            onDraftSelect={selectDraft}
            onRefreshDraft={refreshActiveDraft}
            onCreateDraft={handleCreateDraft}
          />
        )}

        {activeTab === 'kb' && (
          <KnowledgeBaseScreen
            rules={rules}
            workspaceId={workspaceId}
            activeRole={activeRole}
            onRefresh={refreshRules}
          />
        )}

        {activeTab === 'history' && (
          <RevisionHistoryScreen
            activeDraft={activeDraft}
            workspaceId={workspaceId}
            userId={userId}
            activeRole={activeRole}
            onRefresh={refreshActiveDraft}
          />
        )}

        {activeTab === 'payloads' && (
          <PayloadLogScreen logs={payloadLogs} onRefresh={refreshPayloadLogs} />
        )}
      </main>
    </div>
  );
}
