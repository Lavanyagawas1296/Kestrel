export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { memberRoleSchema } from '@/lib/validation/entities';
import { extractToken } from '@/lib/auth/extract-token';
import { z } from 'zod';

const roleSwitchSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  role: memberRoleSchema,
});

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    const body = await req.json();
    const parsed = roleSwitchSchema.parse(body);
    const updated = await workspaceService.switchRole(
      parsed.workspaceId,
      parsed.userId,
      parsed.role,
      token
    );
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
