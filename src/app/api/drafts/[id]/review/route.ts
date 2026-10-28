export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { z } from 'zod';

const reviewRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  codenames: z.array(z.string()).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const parsed = reviewRequestSchema.parse(body);

    const reviewResult = await workspaceService.reviewDraft(
      parsed.workspaceId,
      parsed.userId,
      params.id,
      { codenames: parsed.codenames }
    );

    return NextResponse.json(reviewResult);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
