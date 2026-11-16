/**
 * Galileo × document assignments — ORCHESTRATION ONLY.
 *
 * This module understands the language of document assignments and translates it
 * into what the EXISTING contract already does. It writes nothing, decides no
 * authorization, and owns no state:
 *
 *   · It classifies what the owner is asking (read / assign / complete / reopen /
 *     remove) and resolves the three things a change needs — the business's own
 *     document, an authorized person from this business's roster, and the
 *     responsibility level — DETERMINISTICALLY, from real records.
 *   · askGalileo never mutates. A change leaves here as a PROPOSAL carrying
 *     authoritative ids; the frontend confirms it and calls
 *     `documentAssignments.assign | setStatus | remove`, which re-proves
 *     business scope, document ownership, roster membership and the actor for
 *     itself. Natural language can therefore never bypass authorization — there
 *     is no path from a sentence to a row except through that contract.
 *   · Nothing is inferred from notifications, chat history, document metadata,
 *     Sprint tasks, document requests or extraction review. Assignments come
 *     from document_assignments, and everything else is a different concept
 *     (see ASSIGNMENT_CONCEPTS below).
 */

export const ASSIGNMENT_TYPES = ['review', 'action_required', 'fyi'];

export interface RosterPerson {
  profile_id: string;
  full_name: string;
  email?: string;
  role_label?: string;
  has_platform_account?: boolean;
}

export interface DocumentRecord {
  id: string;
  name: string;
  document_type?: string | null;
  upload_status?: string | null;
}

export interface AssignmentRecord {
  id: string;
  document_id: string;
  document_name?: string | null;
  assignee_profile_id: string;
  assignee_name?: string | null;
  assignment_type: string;
  status: string;
  note?: string | null;
  assigned_by_name?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
}

/** The six concepts Galileo must never collapse into one another (§2). */
export const ASSIGNMENT_CONCEPTS = [
  'DOCUMENT ASSIGNMENT: responsibility for an EXISTING document (review | action_required | fyi). The only thing the word "assignment" ever means here.',
  'DOCUMENT REQUEST: someone is being asked to PROVIDE a document that does not exist yet.',
  'EXTRACTION REVIEW: Accept / Correct / Reject the facts Vision extracted from a document.',
  'SPRINT TASK: execution work inside a 90-Day Sprint.',
  'DOCUMENT ACCESS: who is allowed to open the business\'s documents.',
  'NOTIFICATION: a message telling someone that something happened.',
];

// ── Language (deterministic classification) ──────────────────────────────────

