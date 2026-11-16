import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Plus, Sparkles, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { useMembership } from '@/lib/useMembership';
import ReadinessMetrics from '@/components/exit-readiness/ReadinessMetrics';
import ReadinessColumn from '@/components/exit-readiness/ReadinessColumn';
import ReadinessModal from '@/components/exit-readiness/ReadinessModal';
import { useNavigate } from 'react-router-dom';

const COLUMNS = ['not_started', 'in_progress', 'under_review', 'completed'];

const DEFAULT_ITEMS = [
  { title: 'Audited Financial Statements (3 years)', category: 'financial', priority: 'critical', is_critical: true },
  { title: 'Clean Cap Table & Equity Documentation', category: 'legal', priority: 'critical', is_critical: true },
  { title: 'Customer Contracts & Revenue Agreements', category: 'legal', priority: 'high' },
  { title: 'Key Employee Retention Agreements', category: 'hr', priority: 'high' },
  { title: 'Documented Standard Operating Procedures', category: 'operations', priority: 'high' },
  { title: 'Intellectual Property Assignments', category: 'legal', priority: 'critical', is_critical: true },
  { title: 'Recast EBITDA Analysis', category: 'financial', priority: 'critical', is_critical: true },
  { title: 'Vendor & Supplier Contracts Review', category: 'operations', priority: 'medium' },
  { title: 'Employee Handbook & Policies', category: 'hr', priority: 'medium' },
  { title: 'Tax Returns & Compliance Records', category: 'financial', priority: 'high' },
];

