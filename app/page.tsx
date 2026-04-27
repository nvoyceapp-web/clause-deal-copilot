'use client';

import { useState } from 'react';

const GLOBEX_CONTRACT_ID = '33333333-3333-3333-3333-333333333333';

interface ExtractedTerm {
  term_key: string;
  term_value: unknown;
  citation_page: number | null;
  citation_paragraph: number | null;
  citation_text: string | null;
  extraction_confidence: number;
  reasoning: string;
}

interface ParseResult {
  contract_id: string;
  extracted_terms: ExtractedTerm[];
  latency_ms: number;
  tokens: { input: number; output: number };
  model: string;
}

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runParse = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/parse-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: GLOBEX_CONTRACT_ID }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? 'Parse failed');
      }
      setResult(data as ParseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            Clause
          </h1>
          <p className="text-slate-600">
            AI deal desk copilot for non-standard enterprise contracts.
          </p>
        </header>

        <section className="bg-white rounded-lg border border-slate-200 p-6 mb-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">
                Globex Industries · API Enterprise + ChatGPT Enterprise
              </h2>
              <p className="text-sm text-slate-500">
                $4.2M ACV · 24-month term · Customer paper · Owner: Marcus Feld
              </p>
            </div>
            <button
              onClick={runParse}
              disabled={loading}
              className="px-4 py-2 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Parsing…' : 'Run Contract Parse Agent'}
            </button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-6 text-red-900">
            <strong className="font-medium">Error:</strong> {error}
          </div>
        )}

        {result && (
          <section className="bg-white rounded-lg border border-slate-200 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Extracted Terms ({result.extracted_terms.length})
              </h2>
              <div className="text-xs text-slate-500 font-mono">
                {result.model} · {result.latency_ms}ms ·{' '}
                {result.tokens.input.toLocaleString()} in /{' '}
                {result.tokens.output.toLocaleString()} out
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {result.extracted_terms.map((term, i) => (
                <TermRow key={i} term={term} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function TermRow({ term }: { term: ExtractedTerm }) {
  const present = term.term_value !== null;
  return (
    <div className="px-6 py-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h3 className="font-medium text-slate-900 font-mono text-sm">
            {term.term_key}
          </h3>
          {!present && (
            <span className="text-xs text-slate-400 italic">
              not present in contract
            </span>
          )}
        </div>
        <ConfidenceBadge confidence={term.extraction_confidence} />
      </div>

      {present && (
        <pre className="bg-slate-50 rounded p-3 text-xs text-slate-800 overflow-x-auto font-mono mt-2">
          {JSON.stringify(term.term_value, null, 2)}
        </pre>
      )}

      {term.citation_text && (
        <div className="mt-3 text-xs text-slate-600">
          <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded font-mono mr-2">
            p.{term.citation_page} ¶{term.citation_paragraph}
          </span>
          <span className="italic">"{term.citation_text}"</span>
        </div>
      )}

      {term.reasoning && (
        <p className="mt-2 text-xs text-slate-500">{term.reasoning}</p>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.9
      ? 'bg-emerald-100 text-emerald-800'
      : confidence >= 0.7
      ? 'bg-amber-100 text-amber-800'
      : 'bg-red-100 text-red-800';
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${color}`}
    >
      {pct}% confident
    </span>
  );
}
