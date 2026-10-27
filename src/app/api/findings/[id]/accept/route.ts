import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const updated = await workspaceService.acceptFinding(params.id);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
