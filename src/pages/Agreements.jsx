import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import {
  FilePenLine, ExternalLink, Download, CheckCircle2, PenLine,
  Clock, Check, AlertTriangle, XCircle, Eye, MessageSquare, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const AGREEMENT_TYPE_LABELS = {
  engagement_agreement: 'Engagement Agreement',
  client_agreement:     'Client Agreement',
  buy_sell_agreement:   'Buy-Sell Agreement',
  operating_agreement:  'Operating Agreement',
  nda:                  'NDA',
  service_agreement:    'Service Agreement',
  tax_authorization:    'Tax Authorization',
  advisor_agreement:    'Advisor Agreement',
  other:                'Other',
};

const STATUS_CONFIG = {
  draft:              { label: 'Draft',               color: 'text-muted-foreground', bg: 'bg-muted/20',             border: 'border-border',           icon: Clock },
  assigned:           { label: 'Pending Review',       color: 'text-blue-400',         bg: 'bg-blue-500/10',          border: 'border-blue-500/30',      icon: Eye },
  awaiting_review:    { label: 'Awaiting Review',      color: 'text-amber-400',        bg: 'bg-amber-500/10',         border: 'border-amber-500/30',     icon: Eye },
  awaiting_signature: { label: 'Needs Signature',      color: 'text-orange-400',       bg: 'bg-orange-500/10',        border: 'border-orange-500/30',    icon: PenLine },
  signed:             { label: 'Signed',               color: 'text-emerald-400',      bg: 'bg-emerald-500/10',       border: 'border-emerald-500/30',   icon: Check },
  completed:          { label: 'Completed',            color: 'text-emerald-400',      bg: 'bg-emerald-500/10',       border: 'border-emerald-500/30',   icon: CheckCircle2 },
  expired:            { label: 'Expired',              color: 'text-red-400',          bg: 'bg-red-500/10',           border: 'border-red-500/30',       icon: AlertTriangle },
  cancelled:          { label: 'Cancelled',            color: 'text-muted-foreground', bg: 'bg-muted/10',             border: 'border-border',           icon: XCircle },
};

// Statuses where client can take action
const CAN_REVIEW   = new Set(['assigned', 'awaiting_review']);
const CAN_SIGN     = new Set(['awaiting_signature']);
const PENDING      = new Set(['assigned', 'awaiting_review', 'awaiting_signature']);

async function openDocumentSigned(documentId, fallbackUrl) {
  if (!documentId && fallbackUrl) { window.open(fallbackUrl, '_blank'); return; }
  if (!documentId) return;
  try {
    const res = await base44.functions.invoke('supabaseUserData', {
      action: 'getDocumentSignedUrl',
      data: { documentId },
    });
    if (res.data?.signedUrl) {
      window.open(res.data.signedUrl, '_blank');
    } else {
      toast.error(res.data?.error || 'Could not generate download link');
    }
  } catch {
    toast.error('Failed to open document');
  }
}

function AgreementCard({ agreement, onAction }) {
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [acting, setActing] = useState(null);

  const cfg = STATUS_CONFIG[agreement.status] || STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  const isPending = PENDING.has(agreement.status);

  const handleAction = async (action) => {
    setActing(action);
    await onAction(agreement.id, action, noteText);
    setNoteText('');
    setShowNote(false);
    setActing(null);
  };

  return (
    <div className={`glass rounded-xl border p-5 space-y-4 transition-all ${isPending ? 'border-primary/20' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
            <FilePenLine className={`w-4 h-4 ${cfg.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{agreement.title}</p>
            <p className="text-xs text-muted-foreground">
              {AGREEMENT_TYPE_LABELS[agreement.agreement_type] || agreement.agreement_type}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 text-xs gap-1 ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </Badge>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {agreement.due_date && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Due {new Date(agreement.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
        {agreement.created_date && (
          <span>
            Assigned {new Date(agreement.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Description */}
      {agreement.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{agreement.description}</p>
      )}

      {/* Notes from advisor */}
      {agreement.notes && (
        <div className="rounded-lg bg-secondary/50 border border-border px-3 py-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Advisor Notes</p>
          <p className="text-xs text-foreground/80">{agreement.notes}</p>
        </div>
      )}

      {/* Attached document */}
      {agreement.file_url && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
          <FilePenLine className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground flex-1 truncate">{agreement.file_name || 'Agreement document'}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => openDocumentSigned(agreement.document_id, agreement.file_url)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </button>
            <button
              onClick={() => openDocumentSigned(agreement.document_id, agreement.file_url)}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Download
            </button>
          </div>
        </div>
      )}

      {/* Client comment input */}
      {showNote && (
        <div className="space-y-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a comment or question for your advisor..."
            rows={2}
            className="w-full text-sm px-3 py-2 rounded-md bg-secondary border border-border outline-none focus:border-primary/50 resize-none"
          />
        </div>
      )}

      {/* Action buttons */}
      {(CAN_REVIEW.has(agreement.status) || CAN_SIGN.has(agreement.status)) && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {CAN_REVIEW.has(agreement.status) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
              onClick={() => handleAction('awaiting_signature')}
              disabled={!!acting}
            >
              {acting === 'awaiting_signature' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              Mark Reviewed
            </Button>
          )}
          {CAN_SIGN.has(agreement.status) && (
            <Button
              size="sm"
              className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleAction('signed')}
              disabled={!!acting}
            >
              {acting === 'signed' ? <Loader2 className="w-3 h-3 animate-spin" /> : <PenLine className="w-3 h-3" />}
              Mark Signed
            </Button>
          )}
          <button
            onClick={() => setShowNote(v => !v)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            {showNote ? 'Cancel' : 'Add Comment'}
          </button>
          {showNote && noteText.trim() && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAction('comment')}>
              Send
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Agreements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('pending');

  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ['my-agreements', user?.id],
    queryFn: () => base44.entities.Agreement.filter({ assigned_to: { $contains: user?.id } }, '-created_date', 100),
    enabled: !!user?.id,
  });

  const handleAction = async (id, action, note) => {
    const agreement = agreements.find(a => a.id === id);
    if (!agreement) return;

    const now = new Date().toISOString();
    const patch = {};

    if (action === 'awaiting_signature') {
      patch.status = 'awaiting_signature';
    } else if (action === 'signed') {
      patch.status = 'signed';
      patch.signed_at = now;
    } else if (action === 'comment' && note?.trim()) {
      // Append client comment to notes
      const existing = agreement.notes || '';
      const prefix = existing ? existing + '\n\n' : '';
      patch.notes = prefix + `Client (${new Date().toLocaleDateString()}): ${note.trim()}`;
    }

    if (Object.keys(patch).length === 0) return;

    await base44.entities.Agreement.update(id, patch);
    queryClient.invalidateQueries({ queryKey: ['my-agreements'] });
    queryClient.invalidateQueries({ queryKey: ['pending-agreements'] });
    toast.success(action === 'comment' ? 'Comment added' : 'Agreement updated');
  };

  const pending   = agreements.filter(a => PENDING.has(a.status));
  const completed = agreements.filter(a => ['signed', 'completed'].includes(a.status));
  const other     = agreements.filter(a => ['expired', 'cancelled', 'draft'].includes(a.status));

  const displayed = filter === 'pending'   ? pending
                  : filter === 'completed' ? completed
                  : filter === 'other'     ? other
                  : agreements;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">Client Portal</p>
        <h1 className="text-3xl font-display font-bold">Agreements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review, acknowledge, and sign agreements from your advisory team.
        </p>
      </div>

      {/* Pending CTA banner */}
      {pending.length > 0 && (
        <div className="glass-gold rounded-xl p-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-primary">
              {pending.length} agreement{pending.length !== 1 ? 's' : ''} waiting for your attention
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and sign to keep your advisory work moving forward.
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary">
        {[
          { key: 'pending',   label: `Pending (${pending.length})` },
          { key: 'completed', label: `Completed (${completed.length})` },
          { key: 'all',       label: `All (${agreements.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
            <FilePenLine className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {filter === 'pending' ? 'No pending agreements' : 'No agreements yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {filter === 'pending' ? "You're all caught up." : 'Your advisor will assign agreements as needed.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayed.map(a => (
            <AgreementCard key={a.id} agreement={a} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}