import React, { useEffect, useState } from 'react';
import { FileText, X, ExternalLink, Image, FileSpreadsheet, File, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DocumentClassificationOverride from '@/components/documents/DocumentClassificationOverride';
import ReadOnlyDocumentView from '@/components/documents/viewers/ReadOnlyDocumentView';
import AskAboutThisDocument from '@/components/documents/viewers/AskAboutThisDocument';
import { resolveDocumentStates, analysisLabel } from '@/lib/documents/documentTypes';

/**
 * Reusable Document Viewer Modal - Worksheet Style
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - document: { name, document_type, file_size, file_url }
 * - signedUrl: string (optional, will use document.file_url if not provided)
 * - onDownload: () => void
 * - onOpenNewTab: () => void
 * - sourceMissing: { hasExtraction: boolean } | null — the original file is gone.
 *   A SOURCE state, not a load failure: this viewer states it in human language
 *   and never claims retained extraction that does not exist.
 */
 export default function DocumentViewer({
 isOpen,
 onClose,
 document,
 signedUrl,
 onDownload,
 onOpenNewTab,
 onOverrideSuccess,
 sourceMissing = null,
  // Optional collaboration slot (document assignments). The document stays
  // primary; this renders in the metadata sidebar, where the rest of the
  // document's context already lives.
  collaboration = null,
  // How many figures VISION has actually read from THIS document. Whether a
  // document can be DRAWN and whether it has been READ are independent facts,
  // and they are never collapsed into one another here.
  evidenceTotal = 0,
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [liveDocument, setLiveDocument] = useState(document);

  useEffect(() => {
    setLiveDocument(document);
  }, [document]);

  // Reset state when document changes
  useEffect(() => {
    if (isOpen) {
      setLoadFailed(false);
    }
  }, [isOpen, document?.id]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.document.addEventListener('keydown', handleEscape);
    return () => window.document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !liveDocument) return null;

  const displayUrl = signedUrl || liveDocument.file_url;
  const fileType = getFileType(displayUrl, liveDocument.document_type);
  const size = formatBytes(liveDocument.file_size);
  const typeLabel = getDocumentTypeLabel(liveDocument.document_type);
  const analysisStates = resolveDocumentStates(liveDocument);

  return (
    <div
      className="layer-viewer fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-[min(94vw,1200px)] h-[min(90vh,900px)] rounded-2xl bg-[#0b0b0d] border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              {getFileIcon(fileType)}
            </div>
            <div>
              <h3 className="text-base font-semibold">{liveDocument.name || 'Document Preview'}</h3>
              <p className="text-xs text-muted-foreground">{typeLabel}{size ? ` • ${size}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
           
            {/* The whole viewer is read-only, and it says so rather than leaving
                the owner to wonder whether a cell or a paragraph can be changed. */}
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
              <Lock className="w-3 h-3" />
              Read-only
            </span>
            {onOpenNewTab && !sourceMissing && (
              <Button size="sm" onClick={onOpenNewTab} variant="outline">
                <ExternalLink className="w-4 h-4" />
                Open in New Tab
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body - two-panel layout when override panel is present */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Preview area */}
          <div className="flex-1 min-w-0 bg-neutral-950 overflow-hidden">
            {sourceMissing
              ? <SourceMissingPanel hasExtraction={sourceMissing.hasExtraction} />
              : renderPreview(fileType, displayUrl, liveDocument, loadFailed, setLoadFailed, evidenceTotal, onDownload)}
          </div>

          {/* Admin sidebar — injected for authorized roles */}
          <div className="w-72 flex-shrink-0 border-l border-white/10 bg-[#0d0d10] overflow-y-auto p-4 space-y-4">
            {/* Document metadata */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Document Info</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Type</span>
                  <span className="text-foreground">{typeLabel}</span>
                </div>
                {liveDocument.document_scope && (
                  <div className="flex justify-between">
                    <span>Scope</span>
                    <span className="text-foreground capitalize">{liveDocument.document_scope}</span>
                  </div>
                )}
                {size && (
                  <div className="flex justify-between">
                    <span>Size</span>
                    <span className="text-foreground">{size}</span>
                  </div>
                )}
                {liveDocument.upload_source && (
                  <div className="flex justify-between">
                    <span>Source</span>
                    <span className="text-foreground capitalize">{liveDocument.upload_source?.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* WHAT HAPPENED TO THE DOCUMENT vs WHAT VISION READ FROM IT.
                Two separate facts, stated separately: a document that cannot be
                drawn may still have been read, and one that draws perfectly may
                have yielded nothing yet. */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Analysis</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>State</span>
                  <span className="text-foreground">{analysisLabel(analysisStates.analysis)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Evidence extracted</span>
                  <span className="text-foreground">
                    {evidenceTotal} {evidenceTotal === 1 ? 'field' : 'fields'}
                  </span>
                </div>
              </div>
              {analysisStates.note && (
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{analysisStates.note}</p>
              )}
            </div>

            <div className="h-px bg-white/5" />

            {/* Bound to THIS document through the existing focused-record
                contract — never to another document, another business, or a
                generic observation. */}
            <AskAboutThisDocument document={liveDocument} />

            {/* Collaborate — who has this document, and what they owe it (§7) */}
            {collaboration}

            <div className="h-px bg-white/5" />

            {/* Classification Override (renders for authorized roles only) */}
            <DocumentClassificationOverride
              document={liveDocument}
              onOverrideSuccess={(updated) => {
                setLiveDocument(updated);
                if (onOverrideSuccess) onOverrideSuccess(updated);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * SourceMissingPanel — Phase 6D.0-G.
 *
 * The original file is gone. Nothing is invented, nothing is fabricated and no
 * internal error is shown. The panel states the source state and whether VISION
 * still holds information previously extracted from it — a claim made only when
 * extraction genuinely exists.
 */
function SourceMissingPanel({ hasExtraction }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
        <File className="w-10 h-10 text-muted-foreground" />
      </div>
      <p className="text-base font-medium text-foreground mb-2">Original file unavailable</p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        {hasExtraction
          ? 'VISION still has information previously extracted from this document, but the original file is no longer available. Re-upload the document to restore the source.'
          : 'The original file is no longer available. Re-upload it to continue.'}
      </p>
    </div>
  );
}

/**
 * A fast-path classifier only. PDF and image are named here so the browser can
 * draw them with NO byte download at all; everything else is handed to the
 * format reader, which decides the format from the CONTENT — the file name is
 * a hint, never the authority.
 */
function getFileType(url, docType) {
  if (!url && !docType) return 'file';
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.pdf') || docType === 'pdf') return 'pdf';
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/)) return 'image';
  if (lower.match(/\.(xlsx|xlsm|xls|csv|tsv)$/)) return 'sheet';
  return 'file';
}

function getDocumentTypeLabel(docType) {
  const labels = {
    business_tax_return: 'Business Tax Return',
    personal_tax_return: 'Personal Tax Return',
    profit_and_loss: 'Profit & Loss',
    balance_sheet: 'Balance Sheet',
    payroll_report: 'Payroll Report',
    agreement: 'Agreement',
    consulting_resource: 'Resource',
    pdf: 'PDF',
    image: 'Image',
    other: 'Document',
  };
  return labels[docType] || (docType || 'Document').replace(/_/g, ' ');
}

function formatBytes(b) {
  if (!b) return null;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(fileType) {
  switch (fileType) {
    case 'image':
      return <Image className="w-5 h-5 text-primary" />;
    case 'sheet':
      return <FileSpreadsheet className="w-5 h-5 text-primary" />;
    default:
      return <FileText className="w-5 h-5 text-primary" />;
  }
}

function renderPreview(fileType, url, document, loadFailed, setLoadFailed, evidenceTotal, onDownload) {
  // PDF with error handling
  if (fileType === 'pdf' && !loadFailed) {
    return (
      <iframe
        src={url}
        className="w-full h-full border-0 bg-white"
        title={document?.name || 'PDF Preview'}
        onLoad={() => setLoadFailed(false)}
        onError={() => setLoadFailed(true)}
      />
    );
  }


  // Image files
  if (fileType === 'image') {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <img
          src={url}
          alt={document?.name || 'Document'}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // A PDF the browser cannot inline. This is a statement about the BROWSER,
  // never about the document, and it says which one it is.
  if (fileType === 'pdf') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <File className="w-10 h-10 text-muted-foreground" />
        </div>
        <p className="text-base font-medium text-foreground mb-2">This PDF cannot be shown inline</p>
        <p className="text-sm text-muted-foreground max-w-md">
          Your browser cannot display this PDF inside the page. Download it to read it in full.
        </p>
      </div>
    );
  }

  // EVERY OTHER FORMAT IS READ. The reader decides the format from the document's
  // own bytes, draws what it can read, and states plainly what it cannot — and a
  // file it cannot draw is never reported as an unsupported document.
  return (
    <ReadOnlyDocumentView
      url={url}
      name={document?.name}
      evidenceTotal={evidenceTotal}
      onDownload={onDownload}
    />
  );
}