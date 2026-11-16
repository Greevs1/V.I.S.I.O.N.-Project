import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAskGalileo } from '@/hooks/useAskGalileo';

/**
 * AskAboutThisDocument — ask about THIS document, and no other.
 *
 * The exact document is bound through the EXISTING focused-record contract:
 * `useAskGalileo({ focus: { type: 'document', id } })` sends askGalileo's own
 * `focused_record_type` / `focused_record_id`. Nothing here re-describes the
 * document, resolves it again, or substitutes another one — so the protections
 * already built into the focused-document path are the ones doing the work.
 *
 * The answer states which document it was grounded in, taken from the server's
 * own `focused_document`. If that disagrees with this viewer's document, the
 * answer is not shown as belonging to it.
 */
export default function AskAboutThisDocument({ document }) {
  const { ask, answer, error, loading } = useAskGalileo({ focus: { type: 'document', id: document?.id } });

  if (!document?.id) return null;

  const groundedInThisDocument =
    !answer?.focusedDocument?.id || String(answer.focusedDocument.id) === String(document.id);

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-xs"
        disabled={loading}
        onClick={() => ask('What does this document tell you about this business?')}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        Ask Galileo about this document
      </Button>

      {error && <p className="text-[11px] text-amber-400 leading-relaxed">{error}</p>}

      {answer && groundedInThisDocument && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">Galileo</p>
          <p className="text-xs leading-relaxed text-foreground/90">{answer.text}</p>
          {answer.missingData?.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Missing: {answer.missingData.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}