import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useBusinessContext } from '@/lib/BusinessContext';
import { fetchNbaRecommendations } from '@/lib/nbaRecommendations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, RefreshCw, Target } from 'lucide-react';

export default function TestNextBestAction() {
  const { context } = useBusinessContext();
  const activeBusinessId = context.active_business_id;
  const [testState, setTestState] = useState({
    running: false,
    result: null,
  });

  const runTest = async () => {
    setTestState({ running: true, result: null });
    const errors = [];

    try {
      // Step 1: Build canonical BIE recommendations + generate next best actions
      console.log('[TEST] Building BIE recommendations...');
      const recommendations = await fetchNbaRecommendations(activeBusinessId);
      console.log('[TEST] Recommendations:', recommendations.length);
      console.log('[TEST] Generating next best actions...');
      const genRes = await base44.functions.invoke('generateNextBestActions', {
        business_id: activeBusinessId,
        recommendations,
        canonical_version: 1,
      });
      console.log('[TEST] Generation result:', genRes.data);

      if (!genRes.ok || genRes.data?.error) {
        if (genRes.data?.fallback === 'onboarding_required') {
          errors.push('Onboarding required - no business linked');
        } else {
          throw new Error(genRes.data?.error || 'Generation failed');
        }
      }

      // Step 2: Fetch via supabaseUserData
      console.log('[TEST] Fetching via supabaseUserData...');
      const fetchRes = await base44.functions.invoke('supabaseUserData', {
        action: 'getNextBestAction',
        data: { business_id: activeBusinessId, recommendations, canonical_version: 1 },
      });
      console.log('[TEST] Fetch result:', fetchRes.data);

      const primary = fetchRes.data?.primary;
      const secondaries = fetchRes.data?.secondaries || [];
      const reason = fetchRes.data?.reason;

      // Step 3: Validate structure
      console.log('[TEST] Validating structure...');
      const requiredFields = ['title', 'description', 'action_type', 'category', 'priority_score'];
      const missingFields = requiredFields.filter(f => !primary || !(f in primary));

      if (missingFields.length > 0 && !errors.length) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Step 4: Check priority ordering
      console.log('[TEST] Checking priority ordering...');
      const allActions = [primary, ...secondaries].filter(Boolean);
      const isOrdered = allActions.every((action, i) => {
        if (i === 0) return true;
        return (action.priority_score || 0) <= (allActions[i - 1].priority_score || 0);
      });

      // Step 5: Validate action types
      console.log('[TEST] Validating action types...');
      const validTypes = ['data_review', 'continue_roadmap', 'opportunity', 'complete_assessment', 'upload_documents', 'wait_for_analysis'];
      const invalidTypes = allActions.filter(a => !validTypes.includes(a.action_type));

      setTestState({
        running: false,
        result: {
          success: errors.length === 0,
          generationOk: genRes.ok,
          hasPrimary: !!primary,
          primaryTitle: primary?.title,
          primaryType: primary?.action_type,
          primaryScore: primary?.priority_score,
          secondaryCount: secondaries.length,
          reason,
          isOrdered,
          invalidTypes: invalidTypes.length,
          errors,
          raw: fetchRes.data,
        },
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
      });
    }
  };

  const { result } = testState;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Next Best Action Test
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify action generation, scoring, and RLS-safe reads
          </p>
        </div>
        <Button
          onClick={runTest}
          disabled={testState.running}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${testState.running ? 'animate-spin' : ''}`} />
          {testState.running ? 'Running Test...' : 'Run Test'}
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
                    <p className="text-xs text-muted-foreground">Generation OK</p>
                    <Badge variant={result.generationOk ? 'default' : 'destructive'}>
                      {result.generationOk ? 'YES ✓' : 'NO ✗'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Has Primary</p>
                    <Badge variant={result.hasPrimary ? 'default' : 'secondary'}>
                      {result.hasPrimary ? 'YES ✓' : 'NO'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Priority Score</p>
                    <p className="text-2xl font-bold">{result.primaryScore || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Sort Order</p>
                    <Badge variant={result.isOrdered ? 'default' : 'destructive'}>
                      {result.isOrdered ? 'DESC ✓' : 'FAIL ✗'}
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

          {/* Primary Action Details */}
          {result.success && result.primaryTitle && (
            <Card>
              <CardHeader>
                <CardTitle>Primary Action</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{result.primaryTitle}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs capitalize">{result.primaryType}</Badge>
                      <Badge variant="outline" className="text-xs">{result.reason}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Priority</p>
                    <p className="text-2xl font-bold text-primary">{result.primaryScore}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Secondaries: {result.secondaryCount} | Invalid Types: {result.invalidTypes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Raw Response */}
          {result.raw && (
            <Card>
              <CardHeader>
                <CardTitle>Raw Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-[10px] bg-muted p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(result.raw, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}