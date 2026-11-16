import React, { useState } from 'react';
import { FilePenLine, Plus, Trash2, UserPlus, Loader2, ChevronRight, FolderOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AgreementEditor from './AgreementEditor';
import AssignAgreementModal from './AssignAgreementModal';

const AGREEMENT_TYPES = [
  'Engagement Agreements',
  'Client Agreements',
  'Compliance & Legal',
];

const TYPE_TO_FOLDER = {
  engagement_agreement: 'Engagement Agreements',
  advisor_agreement:    'Engagement Agreements',
  tax_authorization:    'Engagement Agreements',
  client_agreement:     'Client Agreements',
  service_agreement:    'Client Agreements',
  buy_sell_agreement:   'Compliance & Legal',
  operating_agreement:  'Compliance & Legal',
  nda:                  'Compliance & Legal',
  other:                'Client Agreements',
};

const FOLDER_DEFAULT_TYPE = {
  'Engagement Agreements': 'engagement_agreement',
  'Client Agreements':     'client_agreement',
  'Compliance & Legal':    'nda',
};

export default function AdminAgreements({ selectedBusinessId }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded]   = useState(['Engagement Agreements']);
  const [selectedId, setSelectedId] = useState(null);
  const [assigning, setAssigning]  = useState(null);

  const { data: agreements = [], isLoading } = useQuery({
    queryKey: ['agreements', selectedBusinessId],
    queryFn: () => base44.entities.Agreement.filter(
      selectedBusinessId ? { business_id: selectedBusinessId } : {},
      '-created_date', 200
    ),
    enabled: !!selectedBusinessId,
  });

  const selected = agreements.find(a => a.id === selectedId);

  const byFolder = (folder) =>
    agreements.filter(a => (TYPE_TO_FOLDER[a.agreement_type] || 'Client Agreements') === folder);

  const toggleFolder = (f) =>
    setExpanded(e => e.includes(f) ? e.filter(x => x !== f) : [...e, f]);

  const handleNew = async (folder) => {
    const a = await base44.entities.Agreement.create({
      title:          'Untitled Agreement',
      agreement_type: FOLDER_DEFAULT_TYPE[folder] || 'other',
      status:         'draft',
    });
    queryClient.invalidateQueries({ queryKey: ['agreements', selectedBusinessId] });
    setSelectedId(a.id);
    if (!expanded.includes(folder)) setExpanded(e => [...e, folder]);
  };

  const handleSave = async (data) => {
    if (selectedId) {
      await base44.entities.Agreement.update(selectedId, data);
      queryClient.invalidateQueries({ queryKey: ['agreements', selectedBusinessId] });
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.Agreement.delete(id);
    queryClient.invalidateQueries({ queryKey: ['agreements', selectedBusinessId] });
    if (selectedId === id) setSelectedId(null);
  };

  const STATUS_COLORS = {
    draft:               'border-border text-muted-foreground',
    assigned:            'border-blue-500/40 text-blue-400',
    awaiting_review:     'border-amber-500/40 text-amber-400',
    awaiting_signature:  'border-orange-500/40 text-orange-400',
    signed:              'border-emerald-500/40 text-emerald-400',
    completed:           'border-emerald-500/40 text-emerald-400',
    expired:             'border-red-500/40 text-red-400',
    cancelled:           'border-muted text-muted-foreground',
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-sm text-muted-foreground" style={{ minHeight: 200 }}>
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading client business…
      </div>
    );
  }

  return (
    <div className="flex rounded-xl border border-border bg-card overflow-hidden" style={{ minHeight: 560 }}>
      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FilePenLine className="w-4 h-4" />
            Agreements
          </div>
          <button
            onClick={() => handleNew('Client Agreements')}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="New agreement"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            AGREEMENT_TYPES.map(folder => (
              <div key={folder}>
                <button
                  onClick={() => toggleFolder(folder)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronRight className={`w-3 h-3 transition-transform ${expanded.includes(folder) ? 'rotate-90' : ''}`} />
                    <FolderOpen className="w-3.5 h-3.5" />
                    {folder}
                    <span className="text-[10px] opacity-60">({byFolder(folder).length})</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleNew(folder); }}
                    className="opacity-0 hover:opacity-100 text-muted-foreground hover:text-primary"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </button>

                {expanded.includes(folder) && byFolder(folder).map(a => (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between pl-7 pr-2 py-2 text-xs cursor-pointer transition-colors group ${
                      selectedId === a.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
                    }`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FilePenLine className="w-3 h-3 shrink-0" />
                      <span className="truncate">{a.title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setAssigning(a); }}
                        className="p-0.5 hover:text-primary"
                        title="Assign"
                      >
                        <UserPlus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(a.id); }}
                        className="p-0.5 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Status dot */}
                    {a.status && a.status !== 'draft' && (
                      <span className={`text-[9px] border rounded-full px-1.5 py-0.5 ml-1 shrink-0 ${STATUS_COLORS[a.status] || STATUS_COLORS.draft}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    )}
                    {a.assigned_to?.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ml-1 shrink-0">
                        {a.assigned_to.length}
                      </span>
                    )}
                  </div>
                ))}

                {expanded.includes(folder) && byFolder(folder).length === 0 && (
                  <button
                    onClick={() => handleNew(folder)}
                    className="pl-8 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground w-full text-left"
                  >
                    + New agreement
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">{agreements.length} agreement{agreements.length !== 1 ? 's' : ''} total</p>
        </div>
      </div>

      {/* Editor Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <AgreementEditor
            key={selected.id}
            agreement={selected}
            onSave={handleSave}
            onAssign={() => setAssigning(selected)}
            onDelete={() => handleDelete(selected.id)}
            selectedBusinessId={selectedBusinessId}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <FilePenLine className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold">Select or create an agreement</p>
              <p className="text-sm text-muted-foreground mt-1">Choose an agreement from the sidebar or create a new one.</p>
            </div>
            <Button onClick={() => handleNew('Client Agreements')} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> New Agreement
            </Button>
          </div>
        )}
      </div>

      {assigning && (
        <AssignAgreementModal
          agreement={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => queryClient.invalidateQueries({ queryKey: ['agreements', selectedBusinessId] })}
        />
      )}
    </div>
  );
}