const TYPE_RULES: Array<[RegExp, string]> = [
  [/\bfyi\b|for (her|his|their) reference|for reference|just so (she|he|they) (has|have) it|keep (her|him|them|parker|sarah|mike)[\w']* in the loop|share (this|it) with|send (this|it) to .* as fyi/i, 'fyi'],
  [/take action|action required|needs? to (do|act|handle|follow up)|needs? action|follow up on|something needs? doing/i, 'action_required'],
  [/review|look (this|it|that) over|go (through|over) (this|it)|check (this|it)/i, 'review'],
];

/** Responsibility level, or null when the sentence does not say (never guess). */
export function resolveAssignmentType(question: string): string | null {
  for (const [pattern, type] of TYPE_RULES) {
    if (pattern.test(question)) return type;
  }
  return null;
}

/**
 * A note only when the owner actually dictated one:
 *   "…and ask her to check the unusual marketing expense."
 * → "check the unusual marketing expense"
 * Never manufactured, never paraphrased.
 */
export function extractAssignmentNote(question: string): string | null {
  const match = question.match(
    /\b(?:and\s+)?(?:ask|tell)\s+(?:her|him|them|[A-Za-z][\w'.-]*)\s+to\s+([^.!?]+)/i
  );
  if (!match) return null;
  const note = match[1].trim().replace(/\s+/g, ' ');
  return note ? note.slice(0, 500) : null;
}

export type AssignmentIntent =
  | 'mine' | 'all' | 'completed' | 'document' | 'person'
  | 'assign' | 'complete' | 'reopen' | 'remove';

/**
 * What is being asked. Deliberately conservative: a question only becomes an
 * assignment question when it uses assignment vocabulary, and the caller treats
 * a null as "not about assignments at all".
 */
export function detectAssignmentIntent(question: string): AssignmentIntent | null {
  const q = question.toLowerCase();
  const assignmentWords = /assignment|assigned|assign|document|review|fyi|action required|this|operating agreement|p&l|tax return|balance sheet/.test(q);

  if (/\b(re-?open)\b/.test(q) && assignmentWords) return 'reopen';
  if (/\b(remove|take) .*(off|from)\b|unassign/.test(q) && assignmentWords) return 'remove';
  if (/(mark|consider|it'?s|i'?m|im) .*(complete|completed|done|finished)|mark (this|my|it)/.test(q) && assignmentWords) return 'complete';

  const assignVerb = /\b(assign|assigned|have|send|share|give)\b/.test(q) && /\b(to|with)\b/.test(q);
  const shouldReview = /\b(should|needs? to|must|has to)\b.*\b(review|look|handle|take action|check)\b/.test(q);
  if ((assignVerb || shouldReview) && assignmentWords && !/^\s*(who|what|which|does|is|are|how many)\b/.test(q)) {
    return 'assign';
  }

  if (/assigned to me|waiting on me|\bto me\b|my (open )?(document )?(assignments|reviews)|what.*(need|needs|waiting).*me|does anyone need|needs? action|what'?s on my plate|my plate/.test(q)) return 'mine';
  if (/which .*(assignments|reviews).*(complete|done)|completed assignments|finished assignments/.test(q)) return 'completed';
  if (/who('?s| is| are| has| have| else)?\b.*\b(assigned|handling|responsible|reviewing|working on|got|holds?)\b|does anyone have\b|who has\b/.test(q)) return 'document';
  if (/what (does|is|are)\b.*\b(review|responsible|need to do|working on|assigned)\b|what is \w+ responsible for/.test(q)) return 'person';
  if (/open document assignments|show me .*(assignments|reviews)|all assignments|list .*assignments|any assignments/.test(q)) return 'all';
  return null;
}

// ── Resolution (against this business's own records only) ────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'these', 'those', 'who', 'what', 'which', 'does', 'did',
  'any', 'anyone', 'someone', 'have', 'has', 'had', 'got', 'hold', 'holds', 'is', 'are', 'was', 'weren',
  'need', 'needs', 'needed', 'review', 'reviewing', 'assigned', 'assignment', 'assign', 'assignments',
  'document', 'documents', 'file', 'files', 'report', 'please', 'show', 'list', 'open', 'complete',
  'completed', 'done', 'action', 'required', 'fyi', 'about', 'from', 'you', 'your', 'their', 'her', 'his',
  'him', 'she', 'he', 'they', 'them', 'our', 'can', 'could', 'would', 'should', 'take', 'off', 'mark',
]);

function tokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Documents are resolved INSIDE the active business only, and a tie is never
 * broken by guessing: two plausible documents is a question, not a coin toss.
 */
export function resolveDocumentInQuestion(
  question: string,
  documents: DocumentRecord[],
  focusedDocumentId?: string | null,
  ignoreNames: string[] = []
) {
  // "this" / "it" is not a name match at all: when the owner is standing in a
  // document, that document IS the answer. Authoritative context first (§7).
  if (focusedDocumentId && /\b(this|it|that)\b/i.test(question)) {
    const focused = (documents || []).find((doc) => doc.id === focusedDocumentId);
    if (focused) return { status: 'one' as const, matches: [focused], fromContext: true };
  }

  const q = ` ${String(question || '').toLowerCase()} `;
  // People named in the question are never evidence for WHICH document it is.
  const ignore = new Set(ignoreNames.flatMap((name) => tokens(name)));
  const qTokens = new Set(tokens(question).filter((t) => !ignore.has(t)));
  const scored = (documents || [])
    .map((doc) => {
      const nameLower = String(doc.name || '').toLowerCase();
      const nameTokens = tokens(doc.name);
      let score = nameTokens.reduce((sum, t) => sum + (qTokens.has(t) ? 1 : 0), 0);
      if (nameLower && q.includes(nameLower)) score += 3; // the whole name appears
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return { status: 'one' as const, matches: [scored[0].doc] };
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { status: 'many' as const, matches: scored.filter((s) => s.score === scored[0].score).map((s) => s.doc) };
  }
  return { status: 'none' as const, matches: [] };
}

/** People are resolved against the ACTIVE business roster only (§8). */
export function resolvePersonInQuestion(question: string, roster: RosterPerson[]) {
  const q = String(question || '').toLowerCase();
  const matches = (roster || []).filter((person) => {
    const first = String(person.full_name || '').split(' ')[0]?.toLowerCase();
    const full = String(person.full_name || '').toLowerCase();
    if (full.length > 3 && q.includes(full)) return true;
    return !!first && first.length > 2 && new RegExp(`\\b${first.replace(/[^a-z]/g, '')}\\b`).test(q);
  });
  if (matches.length === 1) return { status: 'one' as const, matches };
  if (matches.length > 1) return { status: 'many' as const, matches };
  return { status: 'none' as const, matches: [] };
}

// ── Assembly ─────────────────────────────────────────────────────────────────

export interface AssignmentLayerInput {
  question: string;
  intent: AssignmentIntent;
  assignments: AssignmentRecord[];
  documents: DocumentRecord[];
  roster: RosterPerson[];
  meProfileId: string | null;
  canManage: boolean;
  focusedDocumentId?: string | null;
  focusedAssignmentId?: string | null;
}

function groupByDocument(rows: AssignmentRecord[], meProfileId: string | null) {
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = row.document_id;
    if (!groups.has(key)) {
      groups.set(key, {
        document_id: row.document_id,
        document_name: row.document_name || 'Document',
        entries: [],
      });
    }
    groups.get(key)!.entries.push({
      assignment_id: row.id,
      assignee_name: row.assignee_name || 'Someone',
      assignment_type: row.assignment_type,
      status: row.status,
      note: row.note || null,
      is_me: !!meProfileId && row.assignee_profile_id === meProfileId,
      assigned_by_name: row.assigned_by_name || null,
    });
  }
  return Array.from(groups.values());
}

function proposalFor(action: string, parts: Record<string, any>) {
  return {
    action,
    document_id: parts.document_id || null,
    document_name: parts.document_name || null,
    assignee_profile_id: parts.assignee_profile_id || null,
    assignee_name: parts.assignee_name || null,
    assignee_has_account: !!parts.assignee_has_account,
    assignment_type: parts.assignment_type || null,
    assignment_id: parts.assignment_id || null,
    note: parts.note || null,
  };
}

/**
 * Build the deterministic answer + structured payload for an assignment
 * question. `answer` replaces the LLM's prose so a count, a name or a status is
 * never invented; `assignment` is what the answer surface renders.
 */
export function buildAssignmentLayer(input: AssignmentLayerInput) {
  const { intent, question, documents, roster, meProfileId, canManage } = input;
  const focusedDocumentId = input.focusedDocumentId || null;
  const focusedAssignmentId = input.focusedAssignmentId || null;

  const current = (input.assignments || []).filter((a) => a.status !== 'removed');
  const open = current.filter((a) => a.status === 'open');
  const mine = open.filter((a) => meProfileId && a.assignee_profile_id === meProfileId);
  const note = extractAssignmentNote(question);

  const listAnswer = (headline: string, rows: AssignmentRecord[], showPeople: boolean) => ({
    answer: headline,
    context: summarizeForPrompt(rows, roster),
    assignment: {
      mode: 'list',
      headline,
      show_people: showPeople,
      groups: groupByDocument(rows, meProfileId),
    },
  });

  const clarify = (kind: string, text: string, options: any[], base?: any) => ({
    answer: text,
    context: '',
    assignment: { mode: 'clarify', headline: text, clarify: { kind, question: text, options }, proposal_base: base || null },
  });

  const refuse = (text: string) => ({
    answer: text,
    context: '',
    assignment: { mode: 'none', headline: text, message: text },
  });

  switch (intent) {
    // ── READ ────────────────────────────────────────────────────────────────
    case 'mine': {
      if (!meProfileId) return refuse('I could not match this account to a member of this business.');
      if (mine.length === 0) return listAnswer('You have no open document assignments in this business.', [], false);
      const headline = mine.length === 1 ? 'You have 1 open document assignment.' : `You have ${mine.length} open document assignments.`;
      return listAnswer(headline, mine, false);
    }

    case 'completed': {
      const done = current.filter((a) => a.status === 'completed');
      if (done.length === 0) return listAnswer('Nothing has been completed yet in this business.', [], true);
      const headline = done.length === 1 ? '1 completed document assignment.' : `${done.length} completed document assignments.`;
      return listAnswer(headline, done, true);
    }

    case 'all': {
      if (open.length === 0) return listAnswer('There are no open document assignments in this business.', [], true);
      const headline = open.length === 1 ? 'There is 1 open document assignment in this business.' : `There are ${open.length} open document assignments in this business.`;
      return listAnswer(headline, open, true);
    }

    case 'document': {
      const resolved = resolveDocumentInQuestion(question, documents, focusedDocumentId);
      if (resolved.status === 'many') {
        return clarify('document', 'I found more than one document that could match. Which one do you mean?',
          resolved.matches.map((d) => ({ value: d.id, label: d.name })));
      }
      if (resolved.status === 'none') {
        return refuse('Vision could not find that document in this business.');
      }
      const doc = resolved.matches[0];
      const rows = open.filter((a) => a.document_id === doc.id);
      if (rows.length === 0) {
        return listAnswer(`Nobody is currently assigned to ${doc.name}.`, [], true);
      }
      const headline = rows.length === 1 ? `One person has ${doc.name}.` : `${rows.length} people have ${doc.name}.`;
      return listAnswer(headline, rows, true);
    }

    case 'person': {
      const resolved = resolvePersonInQuestion(question, roster);
      if (resolved.status === 'many') {
        return clarify('person', `I found ${resolved.matches.length} team members who could match. Which one do you mean?`,
          resolved.matches.map((p) => ({ value: p.profile_id, label: `${p.full_name} · ${p.role_label || 'Team member'}` })));
      }
      if (resolved.status === 'none') {
        return refuse("I couldn't find a matching team member on this business's team.");
      }
      const person = resolved.matches[0];
      const rows = open.filter((a) => a.assignee_profile_id === person.profile_id);
      if (rows.length === 0) return listAnswer(`${person.full_name} has no open document assignments in this business.`, [], true);
      const headline = rows.length === 1
        ? `${person.full_name} has 1 open document assignment.`
        : `${person.full_name} has ${rows.length} open document assignments.`;
      return listAnswer(headline, rows, true);
    }

    // ── CREATE ──────────────────────────────────────────────────────────────
    case 'assign': {
      if (!canManage) return refuse("I can't make that assignment for this business.");
      const type = resolveAssignmentType(question);
      const personResolved = resolvePersonInQuestion(question, roster);

      // A person's name is never evidence for WHICH document: "Assign this to
      // Garrick" must not match a document called Reevs.Garrick.Integrator.pdf.
      const docResolved = resolveDocumentInQuestion(
        question,
        documents,
        focusedDocumentId,
        personResolved.matches.map((p) => p.full_name)
      );
      const base: any = { assignment_type: type, note };
      if (docResolved.status === 'many') {
        return clarify('document', 'I found more than one document that could match. Which one should this be?',
          docResolved.matches.map((d) => ({ value: d.id, label: d.name })), base);
      }
      if (docResolved.status === 'none') {
        return refuse('I could not tell which document you mean. Open the document, or name it, and I will take it from there.');
      }
      const doc = docResolved.matches[0];
      Object.assign(base, { document_id: doc.id, document_name: doc.name });

      if (personResolved.status === 'many') {
        return clarify('person', 'I found more than one team member who could match. Which one do you mean?',
          personResolved.matches.map((p) => ({
            value: p.profile_id,
            label: `${p.full_name} · ${p.role_label || 'Team member'}`,
            assignee_name: p.full_name,
            assignee_profile_id: p.profile_id,
            assignee_has_account: !!p.has_platform_account,
          })), base);
      }
      if (personResolved.status === 'none') {
        return refuse("I couldn't find a matching team member on this business's team.");
      }
      const person = personResolved.matches[0];
      Object.assign(base, {
        assignee_profile_id: person.profile_id,
        assignee_name: person.full_name,
        assignee_has_account: !!person.has_platform_account,
      });

      // The responsibility level is never chosen silently (§11).
      if (!type) {
        return clarify('type', `What would you like ${person.full_name} to do with it?`,
          [
            { value: 'review', label: 'Review' },
            { value: 'action_required', label: 'Action Required' },
            { value: 'fyi', label: 'FYI' },
          ], base);
      }

      const existing = current.find((a) => a.document_id === doc.id && a.assignee_profile_id === person.profile_id);
      const headline = existing
        ? `Update ${person.full_name}'s assignment on ${doc.name}?`
        : `Assign ${doc.name} to ${person.full_name}?`;
      return {
        answer: headline,
        context: '',
        assignment: {
          mode: 'proposal',
          headline,
          proposal: proposalFor('assign', base),
          existing_assignment_id: existing?.id || null,
        },
      };
    }

    // ── STATUS ──────────────────────────────────────────────────────────────
    case 'complete':
    case 'reopen': {
      const resolved = resolveTargetAssignment({
        intent, open, current, meProfileId, canManage, focusedDocumentId, focusedAssignmentId,
      });
      if (resolved.kind === 'none') return refuse(resolved.message);
      if (resolved.kind === 'many') {
        return clarify('assignment', 'Which assignment do you mean?',
          resolved.matches.map((a) => ({
            value: a.id,
            label: `${a.document_name || 'Document'} · ${a.assignee_name || 'Someone'} · ${a.assignment_type}`,
            assignment_id: a.id,
            document_id: a.document_id,
            document_name: a.document_name,
            assignee_profile_id: a.assignee_profile_id,
            assignee_name: a.assignee_name,
            assignment_type: a.assignment_type,
          })),
          { action: intent === 'complete' ? 'complete' : 'reopen' });
      }
      const target = resolved.assignment;
      if (target.assignment_type === 'fyi') {
        return refuse('FYI assignments are reference-only, so there isn\'t anything to mark complete.');
      }
      const verb = intent === 'complete' ? 'Mark complete' : 'Reopen';
      const headline = `${verb}: ${target.document_name || 'document'} — ${target.assignee_name || 'assignment'}.`;
      return {
        answer: headline,
        context: '',
        assignment: {
          mode: 'proposal',
          headline,
          proposal: proposalFor(intent === 'complete' ? 'complete' : 'reopen', {
            assignment_id: target.id,
            document_id: target.document_id,
            document_name: target.document_name,
            assignee_profile_id: target.assignee_profile_id,
            assignee_name: target.assignee_name,
            assignment_type: target.assignment_type,
          }),
        },
      };
    }

    // ── REMOVE ──────────────────────────────────────────────────────────────
    case 'remove': {
      if (!canManage) return refuse("I can't change that assignment for this business.");
      const resolved = resolveTargetAssignment({
        intent, open, current, meProfileId, canManage, focusedDocumentId, focusedAssignmentId,
      });
      if (resolved.kind === 'none') return refuse(resolved.message);
      if (resolved.kind === 'many') {
        return clarify('assignment', 'Which assignment do you mean?',
          resolved.matches.map((a) => ({
            value: a.id,
            label: `${a.document_name || 'Document'} · ${a.assignee_name || 'Someone'} · ${a.assignment_type}`,
            assignment_id: a.id,
            document_id: a.document_id,
            document_name: a.document_name,
            assignee_profile_id: a.assignee_profile_id,
            assignee_name: a.assignee_name,
            assignment_type: a.assignment_type,
          })),
          { action: 'remove' });
      }
      const target = resolved.assignment;
      const headline = `Remove ${target.assignee_name || 'this person'} from ${target.document_name || 'this document'}?`;
      return {
        answer: headline,
        context: '',
        assignment: {
          mode: 'proposal',
          headline,
          proposal: proposalFor('remove', {
            assignment_id: target.id,
            document_id: target.document_id,
            document_name: target.document_name,
            assignee_profile_id: target.assignee_profile_id,
            assignee_name: target.assignee_name,
            assignment_type: target.assignment_type,
          }),
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Which assignment does "this"/"my review" mean? Authoritative context first,
 * then an unambiguous single record — and a question if neither exists. It never
 * picks by plausibility.
 */
function resolveTargetAssignment(args: {
  intent: string;
  open: AssignmentRecord[];
  current: AssignmentRecord[];
  meProfileId: string | null;
  canManage: boolean;
  focusedDocumentId: string | null;
  focusedAssignmentId: string | null;
}) {
  const { open, current, meProfileId, canManage, focusedDocumentId, focusedAssignmentId } = args;
  const mine = open.filter((a) => meProfileId && a.assignee_profile_id === meProfileId);

  // 1. An assignment the surface itself named — validated against this business
  //    (the list is already business-scoped) and against the actor's right to it.
  if (focusedAssignmentId) {
    const target = current.find((a) => a.id === focusedAssignmentId);
    if (!target) return { kind: 'none' as const, message: 'That assignment is not part of this business.' };
    if (target.assignee_profile_id !== meProfileId && !canManage) {
      return { kind: 'none' as const, message: `That ${labelFor(target.assignment_type)} is assigned to ${target.assignee_name}, so they need to complete it.` };
    }
    return { kind: 'one' as const, assignment: target };
  }

  // 2. The document the owner is standing in: their own assignment on it, if
  //    there is exactly one.
  if (focusedDocumentId) {
    const onDocument = mine.filter((a) => a.document_id === focusedDocumentId);
    if (onDocument.length === 1) return { kind: 'one' as const, assignment: onDocument[0] };
    if (onDocument.length > 1) return { kind: 'many' as const, matches: onDocument };
  }

  // 3. Otherwise only an unambiguous single one.
  if (mine.length === 1) return { kind: 'one' as const, assignment: mine[0] };
  if (mine.length > 1) return { kind: 'many' as const, matches: mine };

  return {
    kind: 'none' as const,
    message: canManage
      ? 'I could not tell which assignment you mean. Name the document and I will find it.'
      : 'You have no open document assignments in this business.',
  };
}

function labelFor(type: string) {
  if (type === 'action_required') return 'action item';
  if (type === 'fyi') return 'reference';
  return 'review';
}

/**
 * A compact, honest summary for the LLM prompt — so an assignment-flavoured
 * question that the classifier did NOT claim is still answered from real records
 * rather than from imagination.
 */
export function summarizeForPrompt(rows: AssignmentRecord[], roster: RosterPerson[]) {
  const open = rows.filter((r) => r.status === 'open');
  return {
    open_assignments: open.length,
    assignments: open.slice(0, 15).map((r) => ({
      assignment_id: r.id,
      document: r.document_name || 'Document',
      document_id: r.document_id,
      assigned_to: r.assignee_name || 'Someone',
      type: r.assignment_type,
      status: r.status,
      note: r.note || null,
    })),
    team: (roster || []).slice(0, 20).map((p) => ({ name: p.full_name, role: p.role_label || 'Team member' })),
  };
}