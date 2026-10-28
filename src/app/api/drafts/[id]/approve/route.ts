export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { extractToken } from '@/lib/auth/extract-token';
import { z } from 'zod';

const approveSchema = z.object({
  workspaceId: z.string().uuid(),
  managerId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const token = extractToken(req);
    const body = await req.json();
    const parsed = approveSchema.parse(body);

    const updated = await workspaceService.approveDraft(
      parsed.workspaceId,
      parsed.managerId,
      params.id,
      parsed.decision,
      parsed.comment,
      token
    );
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
