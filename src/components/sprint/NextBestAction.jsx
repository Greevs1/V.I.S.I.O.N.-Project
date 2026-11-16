import React, { useState } from 'react';
import { ArrowRight, Sparkles, Clock, User, Calendar, BookOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import EvidenceSection from '@/components/sprint/EvidenceSection';

export default function NextBestAction({ action }) {
  const { activeContext } = useAuth();
  const [saved, setSaved] = useState(false);

  const handleSaveToPlaybook = async () => {
    if (!action) return;
    try {
      const content = action.expected_outcome || action.description || action.title || '';
      await base44.functions.invoke('savedPlaybookData', {
        action: 'savePlaybookItem',
        data: {
          title: action.title,
          content: content || action.title,
          category: 'strategy',
          saved_from: 'next_best_action',
          active_business_id: activeContext?.businessId || null,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error('Save to playbook error:', e); }
  };

  if (!action) {
    return (
      <div className="rounded-xl p-5 text-center" style={{ backgroundColor: '#141418' }}>
        <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium">Next Best Action</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select a 90-day outcome path and Galileo will identify your next best move.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 border border-primary/20" style={{ backgroundColor: '#141418' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Next Best Action</p>
          <p className="text-[10px] text-muted-foreground">Highest priority task based on impact, ease, and urgency</p>
        </div>
      </div>

      <h4 className="text-base font-semibold mb-2">{action.title}</h4>

      {action.expected_outcome && (
        <p className="text-xs text-muted-foreground mb-3">{action.expected_outcome}</p>
      )}

      <div className="flex items-center gap-3 mb-3 flex-wrap text-[10px] text-muted-foreground">
        {action.due_date && (
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Due: {action.due_date}</span>
        )}
        {action.assigned_to_name && (
          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {action.assigned_to_name}</span>
        )}
        {action.estimated_time && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {action.estimated_time}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-[9px] font-medium border rounded-full px-2 py-0.5 text-amber-400 border-amber-500/30 bg-amber-500/10">{action.ease || 'medium'}</span>
        <span className="text-[9px] font-medium border rounded-full px-2 py-0.5 text-orange-400 border-orange-500/30 bg-orange-500/10">{action.impact || 'medium'} impact</span>
      </div>

      {action.why_next && (
        <p className="text-[10px] text-muted-foreground mb-2">
          <span className="text-primary font-medium">Why this is next: </span>{action.why_next}
        </p>
      )}

      <EvidenceSection
        reason={action.task_reason}
        evidence={action.task_evidence}
        impact={action.expected_outcome}
        confidence={action.confidence_score}
      />

      <div className="mt-3" />

      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5 text-xs">
          <ArrowRight className="w-3.5 h-3.5" /> Start This Action
        </Button>
        <button
          onClick={handleSaveToPlaybook}
          className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
            saved ? 'text-emerald-400 bg-emerald-500/10' : 'text-muted-foreground hover:text-primary'
          }`}
        >
          {saved ? <Check className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
          {saved ? 'Saved' : 'Save to Playbook'}
        </button>
      </div>
    </div>
  );
}