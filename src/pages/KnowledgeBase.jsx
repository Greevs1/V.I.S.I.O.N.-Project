import React, { useState, useEffect, useCallback } from 'react';
import { Search, BookOpen, Upload, Sparkles, Tag, Clock, ChevronRight, Loader2, Trash2, Filter, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

const CATEGORY_ICONS = {
  financial: '💰',
  tax: '📋',
  operations: '⚙️',
  legal: '⚖️',
  strategy: '🎯',
  market: '📊',
  exit: '🚪',
  general: '📝',
};

const CATEGORY_COLORS = {
  financial: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  tax: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  operations: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  legal: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  strategy: 'border-primary/30 bg-primary/10 text-primary',
  market: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  exit: 'border-red-500/30 bg-red-500/10 text-red-400',
  general: 'border-border bg-secondary text-muted-foreground',
};

const SOURCE_LABELS = {
  document: 'Document',
  assessment: 'Assessment',
  advisor_note: 'Advisor Note',
  chat: 'Chat Conversation',
  galileo_insight: 'Galileo Insight',
  opportunity: 'Opportunity',
};

export default function KnowledgeBase() {
  const { user, activeContext } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ingesting, setIngesting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const loadEntries = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('knowledgeBaseEngine', {
        action: 'getContext',
        data: { active_business_id: activeContext?.businessId || null },
      });
      const all = [];
      if (res.data?.by_category) {
        Object.values(res.data.by_category).forEach(catEntries => {
          all.push(...catEntries);
        });
      }
      setEntries(all);
    } catch (e) {
      console.error('Failed to load KB:', e);
    }
    setLoading(false);
  }, [activeContext?.businessId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const ingestFromDocuments = async () => {
    setIngesting(true);
    try {
      const res = await base44.functions.invoke('knowledgeBaseEngine', {
        action: 'ingestFromDocuments',
        data: { active_business_id: activeContext?.businessId || null },
      });
      if (res.data?.ingested > 0) {
        toast.success(`${res.data.ingested} knowledge entries created from documents`);
        loadEntries();
      } else {
        toast.info('No new knowledge found in documents');
      }
    } catch (e) {
      toast.error(e.message || 'Ingestion failed');
    }
    setIngesting(false);
  };

  const ingestFromInsights = async () => {
    setIngesting(true);
    try {
      const res = await base44.functions.invoke('knowledgeBaseEngine', {
        action: 'ingestFromInsights',
        data: { active_business_id: activeContext?.businessId || null },
      });
      if (res.data?.ingested > 0) {
        toast.success(`${res.data.ingested} knowledge entries created from insights`);
        loadEntries();
      } else {
        toast.info('No new insights to ingest');
      }
    } catch (e) {
      toast.error(e.message || 'Ingestion failed');
    }
    setIngesting(false);
  };

  const handleDelete = async (entry) => {
    if (!confirm('Archive this knowledge entry?')) return;
    try {
      await base44.functions.invoke('knowledgeBaseEngine', {
        action: 'deleteEntry',
        data: { entry_id: entry.id, active_business_id: activeContext?.businessId || null },
      });
      toast.success('Entry archived');
      loadEntries();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const filtered = entries.filter(e => {
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.title || '').toLowerCase().includes(q) ||
        (e.content || '').toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const categories = ['all', ...new Set(entries.map(e => e.category).filter(Boolean))];
  const topTags = entries.flatMap(e => e.tags || []).reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Structured learning extracted from your documents, assessments, and Galileo insights.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={ingestFromDocuments} disabled={ingesting}>
            {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Docs
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={ingestFromInsights} disabled={ingesting}>
            {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Insights
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Entries', value: entries.length, icon: BookOpen },
          { label: 'Categories', value: categories.length - 1, icon: Filter },
          { label: 'Tags', value: Object.keys(topTags).length, icon: Tag },
          { label: 'Sources', value: [...new Set(entries.map(e => e.source))].length, icon: ExternalLink },
        ].map(stat => (
          <Card key={stat.label} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-display font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search knowledge base..."
            className="w-full h-10 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                categoryFilter === cat
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-secondary text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              {cat === 'all' ? 'All' : `${CATEGORY_ICONS[cat] || ''} ${cat}`}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !loading && (
        <Card className="border-border">
          <CardContent className="p-12 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">Knowledge Base is empty</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Click "Docs" to ingest knowledge from your uploaded documents, or "Insights" to extract learnings from Galileo opportunities and assessments.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={ingestFromDocuments} disabled={ingesting}>
                <Upload className="w-3.5 h-3.5 mr-1.5" /> Ingest Documents
              </Button>
              <Button size="sm" variant="outline" onClick={ingestFromInsights} disabled={ingesting}>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Ingest Insights
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entry list */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((entry, idx) => (
            <Card
              key={entry.id || idx}
              className={`border-border hover:border-primary/20 transition-all cursor-pointer ${
                selectedEntry === entry ? 'border-primary/40 bg-primary/5' : ''
              }`}
              onClick={() => setSelectedEntry(selectedEntry === entry ? null : entry)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-lg shrink-0 mt-0.5">{CATEGORY_ICONS[entry.category] || '📝'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">{entry.title}</h3>
                      <Badge className={`text-[10px] ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.general}`}>
                        {entry.category}
                      </Badge>
                      {entry.confidence && (
                        <Badge className="text-[10px] bg-secondary text-muted-foreground border-border">
                          {entry.confidence}% conf.
                        </Badge>
                      )}
                    </div>
                    {selectedEntry === entry && (
                      <div className="mt-3 space-y-2">
                        <div className="text-sm text-muted-foreground prose prose-sm prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: entry.content?.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                        <div className="flex items-center gap-3 pt-2 border-t border-border">
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            {SOURCE_LABELS[entry.source_type] || entry.source}: {entry.source}
                          </p>
                          <div className="flex items-center gap-1 flex-wrap">
                            {(entry.tags || []).slice(0, 4).map(t => (
                              <span key={t} className="text-[9px] bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                                {t}
                              </span>
                            ))}
                          </div>
                          {entry.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                              className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedEntry !== entry && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {entry.content?.replace(/\*\*(.*?)\*\*/g, '$1')?.slice(0, 200)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${selectedEntry === entry ? 'rotate-90' : ''}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Top tags */}
      {Object.keys(topTags).length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Top Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(topTags).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([tag, count]) => (
                <span key={tag} className="text-[10px] bg-secondary border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">
                  {tag} ({count})
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}