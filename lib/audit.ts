import { createHash } from 'crypto';
import { supabaseAdmin } from './supabase';

export type ActorType = 'user' | 'agent' | 'system';

export interface AuditEntry {
  actor_type: ActorType;
  actor_id: string;
  action: string;
  subject_type?: string;
  subject_id?: string;
  payload: Record<string, unknown>;
  prompt?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  playbook_version_map?: Record<string, number>;
}

/**
 * Append an entry to audit_log. The audit log enforces append-only at the
 * Postgres level (trigger), so any update or delete will throw.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const promptHash = entry.prompt
    ? createHash('sha256').update(entry.prompt).digest('hex')
    : null;

  const { error } = await supabaseAdmin.from('audit_log').insert({
    actor_type: entry.actor_type,
    actor_id: entry.actor_id,
    action: entry.action,
    subject_type: entry.subject_type ?? null,
    subject_id: entry.subject_id ?? null,
    payload: entry.payload,
    prompt_hash: promptHash,
    model: entry.model ?? null,
    tokens_in: entry.tokens_in ?? null,
    tokens_out: entry.tokens_out ?? null,
    latency_ms: entry.latency_ms ?? null,
    playbook_version_map: entry.playbook_version_map ?? null,
  });

  if (error) {
    // In production this should be a hard failure — losing audit entries
    // breaks the SOX story. For the prototype we log and continue.
    console.error('audit_log insert failed:', error);
  }
}
