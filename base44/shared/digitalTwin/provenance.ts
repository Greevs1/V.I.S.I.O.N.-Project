/**
 * digitalTwin/provenance.ts — Phase 6D.1A — GATE 2: EVIDENCE ORIGIN.
 *
 * A durable classification of WHERE a value came from, independent of what any
 * person did with it afterwards.
 *
 *     REAL_SOURCE  extracted from a real document by a real reader
 *     SYNTHETIC    produced by the engine's mock fixture path
 *     TEST         a test artefact (a fixture the platform generated to exercise itself)
 *     DEMO         demonstration material
 *     UNKNOWN      origin not recorded — which is NOT the same as real
 *
 * ── THE RULE THIS MODULE EXISTS TO ENFORCE ───────────────────────────────────
 *
 *   SYNTHETIC / TEST / DEMO evidence is NEVER eligible for production Digital
 *   Twin promotion. Not after a human accepts it. Not after a human corrects it.
 *   Not at high confidence. Not after expert review. Human acceptance is a
 *   statement about the VALUE; it says nothing about the SOURCE.
 *
 *   The converse is also enforced: REAL_SOURCE is never inferred merely because
 *   review_status = 'accepted', because a person looked at it, because a document
 *   row exists, or because confidence is high.
 *
 * ── PRECEDENCE (deterministic, in order) ─────────────────────────────────────
 *
 *   1. A DECLARED origin — `metadata.evidence_origin` on the observation, or
 *      `evidence_origin` on the analysis. This is the durable mechanism: it is
 *      written once, by us, and it outranks every inferred signal.
 *   2. The recorded extraction METHOD. `mock_extraction` is synthetic by
 *      definition (the engine sets it only on its fixture path). A real provider
 *      method is a real source.
 *   3. A NAME/FILE signal, used ONLY when no method was recorded. A document named
 *      "…test…" with no recorded method is a test artefact, not real evidence. A
 *      document named "…test…" that WAS read by a real provider is still real
 *      — the filename is not a stronger fact than the reader that ran.
 *   4. Otherwise UNKNOWN. Never REAL_SOURCE by default.
 *
 * PURE MODULE — imports nothing, so the harness can bundle it alone and mutate it.
 */

export const PROVENANCE_VERSION = '6d.1a.1';

export const ORIGIN_SIGNALS = {
  DECLARED_OBSERVATION: 'declared:observation',
  DECLARED_ANALYSIS: 'declared:analysis',
  METHOD_MOCK: 'method:mock_extraction',
  METHOD_REAL: 'method:real_provider',
  NAME_TEST: 'name:test_pattern',
  NAME_DEMO: 'name:demo_pattern',
  NOTHING_RECORDED: 'nothing_recorded',
} as const;

/** The engine's fixture method. Set ONLY by `extractEngine` when `useMock: true`. */
export const SYNTHETIC_METHOD = 'mock_extraction';

/**
 * Methods that mean a real reader read a real document. An unrecognised method is
 * NOT treated as real — it falls through to the name signal and then to UNKNOWN.
 */
export const REAL_METHODS = [
  'ai_extraction',
  'provider_extraction',
  'vision_extraction',
  'ocr_extraction',
  'document_ai',
  'manual_entry',
];

const TEST_PATTERN = /(^|[^a-z])(test|tests|sample|spec|mock|fixture|dummy|lorem|placeholder|sandbox)([^a-z]|$)/i;
const DEMO_PATTERN = /(^|[^a-z])(demo|demonstration|example|tutorial|walkthrough)([^a-z]|$)/i;

const DECLARED_ORIGINS = ['REAL_SOURCE', 'SYNTHETIC', 'TEST', 'DEMO', 'UNKNOWN'];

/** The text a name signal is read from: file name, display name, or storage path. */
function nameText(doc: any, observation: any): string {
  const parts = [
    doc?.name,
    doc?.file_name,
    doc?.storage_path,
    doc?.file_path,
    observation?.source_document,
  ];
  return parts.filter((p) => typeof p === 'string' && p).join(' ');
}

function methodOf(observation: any, analysis: any): string | null {
  const m =
    observation?.metadata?.extraction_method ??
    analysis?.extraction_method ??
    analysis?.extracted_data?.extraction_method ??
    null;
  return m == null ? null : String(m);
}

export interface EvidenceOriginVerdict {
  origin: string;
  signals: string[];
  /** True only for REAL_SOURCE. The one boolean a promotion gate needs. */
  promotion_eligible: boolean;
}

/**
 * classifyEvidenceOrigin — the ONE origin decision. It takes the observation, its
 * document and its analysis because origin is a property of the SOURCE, and the
 * source is the document, not the value.
 */
export function classifyEvidenceOrigin(input: {
  observation?: any;
  document?: any;
  analysis?: any;
}): EvidenceOriginVerdict {
  const observation = input?.observation ?? null;
  const document = input?.document ?? null;
  const analysis = input?.analysis ?? null;
  const signals: string[] = [];

  // 1. A DECLARED origin wins outright.
  const declaredObs = observation?.metadata?.evidence_origin ?? null;
  const declaredAnalysis = analysis?.evidence_origin ?? analysis?.extracted_data?.evidence_origin ?? null;
  const declared = declaredObs ?? declaredAnalysis ?? null;
  if (declared != null) {
    const value = String(declared).toUpperCase();
    if (DECLARED_ORIGINS.includes(value)) {
      signals.push(declaredObs != null ? ORIGIN_SIGNALS.DECLARED_OBSERVATION : ORIGIN_SIGNALS.DECLARED_ANALYSIS);
      return {
        origin: value,
        signals,
        promotion_eligible: value === 'REAL_SOURCE',
      };
    }
    // An unrecognised declared value is NOT quietly upgraded: it is unknown.
    signals.push(ORIGIN_SIGNALS.NOTHING_RECORDED);
    return { origin: 'UNKNOWN', signals, promotion_eligible: false };
  }

  // 2. The recorded extraction method.
  const method = methodOf(observation, analysis);
  if (method === SYNTHETIC_METHOD) {
    signals.push(ORIGIN_SIGNALS.METHOD_MOCK);
    return { origin: 'SYNTHETIC', signals, promotion_eligible: false };
  }
  if (method && REAL_METHODS.includes(String(method).toLowerCase())) {
    signals.push(ORIGIN_SIGNALS.METHOD_REAL);
    return { origin: 'REAL_SOURCE', signals, promotion_eligible: true };
  }

  // 3. A name signal — used only where no method was recorded.
  const text = nameText(document, observation);
  if (TEST_PATTERN.test(text)) {
    signals.push(ORIGIN_SIGNALS.NAME_TEST);
    return { origin: 'TEST', signals, promotion_eligible: false };
  }
  if (DEMO_PATTERN.test(text)) {
    signals.push(ORIGIN_SIGNALS.NAME_DEMO);
    return { origin: 'DEMO', signals, promotion_eligible: false };
  }

  // 4. Nothing recorded. UNKNOWN is the honest answer; it is NOT real by default.
  signals.push(ORIGIN_SIGNALS.NOTHING_RECORDED);
  return { origin: 'UNKNOWN', signals, promotion_eligible: false };
}

/** Convenience for a caller that already holds the three rows. */
export function isRealSource(input: { observation?: any; document?: any; analysis?: any }): boolean {
  return classifyEvidenceOrigin(input).promotion_eligible;
}