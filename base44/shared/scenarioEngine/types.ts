/**
 * scenarioEngine/types — the Scenario contract (Phase: What If).
 *
 * A SCENARIO is HYPOTHETICAL. It is never a business fact and must never be
 * written back over canonical business data. The canonical baseline it was
 * built from is carried alongside it (`baseline`) so every displayed number
 * can be traced to either a governed fact or a declared assumption.
 *
 * Nothing in this module reads or writes the database. It is a pure
 * value/type layer so both the engine and its callers agree on the shape.
 */

/** The four honest information classes. Every displayed value is exactly one. */
export type InformationClass = 'known' | 'assumed' | 'estimated' | 'missing';

/**
 * The earnings basis a scenario is modelled on.
 *
 * Metric semantics are NEVER mixed: a scenario is computed on ONE basis and
 * says which. `recast_ebitda` and `net_profit` are different measures and are
 * never substituted for one another.
 */
export type EarningsBasis = 'recast_ebitda' | 'reported_ebitda' | 'net_profit' | 'none';

/** Governed values read from the Business Intelligence Contract. */
export interface ScenarioBaseline {
  business_name: string | null;
  revenue: number | null;
  net_profit: number | null;
  reported_ebitda: number | null;
  recast_ebitda: number | null;
  current_value: number | null;
  potential_value: number | null;
  value_gap: number | null;
  annual_tax_gap: number | null;
  hours_freed_per_week: number | null;
  hourly_value_of_time_freed: number | null;
  freedom_score: number | null;
  business_iq: number | null;
  /** Which governed earnings figure this scenario is computed on. */
  earnings_basis: EarningsBasis;
  /** The value of that basis, or null when the business has not produced it. */
  earnings_value: number | null;
  /** ISO timestamp of the contract this baseline came from. */
  contract_generated_at: string | null;
}

/** One declared input a lever needs. */
export interface LeverInput {
  key: string;
  label: string;
  unit: string | null;
  /** Auto-applied when the owner does not supply a value. null = must ask. */
  default_value: number | null;
  /** Shown when the owner chooses "use a reasonable estimate". */
  estimate_value: number | null;
  estimate_basis: string | null;
  /** The single question asked when no value is supplied and no default exists. */
  question: string;
}

/**
 * How a disclosed value is sourced. Rendered as a visible classification, so
 * the owner is never left to infer whether a figure is verified.
 */
export type DisclosureSource =
  | 'business_data'
  | 'owner_reported'
  /** Declared by Vision, not read from the business: defaults and cost ratios. */
  | 'declared_assumption'
  | 'modelled';

/** A declared assumption the model applied, with its basis. */
export interface DeclaredAssumption {
  key: string;
  label: string;
  value: string;
  basis: string;
  /** true when the figure came from the business's own governed data. */
  from_business_data: boolean;
  /** Machine-readable source class, so the UI never has to infer it. */
  source_class?: DisclosureSource;
}

/** One NOW → WHAT IF row. */
export interface ComparisonRow {
  metric: string;
  now: string | null;
  what_if: string | null;
  /** How the "what if" figure was derived. Never empty for a modelled row. */
  derivation: string;
}

export interface ScenarioLever {
  key: string;
  title: string;
  /** Plain question the lever answers, used for the chip and the header. */
  prompt: string;
  inputs: LeverInput[];
  /** Governed baseline fields this lever cannot run without. */
  requires: (keyof ScenarioBaseline)[];
}

export interface ComputedScenario {
  status: 'computed';
  scenario_key: string;
  scenario_title: string;
  /** The owner's original question, preserved verbatim. */
  question: string | null;

  earnings_basis: EarningsBasis;
  earnings_basis_label: string;

  /** Governed inputs this model actually used. */
  known: Array<{ label: string; value: string; source: string }>;
  /** Assumptions the model applied, each with its basis. */
  assumed: DeclaredAssumption[];
  /** Modelled outputs. Always labelled estimated. */
  estimated: Array<{ label: string; value: string; note: string }>;
  /** What could not be modelled, and why. */
  missing: Array<{ label: string; why: string }>;

  comparison: ComparisonRow[];
  /** The modelled change in the governed earnings figure. */
  earnings_delta: number | null;

  /** Valuation bridge — only present when real inputs support it. */
  value_model: {
    available: boolean;
    multiple: number | null;
    basis: string | null;
    value_delta: number | null;
    reason: string | null;
  };

  confidence: 'high' | 'medium' | 'low';
  /** Why the confidence is what it is — never a bare number. */
  confidence_reason: string;
  warnings: string[];
}

/**
 * Present ONLY when the missing figure is a governed BASELINE input rather than
 * a lever parameter. Its presence tells the caller two things: send the answer
 * back as a scenario-local baseline input rather than a lever input, and show
 * the recovery paths and the classification the value will receive.
 */
export interface NeedsInputRecovery {
  is_baseline_field: true;
  field: string;
  /** Plain statement of what Vision does not have. */
  reason: string;
  /** How a supplied value is labelled where the owner can see it. */
  classification_label: string;
  classification_note: string;
  /** An existing Vision capability that can supply the figure instead. */
  source: { label: string; detail: string; path: string } | null;
}

export interface NeedsInput {
  status: 'needs_input';
  scenario_key: string;
  scenario_title: string;
  question: string | null;
  /** Exactly ONE highest-value question, per the What If philosophy. */
  input: {
    key: string;
    label: string;
    unit: string | null;
    question: string;
    estimate_value: number | null;
    estimate_basis: string | null;
  };
  /** Set only for a recoverable missing baseline input. */
  recovery?: NeedsInputRecovery;
}

export interface UnsupportedScenario {
  status: 'unsupported';
  scenario_key: string;
  scenario_title: string;
  question: string | null;
  reason: string;
  /** What would make it modellable. */
  would_require: string[];
}

export type ScenarioResult = ComputedScenario | NeedsInput | UnsupportedScenario;