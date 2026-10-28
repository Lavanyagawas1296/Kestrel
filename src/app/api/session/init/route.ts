export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = await workspaceService.initSandboxSession(body.userId);
    return NextResponse.json(session);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
