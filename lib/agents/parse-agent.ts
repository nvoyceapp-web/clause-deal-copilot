/**
 * Contract Parse Agent
 *
 * Reads a contract via the (mock) CLM MCP tool, extracts 18 tracked
 * commercial and legal terms with page-level citations, and persists
 * them to extracted_terms. Every tool call and the model run itself
 * are logged to audit_log.
 */

import OpenAI from 'openai';
import { getContractDocument } from '../mcp-tools/clm';
import { logAudit } from '../audit';
import { supabaseAdmin } from '../supabase';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are the Contract Parse Agent for Clause, an AI deal desk copilot.

Your job: extract structured commercial and legal terms from an enterprise contract.

You will be given a parsed contract document with pages and paragraphs. For each tracked term, return:
- term_key: the canonical key from the list below
- term_value: a structured object matching the shape specified for that term, or null if the term is not present in the contract
- citation_page: the page number where the term is defined
- citation_paragraph: the paragraph index (1-based) within that page
- citation_text: the exact quoted phrase from the contract that supports your extraction (max 300 chars)
- extraction_confidence: a number between 0.00 and 1.00 reflecting how unambiguously the contract specifies this term
- reasoning: one sentence explaining your interpretation, especially when ambiguous

CRITICAL RULES:
1. Never invent a value. If you cannot find clear evidence in the document, set term_value to null and confidence to 1.0 (you are confident the term is absent), and set citation fields to null.
2. Always cite. If you have a value, you must have a citation_page, citation_paragraph, and citation_text.
3. If a term is present but the language is ambiguous, return your best structured interpretation, set confidence below 0.90, and explain in reasoning.
4. Output VALID JSON only, matching the OUTPUT FORMAT below.

TRACKED TERMS (extract all 18, in this order):

1. payment_terms — { "days": number }                    — Net-30 means days=30
2. term_length — { "months": number }
3. auto_renewal — { "auto_renew": boolean, "notice_days": number | null }
4. commit_ramp — { "yearly_commits_usd": [number, ...] }  — annual commits in dollars, in order
5. bundled_free_services — { "bundled_present": boolean, "description": string | null, "estimated_ssp_value_usd": number | null }
6. overage_pricing — { "rate_basis": "tier_1" | "tier_2" | "tier_3" | "below_tier_2" | "other", "description": string | null }
7. liability_cap — { "cap_multiple": number, "measurement_period_months": number, "carve_outs": string[] }
8. indemnity_ip — { "mutual": boolean, "capped": boolean }
9. mfn_clause — { "present": boolean, "scope": string | null }
10. exclusivity — { "present": boolean, "scope": string | null }
11. change_of_control — { "consent_required": boolean, "notice_days": number | null }
12. governing_law — { "jurisdiction": string }            — e.g., "Delaware"
13. assignment — { "consent_required": boolean, "m_and_a_exception": boolean }
14. data_retention — { "retention_days_post_term": number | null, "retention_total_years": number | null, "deletion_on_request": boolean }
15. data_use_training — { "training_without_consent": boolean }
16. uptime_sla — { "sla_pct": number }                    — e.g., 99.9
17. service_credits — { "max_credit_pct": number, "sole_remedy": boolean }
18. termination_convenience — { "available_to_customer": boolean, "notice_days": number | null, "commit_survives": boolean }

