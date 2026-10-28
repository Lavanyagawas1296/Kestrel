export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { createDraftSchema } from '@/lib/validation/entities';
import { extractToken } from '@/lib/auth/extract-token';
import { z } from 'zod';

const draftRequestSchema = createDraftSchema.extend({
  userId: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 });
    }
    const drafts = await workspaceService.listDrafts(workspaceId, token);
    return NextResponse.json(drafts);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    const body = await req.json();
    const parsed = draftRequestSchema.parse(body);
    const draft = await workspaceService.createDraft(
      parsed.workspace_id,
      parsed.userId,
      parsed.title,
      parsed.content,
      token
    );
    return NextResponse.json(draft);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
