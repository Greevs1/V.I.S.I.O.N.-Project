/**
 * GalileoDocumentOverlay — THE place documents live inside Galileo (Global Rule #1).
 *
 * The owner never leaves Vision to manage files. Galileo asks for evidence, the
 * owner supplies it, Galileo reads it, the owner confirms it — and closing the
 * overlay returns them to exactly the context they were in, because the Vision
 * workspace layer owns the return (see useVisionWorkspace: closing returns to
 * the surface underneath, and the trail drives Back).
 *
 * IT IS A SHELL. Every capability inside it is the EXISTING implementation:
 *   · library / list / filters / folders / processing state / review tab /
 *     viewer  → the real Data Room page (src/pages/DataRoom.jsx)
 *   · upload / upload progress / save-progress → the real uploader
 *     (src/pages/DocumentUpload.jsx)
 *   · review panel → the real ExtractedFieldsReviewQueue, reached through the
 *     Data Room's Review tab
 * Nothing is reimplemented, and the security behaviour is untouched: the Data
 * Room still resolves documents against the ACTIVE BUSINESS, so an id belonging
 * to another business fails closed (Part 34).
 *
 * HOW THE VIEW IS CHOSEN — always from the URL, so Back/refresh work:
 *   ?workspace=data-room                 → the owner's document library
 *   ?workspace=data-room&mode=upload     → the existing uploader, with the
 *                                          contextual intent Galileo asked for
 *   ?workspace=data-room&id=<documentId> → that exact document in the viewer
 *   ?workspace=data-room&tab=review      → the review panel
 *   ?needs=<plain request>               → the sentence above the uploader
 */

import React, { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import DataRoom from '@/pages/DataRoom';
import DocumentUpload from '@/pages/DocumentUpload';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { uploadIntentCopy } from '@/lib/galileo/uploadIntent';

export default function GalileoDocumentOverlay({ payload, onOpen, onBack, onReplace }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, supabaseProfile, activeContext } = useAuth();

  const mode = searchParams.get('mode');
  const needs = searchParams.get('needs');
  const tab = searchParams.get('tab') || 'dataroom';
  const requestedDocumentId = payload || null;

  const isUpload = mode === 'upload' && !requestedDocumentId;
  const intent = useMemo(() => (needs ? uploadIntentCopy(needs) : null), [needs]);

  const businessId =
    activeContext?.businessId || supabaseProfile?.primary_business_id || null;

  // Leave upload mode and land on the review queue — the same tab the Data Room
  // already exposes. The panel is the existing one, and the LEVEL is swapped
  // rather than stacked: the uploader the owner has just finished with is not a
  // room worth walking back into, so Back from the review list still means the
  // Data Room. (A contextual upload swops within its own single level, so Back
  // there still returns to What If.)
  const goToReview = useCallback(() => {
    if (onReplace) {
      onReplace('data-room', null, { tab: 'review' });
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete('mode');
    params.delete('needs');
    params.set('tab', 'review');
    setSearchParams(params);
  }, [onReplace, setSearchParams]);

  return (
    <div className="min-h-full">
      {/* ── The Galileo header ────────────────────────────────────────────────
          Contextual title, and — when Vision asked for something — the request
          in Vision's own words, above the unchanged uploader. */}
      <div className="border-b border-white/[0.06] px-5 pb-5 pt-6 md:px-8">
        <div className="flex items-center gap-2">
          {isUpload ? (
            <FileText className="h-3.5 w-3.5 text-vision-gold/70" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-vision-gold/70" />
          )}
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-vision-gold/80">
            {isUpload ? 'Evidence' : 'Data Room'}
          </p>
        </div>

        <h2 className="mt-2 font-display text-[22px] leading-tight text-white/90">
          {isUpload
            ? intent?.headline || 'Add a financial document'
            : requestedDocumentId
              ? 'Evidence'
              : 'Your documents'}
        </h2>

        <p className="mt-1.5 max-w-[660px] text-[13px] leading-relaxed text-white/50">
          {isUpload
            ? intent?.body ||
              'Vision reads it, shows you what it found, and nothing joins your business intelligence until you confirm it.'
            : 'Everything Vision has read for this business. Open any document to see the original.'}
        </p>

        {isUpload && intent?.suggestions?.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Good options</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
              {intent.suggestions.map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5 text-[12.5px] text-white/60">
                  <span className="h-1 w-1 rounded-full bg-vision-gold/60" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {isUpload ? (
        <UploadView businessId={businessId} onReview={goToReview} role={role} />
      ) : (
        // The EXISTING Data Room surface — list, folders, readiness, processing
        // state, review tab and the document viewer all unchanged. Keyed by tab
        // so a tab change (and the review deep link) mounts the right view.
        //
        // It is handed the layer's navigation because the Data Room OWNS LEVELS
        // of the stack: its uploader, its document viewer and its Review tab are
        // rooms inside this one, so Back walks out of them one at a time instead
        // of throwing the owner out of Vision.
        <DataRoom key={tab} onOpenLayer={onOpen} onBackLayer={onBack} />
      )}
    </div>
  );
}

/**
 * UploadView — the existing uploader, plus the real result of what Vision read.
 *
 * The counts come from the same server-computed review summary the Data Room
 * uses, so "I found 14 pieces, 11 need your confirmation" is never invented.
 * Polling stops as soon as there is something to review.
 */
function UploadView({ businessId, onReview, role }) {
  const { data: summary } = useQuery({
    queryKey: ['extraction-review-summary', businessId, role],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getExtractionReviewSummary',
        data: { businessId },
      });
      return res.data || null;
    },
    staleTime: 10_000,
    // Extraction is genuinely asynchronous: keep checking while there is nothing
    // to review yet, then stop.
    refetchInterval: (query) => (query.state.data?.totals?.total > 0 ? false : 8000),
  });

  const totals = summary?.totals || null;
  const hasFindings = totals && totals.total > 0;

  return (
    <div>
      {hasFindings && (
        <div className="mx-5 mt-5 rounded-xl border border-vision-gold/20 bg-vision-gold/[0.04] px-5 py-4 md:mx-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-vision-gold/85">
            I found {totals.total} {totals.total === 1 ? 'piece' : 'pieces'} of financial information
          </p>
          <p className="mt-2 text-[14px] text-white/85">
            {totals.needs_review > 0
              ? `${totals.needs_review} need your confirmation.${totals.ready > 0 ? ` ${totals.ready} ${totals.ready === 1 ? 'is' : 'are'} already confirmed and in use.` : ''}`
              : 'All confirmed and in use across Business Intelligence.'}
          </p>
          {totals.needs_review > 0 && (
            <button
              type="button"
              onClick={onReview}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-vision-gold px-4 py-2 text-[12.5px] font-medium text-black transition-colors hover:bg-vision-bright vision-focus"
            >
              Review what I found
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* The existing uploader, untouched. */}
      <DocumentUpload />
    </div>
  );
}