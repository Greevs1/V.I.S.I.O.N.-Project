import React from 'react';
import { Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useOpenDocument } from '@/lib/visionWorkspace/openDocument';

/**
 * GalileoBadge — "where did this number come from?"
 *
 * Renders the source of an auto-populated value. The visual is unchanged, but
 * when the caller passes the DOCUMENT the value came from, the badge becomes a
 * way to the original: click → the exact document, in the existing Data Room
 * viewer (@/lib/visionWorkspace/openDocument).
 *
 * A source is only clickable when a real document id was supplied. A figure with
 * no document behind it keeps stating its source and opens nothing — the badge
 * never implies evidence that does not exist.
 */
export default function GalileoBadge({ source, document = null }) {
  const openDocument = useOpenDocument();
  if (!source) return null;

  const documentId = document?.document_id || document?.id || null;
  const documentName = document?.name || null;

  // A value still awaiting review is NOT governed truth, and must not be shown as
  // if it were. The badge says so plainly rather than only naming a source. It
  // stays clickable: the source document is exactly where the owner confirms it.
  const needsReview = document?.review_status === 'pending_review';
  const period = document?.year ? ` (${document.year})` : '';

  const iconClass = needsReview
    ? 'w-3.5 h-3.5 text-amber-400/80 hover:text-amber-300 transition-colors'
    : 'w-3.5 h-3.5 text-primary/70 hover:text-primary transition-colors';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {documentId ? (
            <button
              type="button"
              onClick={() => openDocument(documentId)}
              aria-label={`Open source document${documentName ? `: ${documentName}` : ''}`}
              className="inline-flex cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Sparkles className={iconClass} />
            </button>
          ) : (
            <span className="inline-flex cursor-pointer">
              <Sparkles className={iconClass} />
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {documentId ? (
            <>
              {documentName ? `From: ${documentName}${period}` : source}
              {needsReview && (
                <span className="block text-amber-400">
                  Extracted, not yet confirmed — review it in the Data Room
                </span>
              )}
              <span className="block opacity-70">Click to open the document</span>
            </>
          ) : (
            source
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}