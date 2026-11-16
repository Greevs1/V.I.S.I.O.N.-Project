import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Send, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const TEST_QUESTIONS = [
  { q: 'What should I focus on next?', cat: 'next_best_action' },
  { q: 'What is hurting my business value most?', cat: 'valuation' },
  { q: 'What tax opportunities am I missing?', cat: 'tax' },
  { q: 'How can I improve profit?', cat: 'profit' },
  { q: 'What should I do in the next 90 days?', cat: 'next_best_action' },
  { q: 'What documents do you still need?', cat: 'documents' },
  { q: 'What roadmap items should I finish first?', cat: 'roadmap' },
];

const CONFIDENCE_COLORS = {
  high: 'bg-emerald-500/20 text-emerald-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-red-500/20 text-red-400',
};

export default function TestAskGalileo() {
  const { role, activeContext } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [membership, setMembership] = useState('paid');
  const [customQuestion, setCustomQuestion] = useState('');
  const [conversationId, setConversationId] = useState(null);

  const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(role);

  if (!isAdminOrAdvisor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="glass rounded-xl p-8 max-w-md text-center space-y-3">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Admin or Advisor access required.</p>
        </div>
      </div>
    );
  }

  const ask = async (question) => {
    if (!question?.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('askGalileo', {
        question,
        membership_status: membership,
        conversation_id: conversationId || undefined,
        // Phase 6.9 — explicit business; the backend no longer guesses the primary.
        ...(activeContext?.businessId ? { active_business_id: activeContext.businessId } : {}),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
      if (res.data?.conversation_id) setConversationId(res.data.conversation_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const r = result?.response;
  const cq = result?.context_quality;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Ask Galileo — Test Console
          </h1>
          <p className="text-sm text-muted-foreground">Admin-only test page for askGalileo function.</p>
        </div>
        <div className="flex items-center gap-2">
          {conversationId && (
            <button onClick={() => setConversationId(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Clear session
            </button>
          )}
          <select
            value={membership}
            onChange={e => setMembership(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
          >
            <option value="paid">Paid / Advisor</option>
            <option value="free">Free (gated)</option>
          </select>
        </div>
      </div>

      {/* Session info */}
      {conversationId && (
        <div className="glass rounded-lg px-4 py-2 text-xs text-muted-foreground">
          Active conversation: <span className="font-mono text-foreground/60">{conversationId}</span>
        </div>
      )}

      {/* Quick test questions */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Tests</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TEST_QUESTIONS.map((item, i) => (
            <button
              key={i}
              onClick={() => ask(item.q)}
              disabled={loading}
              className="text-left text-xs px-3 py-2.5 rounded-lg glass hover:bg-secondary/40 transition-all disabled:opacity-50 space-y-1"
            >
              <span className="text-foreground/80">{item.q}</span>
              <span className="block text-[10px] text-muted-foreground">expects: {item.cat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom question */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Question</p>
        <form onSubmit={(e) => { e.preventDefault(); ask(customQuestion); }} className="flex gap-2">
          <input
            value={customQuestion}
            onChange={e => setCustomQuestion(e.target.value)}
            placeholder="Type any question..."
            className="flex-1 bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <Button type="submit" disabled={loading || !customQuestion.trim()} className="gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </Button>
        </form>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 text-destructive text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Status row */}
          <div className="glass rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Category</p>
              <Badge className="bg-primary/20 text-primary border-0">{r?.category || '—'}</Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Confidence</p>
              <Badge className={`border-0 ${CONFIDENCE_COLORS[r?.confidence_level] || ''}`}>{r?.confidence_level || '—'}</Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Gated</p>
              <Badge className={result.is_gated ? 'bg-yellow-500/20 text-yellow-400 border-0' : 'bg-emerald-500/20 text-emerald-400 border-0'}>
                {result.is_gated ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Data Driven</p>
              <Badge className={r?.is_data_driven ? 'bg-emerald-500/20 text-emerald-400 border-0' : 'bg-red-500/20 text-red-400 border-0'}>
                {r?.is_data_driven ? 'Yes' : 'Fallback'}
              </Badge>
            </div>
          </div>

          {/* Context quality */}
          {cq && (
            <div className="glass rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Context Quality</p>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {Object.entries(cq).map(([k, v]) => (
                  <div key={k} className="text-center">
                    <p className="text-sm font-semibold">{v ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{k.replace(/_/g, ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Answer */}
          <div className="glass rounded-xl p-5 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Answer</p>
            <p className="text-sm leading-relaxed">{r?.answer}</p>
          </div>

          {/* Supporting sources */}
          {r?.supporting_sources?.length > 0 && (
            <div className="glass rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supporting Sources</p>
              {r.supporting_sources.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {/* Missing data */}
          {r?.missing_data?.length > 0 && (
            <div className="glass rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Missing Data</p>
              {r.missing_data.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">{m}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommended next step */}
          {r?.recommended_next_step && (
            <div className="glass rounded-xl p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recommended Next Step</p>
              <p className="text-sm">→ {r.recommended_next_step}</p>
            </div>
          )}

          {/* Gated detail notice */}
          {r?._gated_detail_available && (
            <div className="glass rounded-xl p-4 border border-dashed border-border">
              <p className="text-xs text-muted-foreground">Implementation detail available for paid users (gated in current response)</p>
            </div>
          )}

          {/* Fallback notice */}
          {r?._fallback && (
            <div className="glass rounded-xl p-4 border border-yellow-500/20">
              <p className="text-xs text-yellow-400">Fallback mode — LLM not used. Error: {r._llm_error || 'No OpenRouter key'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}