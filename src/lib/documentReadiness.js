/**
 * documentReadiness.js
 * =====================
 * SINGLE SOURCE OF TRUTH for all document readiness / folder logic.
 *
 * Consumed by:
 *  - DataRoom page
 *  - Admin View
 *  - Expert Advisor Portal
 *  - IQ Dashboard
 *  - Weekly Digest
 *  - Galileo context
 *  - Opportunity Engine (missing doc opportunities)
 *
 * Nothing here touches upload/download/permissions logic.
 */

// ── System Folders ────────────────────────────────────────────────────────────

export const SYSTEM_FOLDERS = [
  { id: 'tax_returns',          label: 'Tax Returns',             icon: '📁', category: 'tax' },
  { id: 'financial_statements', label: 'Financial Statements',    icon: '📁', category: 'financial' },
  { id: 'balance_sheets',       label: 'Balance Sheets',          icon: '📁', category: 'financial' },
  { id: 'profit_loss',          label: 'Profit & Loss',           icon: '📁', category: 'financial' },
  { id: 'payroll',              label: 'Payroll',                 icon: '📁', category: 'financial' },
  { id: 'banking',              label: 'Banking',                 icon: '📁', category: 'financial' },
  { id: 'insurance',            label: 'Insurance',               icon: '📁', category: 'insurance' },
  { id: 'legal',                label: 'Legal',                   icon: '📁', category: 'legal' },
  { id: 'estate_planning',      label: 'Estate Planning',         icon: '📁', category: 'wealth' },
  { id: 'wealth_planning',      label: 'Wealth Planning',         icon: '📁', category: 'wealth' },
  { id: 'asset_protection',     label: 'Asset Protection',        icon: '📁', category: 'legal' },
  { id: 'exit_planning',        label: 'Exit Planning',           icon: '📁', category: 'exit' },
  { id: 'operations',           label: 'Operations',              icon: '📁', category: 'operations' },
  { id: 'hr',                   label: 'HR',                      icon: '📁', category: 'operations' },
  { id: 'agreements',           label: 'Agreements',              icon: '📁', category: 'legal' },
  { id: 'advisory_deliverables',label: 'Advisory Deliverables',   icon: '📁', category: 'other' },
  { id: 'worksheets',           label: 'Worksheets',              icon: '📁', category: 'other' },
  { id: 'assessments',          label: 'Assessments',             icon: '📁', category: 'other' },
  { id: 'sprint_documents',     label: 'Sprint Documents',        icon: '📁', category: 'other' },
  { id: 'other',                label: 'Other',                   icon: '📁', category: 'other' },
];

export const SYSTEM_FOLDER_IDS = new Set(SYSTEM_FOLDERS.map(f => f.id));

// ── Auto-categorization ───────────────────────────────────────────────────────

/**
 * Given a document's type + name, suggest the best system folder id.
 */
export function suggestFolder(doc) {
  const type = (doc.document_type || '').toLowerCase();
  const name = (doc.name || '').toLowerCase();

  // Explicit type matches first
  const TYPE_MAP = {
    business_tax_return: 'tax_returns',
    personal_tax_return: 'tax_returns',
    profit_and_loss:     'profit_loss',
    balance_sheet:       'balance_sheets',
    payroll_report:      'payroll',
    insurance_document:  'insurance',
    entity_document:     'legal',
    buy_sell_agreement:  'legal',
    estate_document:     'estate_planning',
    agreement:           'agreements',
    client_agreement:    'agreements',
    engagement_letter:   'agreements',
    exit_readiness:      'exit_planning',
    debt_schedule:       'financial_statements',
  };
  if (TYPE_MAP[type]) return TYPE_MAP[type];

  // Name-based heuristics
  if (/tax.return|1120|1065|1040|k-1/i.test(name))     return 'tax_returns';
  if (/p&l|profit.loss|income.statement/i.test(name))   return 'profit_loss';
  if (/balance.sheet/i.test(name))                       return 'balance_sheets';
  if (/financial.statement/i.test(name))                 return 'financial_statements';
  if (/payroll|paychex|adp|gusto/i.test(name))          return 'payroll';
  if (/bank.statement|banking/i.test(name))             return 'banking';
  if (/insurance|policy|liability|umbrella/i.test(name))return 'insurance';
  if (/buy.sell|operating.agreement|bylaws|articles/i.test(name)) return 'legal';
  if (/estate|trust|will|succession/i.test(name))       return 'estate_planning';
  if (/wealth|net.worth|investment/i.test(name))        return 'wealth_planning';
  if (/asset.protect/i.test(name))                      return 'asset_protection';
  if (/exit|valuation|m&a|acquisition/i.test(name))     return 'exit_planning';
  if (/sop|process|operations|org.chart/i.test(name))   return 'operations';
  if (/hr|employee|onboard/i.test(name))                return 'hr';
  if (/agreement|contract|engagement/i.test(name))      return 'agreements';
  if (/sprint/i.test(name))                             return 'sprint_documents';
  if (/assessment/i.test(name))                         return 'assessments';
  if (/worksheet/i.test(name))                          return 'worksheets';

  return 'other';
}

