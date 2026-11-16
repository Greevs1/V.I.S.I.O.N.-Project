/**
 * whatIfEngine — the What If capability.
 *
 * WHAT THIS FUNCTION IS
 * It answers "what would this mean for MY business?" by modelling a declared
 * change against the business's own governed figures.
 *
 * WHAT IT DELIBERATELY IS NOT
 *  - Not a calculator with generic benchmarks dressed up as personal answers.
 *  - Not a second scenario system: the ONLY baseline it reads is the certified
 *    Business Intelligence Contract, and the valuation relationship it applies
 *    is the same earnings × multiple relationship the certified valuation
 *    engine uses.
 *  - Not a writer. A scenario is HYPOTHETICAL: nothing here is ever persisted
 *    over a canonical business fact. The function is read-only.
 *
 * AUTHORITY
 * Business scope is resolved through the canonical Phase 6.9 contract, which
 * REFUSES an ambiguous request rather than substituting primary_business_id.
 * No guard is weakened and no fallback is introduced.
 *
 * THE SPLIT OF RESPONSIBILITY
 * The ARITHMETIC is deterministic and lives in shared/scenarioEngine (pure,
 * testable, no LLM). The LLM writes ONE field — the interpretation — and is
 * forbidden from producing any figure that is not already in the model output.
 * If the LLM is unavailable the interpretation is composed deterministically,
 * so a scenario result never depends on a model call succeeding.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  resolveActorBusinessContext,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';
import { buildBusinessIntelligenceContract } from '../../shared/intelligenceContract/businessIntelligenceContract.ts';
import { buildBaseline, computeScenario } from '../../shared/scenarioEngine/compute.ts';
import { listLevers, approxMoney } from '../../shared/scenarioEngine/catalog.ts';
import { getRecoverableBaseline } from '../../shared/scenarioEngine/recovery.ts';

/**
 * Map a free-text what-if question onto a supported lever.
 *
 * The catalog is the single source of truth for what Vision can model, so an
 * unrecognised question resolves to nothing and is answered honestly rather
 * than being forced onto the nearest lever.
 */
