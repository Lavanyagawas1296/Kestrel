export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { extractToken } from '@/lib/auth/extract-token';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: { ruleId: string } }
) {
  try {
    const token = extractToken(req);
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId || !UUID_REGEX.test(workspaceId)) {
      return NextResponse.json([]);
    }
    const history = await workspaceService.getRuleHistory(workspaceId, params.ruleId, token);
    return NextResponse.json(history);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