// ── Readiness Categories & Requirements ──────────────────────────────────────

export const READINESS_CATEGORIES = [
  {
    id: 'financial',
    label: 'Financial Documentation',
    folderIds: ['financial_statements', 'balance_sheets', 'profit_loss', 'banking'],
    required: [
      { key: 'pl_current',     label: 'Profit & Loss (Current Year)',   types: ['profit_and_loss'],     keywords: ['p&l', 'profit', 'income'] },
      { key: 'bs_current',     label: 'Balance Sheet (Current Year)',    types: ['balance_sheet'],       keywords: ['balance sheet'] },
      { key: 'pl_prior',       label: 'Prior Year P&L',                  types: ['profit_and_loss'],     keywords: ['p&l', 'prior', 'previous'] },
      { key: 'bs_prior',       label: 'Prior Year Balance Sheet',        types: ['balance_sheet'],       keywords: ['balance sheet', 'prior'] },
    ],
  },
  {
    id: 'tax',
    label: 'Tax Documentation',
    folderIds: ['tax_returns'],
    required: [
      { key: 'biz_tax_current',  label: 'Business Tax Return (Current Year)',  types: ['business_tax_return'], keywords: ['1120', '1065', 'business tax'] },
      { key: 'biz_tax_prior',    label: 'Business Tax Return (Prior Year)',     types: ['business_tax_return'], keywords: ['1120', '1065', 'prior'] },
      { key: 'pers_tax_current', label: 'Personal Tax Return (Current Year)',   types: ['personal_tax_return'], keywords: ['1040', 'personal tax'] },
    ],
  },
  {
    id: 'legal',
    label: 'Legal Documentation',
    folderIds: ['legal', 'agreements', 'asset_protection'],
    required: [
      { key: 'operating_agreement', label: 'Operating Agreement',           types: ['entity_document'],    keywords: ['operating agreement'] },
      { key: 'buy_sell',            label: 'Buy-Sell Agreement',             types: ['buy_sell_agreement'], keywords: ['buy-sell', 'buy sell'] },
      { key: 'corporate_docs',      label: 'Corporate Documents',            types: ['entity_document'],    keywords: ['articles', 'bylaws', 'corporate'] },
      { key: 'entity_structure',    label: 'Entity Structure Documentation', types: ['entity_document'],    keywords: ['entity', 'structure'] },
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance Documentation',
    folderIds: ['insurance'],
    required: [
      { key: 'general_liability', label: 'General Liability',    types: ['insurance_document'], keywords: ['general liability'] },
      { key: 'umbrella',          label: 'Umbrella Policy',       types: ['insurance_document'], keywords: ['umbrella'] },
      { key: 'key_person',        label: 'Key Person Insurance',  types: ['insurance_document'], keywords: ['key person', 'key man'] },
      { key: 'disability',        label: 'Disability Coverage',   types: ['insurance_document'], keywords: ['disability'] },
    ],
  },
  {
    id: 'operations',
    label: 'Operations Documentation',
    folderIds: ['operations', 'hr'],
    required: [
      { key: 'sop',      label: 'SOP Documentation',    types: [], keywords: ['sop', 'standard operating'] },
      { key: 'org_chart',label: 'Org Chart',            types: [], keywords: ['org chart', 'organization chart'] },
      { key: 'kpi',      label: 'KPI Dashboard',        types: [], keywords: ['kpi', 'dashboard', 'metrics'] },
      { key: 'process',  label: 'Process Documentation',types: [], keywords: ['process', 'workflow'] },
    ],
  },
  {
    id: 'wealth',
    label: 'Wealth Documentation',
    folderIds: ['wealth_planning', 'estate_planning'],
    required: [
      { key: 'net_worth',   label: 'Net Worth Statement', types: [],                   keywords: ['net worth'] },
      { key: 'estate_plan', label: 'Estate Plan',         types: ['estate_document'],  keywords: ['estate plan', 'trust', 'will'] },
      { key: 'trust',       label: 'Trust Documents',     types: ['estate_document'],  keywords: ['trust'] },
      { key: 'investments', label: 'Investment Summary',  types: [],                   keywords: ['investment', 'portfolio'] },
    ],
  },
  {
    id: 'exit',
    label: 'Exit Readiness Documentation',
    folderIds: ['exit_planning'],
    required: [
      { key: 'valuation',     label: 'Valuation Reports',         types: ['exit_readiness'], keywords: ['valuation', 'appraisal'] },
      { key: 'succession',    label: 'Succession Plan',           types: [],                 keywords: ['succession'] },
      { key: 'buyer_ready',   label: 'Buyer Readiness Checklist', types: [],                 keywords: ['buyer', 'readiness'] },
      { key: 'due_diligence', label: 'Due Diligence Package',     types: [],                 keywords: ['due diligence', 'diligence'] },
    ],
  },
];

// ── Core Readiness Calculator ─────────────────────────────────────────────────

/**
 * calculateReadiness(documents)
 *
 * Takes an array of document objects from the Data Room.
 * Returns a readiness report consumable by all platform views.
 *
 * @param {Array} documents — raw docs from supabaseUserData / getDataRoomDocuments
 * @returns {Object} ReadinessReport
 */
export function calculateReadiness(documents = []) {
  const categories = READINESS_CATEGORIES.map(cat => {
    const fulfilled = new Set();
    const missing = [];

    cat.required.forEach(req => {
      const found = documents.some(doc => {
        const typeMatch = req.types.length === 0 || req.types.includes(doc.document_type);
        const nameMatch = req.keywords.some(kw =>
          (doc.name || '').toLowerCase().includes(kw) ||
          (doc.document_type || '').toLowerCase().includes(kw.replace(/\s+/g, '_'))
        );
        return typeMatch || nameMatch;
      });
      if (found) fulfilled.add(req.key);
      else missing.push(req);
    });

    const total = cat.required.length;
    const completed = fulfilled.size;
    const score = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      id: cat.id,
      label: cat.label,
      folderIds: cat.folderIds,
      score,
      completed,
      total,
      missing,
      fulfilled: [...fulfilled],
    };
  });

  const overallScore = categories.length > 0
    ? Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)
    : 0;

  const totalMissing = categories.reduce((sum, c) => sum + c.missing.length, 0);
  const totalRequired = categories.reduce((sum, c) => sum + c.total, 0);
  const totalCompleted = categories.reduce((sum, c) => sum + c.completed, 0);

  const highestCategory = [...categories].sort((a, b) => b.score - a.score)[0];
  const lowestCategory  = [...categories].sort((a, b) => a.score - b.score)[0];

  // Critical missing: any document missing from a category with score < 50%
  const criticalMissing = categories
    .filter(c => c.score < 50)
    .flatMap(c => c.missing.map(m => ({ ...m, categoryId: c.id, categoryLabel: c.label })));

  return {
    categories,
    overallScore,
    totalMissing,
    totalRequired,
    totalCompleted,
    highestCategory,
    lowestCategory,
    criticalMissing,
  };
}

