import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import {
  BookOpen, Download, Trash2, Loader2, ChevronDown, ChevronRight,
  Sparkles, Copy, Check, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SavedPlaybook() {
  const { supabaseProfile, activeContext } = useAuth();

  const [playbooks, setPlaybooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const fetchPlaybooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('savedPlaybookData', {
        action: 'getSavedPlaybooks',
        data: { active_business_id: activeContext?.businessId || null },
      });
      setPlaybooks(res.data?.playbooks || []);
    } catch (e) {
      console.error('getSavedPlaybooks error:', e);
    }
    setLoading(false);
  }, [activeContext?.businessId]);

  useEffect(() => { fetchPlaybooks(); }, [fetchPlaybooks]);

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
    setCopiedId(null);
  };

  const handleDelete = async (playbookId) => {
    if (!confirm('Delete this saved playbook?')) return;
    try {
      await base44.functions.invoke('savedPlaybookData', {
        action: 'deleteSavedPlaybook',
        data: { playbookId, active_business_id: activeContext?.businessId || null },
      });
      setPlaybooks(prev => prev.filter(p => p.id !== playbookId));
      if (expandedId === playbookId) setExpandedId(null);
    } catch (e) { console.error('deleteSavedPlaybook error:', e); }
  };

  const handleCopy = (content, id) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res = await base44.functions.invoke('savedPlaybookData', {
        action: 'exportSavedPlaybooksPdf',
        data: { active_business_id: activeContext?.businessId || null },
      });
      if (res.data?.error) {
        alert(res.data.error);
        setExporting(false);
        return;
      }
      const exp = res.data?.export;
      if (!exp) { setExporting(false); return; }

      // Build text content
      const lines = [
        exp.platform,
        exp.title,
        `User: ${exp.user}`,
        `Export Date: ${exp.exportDate}`,
        `Total Strategies: ${exp.count}`,
        '',
        ...exp.items.map((item, i) => [
          `${'─'.repeat(60)}`,
          `#${i + 1}: ${item.title}`,
          `Category: ${item.category}  |  Source: ${item.saved_from}  |  Saved: ${item.saved_date}`,
          '',
          item.content,
          '',
        ]).flat(),
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saved-playbook-export-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('export error:', e);
    }
    setExporting(false);
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
      </div>
    );
  }

  // ── Empty state ──
  if (playbooks.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold mb-1">No Saved Strategies</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Save Galileo responses using 'Save to Playbook' anywhere you see the button to build your strategic playbook.
        </p>
      </div>
    );
  }

  // ── Main view ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Saved Playbook</h3>
          <p className="text-xs text-muted-foreground">{playbooks.length} saved {playbooks.length === 1 ? 'strategy' : 'strategies'}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-8"
          onClick={handleExportPDF}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Export PDF
        </Button>
      </div>

      {/* Accordion cards */}
      <div className="space-y-2">
        {playbooks.map(pb => {
          const isExpanded = expandedId === pb.id;

          return (
            <div
              key={pb.id}
              className="rounded-xl border border-border overflow-hidden"
              style={{ backgroundColor: '#141418' }}
            >
              {/* Header — click to toggle */}
              <button
                onClick={() => toggleExpand(pb.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/20 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pb.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(pb.created_at).toLocaleDateString()}
                    </span>
                    {pb.category && pb.category !== 'strategy' && (
                      <span className="text-[9px] font-medium text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
                        {pb.category}
                      </span>
                    )}
                    {pb.saved_from && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        {pb.saved_from.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border">
                  <div className="pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {pb.content || 'No content'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <button
                      onClick={() => handleCopy(pb.content, pb.id)}
                      className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      {copiedId === pb.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId === pb.id ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleDelete(pb.id)}
                      className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}