function resolveScenarioKey(question: string): string | null {
  const q = (question || '').toLowerCase();
  if (/\bmanager\b|\bgm\b|general manager|operations manager/.test(q)) return 'hire_manager';
  if (/salesperson|sales person|sales rep|sales hire|rep\b/.test(q)) return 'hire_salesperson';
  if (/price|pricing|charge more|raise.*price/.test(q)) return 'raise_prices';
  if (/margin|cost control|efficien/.test(q)) return 'improve_margins';
  if (/revenue|turnover|sales growth|top line/.test(q)) return 'add_revenue';
  if (/involvement|step back|step away|hand over|less involved|delegate|owner depend/.test(q)) {
    return 'reduce_owner_involvement';
  }
  return null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { question, scenario_key, inputs, baseline_inputs, probe_baseline, list_only } = body || {};

    // Every supported scenario comes from the catalog — never a hardcoded list
    // here — so the UI and the engine can never disagree about what is offered.
    const supported_scenarios = listLevers().map((l) => ({
      key: l.key,
      title: l.title,
      prompt: l.prompt,
      asks: l.inputs.map((i) => ({ key: i.key, label: i.label, unit: i.unit, question: i.question })),
    }));

    if (list_only) {
      return Response.json({ supported_scenarios });
    }

    // ── Canonical business scope (Phase 6.9 — refuses ambiguity) ─────────────
    let businessId: string | null = null;
    let profileId: string | null = null;
    try {
      const resolved = await resolveActorBusinessContext(sb, user, body, { action: 'whatIfEngine' });
      businessId = resolved.businessId;
      profileId = resolved.profileId;
    } catch (bizErr) {
      return businessContextError(bizErr);
    }
    if (!businessId) return Response.json({ error: 'business_id required' }, { status: 400 });

    // ── Baseline probe ───────────────────────────────────────────────────────
    // Used when the owner leaves to supply a missing figure through an existing
    // Vision capability (financial statements in the Data Room) and comes back.
    // It reads the SAME certified contract a scenario reads, so it can only
    // ever report a governed figure — never a scenario-local one.
    if (probe_baseline) {
      const fields = Array.isArray(probe_baseline)
        ? probe_baseline.filter((f: any) => getRecoverableBaseline(String(f)))
        : [];
      if (fields.length === 0) return Response.json({ baseline_probe: {} });

      const probeContract = await buildBusinessIntelligenceContract(sb, businessId, profileId);
      const probeBaseline = buildBaseline(probeContract);

      const baseline_probe: Record<string, any> = {};
      for (const field of fields) {
        const spec = getRecoverableBaseline(String(field));
        const raw = (probeBaseline as any)[String(field)];
        baseline_probe[String(field)] = {
          label: spec?.label || String(field),
          available: raw != null,
          formatted: raw == null ? null : approxMoney(raw),
        };
      }
      return Response.json({ baseline_probe });
    }

    const key = scenario_key || resolveScenarioKey(question || '');
    if (!key) {
      return Response.json({
        error: 'unsupported_scenario',
        message:
          'Vision models a specific set of decisions. It will not model one it cannot ground in your business data.',
        supported_scenarios,
      }, { status: 422 });
    }

    // ── Governed baseline — the certified contract is the ONLY source ───────
    const contract = await buildBusinessIntelligenceContract(sb, businessId, profileId);
    const baseline = buildBaseline(contract);

    // baseline_inputs are OWNER REPORTED, scenario-local, and applied only where
    // the contract holds nothing. Nothing here is written back to business data.
    const result = computeScenario(
      key,
      inputs || {},
      baseline,
      question || null,
      baseline_inputs || {},
    );

    if (result.status !== 'computed') {
      return Response.json({ scenario: result, supported_scenarios });
    }

    // ── Interpretation — the ONLY LLM responsibility ────────────────────────
    const read = await buildRead(result, question || '', OPENROUTER_KEY, sb, profileId, businessId);

    return Response.json({
      scenario: { ...result, galileo_read: read },
      supported_scenarios,
      business_name: baseline.business_name,
      context_quality: {
        business_iq: baseline.business_iq,
        earnings_basis: baseline.earnings_basis,
        contract_generated_at: baseline.contract_generated_at,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Galileo's read ───────────────────────────────────────────────────────────
/**
 * The read interprets the modelled numbers. It is given the model output as
 * the ONLY permitted source of figures and is explicitly forbidden from
 * computing anything. A deterministic read is returned if the model is
 * unavailable, so the scenario is never blocked on an LLM call.
 */
async function buildRead(
  scenario: any,
  question: string,
  openRouterKey: string | null | undefined,
  sb: any,
  profileId: string | null,
  businessId: string,
): Promise<{ text: string; source: 'ai' | 'deterministic'; }> {
  const deterministic = deterministicRead(scenario);

  if (!openRouterKey) return { text: deterministic, source: 'deterministic' };

  const modelOutput = {
    scenario: scenario.scenario_title,
    earnings_basis: scenario.earnings_basis_label,
    known: scenario.known,
    assumed: scenario.assumed,
    estimated: scenario.estimated,
    missing: scenario.missing,
    comparison: scenario.comparison,
    earnings_delta: scenario.earnings_delta,
    value_model: scenario.value_model,
    confidence: scenario.confidence,
    confidence_reason: scenario.confidence_reason,
    warnings: scenario.warnings,
  };

  const systemPrompt = `You are Galileo, the intelligence inside the V.I.S.I.O.N. Platform™.

You are interpreting a MODELLED scenario for a business owner.

ABSOLUTE RULES:
1. The MODEL OUTPUT below is your ONLY source of figures. Every number you use must appear in it.
2. You must NOT perform any arithmetic. Do not add, subtract, multiply, or derive a new figure.
3. You must NOT invent a benchmark, a salary, a multiple, a growth rate, or an industry average.
4. Scenario figures are MODELLED, not facts. Never present them as actual or verified.
5. Distinguish plainly between what is known from the owner's data, what was assumed, and what could not be modelled.
6. If the model could not establish a value effect, say so — do not imply one.
7. Never say "guaranteed", "will", or "proven". Use "would", "could", "if this holds".
8. Never use an em-dash. Use a comma, a period, or rewrite the sentence.
9. Write 3 to 5 short sentences of plain prose. No headings, no bullet points, no markdown.

WHAT A GOOD READ DOES
It answers the owner's real question: when would this decision make sense for THIS business?
Name the condition under which it becomes attractive, and name the assumption that condition rests on.

Return JSON: { "read": "your interpretation" }`;

  const userPrompt = `OWNER'S QUESTION: "${question}"

MODEL OUTPUT (your only source of figures):
${JSON.stringify(modelOutput, null, 2)}

Interpret this for the owner.`;

  try {
    const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });
    const data = await llmRes.json();
    const rawResp = data?.choices?.[0]?.message?.content;
    if (rawResp) {
      const parsed = JSON.parse(rawResp);
      const text = typeof parsed?.read === 'string' ? parsed.read.trim() : '';
      if (text) return { text, source: 'ai' };
    }
  } catch (err: any) {
    console.warn('[whatIfEngine] interpretation unavailable, using deterministic read:', err?.message || err);
  }

  return { text: deterministic, source: 'deterministic' };
}

/**
 * The deterministic read — composed only from the model output. Used when the
 * LLM is unavailable, and it is what keeps the capability working regardless.
 */
function deterministicRead(scenario: any): string {
  const basis = scenario.earnings_basis_label;
  const delta = scenario.earnings_delta;
  const parts: string[] = [];

  const condition =
    delta != null
      ? (delta >= 0 ? 'adds' : 'reduces') +
        ' ' + approxMoney(Math.abs(delta)) + ' a year to your ' + basis.toLowerCase()
      : 'changes your ' + basis.toLowerCase();

  parts.push('Modelled against your own figures, this ' + condition + '.');

  if (scenario.value_model?.available && scenario.value_model?.value_delta != null) {
    parts.push(
      'At the multiple implied by your current value and ' + basis.toLowerCase() +
      ', that is roughly ' + approxMoney(scenario.value_model.value_delta) + ' of business value.'
    );
  } else if (scenario.value_model?.reason) {
    parts.push('Vision did not model a business value effect: ' + scenario.value_model.reason);
  }

  if (scenario.assumed?.length > 0) {
    parts.push(
      'This rests on ' + scenario.assumed.length + ' declared ' +
      (scenario.assumed.length === 1 ? 'assumption' : 'assumptions') +
      ', so treat it as a direction rather than a number.'
    );
  } else {
    parts.push('Every figure here came from your own business data.');
  }

  if (scenario.missing?.length > 0) {
    parts.push('Still unknown: ' + scenario.missing.map((m: any) => m.label).join(', ') + '.');
  }

  return parts.join(' ');
}