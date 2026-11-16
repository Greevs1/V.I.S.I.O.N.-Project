/**
 * askGalileo — Phase 12C: BIE-Consumer
 *
 * Answers user questions using canonical BIE recommendations, BIE metrics,
 * BIE journal, BIE snapshots, approved strategy mappings, Sprint objectives,
 * Scenario Builder results, uploaded document evidence, and advisor notes.
 *
 * Galileo may explain, summarize, personalize, compare, clarify, educate,
 * coach, warn, encourage, and answer follow-up questions.
 *
 * Galileo may NOT invent business recommendations, create alternate recommendations,
 * independently score opportunities, independently prioritize gaps, change estimated
 * impact, change confidence, change BIE priority, ignore advisor overrides, or
 * recommend a strategy that is not mapped or approved.
 *
 * If no canonical recommendation exists, Galileo says:
 * "There is not enough verified intelligence yet to make a reliable recommendation."
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  fetchCanonicalRecommendations,
  resolveStrategyContext,
  checkAdvisorOverride,
  buildSupportingEvidence,
  buildGalileoResponseContract,
  fetchLearningPatterns,
  INTELLIGENCE_LABELS,
} from '../../shared/galileoBieConsumer/entry.ts';
import {
  resolveActorBusinessContext,
  businessContextError,
} from '../../shared/businessScope/activeBusiness.ts';
import { buildGalileoValuationContext } from '../../shared/galileo/valuationContext.ts';
// The guard that mirrors can_access_business() — the SAME rule the assignment
// contract uses to decide who may manage assignments. Nothing new is invented.
import { validateBusinessScope } from '../../shared/businessScope/writeGuard.ts';
import {
  ASSIGNMENT_CONCEPTS,
  buildAssignmentLayer,
  detectAssignmentIntent,
  summarizeForPrompt,
} from '../../shared/galileo/assignments/index.ts';
import {
  resolveFocusedDocument,
  deriveAnswerVerification,
  applyAnswerLabels,
  resolveObservationForPeriod,
  takeHomeSemantics,
  parseRequestedFiscalYear,
} from '../../shared/galileo/focusedDocument.ts';
// 6D.0c.1 — the PROVISIONAL lane: unreviewed document evidence is retrievable, and
// is never promoted. The canonical rules in focusedDocument.ts are untouched.
import {
  metricIntent,
  buildProvisionalEvidence,
  resolveMetricEvidence,
  buildProvisionalEvidenceBlock,
  applyProvisionalEvidence,
  historicalValueIntent,
  applyHistoricalEvidenceContract,
  deriveExtractionReviewCounts,
  buildExtractionNotice,
  buildExtractionSummary,
  extractionSummaryIntent,
  isPendingReview,
} from '../../shared/galileo/provisionalEvidence.ts';
import { buildObservationLayer } from '../../shared/documentObservation/semantics.ts';
// 6D.0c.2 — the EVIDENCE-FIRST answer engine: for a factual metric question the
// answer, its state, its labels, its sources and its next step are decided from
// resolved evidence BEFORE the model is asked, and enforced AFTER it answers.
import { resolveRequestedConcept } from '../../shared/galileo/answerEngine/ontology.ts';
import { prepareEvidenceFirstAnswer, finalizeEvidenceFirstAnswer } from '../../shared/galileo/answerEngine/pipeline.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    let { question, conversation_id, current_route, page_context,
          valuation_id, workspace_key, section_key, focused_record_type, focused_record_id, conversation_mode } = body;

    if (!question?.trim()) return Response.json({ error: 'question is required' }, { status: 400 });

    // ── PHASE 6.9 — BUSINESS SCOPE CONTRACT ───────────────────────────────────
    // This function has ONE business-scoped path (no action router): every read
    // below — canonical BIE recommendations, assessments, documents, next best
    // actions, sprint, advisor notes, conversations — belongs to a single business.
    //
    // `resolveProfileAndBusiness` silently substituted profile.primary_business_id
    // whenever the caller omitted the business, so a multi-business account was
    // answered with whichever business happened to be primary. Actor identity and
    // the business are now resolved through the canonical contract, which REFUSES
    // an ambiguous request (400 BUSINESS_CONTEXT_REQUIRED) instead of guessing.
    let profileId: string | null = null;
    let businessId: string | null = null;
    let membershipStatus = 'free';
    try {
      ({ profileId, businessId, membershipStatus } = await resolveActorBusinessContext(sb, user, body, { action: 'askGalileo' }));
    } catch (bizErr) {
      return businessContextError(bizErr);
    }
    if (!businessId) return Response.json({ error: 'business_id required' }, { status: 400 });

    // ── Phase 13.4A.2: Valuation context (additive) ───────────────────────────
    // When valuation_id is present, assemble a permission-filtered valuation
    // context and include it in the LLM prompt. Does not alter existing context.
    let valuation_context: any = null;
    if (valuation_id) {
      try {
        const { data: valProf } = await sb.from('profiles').select('id, app_role, primary_business_id').eq('id', profileId).maybeSingle();
        if (valProf) {
          valuation_context = await buildGalileoValuationContext({
            sb, profile: valProf, profileId,
            businessId, valuationId: valuation_id,
            workspaceKey: workspace_key, sectionKey: section_key,
            focusedRecordType: focused_record_type, focusedRecordId: focused_record_id,
            conversationMode: conversation_mode,
          });
        }
      } catch (_valErr) {
        valuation_context = { available: false, reason: 'context_error' };
      }
    }

    const isPaid = membershipStatus === 'paid';
    const userRole = user.role || 'owner';
    const isAdvisor = ['super_admin', 'advisor', 'admin'].includes(userRole);

    // ── 2a. THE FOCUSED DOCUMENT — SERVER-RESOLVED, NOT PROSE (§2) ────────────
    // When the owner is standing in ONE document, that document becomes real
    // server-resolved context. The ROW owns the tenant: a focus whose document
    // belongs to another business FAILS CLOSED rather than pivoting the question
    // into that business. Access is decided by the canonical document
    // authorization, and only knowledge derived from THIS id is loaded — so no
    // latest / newest / same-type / same-business document can stand in for it.
    //
    // An unavailable focus is NOT an error: it is reported as unavailable, and
    // the prompt below forbids substituting another document to produce an answer.
    const askedDocumentId = focused_record_type === 'document' ? focused_record_id || null : null;
    let focusedDocument: any = null;
    if (askedDocumentId) {
      try {
        focusedDocument = await resolveFocusedDocument({
          sb,
          focusedDocumentId: askedDocumentId,
          businessId,
          actor: { profile_id: profileId, isAdmin: isAdvisor, hasProfile: !!profileId },
          checkBusinessAccess: async (bid: string) => {
            // The SAME canonical rule the assignment contract applies — never a
            // second permission model.
            const scope = await validateBusinessScope(sb, bid, profileId);
            const reason = scope?.authorization_reason || '';
            if (!/owner|advisor|super_admin|team|admin/.test(reason)) throw new Error('business_access_denied');
          },
        });
      } catch (fdErr: any) {
        console.warn('[askGalileo] focused document context skipped:', fdErr?.message);
        focusedDocument = { available: false, reason: 'context_error' };
      }
    }

    // ── 2c. PERIOD + TAKE-HOME — SERVER-DERIVED, NEVER LEFT TO THE MODEL ─────
    // A question that names a year is answered from THAT year or not at all: the
    // resolver returns `no_observation_for_period` rather than reusing another
    // year's figure, so 2024 evidence cannot become a 2023 answer. And "take
    // home" is declared AMBIGUOUS in structured context, so the model cannot
    // silently read it as revenue, AGI, taxable income, profit or a refund.
    const requestedFiscalYear = parseRequestedFiscalYear(question);
    const takeHome = takeHomeSemantics(question);
    let focusedPeriodResolution: any = null;
    if (focusedDocument?.available && requestedFiscalYear) {
      const obs = focusedDocument.period_observations || focusedDocument.focused_document.semantic_observations || [];
      const keys = [...new Set(obs.map((o: any) => o.canonical_key))];
      focusedPeriodResolution = {
        requested_fiscal_year: requestedFiscalYear,
        available_fiscal_years: [...new Set(obs.map((o: any) => o?.period?.fiscal_year).filter((y: any) => y != null))].sort(),
        by_key: Object.fromEntries(
          keys.map((k: any) => [k, resolveObservationForPeriod(obs, k, {
            businessId: focusedDocument.focused_document.business_id,
            fiscalYear: requestedFiscalYear,
          })]),
        ),
      };
    }

    // ── 1. Fetch canonical BIE recommendations ────────────────────────────────
    const { recommendations, raw } = await fetchCanonicalRecommendations(sb, profileId, businessId);

    // ── 2. Load supporting context (assessments, documents, NBA, sprint) ──────
    // Documents are scoped to the ACTIVE BUSINESS. They used to be read
    // profile-wide, which put every business's documents into every answer's
    // context — a multi-business owner's answer could be informed by another
    // business's paperwork. The id is kept so a citation can resolve to the
    // source document rather than naming it in prose only.
    const documentQuery = sb
      .from('documents')
      // `extracted_data` carries the recognized tax-form inventory and its
      // page-provenance (6D.0c.3), which is what a form question is answered from.
      .select('id, name, document_type, upload_status, year, extracted_data')
      .order('created_at', { ascending: false })
      .limit(15);
    const scopedDocumentQuery = businessId
      ? documentQuery.eq('business_id', businessId)
      : documentQuery.eq('profile_id', profileId);

    // ── B1.1 — BUSINESS-SCOPED SUPPORTING CONTEXT ────────────────────────────
    // assessments, the active sprint and advisor notes are read for the
    // AUTHORIZED ACTIVE BUSINESS only — never profile-wide — so a multi-business
    // account's answer can no longer be informed by a sibling business's records.
    // The business filter REPLACES the profile filter (they are not joined):
    // advisor, team and expert access is granted against the business by the
    // canonical contract above, and these records carry the business's own
    // profile_id, so an appended profile filter would wrongly exclude them.
    const [assessRes, docRes, nbaRes, sprintRes, notesRes] = await Promise.allSettled([
      sb.from('business_assessments').select('assessment_type, score, estimated_opportunity_value, risk_level, opportunity_level, summary, key_findings').eq('business_id', businessId),
      scopedDocumentQuery,
      sb.from('next_best_actions').select('id, title, action_type, priority_score, estimated_impact, status, reason, difficulty_level, expected_time_days').eq('business_id', businessId).in('status', ['recommended', 'accepted', 'in_progress']).order('priority_score', { ascending: false }).limit(10),
      sb.from('ninety_day_sprint_paths').select('id, path_title, path_goal, status, progress_percent, is_active').eq('business_id', businessId).eq('is_active', true).limit(1),
      sb.from('advisor_notes').select('id, note, created_at').eq('business_id', businessId).neq('visibility', 'advisor_only').order('created_at', { ascending: false }).limit(5),
    ]);

    const safeVal = (s: any, fb: any = null) => s.status === 'fulfilled' ? (s.value?.data ?? fb) : fb;
    const assessments = safeVal(assessRes, []);
    const doc_rows = safeVal(docRes, []);
    const nba_rows = safeVal(nbaRes, []);
    const active_sprint = safeVal(sprintRes, [])?.[0] || null;
    const advisor_notes = safeVal(notesRes, []);

    // ── 2b. DOCUMENT ASSIGNMENTS — THIS BUSINESS'S OWN RECORDS ────────────────
    // Galileo understands assignments from document_assignments and this
    // business's roster — never from notifications, chat history, document
    // metadata, Sprint tasks, document requests or extraction review. Those are
    // six distinct concepts and this layer keeps them apart.
    //
    // askGalileo NEVER mutates. A change leaves here as a PROPOSAL carrying
    // authoritative ids; the Data Room's own `documentAssignments` contract
    // performs the write once the owner confirms, re-proving business scope,
    // document ownership, roster membership and the actor for itself. So a
    // sentence can never become a row without passing the same authorization as
    // every other surface.
    //
    // The work only happens when the question (or the document the owner is
    // standing in) is actually about assignments, so an ordinary question costs
    // nothing extra.
    const displayName = (profile: any) =>
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() ||
      profile?.email ||
      'Unknown';

    const assignmentIntent = detectAssignmentIntent(question);
    const focusedDocumentId = focused_record_type === 'document' ? focused_record_id || null : null;
    const focusedAssignmentId = focused_record_type === 'assignment' ? focused_record_id || null : null;

    let assignmentLayer: any = null;
    let assignmentPromptBlock = '';

    if (assignmentIntent || focusedDocumentId || focusedAssignmentId) {
      try {
        const [asgRes, asgDocsRes, bizRes, ownersRes, teamRes] = await Promise.allSettled([
          sb.from('document_assignments')
            .select('id, business_id, document_id, assignee_profile_id, assignment_type, status, note, assigned_by_profile_id, assigned_at, completed_at')
            .eq('business_id', businessId)
            .in('status', ['open', 'completed'])
            .order('assigned_at', { ascending: false })
            .limit(300),
          sb.from('documents').select('id, name, document_type, upload_status')
            .eq('business_id', businessId).order('created_at', { ascending: false }).limit(300),
          sb.from('business_entities').select('id, profile_id, assigned_advisor_id').eq('id', businessId).maybeSingle(),
          sb.from('business_owners').select('profile_id, ownership_role').eq('business_id', businessId),
          sb.from('business_team_members').select('profile_id').eq('business_id', businessId),
        ]);

        const asgRows = (asgRes.status === 'fulfilled' ? asgRes.value?.data : []) || [];
        const asgDocuments = (asgDocsRes.status === 'fulfilled' ? asgDocsRes.value?.data : []) || [];
        const asgBusiness = bizRes.status === 'fulfilled' ? bizRes.value?.data : null;

        // The roster comes from the membership model itself, so a member of
        // another business simply is not in it (§12 — assignment grants nothing).
        const rosterIds = new Set<string>();
        const rosterRoles = new Map<string, string>();
        if (asgBusiness?.profile_id) { rosterIds.add(asgBusiness.profile_id); rosterRoles.set(asgBusiness.profile_id, 'Owner'); }
        if (asgBusiness?.assigned_advisor_id) { rosterIds.add(asgBusiness.assigned_advisor_id); rosterRoles.set(asgBusiness.assigned_advisor_id, 'Advisor'); }
        for (const row of (ownersRes.status === 'fulfilled' ? ownersRes.value?.data : []) || []) {
          if (row.profile_id && !rosterIds.has(row.profile_id)) {
            rosterIds.add(row.profile_id);
            rosterRoles.set(row.profile_id, row.ownership_role ? `Owner (${row.ownership_role})` : 'Owner');
          }
        }
        for (const row of (teamRes.status === 'fulfilled' ? teamRes.value?.data : []) || []) {
          if (row.profile_id && !rosterIds.has(row.profile_id)) {
            rosterIds.add(row.profile_id);
            rosterRoles.set(row.profile_id, 'Team member');
          }
        }

        const peopleIds = new Set<string>(rosterIds);
        for (const row of asgRows) {
          if (row.assignee_profile_id) peopleIds.add(row.assignee_profile_id);
          if (row.assigned_by_profile_id) peopleIds.add(row.assigned_by_profile_id);
        }
        const { data: peopleRows } = peopleIds.size
          ? await sb.from('profiles').select('id, first_name, last_name, email, base44_user_id').in('id', Array.from(peopleIds))
          : { data: [] as any[] };
        const people = new Map<string, any>((peopleRows || []).map((p: any) => [p.id, p]));
        const docById = new Map<string, any>((asgDocuments || []).map((d: any) => [d.id, d]));

        // A focused document is honoured only if it is in THIS business's own
        // document list — a forged context id fails closed.
        const focusedDocument = focusedDocumentId ? docById.get(focusedDocumentId) || null : null;

        const asgAssignments = asgRows.map((row: any) => ({
          id: row.id,
          document_id: row.document_id,
          document_name: docById.get(row.document_id)?.name || null,
          assignee_profile_id: row.assignee_profile_id,
          assignee_name: displayName(people.get(row.assignee_profile_id)),
          assignment_type: row.assignment_type,
          status: row.status,
          note: row.note || null,
          assigned_by_name: displayName(people.get(row.assigned_by_profile_id)),
          assigned_at: row.assigned_at,
          completed_at: row.completed_at,
        }));

        const asgRoster = Array.from(rosterIds)
          .map((id) => {
            const person = people.get(id);
            return {
              profile_id: id,
              full_name: displayName(person),
              email: person?.email || '',
              role_label: rosterRoles.get(id) || 'Team member',
              has_platform_account: !!person?.base44_user_id,
            };
          })
          .sort((a, b) => a.full_name.localeCompare(b.full_name));

        // Manage rights are decided by the SAME rule the contract applies.
        let canManageAssignments = ['super_admin', 'advisor', 'admin'].includes(userRole);
        if (!canManageAssignments && profileId) {
          try {
            const scope = await validateBusinessScope(sb, businessId, profileId);
            canManageAssignments = /owner|advisor|super_admin/.test(scope?.authorization_reason || '');
          } catch {
            canManageAssignments = false;
          }
        }

        // Context for the LLM, so a question the classifier did NOT claim is
        // still answered from real records rather than from imagination.
        assignmentPromptBlock = `\nDOCUMENT ASSIGNMENT CONTEXT (this business only — real records; an assignment may never be inferred from a notification, chat history, document metadata, a Sprint task, a document request or extraction review):\n${JSON.stringify(
          {
            ...summarizeForPrompt(asgAssignments, asgRoster),
            can_manage_assignments: canManageAssignments,
            focused_document: focusedDocument ? { document_id: focusedDocument.id, name: focusedDocument.name } : null,
          },
          null,
          2
        )}\n`;

        if (assignmentIntent) {
          assignmentLayer = buildAssignmentLayer({
            question,
            intent: assignmentIntent,
            assignments: asgAssignments,
            documents: (asgDocuments || []).map((d: any) => ({
              id: d.id, name: d.name, document_type: d.document_type, upload_status: d.upload_status,
            })),
            roster: asgRoster,
            meProfileId: profileId,
            canManage: canManageAssignments,
            focusedDocumentId: focusedDocument?.id || null,
            focusedAssignmentId,
          });
          // The write the surface later confirms must be scoped to the business
          // this answer was actually about — never re-derived from anywhere else.
          if (assignmentLayer?.assignment) assignmentLayer.assignment.business_id = businessId;
        }
      } catch (asgErr: any) {
        console.warn('[askGalileo] assignment context skipped:', asgErr?.message);
        assignmentLayer = null;
        assignmentPromptBlock = '';
      }
    }

    // ── 2d. GENERAL BUSINESS EVIDENCE — CANONICAL FIRST, THEN PROVISIONAL (§16) ─
    // The gap production acceptance found: a supported P&L's revenue WAS extracted
    // (pending review), and a general question — "What is my revenue?" — was
    // answered with no document evidence at all, because document knowledge only
    // ever reached the model on a FOCUSED-document question.
    //
    // This lane closes it WITHOUT a second store. ONE read of this business's own
    // extracted_fields feeds BOTH lanes: the canonical observation layer (which
    // admits eligible rows only) and the provisional evidence lane (pending rows
    // only). Pending rows are deliberately passed to the canonical layer too — and
    // are inert there, because its own eligibility rule refuses them, so "pending
    // never becomes canonical" stays a property of the SHIPPED layer rather than of
    // this call site.
    //
    //   canonical  >  provisional  >  unavailable      (never canonical > unavailable)
    //
    // It runs only when the question actually asks for a metric or about the
    // extraction itself, so an ordinary question costs nothing extra.
    const summaryIntent = extractionSummaryIntent(question);
    const wantedMetrics = metricIntent(question).keys;
    let evidenceResolution: any = null;
    let provisionalBlock: any = null;
    let extractionAwareness: any = null;
    let extractionSummary: any = null;
    let extractionNotice: any = null;
    let provisionalDocumentId: string | null = null;
    let businessFieldRows: any[] = [];

    // §P8 — a HISTORICAL question ("how much did I pay in tax 2024") must reach the
    // evidence lane even when no alias matched its words: the answer needs what the
    // business's own documents report, never a projected opportunity standing in.
    const historicalIntent = historicalValueIntent(question);
    const conceptRequest = resolveRequestedConcept(question, { fiscalYear: requestedFiscalYear });

    if (wantedMetrics.length > 0 || summaryIntent.applies || historicalIntent.historical || conceptRequest.intent !== 'none') {
      try {
        const { data } = await sb
          .from('extracted_fields')
          .select('id, field_name, field_value, normalized_value, accepted_value, accepted_normalized_value, review_status, source_document_type, document_id, business_id, metadata, confidence_score, source_page, reviewed_at, created_at')
          .eq('business_id', businessId)
          .in('review_status', ['accepted', 'corrected', 'pending_review'])
          .order('created_at', { ascending: false })
          .limit(400);
        businessFieldRows = data || [];
      } catch (evErr: any) {
        console.warn('[askGalileo] business evidence read skipped:', evErr?.message);
        businessFieldRows = [];
      }

      const canonicalObservations = buildObservationLayer(businessFieldRows, businessId).observations;
      const provisionalEvidence = buildProvisionalEvidence(businessFieldRows, businessId);
      extractionAwareness = deriveExtractionReviewCounts(businessFieldRows, { businessId });

      evidenceResolution = resolveMetricEvidence({
        question,
        canonicalObservations,
        provisionalEvidence,
        businessId,
        fiscalYear: requestedFiscalYear,
      });

      // The CTA carries the EXACT document the evidence came from — read off the
      // row that produced the value, never a "latest document" resolution.
      provisionalDocumentId = evidenceResolution.used_keys
        .map((k: string) => evidenceResolution.results[k]?.item?.source_document_id)
        .filter(Boolean)[0] || null;

      provisionalBlock = buildProvisionalEvidenceBlock(evidenceResolution, { documentId: provisionalDocumentId });
      if (summaryIntent.applies) extractionSummary = buildExtractionSummary(businessFieldRows, { businessId });
    }

    // ── §12 — the proactive extraction notice. It exists ONLY while something is
    // genuinely waiting for review, and every number in it comes from the rows.
    if (extractionAwareness?.pending_count > 0) {
      // ── ASSOCIATION RULE (6D.0c.3) ────────────────────────────────────────────
      // The notice belongs to THIS answer only when a pending document actually
      // supported it. Previously the fallback was pendingDocIds[0] — merely the most
      // recent pending document — so an answer with no supporting evidence could
      // present an unrelated document (a Profit & Loss) as its source. With no
      // supporting document there is no notice: everything awaiting review is still
      // stated where it belongs, in the Data Room.
      const noticeDocId = provisionalDocumentId || null;
      if (noticeDocId) {
        const docMeta: any = (doc_rows || []).find((d: any) => d.id === noticeDocId) || null;
        extractionNotice = buildExtractionNotice({
          counts: deriveExtractionReviewCounts(businessFieldRows.filter((r) => r.document_id === noticeDocId), { businessId }),
          documentId: noticeDocId,
          documentName: docMeta?.name || null,
          documentType: docMeta?.document_type || null,
        });
      }
    }

    // ── 2e. EVIDENCE-FIRST — resolve the factual answer BEFORE the model (6D.0c.2)
    // Business scope was proven by resolveActorBusinessContext above (it throws for
    // an actor without access, including a revoked relationship), so the access
    // grant handed to the engine is that proof — and only for THIS business.
    // Recommendations and assessments enter ONLY as advisory (projected) context.
    const evidenceFirst = prepareEvidenceFirstAnswer({
      question,
      fiscalYear: requestedFiscalYear,
      businessId,
      access: { businessId, granted: true },
      fieldRows: businessFieldRows,
      recommendations,
      assessments,
      documents: doc_rows,
      // The recognized form inventory, read from the persisted document rows — the
      // same rows the extraction engine wrote. Evidence, never a re-derivation.
      formSections: (doc_rows || []).flatMap((d: any) =>
        Array.isArray(d?.extracted_data?.form_sections)
          ? d.extracted_data.form_sections.map((s: any) => ({ ...s, document_id: d.id }))
          : []),
      focusedDocumentActive: !!focusedDocument?.available || !!assignmentLayer?.answer,
    });
    const factualContract = evidenceFirst.contract;

    // ── 3. Resolve strategy context for each recommendation ────────────────────
    const recommendationsWithContext = [];
    for (const rec of recommendations) {
      const strategyContext = await resolveStrategyContext(sb, rec.recommendation_key, businessId, profileId, userRole, membershipStatus);
      const override = await checkAdvisorOverride(sb, rec.recommendation_key, businessId);
      const evidence = await buildSupportingEvidence(sb, profileId, businessId, rec.recommendation_key, raw);
      recommendationsWithContext.push({ recommendation: rec, strategyContext, override, evidence });
    }

    // ── 3b. Fetch strategic hypotheses and learning patterns ───────────────────
    const [hypothesesRes, learningRes] = await Promise.allSettled([
      sb.from('strategic_hypotheses').select('*').eq('business_id', businessId).in('status', ['hypothesis', 'under_review', 'confirmed']).order('created_date', { ascending: false }).limit(10),
      Promise.resolve(recommendations.length > 0 ? await fetchLearningPatterns(sb, recommendations[0].recommendation_key, businessId) : []),
    ]);
    const hypotheses = hypothesesRes.status === 'fulfilled' ? hypothesesRes.value?.data || [] : [];
    const learningPatterns = learningRes.status === 'fulfilled' ? learningRes.value || [] : [];

    // ── 4. Detect "What should I focus on?" type questions ─────────────────────
    const focusQuestion = /what should i focus|what.*focus.*on|what.*priority|what.*next|what should i do|most important/i.test(question);

    // ── 5. Build LLM context ───────────────────────────────────────────────────
    const byType = (assessments || []).reduce((acc: any, a: any) => { acc[a.assessment_type] = a; return acc; }, {});
    const ciq_score = raw?.iq_score || null;

    const canonicalRecsSummary = recommendationsWithContext.map((rwc: any) => ({
      recommendation_key: rwc.recommendation.recommendation_key,
      title: rwc.recommendation.title,
      category: rwc.recommendation.category,
      priority: rwc.recommendation.priority,
      estimated_impact: rwc.recommendation.estimatedImpact,
      confidence: rwc.recommendation.confidence,
      formatted: rwc.recommendation.formatted,
      strategy_options: rwc.strategyContext.strategy_options?.map((s: any) => s.strategy_name) || [],
      override_status: rwc.override?.override_type || null,
      missing_info: rwc.evidence.missingInformation,
    }));

    const pageCtxLines = [];
    if (current_route) pageCtxLines.push(`Current Page: ${current_route}`);
    if (page_context?.page_name) pageCtxLines.push(`Page Name: ${page_context.page_name}`);
    if (page_context?.selected_tab) pageCtxLines.push(`Selected Tab: ${page_context.selected_tab}`);
    const pageCtxSection = pageCtxLines.length > 0 ? `\nCURRENT PAGE CONTEXT:\n${pageCtxLines.join('\n')}\n` : '';

    const systemPrompt = `You are Galileo, an AI strategic advisor for the V.I.S.I.O.N. Platform™.

You answer questions about a specific business using ONLY the canonical BIE recommendations and verified data provided. You never fabricate numbers.

ARCHITECTURE (critical):
- BIE decides. Strategy Library enriches. Galileo explains.
- You EXPLAIN canonical recommendations — you do NOT invent, score, rank, or create new recommendations.
- Every recommendation-related answer must reference the canonical recommendation_key.
- If no canonical recommendation exists for a topic, say: "There is not enough verified intelligence yet to make a reliable recommendation." Then identify what's missing.
- You may NOT: invent recommendations, create alternate recommendations, independently score opportunities, independently prioritize gaps, change estimated impact, change confidence, change BIE priority, ignore advisor overrides, or recommend unmapped strategies.

LANGUAGE (the owner is a business owner, not an accountant):
- Keep the CORRECT professional term — EBITDA stays EBITDA. Never simplify an answer by removing the real word the owner needs to learn.
- The FIRST time a technical term appears in this conversation, gloss it in the same breath, in plain English, then keep going:
  "Your customer concentration is high — that simply means too much of your revenue depends on a small number of customers."
- ONE short gloss. Never three paragraphs defining a term, and never repeat a gloss already given in this conversation.
- If the owner asks what something means ("what does that mean", "what is EBITDA", "explain that", "I don't understand", "why does that matter"), answer in this order: plain meaning → a concrete analogy or example → what it means for THIS business. Never answer an education question with more jargon.
- Standard accounting and business terms have ONE meaning (EBITDA, working capital, gross margin, enterprise value…). You may simplify them and apply them to this business; you may NOT redefine them.
- When asked to explain a term FOR THIS BUSINESS, use this business's own verified figures, and say plainly when a figure is not on file instead of estimating it.
- Explain terms the owner is actually looking at. Do not decorate an answer with definitions nobody asked for.
- The controlled glossary is a STARTING VOCABULARY, not the limit of what you may explain. Any specialized term you introduce — financial, accounting, tax, valuation, M&A, operational, legal or industry-specific — gets the same treatment on first use in this conversation, whether or not it appears in any list: name it, give its plain meaning in one short clause, then say why it matters here. Example: "We should establish a working capital peg — basically the normal amount of short-term operating money a buyer expects to remain in the business at closing."
- On first use, give an acronym's full term where it reads naturally: "your ARR (Annual Recurring Revenue)", then the plain meaning in the same breath. Do not repeat the expansion after the concept is established.
- This is not finance-only. Construction (WIP, retainage, backlog, bonding capacity), software (ARR, MRR, NRR, churn) and professional services (utilization, realization, billable rate) all qualify. Explain only the terms this business's own data actually uses; never introduce industry jargon to demonstrate knowledge.
- The pattern is: TERM → plain meaning → why it matters for THIS business. Expanding an acronym is not an explanation — "EBITDA is earnings before interest, taxes, depreciation and amortization" teaches nothing until you say what it means for this business. Stay concise by default.
- You may simplify a canonical accounting term and apply it to this business; you may never give it a different meaning. When the controlled glossary defines a term, that definition is authoritative.

DOCUMENT ASSIGNMENTS — A REAL OPERATING CONCEPT (never blur these):
${ASSIGNMENT_CONCEPTS.map((line) => `- ${line}`).join('\n')}
- "Assignment" ALWAYS means a document assignment above. An assignment of type review does NOT mean extracted facts need verification: completing an assignment never accepts an extracted field, and accepting an extracted field never completes an assignment.
- Never infer an assignment from a notification, chat history, document metadata, a Sprint task, a document request or extraction review. Assignments come only from the assignment data provided.
- Say which responsibility level it is, in plain words, the first time it comes up in this conversation: review (they read it and note anything that looks wrong), action required (something must be done with it), FYI (reference only — nothing to complete). Do not invent a "seen", "acknowledged" or "read" state for FYI.
- When you describe what happens after an assignment, say the person is notified in Vision. Never claim an email or a push notification.

DATA PRIORITY:
1. Current page context
2. Canonical BIE recommendations (provided below)
3. Verified advisor-confirmed values
4. Advisor-reviewed document fields
5. Assessment results
6. Sprint/roadmap data
7. General AI reasoning — ONLY to fill gaps, always label as "general guidance"

EVIDENCE STATES (these are four DIFFERENT things — never collapse them):
- UNKNOWN: nothing was extracted and nothing was stated. Only then say the data is not available.
- EXTRACTED / UNREVIEWED: a document of this business yielded the figure and no human has reviewed it yet. It IS usable, and its state MUST be stated: "unverified document data, not yet reviewed". NEVER describe it as unavailable or missing, and NEVER call it confirmed or verified.
- CONFIRMED: an authorized human accepted or corrected it.
- VERIFIED: validated beyond ordinary human confirmation.
The rule in one line: pending != confirmed, confirmed != verified, extracted != verified.
A figure the owner has not reviewed is still a real answer to their question — say what it is AND say what it is not.

INTELLIGENCE LABELS (you MUST distinguish these in every answer):
- VERIFIED: "Based on your verified data..." — facts from BIE metrics, assessments, documents
- PROJECTED: "If this assumption holds..." — projections from canonical recommendations
- HYPOTHESIS: "One possibility worth validating is..." — AI-generated strategic hypotheses (provided below)
- ADVISOR-CONFIRMED: "Your advisor has confirmed..." — advisor overrides or confirmed strategies

AI STRATEGIC REASONING (you ARE encouraged to do this):
- Analyze relationships among verified metrics
- Detect patterns across assessments, documents, and outcomes
- Compare approved strategies for suitability
- Identify second-order and third-order effects
- Generate strategic hypotheses for review (clearly labeled as HYPOTHESIS)
- Explain tradeoffs among approved strategic paths
- Personalize recommendations to the business context
- Surface hypotheses from the provided hypothesis list
- Identify missing data that would materially improve confidence
- Surface anomalies and contradictions in the business data

AI MUST NOT:
- Create a new canonical recommendation
- Alter the BIE metric value or estimated impact
- Present a hypothesis as a verified recommendation
- Ignore contraindications or access controls
- Reveal proprietary implementation details to free users

RESPONSE RULES:
- Begin with source citation: "Based on your [canonical BIE recommendation / completed Tax Gap assessment / active sprint]..."
- If data is missing, say what's missing and what would help.
- For FREE users: 2-3 sentence answer. No implementation steps.
- For PAID users: full analysis with action steps and implementation detail.
- For "What should I focus on?" questions: reference the already-ranked canonical recommendations. Do NOT run a new analysis.
- Honor advisor overrides: suppressed recommendations must not be promoted. Deferred recommendations described as deferred. Confirmed strategies presented as confirmed.
- When surfacing hypotheses: clearly label as HYPOTHESIS, include evidence, assumptions, and suggested validation step. Never present as verified.
${pageCtxSection}
EXECUTION RULES:
- The platform uses 90-Day Sprints. Reference sprint items for progress.
- NEVER claim an outcome is "verified" unless explicitly stated in the data.
- source_type="sprint_item" = completed sprint task. source_type="sprint" = completed full sprint.

ALWAYS return valid JSON:
{
  "category": "next_best_action|tax|profit|valuation|cash_flow|operations|protection|wealth|roadmap|documents|sprint|outcomes|general",
  "answer": "Your answer text",
  "recommendation_key": "the canonical BIE recommendation key if applicable, or null",
  "supporting_sources": ["source label: data point used"],
  "missing_data": ["Any data that would improve this answer"],
  "recommended_next_step": "One specific actionable next step",
  "confidence_level": "high|medium|low",
  "is_data_driven": true,
  "source": "bie",
  "intelligence_labels": {
    "verified": ["statements backed by verified BIE data"],
    "projected": ["statements based on canonical projections"],
    "hypothesis": ["AI-generated hypotheses surfaced — clearly labeled"],
    "advisor_confirmed": ["advisor-confirmed statements"]
  },
  "hypotheses_surfaced": ["hypothesis_id of any hypothesis referenced, or empty array"],
  "gated_detail": "For paid users only — detailed implementation guidance or null"
}`;

    // The focused-document context is stated to the model EXPLICITLY, with the
    // prohibition that makes it exact: every figure below comes from THIS
    // document id, and no other document, year or business-wide figure may be
    // substituted for it. Pending findings are labelled unconfirmed in the data
    // itself, so they cannot be read as verified business truth.
    const focusedExtras = [
      focusedPeriodResolution
        ? `\nFOCUSED PERIOD RESOLUTION (the owner's question names ${focusedPeriodResolution.requested_fiscal_year}. Answer ONLY from that year. A key whose reason is NOT "resolved" has NO evidence for that year in this document: say so plainly and name the years that ARE available. NEVER reuse another year's figure for the year asked.):\n${JSON.stringify(focusedPeriodResolution, null, 2)}\n`
        : '',
      takeHome.applies
        ? `\nTAKE-HOME SEMANTICS (structured instruction — obey exactly):\n${JSON.stringify(takeHome, null, 2)}\n`
        : '',
    ].join('');

    const focusedContextBlock = focusedDocument?.available
      ? `\nFOCUSED DOCUMENT (the owner is asking about THIS document — every observation below is derived from this document id ONLY; never substitute another document, another year, the newest document, or the business's general figures for it; anything under unconfirmed_findings is an UNCONFIRMED document finding and must be described as not yet reviewed):\n${JSON.stringify(focusedDocument.focused_document, null, 2)}\n${focusedExtras}`
      : askedDocumentId
        ? `\nFOCUSED DOCUMENT: the owner asked about a document that is NOT available to them (reason: ${focusedDocument?.reason || 'unavailable'}). Do NOT substitute another document and do NOT answer as though you had read it. Say plainly that this document is not available to you, and name the next step.\n`
        : '';

    const userPrompt = `MEMBERSHIP: ${membershipStatus} (${isPaid ? 'show full detail' : 'brief answer only, no implementation steps'})
USER ROLE: ${userRole}

USER QUESTION: "${question}"

CANONICAL BIE RECOMMENDATIONS (ranked by priority — use these, do NOT create new ones):
${JSON.stringify(canonicalRecsSummary, null, 2)}

BUSINESS CONTEXT:
${JSON.stringify({
  ciq_score,
  assessments_completed: Object.keys(byType),
  assessments_missing: ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'recast_ebitda', 'freedom_assessment'].filter(t => !byType[t]),
  active_sprint: active_sprint ? { title: active_sprint.path_title, goal: active_sprint.path_goal, progress: active_sprint.progress_percent } : null,
  next_best_actions: nba_rows.slice(0, 5).map(a => ({ title: a.title, status: a.status, impact: a.estimated_impact, reason: a.reason })),
  documents: { total: doc_rows.length, completed: doc_rows.filter(d => d.upload_status === 'completed').length },
  advisor_notes_count: advisor_notes.length,
}, null, 2)}

${focusQuestion ? 'FOCUS QUESTION DETECTED: Reference the already-ranked canonical BIE recommendations above. Do NOT run a new analysis. The first recommendation is the highest priority.' : ''}

${recommendations.length === 0 ? 'NO CANONICAL RECOMMENDATIONS AVAILABLE: If the user asks for a recommendation, say "There is not enough verified intelligence yet to make a reliable recommendation." Identify what assessments or data are missing.' : ''}

${hypotheses.length > 0 ? `AI STRATEGIC HYPOTHESES (clearly label as HYPOTHESIS in your response — these are NOT verified recommendations):
${JSON.stringify(hypotheses.map(h => ({
  hypothesis_id: h.hypothesis_id,
  title: h.title,
  thesis: h.strategic_thesis,
  related_recommendation: h.related_recommendation_key,
  confidence: h.confidence,
  assumptions: h.assumptions,
  missing_info: h.missing_information,
  validation_step: h.suggested_validation_step,
  status: h.status,
  requires_advisor_review: h.requires_advisor_review,
})), null, 2)}` : ''}

${learningPatterns.length > 0 ? `LEARNING PATTERNS (from verified outcomes — use for context, label as PROJECTED):
${JSON.stringify(learningPatterns.map(p => ({
  strategy: p.strategy_name,
  learning: p.learning_summary,
  confidence: p.confidence,
  sample_size: p.sample_size,
  validation: p.advisor_validation_status,
})), null, 2)}` : ''}

${valuation_context?.available ? `\nVALUATION CONTEXT (Phase 13.4A — use this for valuation questions, respect access_context.client_safe_only):\n${JSON.stringify(valuation_context, null, 2)}\n` : ''}

${assignmentPromptBlock}
${focusedContextBlock}
${factualContract ? `\nFACTUAL ANSWER CONTRACT (decided by the server from this business's resolved evidence — obey the instruction field exactly):\n${JSON.stringify(evidenceFirst.prompt_block, null, 2)}\n` : ''}
${provisionalBlock && !factualContract ? `\nUNREVIEWED DOCUMENT EVIDENCE (the owner's own uploaded documents; structured — obey the instruction field exactly, quote the value, name the source and the period, and state that it is not yet reviewed):\n${JSON.stringify(provisionalBlock, null, 2)}\n` : ''}
${extractionSummary ? `\nEXTRACTION SUMMARY (derived from persisted rows — use these EXACT counts and these EXACT field names; never a count you infer, never a field list you invent):\n${JSON.stringify(extractionSummary, null, 2)}\n` : ''}
Answer using ONLY the canonical recommendations and context above. Return valid JSON.`;

    // A document-assignment answer is already fully determined by real records,
    // so it never consults the model: a slow or unavailable model cannot delay
    // it, alter it, or fail it. That is also why an assignment question can never
    // be answered by invention. Every other question keeps the existing path.
    let llmResponse: any = assignmentLayer?.answer
      ? {
          category: 'documents',
          answer: assignmentLayer.answer,
          recommendation_key: null,
          supporting_sources: ['Document assignments in this business (document_assignments)'],
          missing_data: [],
          recommended_next_step: null,
          confidence_level: 'high',
          is_data_driven: true,
          source: 'document_assignments',
          intelligence_labels: { verified: [], projected: [], hypothesis: [], advisor_confirmed: [] },
          hypotheses_surfaced: [],
          gated_detail: null,
        }
      : null;
    let llm_error: string | null = null;

    if (OPENROUTER_KEY && !llmResponse) {
      try {
        const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.15,
            response_format: { type: 'json_object' },
          }),
        });
        const llmData = await llmRes.json();
        const rawResp = llmData.choices?.[0]?.message?.content;
        if (rawResp) {
          const parsed = JSON.parse(rawResp);
          if (parsed && typeof parsed === 'object') llmResponse = parsed;
        }
      } catch (e: any) {
        llm_error = e.message;
        console.error('[askGalileo] LLM failed:', e.message);
      }
    }

    // ── 6. Fallback: rule-based answer using canonical recommendations ──────
    if (!llmResponse) {
      const topRec = recommendations[0];
      const topNBA = nba_rows[0];

      let answer = '';
      let recKey = null;
      let category = 'general';

      if (recommendations.length === 0) {
        answer = 'There is not enough verified intelligence yet to make a reliable recommendation. Complete your assessments to unlock canonical recommendations.';
        category = 'general';
      } else if (focusQuestion) {
        answer = `Your highest priority is: "${topRec.title}" (${topRec.formatted}). This is a canonical BIE recommendation with ${topRec.confidence}% confidence. ${topRec.relatedSprint ? `Start by completing the ${topRec.title} assessment.` : ''}`;
        recKey = topRec.recommendation_key;
        category = topRec.category;
      } else if (/tax/i.test(question)) {
        const taxRec = recommendations.find(r => r.category === 'tax');
        if (taxRec) {
          answer = `Based on your Tax Gap assessment, ${taxRec.formatted} in annual tax savings is available. This is a canonical BIE recommendation.`;
          recKey = taxRec.recommendation_key;
          category = 'tax';
        }
      } else if (/profit/i.test(question)) {
        const profitRec = recommendations.find(r => r.category === 'profit');
        if (profitRec) {
          answer = `Your Profit Gap assessment identified ${profitRec.formatted} in uncaptured profit. This is a canonical BIE recommendation.`;
          recKey = profitRec.recommendation_key;
          category = 'profit';
        }
      } else if (/value|valuation/i.test(question)) {
        const valueRec = recommendations.find(r => r.category === 'value');
        if (valueRec) {
          answer = `Your Value Gap assessment identified ${valueRec.formatted} in potential value improvement. This is a canonical BIE recommendation.`;
          recKey = valueRec.recommendation_key;
          category = 'valuation';
        }
      }

      if (!answer) {
        answer = topRec
          ? `Based on your business intelligence, your top recommendation is: "${topRec.title}" (${topRec.formatted}). This is a canonical BIE recommendation with ${topRec.confidence}% confidence.`
          : 'Complete your assessments to get personalized strategic insights.';
        recKey = topRec?.recommendation_key || null;
        category = topRec?.category || 'general';
      }

      llmResponse = {
        category,
        answer,
        recommendation_key: recKey,
        supporting_sources: [
          ciq_score && `CIQ Score: ${ciq_score}`,
          recommendations.length > 0 && `${recommendations.length} canonical BIE recommendations available`,
          doc_rows.length > 0 && `${doc_rows.length} documents uploaded`,
        ].filter(Boolean),
        missing_data: [
          !raw?.revenue && 'Revenue data not available',
          recommendations.length === 0 && 'No canonical recommendations — complete assessments',
        ].filter(Boolean),
        recommended_next_step: topNBA?.title || topRec?.relatedSprint?.label || 'Complete remaining assessments',
        confidence_level: recommendations.length > 0 ? 'medium' : 'low',
        is_data_driven: recommendations.length > 0,
        source: 'bie',
        gated_detail: null,
        _fallback: true,
        _llm_error: llm_error,
      };
    }

    // Ensure source = "bie" on all responses
    if (!llmResponse.source) llmResponse.source = 'bie';

    // ── 6c. VERIFICATION IS SERVER-DERIVED, NEVER SELF-AWARDED (§13) ─────────
    // The model may describe which sources it used; it may NOT decide that an
    // answer is VERIFIED. Canonical VERIFIED is earned only by evidence whose own
    // verification semantics say so. The model's own "verified" label is cleared
    // unless the evidence behind the answer canonically earns it — so an answer
    // built from nothing (or from document metadata alone) can never read as
    // verified, and CONFIRMED is never promoted to VERIFIED.
    const answerEvidenceState = deriveAnswerVerification({
      documentGrounded: !!focusedDocument?.available,
      usedObservations: focusedDocument?.available ? focusedDocument.focused_document.semantic_observations : [],
      // §3/§9 — an answer built on UNREVIEWED document evidence HAS support. It is
      // document evidence, never canonical truth, and never "no supporting data".
      usedProvisional: !!evidenceResolution?.used,
    });
    // The rule itself lives in ONE shared, executable place (focusedDocument.ts),
    // so it is proved by running it rather than by reading its source shape.
    applyAnswerLabels(llmResponse, answerEvidenceState);

    // §10 — the server's own reading of what supported the answer, applied AFTER
    // the verified-label rule. An answer that used provisional evidence cannot keep
    // a "missing" claim about a metric it just answered.
    // A factual question is owned by the evidence-first contract; the older lane's
    // annotations would compete with it, so they apply only to other questions.
    if (!factualContract) applyProvisionalEvidence(llmResponse, evidenceResolution);

    // ── 6b. A DETERMINISTIC ASSIGNMENT ANSWER OVERRIDES THE PROSE ────────────
    // Counts, names and statuses here come from document_assignments and this
    // business's roster, so the model cannot invent one. The structured payload
    // carries the authoritative ids the answer surface renders and, for a change,
    // the proposal the owner confirms — askGalileo itself writes nothing.
    if (assignmentLayer?.answer) {
      llmResponse.answer = assignmentLayer.answer;
      llmResponse.assignment = assignmentLayer.assignment;
      llmResponse.is_data_driven = true;
      llmResponse.source = 'document_assignments';
      llmResponse.confidence_level = 'high';
      llmResponse.supporting_sources = Array.from(
        new Set([
          ...(llmResponse.supporting_sources || []),
          'Document assignments in this business (document_assignments)',
        ])
      );
      if (!llmResponse.category) llmResponse.category = 'documents';
    }

    // ── 6d. THE EVIDENCE-STATE CONTRACT FOR A DIRECT METRIC QUESTION (§P6/§P8/§P9)
    // The server knows whether the state is CONFIRMED, PROVISIONAL, PERIOD-CHOICE,
    // CONFLICTED or UNAVAILABLE, and the model may not overwrite it: a provisional
    // or period-choice answer can never be delivered as "no supporting data" or
    // "missing", and a projected opportunity can never stand in for a historical
    // figure. Placed last so nothing downstream can replace the server's own line.
    if (!factualContract) {
      applyHistoricalEvidenceContract(llmResponse, {
        question,
        askedKeys: evidenceResolution?.asked_keys || [],
        resolution: evidenceResolution,
        historical: historicalIntent,
        requestedFiscalYear,
      });
    }

    // ── 6e. THE CONTRACT HAS THE LAST WORD (6D.0c.2) ─────────────────────────
    // For a factual question: first block, state, labels, missing list, sources
    // and next step all come from the contract. For any other question: a known
    // metric may still never be called missing or requested as a next step.
    finalizeEvidenceFirstAnswer(llmResponse, evidenceFirst);

    // Apply gating for free users
    if (!isPaid) {
      const gatedDetail = llmResponse.gated_detail;
      llmResponse.gated_detail = null;
      llmResponse._gated_detail_available = !!gatedDetail;
      llmResponse._is_gated = true;
    }

    // ── 7. Store conversation ─────────────────────────────────────────────────
    const now = new Date().toISOString();
    const conversationMessage = {
      role_user: question,
      role_assistant: llmResponse.answer,
      category: llmResponse.category,
      confidence: llmResponse.confidence_level,
      recommendation_key: llmResponse.recommendation_key || null,
      source: 'bie',
      timestamp: now,
    };

    // ── Phase 13.4A.2: Five-field conversation scoping ──────────────────────
    // Scope: profile_id + business_id + valuation_id + conversation_mode + visibility_scope
    // Mismatched conversations are not reused — a new scoped conversation is created.
    const vis_scope = valuation_context?.access_context?.client_safe_only ? 'client_safe' : 'internal';
    const conv_mode = conversation_mode || (valuation_id ? 'valuation_advisor' : 'general');

    try {
      if (conversation_id) {
        // Verify scope match before reusing
        const { data: existing } = await sb.from('galileo_conversations')
          .select('messages, business_id, valuation_id, conversation_mode, visibility_scope')
          .eq('id', conversation_id).maybeSingle();
        if (existing) {
          const scopeMatch = existing.business_id === businessId &&
            (existing.valuation_id || null) === (valuation_id || null) &&
            (existing.conversation_mode || 'general') === conv_mode &&
            (existing.visibility_scope || 'internal') === vis_scope;
          if (scopeMatch) {
            await sb.from('galileo_conversations').update({ messages: [...(existing.messages || []), conversationMessage], updated_at: now }).eq('id', conversation_id);
          } else {
            // Scope mismatch — create new scoped conversation
            const { data: newConv } = await sb.from('galileo_conversations').insert({ profile_id: profileId, business_id: businessId, valuation_id: valuation_id || null, conversation_mode: conv_mode, visibility_scope: vis_scope, messages: [conversationMessage], created_at: now, updated_at: now }).select('id').single();
            if (newConv) conversation_id = newConv.id;
          }
        } else {
          const { data: newConv } = await sb.from('galileo_conversations').insert({ profile_id: profileId, business_id: businessId, valuation_id: valuation_id || null, conversation_mode: conv_mode, visibility_scope: vis_scope, messages: [conversationMessage], created_at: now, updated_at: now }).select('id').single();
          if (newConv) conversation_id = newConv.id;
        }
      } else {
        // Look for a matching conversation by scope
        let matchQuery = sb.from('galileo_conversations').select('id, messages').eq('profile_id', profileId).eq('business_id', businessId);
        if (valuation_id) { matchQuery = matchQuery.eq('valuation_id', valuation_id); } else { matchQuery = matchQuery.is('valuation_id', null); }
        matchQuery = matchQuery.eq('conversation_mode', conv_mode).eq('visibility_scope', vis_scope).order('updated_at', { ascending: false }).limit(1);
        const { data: existing } = await matchQuery.maybeSingle();
        if (existing) {
          await sb.from('galileo_conversations').update({ messages: [...(existing.messages || []), conversationMessage], updated_at: now }).eq('id', existing.id);
          conversation_id = existing.id;
        } else {
          const { data: newConv } = await sb.from('galileo_conversations').insert({ profile_id: profileId, business_id: businessId, valuation_id: valuation_id || null, conversation_mode: conv_mode, visibility_scope: vis_scope, messages: [conversationMessage], created_at: now, updated_at: now }).select('id').single();
          if (newConv) conversation_id = newConv.id;
        }
      }
    } catch (convErr) {
      // Phase 13.4A.2: Migration is live — scope columns exist.
      // Do NOT fall back to unscoped insert (would bypass five-field scoping).
      // If the scoped insert fails, conversation_id remains null (no persistence).
      // This is safer than creating an unscoped conversation that could
      // cross-contaminate business/valuation context.
      console.warn('[askGalileo] Scoped conversation storage failed (non-fatal):', convErr?.message || convErr);
    }

    return Response.json({
      response: llmResponse,
      conversation_id: conversation_id || null,
      membership_status: membershipStatus,
      is_gated: !isPaid,
      canonical_recommendations_count: recommendations.length,
      focused_document: focusedDocument?.available ? focusedDocument.focused_document : null,
      focused_document_state: focusedDocument?.available
        ? focusedDocument.focused_document.processing_state
        : (askedDocumentId ? (focusedDocument?.reason || 'unavailable') : null),
      evidence_state: llmResponse.evidence_state || null,
      // §3/§9/§10/§14 — the provisional lane's server-derived state: which metrics
      // came from UNREVIEWED documents, the exact source document behind each, the
      // precedence that decided the answer, and the review CTA bound to the exact
      // document id. The client renders this; it never re-derives any of it.
      provisional_evidence: llmResponse.provisional_evidence || null,
      // §P6/§P8 — the server's own reading of a direct metric question: which state
      // the evidence was in, and whether a projection was blocked from answering it.
      historical_metric: llmResponse.historical_metric || null,
      // 6D.0c.2 — the factual answer contract (client-safe): resolution state,
      // labels, exact sources, missing list and next step. The surface renders it.
      factual_answer: llmResponse.factual_answer || null,
      evidence_precedence: evidenceResolution
        ? {
            precedence: evidenceResolution.precedence,
            asked_keys: evidenceResolution.asked_keys,
            canonical_keys: evidenceResolution.canonical_keys,
            provisional_keys: evidenceResolution.used_keys,
            ambiguous_period_keys: evidenceResolution.ambiguous_keys,
            conflict_keys: evidenceResolution.conflict_keys,
            unavailable_keys: evidenceResolution.unavailable_keys,
            present_keys: evidenceResolution.present_keys,
          }
        : null,
      // §11/§12/§13 — extraction awareness, derived from persisted rows.
      extraction_awareness: extractionAwareness,
      extraction_summary: extractionSummary,
      extraction_notice: extractionNotice,
      // The CTA is the provisional lane's own, carrying the EXACT document id the
      // evidence came from (§14) — forwarded, never rebuilt here.
      review_action: llmResponse.provisional_evidence?.review_action || null,
      // Structured, server-derived semantics the answer surface can rely on:
      // the period resolution for the year the owner named, and the declared
      // ambiguity of "take home". Neither is ever inferred on the client.
      focused_period_resolution: focusedPeriodResolution,
      take_home_semantics: takeHome.applies ? takeHome : null,
      context_quality: {
        ciq_score,
        canonical_recommendations: recommendations.length,
        assessments_completed: Object.keys(byType).length,
        documents_uploaded: doc_rows.length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});