// ── Folder assignment for documents ──────────────────────────────────────────

/**
 * Assign each document to a system folder based on auto-categorization.
 * Returns a map: folderId → document[]
 */
export function groupDocumentsByFolder(documents = []) {
  const groups = {};
  SYSTEM_FOLDERS.forEach(f => { groups[f.id] = []; });

  documents.forEach(doc => {
    const folder = doc.system_folder || suggestFolder(doc);
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push(doc);
  });

  return groups;
}

// ── Galileo context summary ───────────────────────────────────────────────────

/**
 * Produce a text summary of folder contents for Galileo context injection.
 */
export function buildFolderContextSummary(documents = []) {
  const groups = groupDocumentsByFolder(documents);
  const lines = [];

  SYSTEM_FOLDERS.forEach(folder => {
    const docs = groups[folder.id] || [];
    if (docs.length > 0) {
      lines.push(`${folder.label} folder contains ${docs.length} document(s): ${docs.slice(0, 3).map(d => d.name).join(', ')}${docs.length > 3 ? ` and ${docs.length - 3} more` : ''}.`);
    }
  });

  return lines.join('\n');
}

// ── Missing doc → Opportunity seeds ─────────────────────────────────────────

/**
 * Returns opportunity-shaped objects for missing critical documents.
 * These can be fed into the existing Opportunity system, not a separate engine.
 */
export function getMissingDocumentOpportunities(readinessReport) {
  return readinessReport.criticalMissing.map(item => ({
    title: `Upload Missing Document: ${item.label}`,
    description: `The "${item.label}" is required for ${item.categoryLabel} completeness.`,
    category: item.categoryId,
    source: 'data_room_readiness',
    estimated_value_created: 0,
    impact_score: 60,
    ease_score: 80,
    urgency_score: 70,
    confidence_score: 95,
    status: 'available',
  }));
}