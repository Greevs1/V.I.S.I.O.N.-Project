/**
 * SprintExpertPanel — the destination of a blue expert-role pill.
 *
 * ONE surface, TWO doors (Parts 5, 6, 7, 23, 24, 26):
 *
 *   ENTITLED      → Expert Task Brief (task · why · intelligence · outcome ·
 *                    your team) and then straight into the real Expert ecosystem.
 *                    No sales messaging: they already have access.
 *   NOT ENTITLED  → Expert Support Preview: why the expertise matters, what
 *                    someone in that seat would get done, what to prepare, and
 *                    then the existing /strategy-call access path.
 *
 * The door is chosen ONLY by `resolveExpertAccess` — never by the click, never by
 * a relationship record, never by a query parameter.
 *
 * CONTINUITY: this panel is mounted BY the Sprint, so closing it (Escape, the
 * back control, or the backdrop) returns to the same Sprint with the same task
 * context. Entering the ecosystem uses the workspace layer, so Back steps back
 * to this Sprint rather than dumping the owner on Home.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight, Loader2, UserCheck, Users } from 'lucide-react';

import { useAuth } from '@/lib/AuthContext';
import { useMembership } from '@/lib/useMembership';
import { useBusinessContext } from '@/lib/BusinessContext';
import { useAdvisorRelationship } from '@/hooks/useAdvisorRelationship';
import { useBusinessIntelligenceContract } from '@/hooks/useBusinessIntelligenceContract';
import { ExpertAccessState, resolveExpertAccess } from '@/lib/galileo/expertAccess';
import {
  buildExpertHandoff,
  buildPrepChecklist,
  relevantFacts,
  sameExpertise,
  taskContextText,
} from '@/lib/galileo/expertTaskBrief';

import ExpertTaskBrief from './ExpertTaskBrief';
import ExpertSupportPreview from './ExpertSupportPreview';
import ExpertPrepChecklist from './ExpertPrepChecklist';
import ExpertAskGalileo from './ExpertAskGalileo';

export default function SprintExpertPanel({
  task,
  sprint,
  subtasks = [],
  documentCount = 0,
  onOpen,
  onClose,
}) {
  const { role, supabaseProfile, isLoadingProfile } = useAuth();
  const membership = useMembership();
  const { context, bisVersion } = useBusinessContext();
  const businessId = context?.active_business_id || null;

  const advisor = useAdvisorRelationship(businessId);
  const { data: contract } = useBusinessIntelligenceContract(businessId, bisVersion);

  const requestedRole = task?.recommended_expert_type || null;
  // Entitlement is UNRESOLVED until the profile that carries the tier has loaded.
  // That is not entitlement: the panel waits instead of choosing a door.
  const pending = !!isLoadingProfile && !supabaseProfile;

  const access = useMemo(
    () => resolveExpertAccess({ requestedRole, role, membership, advisor, pending }),
    [requestedRole, role, membership.isPaid, membership.tier, advisor, pending]
  );

  const facts = useMemo(() => relevantFacts(contract, requestedRole), [contract, requestedRole]);
  const prep = useMemo(() => buildPrepChecklist(contract), [contract]);
  const askContext = useMemo(
    () =>
      taskContextText({
        task,
        requestedRole,
        sprintTitle: sprint?.path_title,
        businessName: sprint?.business_name,
      }),
    [task, requestedRole, sprint?.path_title, sprint?.business_name]
  );

  const handoff = useMemo(
    () => buildExpertHandoff({ task, sprint, requestedRole, advisor, businessId }),
    [task, sprint, requestedRole, advisor, businessId]
  );

  // ── Business isolation (Part 29) ─────────────────────────────────────────
  // A switch to business B must not leave A's task, role, advisor or brief on
  // screen. The task row carries its business; when it no longer matches the
  // canonical active business, this surface closes itself.
  const taskBusinessId = task?.business_id || null;
  useEffect(() => {
    if (taskBusinessId && businessId && taskBusinessId !== businessId) onClose?.();
  }, [taskBusinessId, businessId, onClose]);

  // ── Focus + Escape (Part 24) ─────────────────────────────────────────────
  // data-state="open" makes the Vision workspace behind us yield Escape to this
  // surface, so the first Escape closes the expert surface and the Sprint stays.
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const target = restoreFocusRef.current;
      if (target && typeof target.focus === 'function' && document.contains(target)) target.focus();
    };
  }, []);

  // ── The two doors ────────────────────────────────────────────────────────
  const enterExpertEcosystem = () => {
    // The RAW requested role travels with the owner. ExpertNetwork applies its
    // existing specialty filter only when the role is a real taxonomy value.
    if (onOpen) onOpen('expert-network', requestedRole);
    else if (requestedRole) {
      window.location.href = `/expert-network?tab=find&expertise=${encodeURIComponent(requestedRole)}`;
    } else {
      window.location.href = '/expert-network?tab=find';
    }
  };

  const exploreExpertSupport = () => {
    // Sales/contextual information only. It authorizes nothing: entitlement and
    // access stay server-side and are decided by the account.
    const params = new URLSearchParams({ source: 'sprint_expert_recommendation' });
    if (requestedRole) params.set('role', requestedRole);
    if (task?.title) params.set('task', task.title);
    if (task?.id) params.set('sprint_task_id', task.id);
    if (businessId) params.set('business_id', businessId);
    window.location.href = `/strategy-call?${params.toString()}`;
  };

  const advisorRow = access.relationship.advisor;
  const advisorMatchesTask = sameExpertise(advisorRow?.role, requestedRole);
  const entitled = access.hasExpertAccess;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      data-state="open"
      aria-modal="true"
      aria-labelledby="sprint-expert-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose?.();
        }
      }}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/70 p-0 outline-none backdrop-blur-[3px] sm:p-6"
    >
      <div className="relative h-fit w-full max-w-[900px] rounded-none vision-glass-raised vision-sheen sm:rounded-2xl">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 md:px-7">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-white/45 transition-colors hover:text-white/80 vision-focus"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to 90-Day Sprint
            </button>
            <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-vision-gold/70">
              {entitled ? 'Expert Task Brief' : 'Expert Support'}
            </p>
            <h2 id="sprint-expert-title" className="mt-1 text-[17px] font-medium text-white/90">
              {task?.title || 'Sprint task'}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {requestedRole && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
                  <UserCheck className="h-3 w-3" aria-hidden="true" />
                  {requestedRole}
                </span>
              )}
              {documentCount > 0 && (
                <span className="text-[11px] text-white/35">
                  {documentCount} document{documentCount === 1 ? '' : 's'} attached
                </span>
              )}
              {handoff.sprint_id && <span className="text-[11px] text-white/25">90-Day Sprint</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close expert support"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] leading-none text-white/35 transition-colors hover:text-white/80 vision-focus"
          >
            ×
          </button>
        </header>

        {/* Body */}
        <div className="space-y-6 px-5 py-6 md:px-7">
          {pending ? (
            <div className="flex items-center gap-2.5 py-6 text-[12.5px] text-white/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Checking your expert access.
            </div>
          ) : (
            <>
              {entitled ? (
                <ExpertTaskBrief handoff={handoff} facts={facts} />
              ) : (
                <ExpertSupportPreview handoff={handoff} subtasks={subtasks} />
              )}

              <ExpertPrepChecklist items={prep} roleLabel={requestedRole} />

              <ExpertAskGalileo contextText={askContext} roleLabel={requestedRole} />
            </>
          )}
        </div>

        {/* The access moment — value first, always after it. */}
        {!pending && (
          <footer className="border-t border-white/[0.06] px-5 py-5 md:px-7">
            {entitled ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  {advisorRow?.name ? (
                    <>
                      <p className="flex items-center gap-2 text-[13px] text-white/80">
                        <Users className="h-3.5 w-3.5 text-vision-champagne/70" aria-hidden="true" />
                        {advisorRow.name}
                        {advisorRow.role && <span className="text-white/40">· {advisorRow.role}</span>}
                      </p>
                      <p className="mt-1 text-[11.5px] text-white/40">
                        {advisorMatchesTask
                          ? 'Vision has prepared the context for this task.'
                          : `This task needs ${requestedRole}. ${advisorRow.name.split(' ')[0]} is your ${advisorRow.role}.`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] text-white/80">
                        {access.accessState === ExpertAccessState.INTERNAL_OVERRIDE
                          ? 'Internal expert access'
                          : 'Expert support is included in your plan'}
                      </p>
                      {requestedRole && (
                        <p className="mt-1 text-[11.5px] text-white/40">
                          Recommended expertise: {requestedRole}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={enterExpertEcosystem}
                  className="inline-flex items-center gap-2 rounded-full bg-vision-gold px-5 py-2.5 text-[12.5px] font-semibold text-black transition-colors hover:bg-vision-bright vision-focus"
                >
                  {advisorRow?.name && advisorMatchesTask
                    ? 'Continue with your team'
                    : requestedRole
                      ? `Find ${requestedRole} expertise`
                      : 'Find an Expert'}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] text-white/80">Want hands-on help?</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">
                    Work with specialists who can see the same business context Galileo is using, and
                    carry this task forward with you.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exploreExpertSupport}
                  className="inline-flex items-center gap-2 rounded-full bg-vision-gold px-5 py-2.5 text-[12.5px] font-semibold text-black transition-colors hover:bg-vision-bright vision-focus"
                >
                  Explore Expert Support
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}