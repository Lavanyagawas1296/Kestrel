export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { extractToken } from '@/lib/auth/extract-token';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const token = extractToken(req);
    const updated = await workspaceService.acceptFinding(params.id, token);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
