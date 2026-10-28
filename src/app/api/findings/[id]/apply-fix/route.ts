export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { z } from 'zod';

const applyFixSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const parsed = applyFixSchema.parse(body);
    const updatedDraft = await workspaceService.applyFix(
      parsed.workspaceId,
      parsed.userId,
      params.id
    );
    return NextResponse.json(updatedDraft);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
