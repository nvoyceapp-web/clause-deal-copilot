/**
 * MCP-shaped tool module for the Standard Terms Library (the "playbook").
 *
 * Same pattern as clm.ts — the function signatures match what an MCP
 * server backed by a knowledge base (Notion, Confluence, internal portal)
 * would expose. The Playbook Check Agent will call get_rule on every
 * extracted term in Weekend 2.
 */

import { supabaseAdmin } from '../supabase';

export interface PlaybookRuleSpec {
  standard?: string;
  green_values?: string[];
  yellow_values?: string[];
  green_condition?: string;
  yellow_condition?: string;
  red_condition?: string;
  deal_impact?: string;
  escalation?: string;
  [key: string]: unknown;
}

export interface PlaybookRule {
  id: string;
  rule_key: string;
  rule_version: number;
  effective_from: string;
  category: string;
  rule_spec: PlaybookRuleSpec;
  owner_team: string;
  notes: string | null;
  created_at: string;
}

/**
 * MCP tool: get_rule
 *
 * Returns the most recent (currently-effective) version of a playbook rule
 * for the given key. If no rule exists for that key, returns null.
 */
export async function getRule(ruleKey: string): Promise<PlaybookRule | null> {
  const { data, error } = await supabaseAdmin
    .from('playbook_rules')
    .select('*')
    .eq('rule_key', ruleKey)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as PlaybookRule | null;
}

/**
 * MCP tool: list_rules
 *
 * Returns all playbook rules, optionally scoped to a category
 * ('commercial' | 'legal' | 'security' | 'operational' | etc).
 */
export async function listRules(category?: string): Promise<PlaybookRule[]> {
  let query = supabaseAdmin
    .from('playbook_rules')
    .select('*')
    .order('rule_key');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlaybookRule[];
}

/**
 * MCP tool: get_rule_version
 *
 * Returns a specific historical version of a rule. Useful for audit
 * reproducibility (which playbook version was applied to a past review).
 */
export async function getRuleVersion(
  ruleKey: string,
  ruleVersion: number,
): Promise<PlaybookRule | null> {
  const { data, error } = await supabaseAdmin
    .from('playbook_rules')
    .select('*')
    .eq('rule_key', ruleKey)
    .eq('rule_version', ruleVersion)
    .maybeSingle();

  if (error) throw error;
  return data as PlaybookRule | null;
}
