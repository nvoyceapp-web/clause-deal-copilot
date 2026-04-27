/**
 * MCP-shaped tool module for the (mock) CLM system.
 *
 * The function signatures here mirror what an actual MCP server for a
 * Contract Lifecycle Management platform (Ironclad, DocuSign CLM, Conga)
 * would expose as tools. For the prototype, the agent imports and calls
 * these functions directly. To deploy as a real MCP server, wrap each
 * exported function in @modelcontextprotocol/sdk's Server class.
 */

import { supabaseAdmin } from '../supabase';
import { fetchAndParsePdf, ParsedPage } from '../pdf-utils';

export interface ContractDocument {
  contract_id: string;
  document_type: string;
  page_count: number;
  pages: ParsedPage[];
}

/**
 * MCP tool: get_contract_document
 *
 * Fetches the contract record from the CLM, downloads the file, and returns
 * a structured representation with pages and paragraphs that downstream
 * agents can use to produce page-level citations.
 */
export async function getContractDocument(
  contractId: string,
): Promise<ContractDocument> {
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('id, file_url, document_type')
    .eq('id', contractId)
    .single();

  if (error || !contract) {
    throw new Error(`Contract not found: ${contractId}`);
  }

  const parsed = await fetchAndParsePdf(contract.file_url);

  return {
    contract_id: contract.id,
    document_type: contract.document_type,
    page_count: parsed.pageCount,
    pages: parsed.pages,
  };
}

/**
 * MCP tool: list_contract_versions
 *
 * Returns all contract document versions for a given opportunity, newest first.
 */
export async function listContractVersions(opportunityId: string) {
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .select('id, contract_version, document_type, uploaded_at, uploaded_by')
    .eq('opportunity_id', opportunityId)
    .order('contract_version', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
