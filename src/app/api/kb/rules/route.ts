export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { workspaceService } from '@/lib/services/workspace-service';
import { createKbRuleSchema } from '@/lib/validation/entities';
import { extractToken } from '@/lib/auth/extract-token';

export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 });
    }
    const rules = await workspaceService.getRules(workspaceId, token);
    return NextResponse.json(rules);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = extractToken(req);
    const body = await req.json();
    const parsed = createKbRuleSchema.parse(body);
    const saved = await workspaceService.saveRule(
      parsed.workspace_id,
      {
        rule_id: parsed.rule_id,
        type: parsed.type,
        owner: parsed.owner,
        effective_date: parsed.effective_date,
        version: parsed.version,
        rule_text: parsed.rule_text,
        source_name: parsed.source_name,
        source_url: parsed.source_url,
        status: parsed.status,
      },
      token
    );
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
