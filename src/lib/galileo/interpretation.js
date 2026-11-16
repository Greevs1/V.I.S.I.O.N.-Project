/**
 * interpretation.js — WHAT GALILEO JUST LEARNED, said in one line.
 *
 * The Knowledge Gap Engine decides which question comes next; it is untouched.
 * This module only decides whether Galileo has something WORTH SAYING about the
 * answer it just received, before the next question arrives — the difference
 * between a living conversation and question → answer → question.
 *
 * THE RULE
 *
 * Every line is derivable from the numbers the owner just gave. If nothing is
 * derivable, these functions return null and Galileo simply progresses in
 * silence. That silence is deliberate: it is what varies the rhythm, and it is
 * why this cannot drift into manufactured enthusiasm.
 *
 * No claim about benchmarks, comparables or peers is ever made here — those
 * require evidence Galileo does not have at this point in the conversation.
 */

import { toNumber, isReal } from './factKnowledge';

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

const fmtMoney = (n) => {
  if (n == null || isNaN(n)) return null;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

const fmtCount = (n) => (n <= 10 ? WORDS[n] : String(n));

/** Revenue per person above which the team size is genuinely notable. */
const REVENUE_PER_PERSON_NOTABLE = 300000;

/**
 * interpretAnswer — a deterministic sentence about the answer just given, or
 * null when the answer supports no statement at all.
 */
export function interpretAnswer(field, answers = {}, facts = null) {
  // THE VALUE COMES WITH ITS EPISTEMIC STATE. When a resolved fact set is
  // supplied, an UNKNOWN fact reads as null — never as 0 — so a missing EBITDA
  // cannot produce a "0% margin" sentence here either. Without facts, the raw
  // answer is parsed through the same guard (`toNumber` refuses '' and 'abc').
  const read = (key) => (facts?.[key] ? (isReal(facts[key]) ? facts[key].value : null) : toNumber(answers[key]));
  const revenue = read('revenue');
  const ebitda = read('ebitda');
  const employees = toNumber(answers.employees);

  if (field === 'ebitda' && revenue > 0 && Number.isFinite(ebitda) && ebitda !== 0) {
    const margin = Math.round((ebitda / revenue) * 1000) / 10;
    return `${fmtMoney(revenue)} in revenue and roughly ${fmtMoney(ebitda)} of EBITDA puts you around a ${margin}% margin.`;
  }

  if (field === 'employees' && revenue > 0 && employees > 0 && revenue / employees >= REVENUE_PER_PERSON_NOTABLE) {
    const who = employees === 1 ? 'person' : 'people';
    return `${fmtCount(employees)} ${who} supporting ${fmtMoney(revenue)} in revenue makes your role especially important to understand.`;
  }

  if (field === 'involvement' && answers.involvement === 'heavy') {
    return 'Running it day to day yourself is one of the strongest constraints on what a buyer would pay.';
  }

  return null;
}

/**
 * bridgeToQuestion — one line of REASON for the question that is about to be
 * asked, only where the reason is genuinely true of that field.
 *
 * The conversation controller calls this only when nothing was just
 * interpreted, so Galileo never says two things in a row merely to fill space.
 */
export function bridgeToQuestion(field, answers = {}) {
  // The reason for asking about profitability, stated only where it is true: the
  // margin needs BOTH numbers, so this is said before the question, never as a
  // conclusion about it.
  if (field === 'ebitda' && answers.revenue != null && answers.ebitda == null) {
    return 'Profitability is the next piece I need before I can compare you to peers.';
  }
  if (field === 'involvement' && answers.revenue != null) {
    return 'That\u2019s useful. The next thing I want to understand is how dependent the business is on you.';
  }
  if (field === 'employees' && answers.industry) {
    return 'Now I want to understand what actually runs the business day to day.';
  }
  if (field === 'goal' && answers.revenue != null) {
    return 'One more thing, then I\u2019ll show you what I\u2019m seeing.';
  }
  return null;
}