OUTPUT FORMAT (single JSON object):
{
  "extracted_terms": [
    {
      "term_key": "payment_terms",
      "term_value": { "days": 90 },
      "citation_page": 4,
      "citation_paragraph": 2,
      "citation_text": "All invoices issued under this Agreement shall be payable within ninety (90) days of the invoice date.",
      "extraction_confidence": 0.99,
      "reasoning": "Section 3.3 explicitly states a 90-day payment window."
    },
    ...18 entries total...
  ]
}`;

export interface ExtractedTerm {
  term_key: string;
  term_value: unknown;
  citation_page: number | null;
  citation_paragraph: number | null;
  citation_text: string | null;
  extraction_confidence: number;
  reasoning: string;
}

export interface ParseAgentResult {
  contract_id: string;
  extracted_terms: ExtractedTerm[];
  latency_ms: number;
  tokens: { input: number; output: number };
  model: string;
}

export async function runParseAgent(
  contractId: string,
): Promise<ParseAgentResult> {
  const startTime = Date.now();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o';

  // 1) Fetch the contract via the (mock) CLM MCP tool
  const document = await getContractDocument(contractId);

  await logAudit({
    actor_type: 'agent',
    actor_id: 'clause-parse-agent',
    action: 'tool_call:get_contract_document',
    subject_type: 'contract',
    subject_id: contractId,
    payload: {
      contract_id: contractId,
      document_type: document.document_type,
      page_count: document.page_count,
    },
  });

  // 2) Build the user message: a structured representation of the contract
  const documentRepr = document.pages
    .map(
      (page) =>
        `--- PAGE ${page.page} ---\n` +
        page.paragraphs
          .map((p) => `[Paragraph ${p.idx}] ${p.text}`)
          .join('\n\n'),
    )
    .join('\n\n');

  const userMessage = `Extract all 18 tracked terms from the following contract. Return a single JSON object matching the OUTPUT FORMAT in your instructions. Cite page and paragraph for every extracted term that is present in the contract.\n\nCONTRACT:\n\n${documentRepr}`;

  // 3) Call the model
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const latency_ms = Date.now() - startTime;
  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Parse agent returned no content from the model');
  }

  let extractedTerms: ExtractedTerm[];
  try {
    const parsed = JSON.parse(raw) as { extracted_terms?: ExtractedTerm[] };
    if (!parsed.extracted_terms || !Array.isArray(parsed.extracted_terms)) {
      throw new Error('Missing or malformed extracted_terms array');
    }
    extractedTerms = parsed.extracted_terms;
  } catch (err) {
    throw new Error(
      `Failed to parse model output as JSON: ${(err as Error).message}`,
    );
  }

  // 4) Persist extracted terms (idempotent: clear and reinsert)
  await supabaseAdmin
    .from('extracted_terms')
    .delete()
    .eq('contract_id', contractId);

  if (extractedTerms.length > 0) {
    const rows = extractedTerms.map((t) => ({
      contract_id: contractId,
      term_key: t.term_key,
      term_value: t.term_value,
      citation_page: t.citation_page,
      citation_paragraph: t.citation_paragraph,
      citation_text: t.citation_text,
      extraction_confidence: t.extraction_confidence,
      extracted_by: 'clause-parse-agent',
    }));

    const { error: insertError } = await supabaseAdmin
      .from('extracted_terms')
      .insert(rows);

    if (insertError) {
      throw new Error(
        `Failed to persist extracted terms: ${insertError.message}`,
      );
    }
  }

  // 5) Audit-log the parse run
  const avgConfidence =
    extractedTerms.reduce((sum, t) => sum + t.extraction_confidence, 0) /
    Math.max(extractedTerms.length, 1);

  await logAudit({
    actor_type: 'agent',
    actor_id: 'clause-parse-agent',
    action: 'parse_complete',
    subject_type: 'contract',
    subject_id: contractId,
    payload: {
      term_count: extractedTerms.length,
      avg_confidence: Number(avgConfidence.toFixed(4)),
    },
    prompt: SYSTEM_PROMPT,
    model: completion.model,
    tokens_in: completion.usage?.prompt_tokens,
    tokens_out: completion.usage?.completion_tokens,
    latency_ms,
  });

  return {
    contract_id: contractId,
    extracted_terms: extractedTerms,
    latency_ms,
    tokens: {
      input: completion.usage?.prompt_tokens ?? 0,
      output: completion.usage?.completion_tokens ?? 0,
    },
    model: completion.model,
  };
}