export default function ExitReadiness() {
  const { supabaseBusiness } = useAuth();
  const { isPaid, isAdvisorOrAdmin } = useMembership();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('financial');
  const [syncing, setSyncing] = useState(false);

  const businessId = supabaseBusiness?.id || null;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['readinessItems', businessId],
    queryFn: async () => {
      const all = await base44.entities.ReadinessItem.list('-created_date', 200);
      return businessId
        ? all.filter(i => !i.business_id || i.business_id === businessId)
        : all;
    },
    initialData: [],
    enabled: isPaid,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ReadinessItem.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['readinessItems', businessId] });
      const prev = queryClient.getQueryData(['readinessItems', businessId]);
      queryClient.setQueryData(['readinessItems', businessId], old =>
        (old || []).map(i => i.id === id ? { ...i, ...data } : i)
      );
      return { prev };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(['readinessItems', businessId], ctx.prev);
      toast.error('Failed to update item');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['readinessItems', businessId] }),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ReadinessItem.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readinessItems', businessId] });
      setNewTitle('');
      setShowAddForm(false);
      toast.success('Item added');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ReadinessItem.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['readinessItems', businessId] });
      const prev = queryClient.getQueryData(['readinessItems', businessId]);
      queryClient.setQueryData(['readinessItems', businessId], old => (old || []).filter(i => i.id !== id));
      return { prev };
    },
    onError: (err, id, ctx) => {
      queryClient.setQueryData(['readinessItems', businessId], ctx.prev);
      toast.error('Failed to delete item');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['readinessItems', businessId] }),
    onSuccess: () => toast.success('Item deleted'),
  });

  const seedMutation = useMutation({
    mutationFn: () => base44.entities.ReadinessItem.bulkCreate(
      DEFAULT_ITEMS.map(d => ({ ...d, status: 'not_started', business_id: businessId || undefined }))
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['readinessItems', businessId] });
      toast.success('Default checklist loaded!');
    },
  });

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    updateMutation.mutate({ id: draggableId, data: { status: destination.droppableId } });
  };

  const handleUpdate = (id, patch) => {
    updateMutation.mutate({ id, data: patch });
    setSelectedItem(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  };

  const handleAddItem = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      category: newCategory,
      status: 'not_started',
      priority: 'medium',
      business_id: businessId || undefined,
    });
  };

  const handleAiSync = async () => {
    if (!businessId) { toast.error('No business profile linked. Please complete onboarding.'); return; }
    setSyncing(true);
    toast.info('Syncing readiness from your business data…', { duration: 2000 });
    try {
      const res = await base44.functions.invoke('syncReadinessIntelligence', { businessId });
      const suggested = res.data?.items || [];
      if (!suggested.length) { toast.info('No personalization data available yet.'); return; }

      const existingTitles = new Set(items.map(i => i.title.toLowerCase()));
      const toAdd = suggested.filter(s => !existingTitles.has(s.title.toLowerCase()));
      const toUpdate = suggested.filter(s => existingTitles.has(s.title.toLowerCase()));

      let added = 0;
      // Add missing items
      for (const item of toAdd) {
        await base44.entities.ReadinessItem.create({ ...item, status: 'not_started', business_id: businessId });
        added++;
      }
      // Update priority/notes for existing if personalized
      for (const item of toUpdate) {
        if (item.recommended_by !== 'demo_baseline') {
          const existing = items.find(i => i.title.toLowerCase() === item.title.toLowerCase());
          if (existing && existing.status === 'not_started') {
            await base44.entities.ReadinessItem.update(existing.id, { priority: item.priority, is_critical: item.is_critical, notes: item.notes, recommended_by: item.recommended_by });
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['readinessItems', businessId] });
      toast.success(`Readiness synced — ${added} new items added, ${toUpdate.length} existing updated.`);
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Free/unauthenticated users see a locked gate
  if (!isPaid) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-5 max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-display font-semibold">Exit Readiness Tracker</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Manage your due diligence checklist, assign tasks, and track progress toward a frictionless exit.
              This advanced operational module requires an active V.I.S.I.O.N. Platform Partnership.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" className="text-sm" onClick={() => navigate('/login')}>Sign In</Button>
            <Button className="text-sm gap-2" onClick={() => navigate('/strategy-call')}>
              <Sparkles className="w-4 h-4" /> Upgrade to Partnership
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="text-center pt-2 pb-1">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: '#D4A853' }}>
          M&amp;A Preparation
        </p>
        <h1 className="text-3xl lg:text-4xl font-display font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.95)' }}>
          Exit Readiness <em className="font-display not-italic" style={{ color: '#D4A853' }}>Tracker</em>
        </h1>
        <p className="text-sm max-w-lg mx-auto" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: '1.6' }}>
          Manage your due diligence checklist and track progress toward a frictionless exit.
        </p>
      </div>

      {/* Metrics */}
      <ReadinessMetrics items={items} onAiSync={handleAiSync} syncing={syncing} />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!showAddForm ? (
            <Button size="sm" onClick={() => setShowAddForm(true)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') setShowAddForm(false); }}
                placeholder="Item title..."
                className="h-8 text-sm bg-secondary border border-border rounded-md px-3 w-56 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="h-8 text-xs bg-secondary border border-border rounded-md px-2 focus:outline-none"
              >
                {['financial', 'legal', 'hr', 'operations'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <Button size="sm" onClick={handleAddItem} disabled={!newTitle.trim()} className="h-8 px-3 text-xs">Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)} className="h-8 px-2 text-xs">Cancel</Button>
            </div>
          )}
        </div>

        {/* Manual seed — only show when board is empty, no auto-seeding */}
        {items.length === 0 && !isLoading && (
          <Button size="sm" variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="text-xs gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            {seedMutation.isPending ? 'Loading...' : 'Load Sample Checklist'}
          </Button>
        )}
      </div>

      {/* Kanban Board — full access for all paid/admin/advisor users */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {COLUMNS.map(col => (
            <ReadinessColumn
              key={col}
              status={col}
              items={items.filter(i => i.status === col)}
              onCardClick={setSelectedItem}
            />
          ))}
        </div>
      </DragDropContext>

      {/* Card Detail Modal */}
      {selectedItem && (
        <ReadinessModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={handleUpdate}
          onDelete={(id) => { deleteMutation.mutate(id); setSelectedItem(null); }}
          isPaid={isPaid}
          businessId={businessId}
        />
      )}
    </div>
  );
}