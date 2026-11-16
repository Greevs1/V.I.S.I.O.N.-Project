import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readDocument } from '@/lib/documents/formatReader';
import SpreadsheetViewer from '@/components/documents/viewers/SpreadsheetViewer';
import DocxViewer from '@/components/documents/viewers/DocxViewer';
import FormatUnavailablePanel from '@/components/documents/viewers/FormatUnavailablePanel';

/**
 * ReadOnlyDocumentView — the READ half of the document experience.
 *
 * It reads the document's bytes over the SHORT-LIVED SIGNED URL the authorized
 * backend already minted for this actor, and never over a public or persisted
 * URL. The bytes reach a parser and nothing else: nothing is uploaded, nothing
 * is written back, and the source object is untouched by definition.
 *
 * FORMAT IS DECIDED FROM THE BYTES FIRST. A workbook saved as .txt, or a PDF
 * named .doc, is read for what it IS. The extension only decides the fast path:
 * a PDF or an image never downloads bytes at all, because the browser can show
 * it directly.
 *
 * VIEWING AND EXTRACTION ARE INDEPENDENT. A file VISION cannot draw still says
 * so honestly, and still reports what VISION has already read from it.
 */
export default function ReadOnlyDocumentView({ url, name, evidenceTotal = 0, onDownload }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('fetch_failed');
        const bytes = new Uint8Array(await res.arrayBuffer());
        const model = await readDocument({ name, bytes });
        if (!cancelled) setState({ status: 'ready', model });
      } catch (err) {
        // A fetch failure is a LOAD failure, not a verdict about the format:
        // the two are never collapsed into one message.
        if (!cancelled) setState({ status: 'unreachable' });
      }
    })();

    return () => { cancelled = true; };
  }, [url, name]);

  if (state.status === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Reading document…</p>
      </div>
    );
  }

  if (state.status === 'unreachable') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <p className="text-sm text-muted-foreground mb-3">This document could not be opened just now.</p>
        <Button variant="outline" size="sm" onClick={() => setState({ status: 'loading' })} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </Button>
      </div>
    );
  }

  const model = state.model;

  // Content said PDF or image, even though the name did not.
  if (model.ok && model.native) {
    return model.format === 'pdf'
      ? <iframe src={url} className="w-full h-full border-0 bg-white" title={name || 'Document'} />
      : (
        <div className="w-full h-full flex items-center justify-center p-6">
          <img src={url} alt={name || 'Document'} className="w-full h-full object-contain" />
        </div>
      );
  }

  if (!model.ok) {
    return <FormatUnavailablePanel reason={model.reason} evidenceTotal={evidenceTotal} onDownload={onDownload} />;
  }

  if (model.workbook) return <SpreadsheetViewer workbook={model.workbook} />;
  if (model.document?.blocks) return <DocxViewer blocks={model.document.blocks} />;

  if (typeof model.text === 'string') {
    return (
      <div className="w-full h-full overflow-auto p-6 bg-neutral-900">
        <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words max-w-4xl mx-auto">
          {model.text}
        </pre>
      </div>
    );
  }

  return <FormatUnavailablePanel reason="unsupported_format" evidenceTotal={evidenceTotal} onDownload={onDownload} />;
}