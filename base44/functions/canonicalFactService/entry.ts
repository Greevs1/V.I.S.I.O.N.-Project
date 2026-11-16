/**
 * canonicalFactService — Phase 14.2A
 *
 * Read-only Canonical Fact Resolution API. Exposes the CBIL resolver through
 * the existing backend service pattern.
 *
 * Actions:
 *   getCanonicalFact       — Resolve a single canonical fact
 *   getCanonicalFacts      — Batch resolve multiple canonical facts
 *   getCanonicalFactHistory — Historical resolution across periods
 *   getCanonicalFactCandidates — Return all candidates without selecting
 *   shadowCompare          — Compare canonical vs current consumer values
 *   getPilotFacts          — List the 10 pilot fact keys
 *
 * NO WRITES. NO PROPAGATION. NO AUTOMATIC APPROVALS.
 * Resolution only. We must certify truth before automating consequences.
 *
 * Reuses:
 *   - valuationAuth.resolveAuthCtx, requireBusinessAccess
 *   - intelligenceMapping.FIELD_REGISTRY resolvers
 *   - canonicalFact.resolver.resolveFact, applyVisibilityScope
 *   - canonicalFact.contextLoader.loadIntelligenceContext
 *   - canonicalFact.registry.getFactDefinition, PILOT_FACT_KEYS
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  resolveAuthCtx,
  requireBusinessAccess,
  type AuthCtx,
} from '../../shared/valuationEngine/valuationAuth.ts';
import type { IntelligenceContext } from '../../shared/valuationEngine/intelligenceMapping.ts';
import {
  resolveFact,
  applyVisibilityScope,
  getPilotFactKeys,
  getAllFactKeys,
  PILOT_FACT_KEYS,
  getFactDefinition,
  FACT_REGISTRY,
} from '../../shared/canonicalFact/index.ts';
import { loadIntelligenceContext } from '../../shared/canonicalFact/contextLoader.ts';
import { loadCandidates, getAdvisorApprovedValue } from '../../shared/canonicalFact/resolverHelpers.ts';
import type {
  CanonicalFact,
  FactConflict,
  ResolveFactResult,
  ResolveFactsResult,
  VisibilityScope,
  ShadowDiscrepancy,
  DiscrepancyType,
} from '../../shared/canonicalFact/types.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const ctx = await resolveAuthCtx(base44);

    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    // ── getCanonicalFact ─────────────────────────────────────────────────────
    if (action === 'getCanonicalFact') {
      const { businessId, factKey, asOfDate, reportingPeriod, visibilityScope } = data;
      if (!businessId || !factKey) {
        return Response.json({ error: 'businessId and factKey required' }, { status: 400 });
      }

      // Validate business access
      const hasAccess = await requireBusinessAccess(ctx, businessId);
      if (!hasAccess) {
        return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });
      }

      // Only allow pilot facts in this phase
      if (!PILOT_FACT_KEYS.includes(factKey)) {
        return Response.json({
          error: 'Fact not in pilot set',
          pilot_facts: PILOT_FACT_KEYS,
        }, { status: 400 });
      }

      const intelCtx = await loadIntelligenceContext(ctx, businessId);
      const candidates = await loadCandidates(factKey, intelCtx);

      // Check for advisor-approved valuation answer (governance lock)
      const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);

      const scope = visibilityScope || resolveScope(ctx, businessId);
      const { fact, conflict } = resolveFact(factKey, candidates, {
        requestedPeriod: reportingPeriod,
        asOfDate,
        advisorApprovedValue: advisorApproved,
        visibilityScope: scope,
      });

      const filtered = applyVisibilityScope(fact, conflict, scope);

      const result: ResolveFactResult = {
        fact: filtered.fact ? { ...filtered.fact, business_id: businessId } : null,
        conflict: filtered.conflict,
      };

      return Response.json(result);
    }

    // ── getCanonicalFacts ────────────────────────────────────────────────────
    if (action === 'getCanonicalFacts') {
      const { businessId, factKeys, asOfDate, reportingPeriod, visibilityScope } = data;
      if (!businessId || !Array.isArray(factKeys)) {
        return Response.json({ error: 'businessId and factKeys[] required' }, { status: 400 });
      }

      const hasAccess = await requireBusinessAccess(ctx, businessId);
      if (!hasAccess) {
        return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });
      }

      // Filter to pilot facts only
      const allowedKeys = factKeys.filter((k: string) => PILOT_FACT_KEYS.includes(k));

      const intelCtx = await loadIntelligenceContext(ctx, businessId);
      const scope = visibilityScope || resolveScope(ctx, businessId);

      const facts: CanonicalFact[] = [];
      const conflicts: FactConflict[] = [];
      const missing: string[] = [];
      const errors: Record<string, string> = {};

      for (const factKey of allowedKeys) {
        try {
          const candidates = await loadCandidates(factKey, intelCtx);
          const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);
          const { fact, conflict } = resolveFact(factKey, candidates, {
            requestedPeriod: reportingPeriod,
            asOfDate,
            advisorApprovedValue: advisorApproved,
            visibilityScope: scope,
          });
          const filtered = applyVisibilityScope(fact, conflict, scope);

          if (filtered.fact) {
            facts.push({ ...filtered.fact, business_id: businessId });
          } else if (filtered.conflict) {
            conflicts.push(filtered.conflict);
          } else {
            missing.push(factKey);
          }
        } catch (err: any) {
          errors[factKey] = err.message;
        }
      }

      const result: ResolveFactsResult = { facts, conflicts, missing, errors };
      return Response.json(result);
    }

    // ── getCanonicalFactHistory ───────────────────────────────────────────────
    if (action === 'getCanonicalFactHistory') {
      const { businessId, factKey, periods } = data;
      if (!businessId || !factKey || !Array.isArray(periods)) {
        return Response.json({ error: 'businessId, factKey, periods[] required' }, { status: 400 });
      }

      const hasAccess = await requireBusinessAccess(ctx, businessId);
      if (!hasAccess) {
        return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });
      }

      if (!PILOT_FACT_KEYS.includes(factKey)) {
        return Response.json({ error: 'Fact not in pilot set' }, { status: 400 });
      }

      const intelCtx = await loadIntelligenceContext(ctx, businessId);
      const scope = resolveScope(ctx, businessId);

      const history: any[] = [];
      for (const periodLabel of periods) {
        const candidates = await loadCandidates(factKey, intelCtx);
        const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);
        const { fact, conflict } = resolveFact(factKey, candidates, {
          requestedPeriod: { type: 'fiscal_year', label: periodLabel },
          advisorApprovedValue: advisorApproved,
          visibilityScope: scope,
        });
        const filtered = applyVisibilityScope(fact, conflict, scope);
        history.push({
          period: periodLabel,
          fact: filtered.fact ? { ...filtered.fact, business_id: businessId } : null,
          conflict: filtered.conflict,
        });
      }

      return Response.json({ factKey, history });
    }

    // ── getCanonicalFactCandidates ───────────────────────────────────────────
    if (action === 'getCanonicalFactCandidates') {
      const { businessId, factKey } = data;
      if (!businessId || !factKey) {
        return Response.json({ error: 'businessId and factKey required' }, { status: 400 });
      }

      const hasAccess = await requireBusinessAccess(ctx, businessId);
      if (!hasAccess) {
        return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });
      }

      if (!PILOT_FACT_KEYS.includes(factKey)) {
        return Response.json({ error: 'Fact not in pilot set' }, { status: 400 });
      }

      const intelCtx = await loadIntelligenceContext(ctx, businessId);
      const candidates = await loadCandidates(factKey, intelCtx);

      // Return all candidates without selecting
      return Response.json({
        factKey,
        candidates: candidates.map((c) => ({
          source_name: c.source_name,
          source_type: c.source_type,
          source_id: c.source_id,
          value: c.value,
          confidence: c.confidence,
          reporting_period: c.reporting_period,
          source_date: c.source_date,
        })),
      });
    }

    // ── shadowCompare ────────────────────────────────────────────────────────
    if (action === 'shadowCompare') {
      const { businessId, factKeys, consumers } = data;
      if (!businessId || !Array.isArray(factKeys)) {
        return Response.json({ error: 'businessId and factKeys[] required' }, { status: 400 });
      }

      const hasAccess = await requireBusinessAccess(ctx, businessId);
      if (!hasAccess) {
        return Response.json({ error: 'BUSINESS_ACCESS_DENIED' }, { status: 403 });
      }

      const allowedKeys = factKeys.filter((k: string) => PILOT_FACT_KEYS.includes(k));
      const intelCtx = await loadIntelligenceContext(ctx, businessId);
      const scope: VisibilityScope = 'internal'; // Shadow compare always internal

      const discrepancies: ShadowDiscrepancy[] = [];

      for (const factKey of allowedKeys) {
        const candidates = await loadCandidates(factKey, intelCtx);
        const advisorApproved = getAdvisorApprovedValue(factKey, intelCtx);
        const { fact } = resolveFact(factKey, candidates, {
          advisorApprovedValue: advisorApproved,
          visibilityScope: scope,
        });

        const canonicalValue = fact?.value ?? null;

        // Compare against each consumer's current value
        const consumerValues = extractConsumerValues(factKey, intelCtx, consumers || ['dashboard', 'valuation', 'assessments', 'bis']);

        for (const { consumer, value: consumerValue } of consumerValues) {
          const discrepancyType = classifyDiscrepancy(canonicalValue, consumerValue, fact);
          discrepancies.push({
            fact_key: factKey,
            consumer,
            consumer_value: consumerValue,
            canonical_value: canonicalValue,
            discrepancy_type: discrepancyType,
            explanation: explainDiscrepancy(discrepancyType, canonicalValue, consumerValue),
          });
        }
      }

      return Response.json({ businessId, discrepancies });
    }

    // ── getPilotFacts ─────────────────────────────────────────────────────────
    if (action === 'getPilotFacts') {
      return Response.json({
        pilot_facts: PILOT_FACT_KEYS,
        pilot_fact_definitions: PILOT_FACT_KEYS.map((k) => {
          const def = getFactDefinition(k);
          return def ? {
            fact_key: def.fact_key,
            display_name: def.display_name,
            category: def.category,
            value_type: def.value_type,
            registered_consumers: def.registered_consumers,
          } : null;
        }).filter(Boolean),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Resolver helpers (loadCandidates, getAdvisorApprovedValue) are imported
// from base44/shared/canonicalFact/resolverHelpers.ts — extracted in Phase 14.2B
// to share between canonicalFactService and the consumerAdapter.

// ── Resolve visibility scope from auth context ──────────────────────────────
function resolveScope(ctx: AuthCtx, businessId: string): VisibilityScope {
  if (ctx.isSuperAdmin) return 'internal';
  if (ctx.profile.app_role === 'admin' || ctx.profile.app_role === 'advisor' || ctx.profile.app_role === 'expert_advisor') {
    return 'internal';
  }
  // Business owner gets client_safe
  if (ctx.profile.primary_business_id === businessId) return 'client_safe';
  return 'client_safe';
}

// ── Extract current consumer values for shadow comparison ──────────────────
function extractConsumerValues(
  factKey: string,
  intelCtx: IntelligenceContext,
  consumers: string[],
): { consumer: string; value: any }[] {
  const values: { consumer: string; value: any }[] = [];
  const dm = intelCtx.dashboardMetrics || {};
  const pf = intelCtx.profileFinancials || {};

  for (const consumer of consumers) {
    let value: any = null;

    if (consumer === 'dashboard') {
      value = getDashboardValue(factKey, dm);
    } else if (consumer === 'valuation') {
      value = getValuationValue(factKey, intelCtx);
    } else if (consumer === 'assessments') {
      value = getAssessmentValue(factKey, intelCtx);
    } else if (consumer === 'bis') {
      value = getBisValue(factKey, dm);
    } else if (consumer === 'profile_financials') {
      value = getProfileFinancialsValue(factKey, pf);
    }

    if (value !== null) {
      values.push({ consumer, value });
    }
  }

  return values;
}

function getDashboardValue(factKey: string, dm: any): any {
  const map: Record<string, string> = {
    revenue: 'annual_revenue',
    net_income: 'net_profit',
    reported_ebitda: 'current_ebitda',
    normalized_ebitda: 'recast_ebitda',
  };
  return dm[map[factKey]] ?? null;
}

function getValuationValue(factKey: string, intelCtx: IntelligenceContext): any {
  const fins = intelCtx.valuationFinancials || [];
  if (fins.length === 0) return null;
  const f = fins[0];
  const map: Record<string, string> = {
    revenue: 'revenue',
    owner_compensation: 'owner_compensation',
    reported_ebitda: 'ebitda',
  };
  return f[map[factKey]] ?? null;
}

function getAssessmentValue(factKey: string, intelCtx: IntelligenceContext): any {
  const assessments = intelCtx.businessAssessments || [];
  const map: Record<string, { type: string; keys: string[] }> = {
    revenue: { type: 'profit_gap', keys: ['p1_rev', 'revenue'] },
    net_income: { type: 'profit_gap', keys: ['net_profit'] },
    owner_compensation: { type: 'recast_ebitda', keys: ['owner_comp'] },
  };
  const config = map[factKey];
  if (!config) return null;
  const a = assessments.find((x: any) => x.assessment_type === config.type);
  if (!a) return null;
  const ans = a.answers || {};
  for (const k of config.keys) {
    if (ans[k] != null) return ans[k];
  }
  return null;
}

function getBisValue(factKey: string, dm: any): any {
  return getDashboardValue(factKey, dm);
}

function getProfileFinancialsValue(factKey: string, pf: any): any {
  const map: Record<string, string> = {
    revenue: 'annual_revenue',
    net_income: 'net_profit',
    agi: 'adjusted_gross_income',
  };
  return pf[map[factKey]] ?? null;
}

// ── Classify discrepancy between canonical and consumer value ───────────────
function classifyDiscrepancy(
  canonical: any,
  consumer: any,
  fact: CanonicalFact | null,
): DiscrepancyType {
  if (canonical == null && consumer == null) return 'match';
  if (canonical == null || consumer == null) return 'expected_difference';

  const numC = Number(canonical);
  const numCons = Number(consumer);

  if (isNaN(numC) || isNaN(numCons)) {
    return String(canonical) === String(consumer) ? 'match' : 'unknown';
  }

  if (numC === numCons) return 'match';

  const diff = Math.abs(numC - numCons);
  const base = Math.max(Math.abs(numC), Math.abs(numCons), 1);
  const pct = (diff / base) * 100;

  // Small differences (< 1%) are expected (rounding)
  if (pct < 1) return 'match';

  // If canonical is a conflict, consumer may have picked one side
  if (fact?.resolution_status === 'conflict') return 'conflict';

  // If the difference is large, could be a period difference or source authority difference
  if (pct > 20) return 'source_authority_difference';
  if (pct > 5) return 'period_difference';

  return 'expected_difference';
}

function explainDiscrepancy(type: DiscrepancyType, canonical: any, consumer: any): string {
  switch (type) {
    case 'match': return 'Canonical and consumer values agree';
    case 'expected_difference': return 'Minor difference (rounding or derivation)';
    case 'period_difference': return 'Values from different reporting periods';
    case 'source_authority_difference': return 'Consumer using a different source than canonical resolver';
    case 'conflict': return 'Canonical resolver detected a conflict';
    case 'current_consumer_bug': return 'Consumer value appears incorrect';
    case 'canonical_resolver_bug': return 'Canonical resolver value appears incorrect';
    default: return 'Unknown discrepancy';
  }
}