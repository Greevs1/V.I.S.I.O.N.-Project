import React from 'react';
import { File, Lock, FileArchive } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * FormatUnavailablePanel — the honest alternative to a dead end.
 *
 * "We cannot render this here" is NOT "this document is unsupported", and the
 * two must never be shown with the same words. This panel states which one it
 * is, in plain language, and states plainly that viewing and reading are
 * SEPARATE capabilities: a document VISION cannot draw may still be one it has
 * already read, and the evidence survives either way.
 */
const REASONS = {
  legacy_word: {
    icon: File,
    title: 'Legacy Word format',
    body: 'VISION stores this .doc file safely and can read its contents as evidence, but it will not draw a legacy binary Word file here.',
  },
  biff5_not_supported: {
    icon: FileArchive,
    title: 'Very old Excel format',
    body: 'This workbook is in an earlier Excel format (BIFF5). VISION stores it safely and can read its contents as evidence, but it will not draw this older format here.',
  },
  encrypted: {
    icon: Lock,
    title: 'Password-protected file',
    body: 'This file is encrypted. VISION can hold it safely, but it cannot be read or drawn without the password.',
  },
  zip64: {
    icon: FileArchive,
    title: 'Workbook too large to open here',
    body: 'This workbook is stored in the large-archive format. VISION will not open it in place. Download it to read it in full.',
  },
  corrupt_directory: {
    icon: File,
    title: 'This file could not be opened',
    body: 'The file is stored safely, but its internal structure could not be read. It may be incomplete or damaged.',
  },
  empty_file: {
    icon: File,
    title: 'This file is empty',
    body: 'Nothing was stored for this document.',
  },
  unsupported_format: {
    icon: File,
    title: 'Not drawn here',
    body: 'VISION does not draw this file type in place. The document is stored safely and remains evidence it can read.',
  },
  unknown_zip_package: {
    icon: File,
    title: 'Not drawn here',
    body: 'This file is an archive VISION does not draw in place. It is stored safely.',
  },
};

/**
 * A file whose INTERNAL STRUCTURE could not be read is damaged — which is a
 * different fact from a format VISION declines to draw, and the two never share
 * wording.
 */
const DAMAGED = new Set([
  'not_a_zip', 'truncated_entry', 'corrupt_local_header', 'corrupt_directory',
  'unsupported_compression', 'missing_entry', 'bad_sector_size', 'no_directory',
  'not_a_workbook', 'no_sheets', 'not_a_document', 'no_biff_stream', 'unsupported_biff_version',
]);

export default function FormatUnavailablePanel({ reason, evidenceTotal = 0, onDownload }) {
  const cfg = REASONS[reason] || (DAMAGED.has(reason) ? REASONS.corrupt_directory : REASONS.unsupported_format);
  const Icon = cfg.icon;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
        <Icon className="w-9 h-9 text-muted-foreground" />
      </div>
      <p className="text-base font-medium text-foreground mb-2">{cfg.title}</p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{cfg.body}</p>

      {/* READING AND VIEWING ARE INDEPENDENT — said out loud, not implied. */}
      {evidenceTotal > 0 && (
        <p className="text-xs text-emerald-400/90 mt-3">
          VISION has already read {evidenceTotal} {evidenceTotal === 1 ? 'figure' : 'figures'} from this document.
        </p>
      )}

      {onDownload && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onDownload}>
          Download this file
        </Button>
      )}
    </div>
  );
}