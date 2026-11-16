/**
 * useWhatIf — the possibility engine client.
 *
 * Talks to the single canonical What If capability. The SUPPORTED SCENARIOS
 * come from the backend catalog, never from a list duplicated here, so the UI
 * and the engine can never disagree about what Vision is able to model.
 *
 * The business is read at CALL TIME and a response from a business we have
 * left is DISCARDED, which is what stops Business A's scenario appearing under
 * Business B on a rapid switch.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useBusinessContext } from '@/lib/BusinessContext';

const GENERIC_ERROR = "Galileo couldn't model that scenario.";

function readFriendlyError(err) {
  const code = err?.response?.data?.code || err?.code;
  const status = err?.response?.status;

  if (code === 'BUSINESS_CONTEXT_REQUIRED') {
    return 'Galileo needs to know which business this is about. Choose a business, then try again.';
  }
  if (code === 'BUSINESS_CONTEXT_DENIED' || status === 403) {
    return "Galileo couldn't verify your access to this business.";
  }
  if (status === 422) {
    // The engine declined to model it — its own explanation is the right copy.
    return err?.response?.data?.message || 'Vision cannot model that one yet.';
  }
  if (status === 401) {
    return 'Your session has ended. Sign in again to keep exploring.';
  }
  return GENERIC_ERROR;
}

export function useWhatIf() {
  const { context } = useBusinessContext();
  const activeBusinessId = context?.active_business_id || null;

  const [supportedScenarios, setSupportedScenarios] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // The question the owner actually asked, kept so an action can carry it on.
  const [question, setQuestion] = useState(null);
  // Inputs already supplied, so answering the follow-up question resumes the
  // same scenario rather than starting over.
  const [collectedInputs, setCollectedInputs] = useState({});
  const [scenarioKey, setScenarioKey] = useState(null);
  // Owner-reported baseline values, held for the life of THIS scenario only.
  // Never persisted, never sent anywhere except back to the engine, and always
  // superseded by a governed figure the moment one exists.
  const baselineInputsRef = useRef({});

  const businessRef = useRef(activeBusinessId);
  useEffect(() => {
    businessRef.current = activeBusinessId;
  }, [activeBusinessId]);

  const seqRef = useRef(0);
  // The last request, so "Try again" re-runs the SAME scenario rather than
  // dropping the owner back to an empty surface.
  const lastRequestRef = useRef(null);

  // A business switch must not leave the previous business's scenario on screen.
  //
  // The clear fires only when the active business moves from ONE REAL BUSINESS
  // to A DIFFERENT ONE. `active_business_id` is transiently null while the
  // profile re-resolves, and clearing on that blip destroyed a scenario the
  // owner was part-way through modelling: they clicked Model It and the surface
  // came back with nothing on it. Isolation is unchanged, A to B still clears.
  const prevBusinessRef = useRef(null);
  useEffect(() => {
    const nextId = activeBusinessId || null;
    const prevId = prevBusinessRef.current;
    prevBusinessRef.current = nextId;
    if (!nextId || !prevId || prevId === nextId) return;

    seqRef.current += 1;
    setScenario(null);
    setError(null);
    setQuestion(null);
    setScenarioKey(null);
    setCollectedInputs({});
    baselineInputsRef.current = {};
  }, [activeBusinessId]);

  /** The catalog is business-independent and fetched once. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('whatIfEngine', { list_only: true });
        if (!cancelled && Array.isArray(res?.data?.supported_scenarios)) {
          setSupportedScenarios(res.data.supported_scenarios);
        }
      } catch (err) {
        console.error('[useWhatIf] catalog unavailable:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = useCallback(
    async ({
      scenarioKey: key = null,
      question: q = null,
      inputs = {},
      baselineInputs = null,
    } = {}) => {
      const businessAtRequest = businessRef.current;
      const seq = ++seqRef.current;

      const baseline_inputs = { ...baselineInputsRef.current, ...(baselineInputs || {}) };
      lastRequestRef.current = { scenarioKey: key, question: q, inputs, baselineInputs };

      setLoading(true);
      setError(null);

      const isStale = () =>
        seq !== seqRef.current || businessAtRequest !== businessRef.current;

      try {
        const res = await base44.functions.invoke('whatIfEngine', {
          active_business_id: businessAtRequest,
          ...(key ? { scenario_key: key } : {}),
          ...(q ? { question: q } : {}),
          inputs,
          ...(Object.keys(baseline_inputs).length > 0 ? { baseline_inputs } : {}),
        });

        if (isStale()) return null;

        const raw = res?.data?.scenario;
        if (!raw) throw new Error(res?.data?.error || GENERIC_ERROR);

        // The engine returns Galileo's read as { text, source }. Every consumer
        // renders it as text, and an object in a React text node throws, which
        // took the whole result surface down. Flatten it once, here.
        const payload =
          raw.galileo_read && typeof raw.galileo_read === 'object'
            ? {
                ...raw,
                galileo_read: raw.galileo_read.text || null,
                galileo_read_source: raw.galileo_read.source || null,
              }
            : raw;

        setQuestion(q);
        if (key || payload.scenario_key) setScenarioKey(key || payload.scenario_key);
        setScenario(payload);
        return payload;
      } catch (err) {
        console.error('[useWhatIf] request failed:', err?.response?.data || err?.message || err);
        if (isStale()) return null;
        setError(readFriendlyError(err));
        return null;
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    []
  );

  /** Ask a what-if question in the owner's own words. */
  const ask = useCallback((q) => run({ question: q }), [run]);

  /**
   * Start a scenario the catalog offers. An optional question carries the
   * owner's own framing (e.g. from the opportunity that led here).
   */
  const start = useCallback(
    (key, q = null) => {
      setCollectedInputs({});
      baselineInputsRef.current = {};
      return run({ scenarioKey: key, question: q });
    },
    [run]
  );

  /** Re-run the SAME scenario with changed assumptions. */
  const adjust = useCallback(
    (inputs) => {
      const next = { ...collectedInputs, ...inputs };
      setCollectedInputs(next);
      return run({ scenarioKey, question, inputs: next });
    },
    [collectedInputs, scenarioKey, question, run]
  );

  /** Reopen a scenario the owner saved to their Playbook. */
  const restore = useCallback(
    ({ scenarioKey: key, question: q = null, inputs = {} }) => {
      if (!key) return null;
      setCollectedInputs(inputs || {});
      baselineInputsRef.current = {};
      return run({ scenarioKey: key, question: q, inputs: inputs || {} });
    },
    [run]
  );

  /**
   * Answer the single follow-up question the engine asked, then re-run the
   * same scenario with that input supplied.
   */
  const provideInput = useCallback(
    (inputKey, value) => {
      const next = { ...collectedInputs, [inputKey]: value };
      setCollectedInputs(next);
      return run({ scenarioKey, question, inputs: next });
    },
    [collectedInputs, scenarioKey, question, run]
  );

  /**
   * Use the engine's own declared estimate instead of a typed figure.
   * Named applyEstimate, NOT useEstimate: an identifier beginning with "use"
   * is treated as a React Hook by the lint rules, and this one is legitimately
   * called from inside a click handler.
   */
  const applyEstimate = useCallback(
    (inputKey, estimateValue) => provideInput(inputKey, estimateValue),
    [provideInput]
  );

  /**
   * Supply a missing GOVERNED BASELINE figure for this scenario only.
   *
   * Deliberately separate from provideInput: a baseline field is not a lever
   * parameter, and the engine accepts the two in different places. The value is
   * owner reported and unverified, and the engine drops it as soon as real data
   * exists for that field.
   */
  const provideBaselineInput = useCallback(
    (field, value) => {
      baselineInputsRef.current = { ...baselineInputsRef.current, [field]: value };
      return run({ scenarioKey, question, inputs: collectedInputs });
    },
    [collectedInputs, scenarioKey, question, run]
  );

  /**
   * Ask whether a governed figure has arrived since the owner left to supply it
   * somewhere else. Reads the same certified contract a scenario reads, so it
   * can only ever report a real business figure.
   */
  const probeBaseline = useCallback(async (fields) => {
    const businessAtRequest = businessRef.current;
    try {
      const res = await base44.functions.invoke('whatIfEngine', {
        active_business_id: businessAtRequest,
        probe_baseline: fields,
      });
      if (businessAtRequest !== businessRef.current) return null;
      return res?.data?.baseline_probe || null;
    } catch (err) {
      console.error('[useWhatIf] baseline probe failed:', err?.message || err);
      return null;
    }
  }, []);

  /**
   * The figure arrived through a real capability, so the owner's typed value is
   * dropped and the scenario re-runs on the governed one. Governed data wins.
   */
  const resumeWithGovernedData = useCallback(
    (field) => {
      const next = { ...baselineInputsRef.current };
      if (field) delete next[field];
      baselineInputsRef.current = next;
      return run({ scenarioKey, question, inputs: collectedInputs });
    },
    [collectedInputs, scenarioKey, question, run]
  );

  const reset = useCallback(() => {
    seqRef.current += 1;
    setScenario(null);
    setError(null);
    setQuestion(null);
    setScenarioKey(null);
    setCollectedInputs({});
    baselineInputsRef.current = {};
  }, []);

  /** Re-run the exact request that failed — backs the inline "Try again". */
  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last) return null;
    return run(last);
  }, [run]);

  return {
    supportedScenarios,
    scenario,
    question,
    scenarioKey,
    collectedInputs,
    loading,
    error,
    ask,
    start,
    adjust,
    restore,
    provideInput,
    provideBaselineInput,
    probeBaseline,
    resumeWithGovernedData,
    applyEstimate,
    retry,
    reset,
  };
}