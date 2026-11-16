/**
 * useAssessmentPrefill
 *
 * Reads extracted fields from the guest session or profile financials
 * and returns prefill suggestions for assessment inputs.
 *
 * Rules:
 *  - Never blocks rendering (all async, returns suggestions only)
 *  - Never throws
 *  - Never overwrites user-edited values (callers must track edited state)
 *  - Only returns values with acceptable confidence
 *  - Works in both journey and member mode
 */

import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getGuestSessionId } from '@/lib/anonymousSession';
import { PREFILL_MAP } from '@/lib/assessmentPrefillMap';
import { useBusinessContext } from '@/lib/BusinessContext';

/**
 * @param {object} opts
 * @param {string} opts.assessmentKey - e.g. 'profit_gap'
 * @param {string} opts.mode          - 'journey' | 'member'
 */
export default function useAssessmentPrefill({ assessmentKey, mode }) {
  const { context: bizCtx } = useBusinessContext();
  const [suggestions, setSuggestions] = useState({});
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    const relevantFields = PREFILL_MAP.filter(f => f.assessment_key === assessmentKey);
    if (!relevantFields.length) return;

    const fetchAndApply = async () => {
      setLoading(true);
      try {
        let extractedFields = {};

        if (mode === 'journey') {
          // Read from guest session state_snapshot
          const guestSessionId = getGuestSessionId();
          if (guestSessionId) {
            const res = await base44.functions.invoke('guestSessionService', {
              action: 'getGuestSession',
              data: { guest_session_id: guestSessionId },
            });
            const snapshot = res.data?.session?.state_snapshot || {};
            extractedFields = { ...snapshot, ...(snapshot.extracted_fields || {}) };

            // Calculate derived margin if not directly available
            if (
              !extractedFields.net_profit_margin &&
              extractedFields.total_revenue > 0 &&
              (extractedFields.net_income || extractedFields.ordinary_business_income)
            ) {
              const ni = extractedFields.net_income || extractedFields.ordinary_business_income;
              extractedFields.__calculated_margin = parseFloat(
                ((ni / extractedFields.total_revenue) * 100).toFixed(1)
              );
            }
          }
        } else {
          // Member mode: try profile financials
          const res = await base44.functions.invoke('getMetricAutoPopulate', { active_business_id: bizCtx.active_business_id });
          const d = res.data || {};
          // UNKNOWN ≠ ZERO. A metric the profile does not carry is ABSENT, not $0:
          // coercing it to 0 would prefill an assessment with a fact nobody stated.
          extractedFields = {
            total_revenue: d.revenue ?? null,
            ebitda: d.ebitda ?? null,
            net_income: d.net_profit ?? null,
          };
        }

        // Build suggestion map
        const result = {};
        for (const mapping of relevantFields) {
          for (const key of mapping.extracted_keys) {
            const raw = extractedFields[key];
            if (raw == null || raw === '' || raw === 0) continue;

            try {
              const transformed = mapping.transform ? mapping.transform(raw) : raw;
              if (transformed == null || isNaN(transformed) && typeof transformed !== 'string') continue;

              result[mapping.field_key] = {
                value: transformed,
                source_label: mapping.source_label,
                label: mapping.label,
              };
              break; // use first matching extracted key
            } catch {
              // transform failed — skip silently
            }
          }
        }

        setSuggestions(result);
      } catch {
        // Never throw — prefill is best-effort
      } finally {
        setLoading(false);
      }
    };

    fetchAndApply();
  }, [assessmentKey, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return { suggestions, loading };
}