export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { extractToken } from '@/lib/auth/extract-token';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = extractToken(req) || body.token;
    const session = await workspaceService.loadSampleWorkspace(body.userId, token);

    const response = NextResponse.json(session);
    if ((session as any).token) {
      response.cookies.set('kestrel_session_token', (session as any).token, {
        path: '/',
        httpOnly: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
