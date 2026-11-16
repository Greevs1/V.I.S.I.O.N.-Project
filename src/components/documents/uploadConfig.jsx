import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
export const MAX_FILES_PER_BATCH = 10;
export const MAX_BATCH_SIZE = 150 * 1024 * 1024; // 150MB total
export const MAX_CONCURRENT_UPLOADS = 2;

// The ONE frontend type vocabulary — re-exported from the shared module so the
// uploader, the Data Room and every label agree about which types VISION can
// actually analyze. A second copy here is how the two came to disagree before.
export { DOCUMENT_TYPES as docTypes } from '@/lib/documents/documentTypes';

export const statusConfig = {
  queued: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Queued' },
  uploading: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Uploading' },
  processing: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Processing' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Failed' }
};