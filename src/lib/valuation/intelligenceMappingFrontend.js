/**
 * intelligenceMappingFrontend — frontend-accessible subset of the
 * intelligence mapping registry (category labels only). The full registry
 * lives in base44/shared/valuationEngine/intelligenceMapping.ts and is
 * used by the backend engine.
 */

export const SNAPSHOT_CATEGORIES = [
  { key: 'business_identity', label: 'Business Identity', order: 1 },
  { key: 'financial_performance', label: 'Financial Performance', order: 2 },
  { key: 'balance_sheet_cash_flow', label: 'Balance Sheet & Cash Flow', order: 3 },
  { key: 'commercial_quality', label: 'Commercial Quality', order: 4 },
  { key: 'organization_transferability', label: 'Organization & Transferability', order: 5 },
  { key: 'risk', label: 'Risk', order: 6 },
];