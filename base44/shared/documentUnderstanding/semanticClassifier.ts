/**
 * VISION 6D.0b — THE CONTENT SEMANTIC CLASSIFIER (Phase 6).
 *
 * The ONE provider-mediated content read used to CLASSIFY a document whose bytes
 * no deterministic reader can decode (PDF, scan, image, spreadsheet). It is
 * deliberately narrow:
 *
 *   · schema-constrained output — approved enums only, no free-form types,
 *     no invented reader keys, folders or business ids;
 *   · low output — identity and structure, never extracted financial values
 *     (extraction stays the extraction engine's job);
 *   · non-conversational — one question, one JSON answer;
 *   · no new dependency — the platform's existing AI integration, called with
 *     the platform's own default model selection (`automatic`), never a
 *     hardcoded model name (Decision 2);
 *   · no authorization — it receives ONLY the authorized candidate businesses
 *     the server chose to supply, and its answer can never grant access
 *     (Phase 6 / Decision 3).
 *
 * It returns the provider's raw structured answer. It does NOT decide the
 * confidence band: the understanding service computes confidence from the
 * evidence the provider reports, never from a self-reported percentage.
 */

/**
 * The provider schema. Built from the taxonomy the CALLER passes in, so the
 * classifier can never drift from the canonical vocabulary. When the actor has
 * no authorized candidate business, the business property is omitted entirely —
 * an inaccessible business is never even named to the model.
 */
export function buildProviderSchema(ctx: {
  types: string[];
  subtypes: string[];
  families: string[];
  candidateBusinesses: { id: string; name?: string }[];
}): Record<string, any> {
  const properties: Record<string, any> = {
    document_type: {
      type: 'string',
      enum: ctx.types,
      description: 'The single best-matching document type. Use "other" only when nothing above fits.',
    },
    document_subtype: {
      type: 'string',
      enum: ['none'].concat(ctx.subtypes),
      description: 'The exact government form if one is present, otherwise "none".',
    },
    document_family: { type: 'string', enum: ctx.families },
    form_number: {
      type: 'string',
      description: 'The government form number printed on the document (e.g. "1040", "1120-S"), or "" if none.',
    },
    form_title: {
      type: 'string',
      description: 'The official form title printed on the document (e.g. "U.S. Individual Income Tax Return"), or "" if none.',
    },
    statement_heading: {
      type: 'string',
      description: 'The statement heading printed on the document (e.g. "Profit and Loss", "Balance Sheet"), or "" if none.',
    },
    structural_markers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 10 line-item labels actually printed on the document that identify its structure.',
    },
    tax_year: { type: 'string', description: 'The tax/fiscal year the document states, or "" if none is stated.' },
    reporting_period: { type: 'string', description: 'The period the document covers, exactly as stated, or "".' },
    accounting_basis: { type: 'string', enum: ['cash', 'accrual', 'modified_accrual', 'tax_basis', 'none'] },
    semantic_scope: {
      type: 'string',
      enum: ['personal', 'business', 'ambiguous'],
      description: 'Whose document this is: an individual/household document, a business/entity document, or unclear.',
    },
    // PII MINIMIZATION (6D.0c §11). The classifier is NOT asked for an EIN/TIN/
    // SSN-shaped identifier — determining that a document is a Form 1040 does not
    // require the taxpayer's identifying number, so it is never collected. This is
    // minimization at the source, not redaction after collection.
    entity_name: { type: 'string', description: 'The taxpayer/entity name printed on the document, or "".' },
    content_confidence: {
      type: 'number',
      description: '0-100. How clear the printed evidence is. A judgement about legibility, not a classification decision.',
    },
  };

  if (ctx.candidateBusinesses.length > 0) {
    properties.suggested_business_id = {
      type: 'string',
      enum: ['none'].concat(ctx.candidateBusinesses.map((b) => b.id)),
      description:
        'ONLY if the document itself names one of these businesses. Otherwise "none". Never guess an id that is not in this list.',
    };
  }

  return { type: 'object', properties };
}

