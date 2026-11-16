/**
 * Galileo Capability Framework — Context Model
 * Phase 13.4B.1
 *
 * Capabilities declare context requirements. The framework validates
 * that required context resources exist before execution proceeds.
 *
 * If required context is missing:
 *   - fallback 'block'  → execution returns blocked status
 *   - fallback 'warn'   → execution proceeds, missing context reported
 *   - fallback 'proceed_with_gap' → execution proceeds silently
 *
 * The framework NEVER fabricates context. If something is missing,
 * it returns a structured explanation of what is missing.
 */
import type {
  CapabilityMetadata,
  CapabilityExecutionContext,
  ContextRequirement,
  ContextValidationResult,
  ContextResource,
} from './types.ts';

/**
 * Extract available resources from the Galileo context object.
 * This reads the certified Galileo context (from buildGalileoContext)
 * and determines which resources are present.
 *
 * Platform-agnostic: the context object is treated as a generic record.
 * Each domain populates its own resources; the framework checks presence.
 */
function extractAvailableResources(
  context: unknown
): Set<ContextResource> {
  const available = new Set<ContextResource>();
  if (!context || typeof context !== 'object') return available;

  const ctx = context as Record<string, unknown>;

  // Valuation resources
  if (ctx.valuation) {
    const val = ctx.valuation as Record<string, unknown>;
    if (val.status === 'approved' || val.is_approved) available.add('approved_valuation');
    if (val.status === 'draft' || val.is_draft) available.add('draft_valuation');
    if (val.confidence) available.add('confidence');
    if (val.advisor_conclusion) available.add('advisor_conclusion');
    if (val.reconciliation) available.add('reconciliation');
    if (val.build_value) available.add('build_value');
    if (val.published_version) available.add('published_version');
  }

  // Business resources
  if (ctx.business) available.add('business_profile');
  if (ctx.financials) available.add('financials');
  if (ctx.adjustments) available.add('adjustments');
  if (ctx.assessments) available.add('assessments');
  if (ctx.documents) available.add('documents');
  if (ctx.readiness) available.add('readiness');

  // Growth resources
  if (ctx.growth_plan) available.add('growth_plan');
  if (ctx.initiatives) available.add('initiatives');
  if (ctx.roadmap) available.add('roadmap');
  if (ctx.sprint) available.add('sprint');

  // Deliverables
  if (ctx.deliverables) available.add('deliverables');

  // Verification
  if (ctx.verification_queue) available.add('verification_queue');

  // Expert profiles
  if (ctx.expert_profiles) available.add('expert_profiles');

  return available;
}

export function validateContext(
  capability: CapabilityMetadata,
  input: CapabilityExecutionContext
): ContextValidationResult {
  const available = extractAvailableResources(input.context);
  const missing: ContextRequirement[] = [];
  const warnings: ContextRequirement[] = [];

  for (const req of capability.requiredContext) {
    if (!req.required) continue;

    const isAvailable = available.has(req.resource);

    if (!isAvailable) {
      if (req.fallback === 'block') {
        missing.push(req);
      } else if (req.fallback === 'warn') {
        warnings.push(req);
      }
      // 'proceed_with_gap' → no action needed
    }
  }

  return {
    valid: missing.length === 0,
    shouldBlock: missing.length > 0,
    missing,
    warnings,
  };
}

export function getContextGaps(
  capability: CapabilityMetadata,
  input: CapabilityExecutionContext
): ContextRequirement[] {
  const result = validateContext(capability, input);
  return [...result.missing, ...result.warnings];
}

export function describeMissingContext(
  missing: ContextRequirement[]
): string {
  if (missing.length === 0) return '';
  return missing
    .map((m) => `${m.resource}: ${m.description}`)
    .join('; ');
}