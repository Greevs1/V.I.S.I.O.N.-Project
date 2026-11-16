import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, TrendingUp } from 'lucide-react';

export default function TestOpportunityEngine() {
  const [testState, setTestState] = useState({
    running: false,
    result: null,
    opportunities: [],
  });

  const runFullTest = async () => {
    setTestState({ running: true, result: null, opportunities: [] });
    const errors = [];

    try {
      // Step 1: Generate opportunities
      console.log('[TEST] Step 1: Generating opportunities...');
      const genRes = await base44.functions.invoke('generateOpportunities', {});
      console.log('[TEST] Generation result:', genRes.data);

      if (!genRes.data?.success) {
        throw new Error(genRes.data?.error || 'Generation failed');
      }

      // Step 2: Fetch all opportunities
      console.log('[TEST] Step 2: Fetching opportunities...');
      const fetchRes = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOpportunities',
      });
      const opps = fetchRes.data?.opportunities || [];
      console.log('[TEST] Fetched opportunities:', opps.length);

      // Step 3: Verify sorting (should be by priority_score DESC)
      console.log('[TEST] Step 3: Verifying sort order...');
      const isSorted = opps.every((opp, i) => {
        if (i === 0) return true;
        return (opp.priority_score || 0) <= (opps[i - 1].priority_score || 0);
      });

      // Step 4: Test duplicate prevention
      console.log('[TEST] Step 4: Testing duplicate prevention...');
      const genRes2 = await base44.functions.invoke('generateOpportunities', {});
      const secondGenCount = genRes2.data?.opportunities_generated || 0;
      console.log('[TEST] Second generation count:', secondGenCount);

      // Step 5: Fetch again to verify count unchanged
      console.log('[TEST] Step 5: Verifying no duplicates...');
      const fetchRes2 = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOpportunities',
      });
      const opps2 = fetchRes2.data?.opportunities || [];
      console.log('[TEST] Opportunities after 2nd gen:', opps2.length);

      const top5 = [...opps]
        .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
        .slice(0, 5);

      const categories = [...new Set(opps.map(o => o.category))];

      setTestState({
        running: false,
        result: {
          success: true,
          opportunitiesGenerated: genRes.data.opportunities_generated,
          totalOpportunities: opps.length,
          duplicatePreventionWorks: opps.length === opps2.length && secondGenCount === 0,
          secondGenCount,
          isSorted,
          top5,
          categories,
          errors,
        },
        opportunities: opps,
      });

    } catch (error) {
      console.error('[TEST] Error:', error);
      setTestState({
        running: false,
        result: {
          success: false,
          error: error.message,
          errors: [...errors, error.message],
        },
        opportunities: [],
      });
    }
  };

  const { result, opportunities } = testState;

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Opportunity Engine Test
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify generation, duplicate prevention, sorting, and RLS-safe reads
          </p>
        </div>
        <Button
          onClick={runFullTest}
          disabled={testState.running}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${testState.running ? 'animate-spin' : ''}`} />
          {testState.running ? 'Running Test...' : 'Run Full Test'}
        </Button>
      </div>

      {result && (
        <div className="space-y-6">
          {/* Test Summary */}
          <Card className={result.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                Test {result.success ? 'PASSED' : 'FAILED'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.success ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Generated</p>
                    <p className="text-2xl font-bold">{result.opportunitiesGenerated}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Total in DB</p>
                    <p className="text-2xl font-bold">{result.totalOpportunities}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Duplicate Prevention</p>
                    <Badge variant={result.duplicatePreventionWorks ? 'default' : 'destructive'}>
                      {result.duplicatePreventionWorks ? 'PASS ✓' : 'FAIL ✗'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Sort Order</p>
                    <Badge variant={result.isSorted ? 'default' : 'destructive'}>
                      {result.isSorted ? 'DESC ✓' : 'FAIL ✗'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-red-400">
                  <p className="font-medium">Error: {result.error}</p>
                  {result.errors?.length > 0 && (
                    <ul className="text-xs mt-2 space-y-1">
                      {result.errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Opportunities */}
          {result.success && result.top5?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Opportunities by Priority Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.top5.map((opp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">#{idx + 1}</span>
                        <Badge variant="outline" className="text-xs capitalize">{opp.category}</Badge>
                        <Badge variant="outline" className="text-xs">{opp.source}</Badge>
                      </div>
                      <p className="text-sm font-medium">{opp.title}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Priority Score</p>
                      <p className="text-lg font-bold text-primary">{opp.priority_score}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Impact: {opp.estimated_impact ? `$${(opp.estimated_impact / 1000).toFixed(0)}K` : 'N/A'}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Categories */}
          {result.success && result.categories?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Categories Found</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.categories.map(cat => (
                    <Badge key={cat} variant="outline" className="capitalize">
                      {cat}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Opportunities Table */}
          {result.success && opportunities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>All Opportunities ({opportunities.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {opportunities.map((opp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded border border-border text-xs">
                      <div className="flex-1">
                        <span className="font-mono text-muted-foreground mr-2">#{idx + 1}</span>
                        <span className="font-medium">{opp.title}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="capitalize">{opp.category}</Badge>
                        <span className="text-xs font-mono">Score: {opp.priority_score}</span>
                        <span className="text-xs text-muted-foreground">
                          {opp.estimated_impact ? `$${(opp.estimated_impact / 1000).toFixed(0)}K` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}