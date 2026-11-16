/**
 * livingIntelligence/businessMemoryContract.ts — Phase 15.0
 *
 * Business Memory Contract — FRAMEWORK ONLY.
 *
 * Do NOT implement memory.
 *
 * Define:
 *   • What should be remembered
 *   • Relationship to Timeline
 *   • Relationship to Canonical Facts
 *   • Relationship to Galileo
 *   • Relationship to Advisors
 *   • Retention philosophy
 *   • Extension points
 *
 * Constitution Compliance:
 *   Article I — One Truth (memory does not duplicate canonical facts)
 *   Article II — Single Ownership (memory owns "remembered context", not facts)
 *   Article III — No Duplicate Intelligence (memory references, not copies)
 *   Article VII — Extension First (memory is an extension point, not a parallel system)
 */

import type { BusinessMemoryContract, MemoryCategory, RetentionPhilosophy } from './types.ts';

/**
 * The Business Memory Contract.
 *
 * This is a FRAMEWORK. implemented: false.
 * Future phases will implement memory by EXTENDING this contract.
 */
export const BUSINESS_MEMORY_CONTRACT: BusinessMemoryContract = {
  implemented: false,

  // ── What Should Be Remembered ──────────────────────────────────────────────
  memory_categories: [
    {
      name: 'Advisor Decisions',
      description: 'Key decisions the advisor has made — approved add-backs, selected multiples, confirmed strategies',
      what_to_remember: 'Decision type, rationale, timestamp, advisor identity, affected fields',
      retention_duration: 'Permanent (aligned with valuation immutability — Article XII)',
      relationship_to_timeline: 'Referenced by timeline entries as the cause of business state changes',
      relationship_to_canonical_facts: 'Decisions affect canonical facts but do not duplicate them — facts remain in the Canonical Fact Registry',
    },
    {
      name: 'Conversation Context',
      description: 'Key topics, questions, and conclusions from Galileo conversations',
      what_to_remember: 'Conversation summary, key questions asked, conclusions reached, follow-up items',
      retention_duration: '90 days (conversation relevance decays; canonical facts persist independently)',
      relationship_to_timeline: 'Conversations may reference timeline events; timeline does not depend on conversations',
      relationship_to_canonical_facts: 'Conversations discuss canonical facts but do not duplicate them — facts are read from the Canonical Fact Resolver',
    },
    {
      name: 'Business Patterns',
      description: 'Observed patterns in the business — seasonal trends, recurring issues, growth patterns',
      what_to_remember: 'Pattern description, supporting evidence, confidence, first observed, last observed',
      retention_duration: 'Permanent (patterns are long-term observations)',
      relationship_to_timeline: 'Patterns are derived from timeline observations — they summarize, not duplicate',
      relationship_to_canonical_facts: 'Patterns reference canonical facts as evidence but do not duplicate fact values',
    },
    {
      name: 'Advisor Notes',
      description: 'Advisor observations, hypotheses, and strategic notes about the business',
      what_to_remember: 'Note content, advisor identity, timestamp, related metrics or facts',
      retention_duration: 'Permanent (advisor notes are professional records)',
      relationship_to_timeline: 'Notes may reference timeline events; timeline does not depend on notes',
      relationship_to_canonical_facts: 'Notes reference canonical facts but do not duplicate them',
    },
    {
      name: 'Execution History',
      description: 'Sprint completions, task outcomes, value creation events',
      what_to_remember: 'What was executed, when, outcome, verified value, lessons learned',
      retention_duration: 'Permanent (execution history is the business\'s track record)',
      relationship_to_timeline: 'Execution events ARE timeline events — memory references them, does not duplicate',
      relationship_to_canonical_facts: 'Execution outcomes may affect canonical facts (e.g., verified value) but facts remain in the Registry',
    },
    {
      name: 'Meeting Intelligence',
      description: 'Key outcomes from advisor-owner meetings — decisions, action items, follow-ups',
      what_to_remember: 'Meeting date, attendees, key decisions, action items, follow-up deadlines',
      retention_duration: 'Permanent (meeting records are professional records)',
      relationship_to_timeline: 'Meetings may reference timeline events; timeline does not depend on meetings',
      relationship_to_canonical_facts: 'Meetings discuss canonical facts but do not duplicate them',
    },
  ],

  // ── Relationship to Timeline ──────────────────────────────────────────────
  timeline_relationship: `Business Memory references the Business Timeline but does not duplicate it.
The Timeline is the immutable record of business state changes (owned by the Timeline Module).
Memory is the synthesized understanding of what those changes mean — the patterns, the decisions,
the context that gives the timeline meaning.

Memory REFERENCES timeline entries by ID. It does not copy timeline data.
When a timeline entry is relevant to a memory, the memory stores a reference, not a copy.`,

  // ── Relationship to Canonical Facts ────────────────────────────────────────
  canonical_facts_relationship: `Business Memory NEVER duplicates canonical fact values.
Canonical facts live in the Canonical Fact Registry — they are the single source of truth.
Memory references canonical facts by ID when they are relevant to a remembered context.
When memory needs a fact value, it reads from the Canonical Fact Resolver at access time.
This ensures memory never holds stale fact values.`,

  // ── Relationship to Galileo ────────────────────────────────────────────────
  galileo_relationship: `Business Memory feeds Galileo's context.
When Galileo builds a conversation context, it may consult Business Memory to understand
prior conversations, advisor decisions, and business patterns.
Memory enriches Galileo's understanding but does not replace canonical facts.
Galileo always reads canonical facts from the Canonical Fact Resolver.
Memory provides context, not truth.`,

  // ── Relationship to Advisors ──────────────────────────────────────────────
  advisor_relationship: `Advisors are the owners of their notes and decisions.
Business Memory stores advisor-created content (notes, decisions, hypotheses) with
the advisor's identity and timestamp. Advisors can review, edit, and delete their own memory.
Memory does not auto-promote advisor hypotheses to canonical — that requires explicit approval.
Memory is a tool for the advisor, not a replacement for advisor judgment.`,

  // ── Retention Philosophy ──────────────────────────────────────────────────
  retention_philosophy: {
    principle: `Business Memory retains what is useful for executive understanding and decays what is not.
Permanent categories (decisions, patterns, execution history, advisor notes, meeting intelligence)
are retained indefinitely because they are professional records.
Conversation context decays after 90 days because conversation relevance diminishes over time.
No memory is retained beyond its useful life — memory is not a data hoard.`,

    rules: [
      'Permanent categories: retained indefinitely (decisions, patterns, execution, notes, meetings)',
      'Conversation context: retained for 90 days, then summarized and decayed',
      'No fact values are stored in memory — only references to canonical facts',
      'No timeline data is duplicated in memory — only references to timeline entries',
      'Memory decay does not affect canonical facts or timeline (they are independent)',
      'Advisors can delete their own memory at any time',
      'Memory is scoped by business_id — no cross-business memory leakage (Article XI)',
    ],

    decay_model: `Conversation context decays linearly over 90 days.
After 90 days, conversation context is summarized into a brief note (key topics, conclusions)
and the detailed conversation is archived.
Permanent categories do not decay — they are retained indefinitely.
All memory is scoped by business_id and advisor identity.`,
  },

  // ── Extension Points ──────────────────────────────────────────────────────
  extension_points: [
    'Business Memory™ — implement the memory store with the categories defined above',
    'Business DNA™ — extend memory with pattern extraction and business fingerprinting',
    'Business Twin™ — extend memory with simulation capabilities (non-mutating)',
    'Advisor Co-Pilot™ — extend memory with workflow automation suggestions',
    'Meeting Intelligence™ — extend memory with meeting preparation and follow-up',
    'Continuous Executive Brief™ — extend memory with brief regeneration triggers',
    'Autonomous Planning™ — extend memory with planning suggestions (advisor-approved)',
  ],
};