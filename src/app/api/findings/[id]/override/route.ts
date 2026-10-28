export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { extractToken } from '@/lib/auth/extract-token';
import { z } from 'zod';

const overrideSchema = z.object({
  comment: z.string().trim().min(1, 'Override comment is required'),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const token = extractToken(req);
    const body = await req.json();
    const parsed = overrideSchema.parse(body);
    const updated = await workspaceService.overrideFinding(params.id, parsed.comment, token);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
