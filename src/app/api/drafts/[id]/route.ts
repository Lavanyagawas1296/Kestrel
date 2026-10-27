import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 });
    }
    const draft = await workspaceService.getDraft(workspaceId, params.id);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }
    return NextResponse.json(draft);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
