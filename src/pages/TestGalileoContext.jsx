import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, 
  Loader2, Database, TrendingUp, FileText, Shield
} from 'lucide-react';
import { toast } from 'sonner';

function JsonSection({ title, data, defaultOpen = false, icon }) {
  const [open, setOpen] = useState(defaultOpen);
  const isEmpty = data === null || data === undefined || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !Array.isArray(data) && Object.keys(data || {}).length === 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          {isEmpty && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">empty</Badge>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-4 bg-background">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap overflow-auto max-h-96 font-mono leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function TestGalileoContext() {
  const { user, supabaseProfile } = useAuth();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [question, setQuestion] = useState('');

  const role = supabaseProfile?.app_role || user?.role;
  const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(role);

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('buildGalileoContext', {
        question: question || undefined,
      });
      setContext(res.data?.context || res.data);
    } catch (err) {
      setError(err.message || 'Failed to build context');
      toast.error('Failed to build Galileo context');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminOrAdvisor) loadContext();
  }, [isAdminOrAdvisor]);

  if (!isAdminOrAdvisor) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Admin or Advisor access required to view Galileo Context.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const meta = context?._meta;
  const quality = context?.source_quality;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Galileo Context Engine v1
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live business intelligence context assembled for the current user's business.
          </p>
        </div>
        <Button onClick={loadContext} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Optional question filter */}
      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground"
          placeholder="Optional: filter context for a specific question (e.g. 'What's my biggest tax opportunity?')"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadContext()}
        />
        <Button onClick={loadContext} disabled={loading} size="sm">Run</Button>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Building Galileo context from all data sources...</p>
          </div>
        </div>
      )}

      {context && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold text-primary">{quality?.overall_quality ?? 0}%</p>
                <p className="text-xs text-muted-foreground mt-1">Data Quality</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{quality?.has_completed_assessments ?? 0}<span className="text-sm text-muted-foreground">/{quality?.total_assessments_possible ?? 6}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Assessments</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{context.missing_data?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Missing Sources</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="pt-4 text-center">
                <p className="text-2xl font-bold">{context.risks?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Risks Flagged</p>
              </CardContent>
            </Card>
          </div>

          {/* Meta / source quality */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: 'Verified Financials', val: quality?.has_verified_financials },
              { label: 'Advisor Review', val: quality?.has_advisor_review },
              { label: 'Verified Wins', val: quality?.has_verified_wins },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-secondary/20">
                {val
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                }
                <span className={val ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-secondary/20">
              <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-foreground">Confidence: {quality?.data_confidence_score ?? 'N/A'}</span>
            </div>
          </div>

          {/* Missing Data */}
          {context.missing_data?.length > 0 && (
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-yellow-400">
                  <AlertCircle className="w-4 h-4" /> Missing Data Sources ({context.missing_data.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {context.missing_data.map((d, i) => (
                    <Badge key={i} variant="outline" className="text-xs border-yellow-500/30 text-yellow-400">{d}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risks */}
          {context.risks?.length > 0 && (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-4 h-4" /> Flagged Risks ({context.risks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {context.risks.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className={`text-[10px] ${r.severity === 'high' ? 'border-destructive/30 text-destructive' : 'border-yellow-500/30 text-yellow-400'}`}>
                      {r.severity}
                    </Badge>
                    <span className="text-foreground/80">{r.risk}</span>
                    <span className="text-muted-foreground">— {r.area}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Schema errors */}
          {meta?.schema_notes?.length > 0 && (
            <Card className="border-orange-500/20 bg-orange-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-orange-400 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Schema / Fetch Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-xs text-orange-300 space-y-1">
                  {meta.schema_notes.map((n, i) => <li key={i}>• {n}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Expandable JSON sections */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Context Sections</h2>
            <JsonSection title="Business Profile" data={context.business_profile} defaultOpen icon={<Database className="w-4 h-4 text-primary" />} />
            <JsonSection title="Current Metrics" data={context.current_metrics} defaultOpen icon={<TrendingUp className="w-4 h-4 text-accent" />} />
            <JsonSection title="IQ™ Summary" data={context.iq_summary || context.ciq_summary} icon={<TrendingUp className="w-4 h-4 text-yellow-400" />} />
            <JsonSection title="Gap Summary" data={context.gap_summary} icon={<AlertCircle className="w-4 h-4 text-orange-400" />} />
            <JsonSection title="Top Opportunities" data={context.top_opportunities} icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} />
            <JsonSection title="Next Best Actions" data={context.next_best_actions} icon={<CheckCircle2 className="w-4 h-4 text-primary" />} />
            <JsonSection title="Sprint Status" data={context.roadmap_status} icon={<FileText className="w-4 h-4 text-blue-400" />} />
            <JsonSection title="Verified Value Created" data={context.verified_value_created} icon={<Shield className="w-4 h-4 text-green-400" />} />
            <JsonSection title="Document Summary" data={context.document_summary} icon={<FileText className="w-4 h-4 text-muted-foreground" />} />
            <JsonSection title="Accepted Financial Fields" data={context.accepted_financial_fields} icon={<CheckCircle2 className="w-4 h-4 text-accent" />} />
            <JsonSection title="Advisor Notes Summary" data={context.advisor_notes_summary} icon={<Database className="w-4 h-4 text-purple-400" />} />
            <JsonSection title="Recommended Focus" data={context.recommended_focus} icon={<TrendingUp className="w-4 h-4 text-primary" />} />
            <JsonSection title="Source Quality" data={context.source_quality} icon={<Shield className="w-4 h-4 text-primary" />} />
            <JsonSection title="Financial Snapshots (history)" data={context.financial_snapshots} icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />} />
            <JsonSection title="Chat History (last 5)" data={context.chat_history} icon={<Database className="w-4 h-4 text-muted-foreground" />} />
            <JsonSection title="Meta / Debug" data={context._meta} icon={<Database className="w-4 h-4 text-muted-foreground" />} />
          </div>
        </>
      )}
    </div>
  );
}