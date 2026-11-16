import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { FileText, ExternalLink, ArrowRight } from 'lucide-react';
import { useOpenDocument, useOpenDocuments } from '@/lib/visionWorkspace/openDocument';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLORS = {
  completed:        'bg-emerald-500/15 text-emerald-400',
  pending_analysis: 'bg-blue-500/15 text-blue-400',
  queued:           'bg-blue-500/15 text-blue-400',
  needs_review:     'bg-orange-500/15 text-orange-400',
  failed:           'bg-red-500/15 text-red-400',
  uploaded:         'bg-slate-500/15 text-slate-400',
};

const STATUS_LABELS = {
  completed:        'Complete',
  pending_analysis: 'Pending',
  queued:           'Queued',
  needs_review:     'Review',
  failed:           'Failed',
  uploaded:         'Uploaded',
};

/**
 * Shows the latest 5 documents for the current business.
 * Intended as a widget on dashboards — not a full library.
 */
export default function RecentDocuments({ limit = 5 }) {
  // Document references open the EXACT document in the Galileo document overlay
  // (the one opening contract); "view all" opens the overlay's library.
  const openDocument = useOpenDocument();
  const openDocs = useOpenDocuments();
  const { data: documents = [] } = useQuery({
    queryKey: ['recent-documents'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDataRoomDocuments',
        data: {},
      });
      return res.data?.documents || [];
    },
    staleTime: 60_000,
    initialData: [],
  });

  const recent = documents.slice(0, limit);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Recent Documents</p>
        <button
          type="button"
          onClick={() => openDocs()}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-2">
        {recent.map(doc => {
          const status = doc.upload_status || 'uploaded';
          const statusColor = STATUS_COLORS[status] || STATUS_COLORS.uploaded;
          const statusLabel = STATUS_LABELS[status] || status;
          const name = doc.name || '—';

          return (
            <div key={doc.id} className="glass rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {doc.created_at ? formatDistanceToNow(new Date(doc.created_at), { addSuffix: true }) : '—'}
                </p>
              </div>
              <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${statusColor}`}>
                {statusLabel}
              </span>
              {doc.id && (
                <button
                  type="button"
                  onClick={() => openDocument(doc.id)}
                  title="Open this document"
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}