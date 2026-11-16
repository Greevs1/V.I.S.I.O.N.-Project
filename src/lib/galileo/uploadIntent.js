/**
 * Upload intent copy — WHY Galileo is asking for a document (Part 4).
 *
 * The uploader is unchanged. What changes is the sentence above it: Vision
 * states the need in plain language and names the documents that would satisfy
 * it, so the owner is not guessing what to dig out.
 *
 * The `needs` string always comes from the caller (a What If missing input, a
 * Next Best Move evidence gap, a Connections gap). This module never invents a
 * business need — it only translates one into a request and a suggested
 * document list. Unknown needs fall back to the general financial-statement
 * wording, which is honest for any financial question.
 */

const GENERIC = ['Profit & Loss statement', 'Balance sheet', 'Business tax return'];

const RULES = [
  {
    match: /revenue|sales|top line|turnover|topline/i,
    suggestions: ['Profit & Loss statement', 'Business tax return'],
  },
  {
    match: /profit|margin|ebitda|earning|income|bottom line/i,
    suggestions: ['Profit & Loss statement', 'Recast or adjusted Profit & Loss'],
  },
  {
    match: /\btax|agi|deduction|write-?off/i,
    suggestions: ['Business tax return', 'Personal tax return'],
  },
  {
    match: /compensation|take-?home|payroll|salary|owner pay|draw/i,
    suggestions: ['Payroll report', 'Profit & Loss statement'],
  },
  {
    match: /debt|loan|interest|dscr|liabilit|borrow/i,
    suggestions: ['Debt schedule', 'Balance sheet'],
  },
  {
    match: /cash|receivable|payable|working capital|inventory/i,
    suggestions: ['Balance sheet', 'Profit & Loss statement'],
  },
  {
    match: /asset|equipment|property|vehicle/i,
    suggestions: ['Balance sheet', 'Depreciation schedule'],
  },
  {
    match: /customer|client|concentration|contract|backlog/i,
    suggestions: ['Revenue by customer', 'Profit & Loss statement'],
  },
  {
    match: /valuation|multiple|enterprise value/i,
    suggestions: ['Profit & Loss statement', 'Balance sheet', 'Business tax return'],
  },
];

/**
 * @param {string} needs — the plain-language data request, e.g. 'Annual revenue'.
 * @returns {{headline: string, body: string, suggestions: string[]}}
 */
export function uploadIntentCopy(needs) {
  const headline = 'Help Galileo finish this model';
  const readable = String(needs || '').trim();
  const rule = RULES.find((r) => r.match.test(readable));

  if (!readable) {
    return {
      headline: 'Add a financial document',
      body: 'Anything Vision can read helps it understand this business better. Nothing is added to your business until you confirm it.',
      suggestions: GENERIC,
    };
  }

  const lower = readable.charAt(0).toLowerCase() + readable.slice(1);
  return {
    headline,
    body: `I need a financial statement that can help me confirm ${lower}.`,
    suggestions: rule?.suggestions || GENERIC,
  };
}