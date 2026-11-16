/**
 * valuationIntelligenceService — frontend wrapper for Phase 13.3E.2
 * intelligence actions on the valuationService backend function.
 */

import { base44 } from '@/api/base44Client';

export async function getValuationIntelligence(valuationId) {
  const res = await base44.functions.invoke('valuationService', {
    action: 'getValuationIntelligence',
    data: { valuation_id: valuationId },
  });
  return res.data;
}

export async function runIntelligenceScan(valuationId, scope = 'full') {
  const res = await base44.functions.invoke('valuationService', {
    action: 'runIntelligenceScan',
    data: { valuation_id: valuationId, scope },
  });
  return res.data;
}