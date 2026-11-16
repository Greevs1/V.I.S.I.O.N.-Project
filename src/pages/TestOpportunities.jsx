import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

export default function TestOpportunities() {
  const [testResult, setTestResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const { data: opportunities, refetch } = useQuery({
    queryKey: ['businessOpportunities'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOpportunities',
      });
      return res.data?.opportunities || [];
    },
    initialData: [],
  });

  const runTest = async () => {
    setIsRunning(true);
    setTestResult(null);
    
    try {
      // Test 1: Generate opportunities
      const genRes = await base44.functions.invoke('generateOpportunities', {});
      
      // Test 2: Fetch opportunities to verify creation
      const fetchRes = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOpportunities',
      });
      
      const opps = fetchRes.data?.opportunities || [];
      
      // Test 3: Check for duplicates (run generate again)
      const genRes2 = await base44.functions.invoke('generateOpportunities', {});
      
      // Test 4: Fetch again to verify no duplicates
      const fetchRes2 = await base44.functions.invoke('supabaseUserData', {
        action: 'getBusinessOpportunities',
      });
      
      const opps2 = fetchRes2.data?.opportunities || [];
      
      // Analyze results
      const top5 = opps
        .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
        .slice(0, 5);
      
      const categories = [...new Set(opps.map(o => o.category))];
      
      setTestResult({
        success: true,
        opportunitiesGenerated: genRes.data?.opportunities_generated || 0,
        totalOpportunities: opps.length,
        duplicatePreventionWorks: opps.length === opps2.length,
        secondGenCount: genRes2.data?.opportunities_generated || 0,
        top5,
        categories,
        errors: [],
      });
    } catch (error) {
      setTestResult({
        success: false,
        error: error.message,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Opportunity Engine Test</h1>
          <p className="text-sm text-muted-foreground">
            Test generateOpportunities function and verify results
          </p>
        </div>
        <Button
          onClick={runTest}
          disabled={isRunning}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Running Test...' : 'Run Test'}
        </Button>
      </div>

      {testResult && (
        <div className="space-y-6">
          {/* Test Summary */}
          <Card className={testResult.success ? 'border-green-500/30' : 'border-red-500/30'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                Test {testResult.success ? 'Passed' : 'Failed'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {testResult.success ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Opportunities Generated</p>
                      <p className="text-2xl font-bold">{testResult.opportunitiesGenerated}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total in Database</p>
                      <p className="text-2xl font-bold">{testResult.totalOpportunities}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Duplicate Prevention</p>
                      <Badge variant={testResult.duplicatePreventionWorks ? 'default' : 'destructive'}>
                        {testResult.duplicatePreventionWorks ? 'Working ✓' : 'Failed ✗'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Second Gen Count</p>
                      <p className="text-2xl font-bold">{testResult.secondGenCount}</p>
                    </div>
                  </div>
                  
                  {testResult.categories.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Categories Found</p>
                      <div className="flex flex-wrap gap-2">
                        {testResult.categories.map(cat => (
                          <Badge key={cat} variant="outline" className="capitalize">
                            {cat}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-red-500">
                  <p className="font-medium">Error: {testResult.error}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Opportunities */}
          {testResult.success && testResult.top5.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top 5 Opportunities by Priority Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {testResult.top5.map((opp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-secondary rounded-lg border border-border">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                        <Badge className="capitalize">{opp.category}</Badge>
                        <Badge variant="outline">Priority: {opp.priority_score}</Badge>
                      </div>
                      <p className="font-medium">{opp.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{opp.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Est. Impact</p>
                      <p className="text-lg font-bold text-primary">
                        ${((opp.estimated_impact || 0) / 1000).toFixed(0)}K
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* All Opportunities */}
          {testResult.success && opportunities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>All Opportunities (Sorted by Priority)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {opportunities
                    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
                    .map((opp, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="w-16 justify-center">
                            P: {opp.priority_score}
                          </Badge>
                          <Badge className="capitalize">{opp.category}</Badge>
                          <span className="font-medium text-sm">{opp.title}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Source: {opp.source}
                        </span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!testResult && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Click "Run Test" to verify the opportunity engine</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}