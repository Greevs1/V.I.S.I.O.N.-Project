import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Sparkles, CheckCircle, XCircle, Database } from 'lucide-react';

function JsonSection({ title, data, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const isEmpty = !data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && Object.keys(data).length === 0);
  return (
    <div className="glass rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-2">
          {isEmpty ? <Badge variant="outline" className="text-[10px] text-muted-foreground">empty</Badge> : <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">data</Badge>}
          <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <pre className="px-4 pb-4 text-xs text-foreground/70 overflow-auto max-h-80 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TestGalileoInsights() {
  const { user, role, activeContext } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [membership, setMembership] = useState('paid');

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

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke('generateGalileoInsights', {
        membership_status: membership,
        // Phase 6.9 — explicit business; the backend no longer guesses the primary.
        ...(activeContext?.businessId ? { active_business_id: activeContext.businessId } : {}),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const ins = result?.insights;
  const sources = result?.context_sources;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Galileo Insights — Test Console
          </h1>
          <p className="text-sm text-muted-foreground">Admin-only test page for generateGalileoInsights function.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={membership}
            onChange={e => setMembership(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
          >
            <option value="paid">Paid / Advisor</option>
            <option value="free">Free (gated)</option>
          </select>
          <Button onClick={run} disabled={loading} className="gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Run'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-destructive/30 text-destructive text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result && (
        <>
          {/* Status */}
          <div className="glass rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Membership Tested</p>
              <Badge className={membership === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border-0' : 'bg-yellow-500/20 text-yellow-400 border-0'}>
                {membership}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Gating Active</p>
              <Badge className={result.is_gated ? 'bg-yellow-500/20 text-yellow-400 border-0' : 'bg-emerald-500/20 text-emerald-400 border-0'}>
                {result.is_gated ? 'Yes — gated' : 'No — full access'}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Confidence</p>
              <Badge className="bg-primary/20 text-primary border-0">{ins?.confidence_level || '—'}</Badge>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase mb-1">Fallback Mode</p>
              <Badge className={ins?._fallback ? 'bg-red-500/20 text-red-400 border-0' : 'bg-emerald-500/20 text-emerald-400 border-0'}>
                {ins?._fallback ? `Yes (${ins._llm_error || 'no LLM'})` : 'No — LLM used'}
              </Badge>
            </div>
          </div>

          {/* Context Sources */}
          {sources && (
            <div className="glass rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Context Sources Used
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(sources).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {(val === true || val > 0) ? <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" /> : <XCircle className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <span className={val === true || val > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                      {key.replace(/_/g, ' ')}: {typeof val === 'boolean' ? (val ? '✓' : '✗') : val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executive Summary */}
          {ins?.executive_summary && (
            <div className="glass rounded-xl p-4 border-l-2 border-primary/40">
              <p className="text-[10px] text-muted-foreground uppercase mb-2">Executive Summary</p>
              <p className="text-sm leading-relaxed">{ins.executive_summary}</p>
            </div>
          )}

          {/* JSON sections */}
          <div className="space-y-3">
            <JsonSection title={`Top Priorities (${ins?.top_3_priorities?.length || 0})`} data={ins?.top_3_priorities} defaultOpen />
            <JsonSection title={`Biggest Risks (${ins?.biggest_risks?.length || 0})`} data={ins?.biggest_risks} defaultOpen />
            <JsonSection title="Estimated Value Available" data={ins?.estimated_value_available} defaultOpen />
            <JsonSection title={`90-Day Plan (${ins?.next_90_day_plan?.length || 0} items)`} data={ins?.next_90_day_plan} />
            <JsonSection title="Recommended Focus" data={ins?.recommended_focus} />
            <JsonSection title="Data Gaps" data={ins?.data_gaps} />
            <JsonSection title="Full Insights Object" data={ins} />
          </div>
        </>
      )}
    </div>
  );
}