export function buildClassificationPrompt(ctx: {
  fileName: string;
  mimeType: string | null;
  declaredType: string | null;
  candidateBusinesses: { id: string; name?: string }[];
  isUncertain: boolean;
}): string {
  const businessLines = ctx.candidateBusinesses.length
    ? ctx.candidateBusinesses.map((b) => `  - ${b.id}${b.name ? ` (${b.name})` : ''}`).join('\n')
    : '  (none supplied — report "none")';

  return [
    'You are a precise document identification component inside a financial operating system.',
    'Identify what THIS document is from its own printed content. Read the file. Do not guess from the file name.',
    '',
    'Report only what is printed on the document:',
    '  · the government form number and its official title if a form is present;',
    '  · the statement heading and structural line-item labels if it is a financial statement;',
    '  · the tax year or reporting period the document itself states;',
    '  · whether it is an individual/household document, a business/entity document, or unclear.',
    '',
    'Rules:',
    '  · Use ONLY values allowed by the response schema.',
    '  · Never invent a form number, an entity name, or a business id.',
    '  · An unrecognized document is "other" with an empty form number — never a guess.',
    '  · A financial statement is NOT a tax return, and a tax return is NOT a financial statement.',
    '  · Do not extract financial amounts. Identification only.',
    '',
    `File name (weak hint only, never authoritative): ${ctx.fileName}`,
    `MIME type: ${ctx.mimeType || 'unknown'}`,
    ctx.declaredType && !ctx.isUncertain
      ? `The uploader stated this type: ${ctx.declaredType} (already applied — treat as context, still report the truth).`
      : 'The uploader did not state a trustworthy type. Classification must come from the content.',
    '',
    'Businesses the requester is authorized to associate this with:',
    businessLines,
    '',
    'Answer with the JSON object only.',
  ].join('\n');
}

/**
 * classifyWithProvider — ONE schema-constrained call against the document's
 * own bytes, through the platform's existing AI integration.
 *
 * `base44` is the platform client (service role). `signedUrl` is the authorized,
 * short-lived read URL the caller already holds. Failure is returned, never
 * thrown: a provider failure must not become an upload failure (D42).
 */
/**
 * THE PROVIDER READ IS BOUNDED. A real production upload proved why: the
 * provider call was the last thing the handler executed, nothing after it was
 * ever persisted, and the platform terminates a request at its execution limit —
 * so the document sat in `other`/queued forever. A content read that cannot
 * finish inside the caller's budget must FAIL HONESTLY (a decision the pipeline
 * persists) instead of consuming the whole request. The budget is generous for a
 * read that is working, and absolute for one that is not.
 */
export const PROVIDER_READ_BUDGET_MS = 90_000;

function withBudget<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export async function classifyWithProvider(args: {
  base44: any;
  signedUrl: string;
  fileName: string;
  mimeType: string | null;
  declaredType: string | null;
  types: string[];
  subtypes: string[];
  families: string[];
  candidateBusinesses: { id: string; name?: string }[];
}): Promise<{ ok: boolean; raw: any | null; error: string | null }> {
  const isUncertain = !args.declaredType || ['other', 'unknown', ''].includes(String(args.declaredType).trim());
  const schema = buildProviderSchema({
    types: args.types,
    subtypes: args.subtypes,
    families: args.families,
    candidateBusinesses: args.candidateBusinesses,
  });
  const prompt = buildClassificationPrompt({
    fileName: args.fileName,
    mimeType: args.mimeType,
    declaredType: args.declaredType,
    candidateBusinesses: args.candidateBusinesses,
    isUncertain,
  });

  try {
    const client = args.base44?.asServiceRole?.integrations?.Core;
    if (!client || typeof client.InvokeLLM !== 'function') {
      return { ok: false, raw: null, error: 'ai_integration_unavailable' };
    }
    const raw = await withBudget(
      client.InvokeLLM({
        prompt,
        file_urls: [args.signedUrl],
        response_json_schema: schema,
        // No model name: the platform's own default model selection is used
        // (Decision 2 — never hardcode a model unless the architecture requires).
      }),
      PROVIDER_READ_BUDGET_MS,
      'classification_read_timeout',
    );
    if (!raw || typeof raw !== 'object') {
      return { ok: false, raw: null, error: 'empty_classification_response' };
    }
    return { ok: true, raw, error: null };
  } catch (err: any) {
    return { ok: false, raw: null, error: String(err?.message || err || 'classification_call_failed') };
  }
}