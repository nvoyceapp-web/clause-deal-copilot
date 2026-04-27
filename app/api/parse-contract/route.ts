import { NextRequest, NextResponse } from 'next/server';
import { runParseAgent } from '@/lib/agents/parse-agent';

export const runtime = 'nodejs';
export const maxDuration = 60; // seconds — gpt-4o on a 14-page contract is ~10–20s

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId = body?.contract_id;

    if (typeof contractId !== 'string' || contractId.length === 0) {
      return NextResponse.json(
        { error: 'contract_id is required' },
        { status: 400 },
      );
    }

    const result = await runParseAgent(contractId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('parse-contract error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
