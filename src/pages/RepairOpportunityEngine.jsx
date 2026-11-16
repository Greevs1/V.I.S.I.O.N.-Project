import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, TrendingUp, Database, Activity } from 'lucide-react';

export default function RepairOpportunityEngine() {
  const [diagnostics, setDiagnostics] = useState({
    loading: true,
    user: null,
    profile: null,
    business: null,
    assessments: [],
    opportunities: [],
    nextBestActions: [],
    errors: [],
  });

  const [repairing, setRepairing] = useState(false);
  const [repairResults, setRepairResults] = useState(null);

  const runDiagnostics = async () => {
    setDiagnostics({ loading: true, user: null, profile: null, business: null, assessments: [], opportunities: [], nextBestActions: [], errors: [] });
    const errors = [];

    try {
      // Step 1: Get current user
      const user = await base44.auth.me();
      console.log('[DIAGNOSTIC] User:', user);

      // Step 2: Get profile
      const profileRes = await base44.functions.invoke('supabaseUserData', { action: 'getProfile' });
      const profile = profileRes.data?.profile;
      console.log('[DIAGNOSTIC] Profile:', profile);

      if (!profile) {
        errors.push('Profile not found');
        setDiagnostics({ loading: false, user, profile: null, business: null, assessments: [], opportunities: [], nextBestActions: [], errors });
        return;
      }

      // Step 3: Check primary_business_id
      let businessId = profile.primary_business_id;
      let business = null;

      if (!businessId) {
        errors.push('primary_business_id is NULL - attempting to resolve');
        // Try to find existing business
        const fullProfileRes = await base44.functions.invoke('supabaseUserData', { action: 'getFullProfile' });
        business = fullProfileRes.data?.business;
        
        if (business) {
          businessId = business.id;
          errors.push(`Found business_entities.id = ${businessId}, but primary_business_id not set`);
        } else {
          errors.push('No business_entities found - will need to create "My Business"');
        }
      } else {
        // Get business details
        const fullProfileRes = await base44.functions.invoke('supabaseUserData', { action: 'getFullProfile' });
        business = fullProfileRes.data?.business;
      }

      // Step 4: Count business_assessments
      const assessmentsRes = await base44.functions.invoke('supabaseUserData', { 
        action: 'getBusinessAssessments',
      });
      const assessments = assessmentsRes.data?.assessments || [];
      console.log('[DIAGNOSTIC] Assessments:', assessments.length);

      // Step 5: Count business_opportunities
      const opportunitiesRes = await base44.functions.invoke('supabaseUserData', { 
        action: 'getBusinessOpportunities',
      });
      const opportunities = opportunitiesRes.data?.opportunities || [];
      console.log('[DIAGNOSTIC] Opportunities:', opportunities.length);

      // Step 6: Count next_best_actions
      const nbaRes = await base44.functions.invoke('supabaseUserData', { 
        action: 'getNextBestActions',
      });
      const nextBestActions = nbaRes.data?.actions || [];
      console.log('[DIAGNOSTIC] Next Best Actions:', nextBestActions.length);

      setDiagnostics({
        loading: false,
        user,
        profile,
        business,
        assessments,
        opportunities,
        nextBestActions,
        errors,
      });

    } catch (error) {
      console.error('[DIAGNOSTIC] Error:', error);
      errors.push(error.message);
      setDiagnostics({ loading: false, user: null, profile: null, business: null, assessments: [], opportunities: [], nextBestActions: [], errors });
    }
  };

  const repairPipeline = async () => {
    setRepairing(true);
    setRepairResults(null);
    const results = { steps: [], errors: [] };

    try {
      // Step 1: Ensure business_id exists
      if (!diagnostics.profile?.primary_business_id) {
        results.steps.push('Creating/finding business entity...');
        
        // Try to find existing business first
        const fullProfileRes = await base44.functions.invoke('supabaseUserData', { action: 'getFullProfile' });
        let businessId = diagnostics.profile?.primary_business_id;

        if (!businessId && fullProfileRes.data?.business) {
          businessId = fullProfileRes.data.business.id;
          results.steps.push(`Found existing business: ${businessId}`);
        }

        if (!businessId) {
          // Need to create business - this requires direct Supabase call
          results.errors.push('Cannot create business entity from frontend - requires backend function');
        }
      }

      const businessId = diagnostics.profile?.primary_business_id || diagnostics.business?.id;

      if (!businessId) {
        results.errors.push('No business_id available - cannot proceed');
        setRepairResults(results);
        setRepairing(false);
        return;
      }

      // Step 2: Generate opportunities if assessments exist but opportunities don't
      if (diagnostics.assessments.length > 0 && diagnostics.opportunities.length === 0) {
        results.steps.push('Generating opportunities from assessments...');
        const genOppRes = await base44.functions.invoke('generateOpportunities', {});
        console.log('[REPAIR] Generate opportunities:', genOppRes.data);
        
        if (genOppRes.data?.success) {
          results.steps.push(`Generated ${genOppRes.data.opportunities_generated || 0} opportunities`);
        } else {
          results.errors.push(genOppRes.data?.error || 'Failed to generate opportunities');
        }
      } else if (diagnostics.assessments.length === 0) {
        results.steps.push('No assessments found - user needs to complete an assessment first');
      }

      // Step 3: Generate next best actions if opportunities exist but NBA don't
      if (diagnostics.opportunities.length > 0 && diagnostics.nextBestActions.length === 0) {
        results.steps.push('Generating next best actions...');
        const genNBARes = await base44.functions.invoke('generateNextBestActions', {});
        console.log('[REPAIR] Generate NBA:', genNBARes.data);
        
        if (genNBARes.data?.primary || genNBARes.data?.success) {
          results.steps.push('Generated next best actions');
        } else {
          results.errors.push(genNBARes.data?.error || 'Failed to generate next best actions');
        }
      }

      // Step 4: Re-fetch to verify
      results.steps.push('Verifying repairs...');
      await runDiagnostics();

      setRepairResults(results);
    } catch (error) {
      console.error('[REPAIR] Error:', error);
      results.errors.push(error.message);
      setRepairResults(results);
    }

    setRepairing(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  if (diagnostics.loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <h1 className="text-2xl font-bold">Running Diagnostics...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6" />
            Opportunity Engine Diagnostics
          </h1>
          <p className="text-muted-foreground">
            Trace pipeline: business_assessments → business_opportunities → next_best_actions
          </p>
        </div>
        <Button onClick={runDiagnostics} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* User & Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current User & Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">User ID</p>
              <p className="font-mono">{diagnostics.user?.id || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-mono">{diagnostics.user?.email || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Profile ID</p>
              <p className="font-mono">{diagnostics.profile?.id || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Primary Business ID</p>
              <Badge variant={diagnostics.profile?.primary_business_id ? 'default' : 'destructive'}>
                {diagnostics.profile?.primary_business_id || 'MISSING'}
              </Badge>
            </div>
            {diagnostics.business && (
              <>
                <div>
                  <p className="text-muted-foreground">Business Name</p>
                  <p className="font-mono">{diagnostics.business.name || diagnostics.business.business_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Business Entity ID</p>
                  <p className="font-mono">{diagnostics.business.id}</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Status */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="w-4 h-4" />
              business_assessments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{diagnostics.assessments.length}</div>
            <p className="text-sm text-muted-foreground">records (profile_id)</p>
            {diagnostics.assessments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {diagnostics.assessments.map(a => (
                  <Badge key={a.id} variant="outline">{a.assessment_type}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              business_opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{diagnostics.opportunities.length}</div>
            <p className="text-sm text-muted-foreground">records (business_id)</p>
            {diagnostics.opportunities.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                Top: {Math.max(...diagnostics.opportunities.map(o => o.priority_score || 0))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              next_best_actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{diagnostics.nextBestActions.length}</div>
            <p className="text-sm text-muted-foreground">recommended (business_id)</p>
            {diagnostics.nextBestActions.length > 0 && (
              <div className="mt-2 text-xs font-medium truncate">
                {diagnostics.nextBestActions[0].title}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Errors */}
      {diagnostics.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {diagnostics.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Repair Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Repair Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button 
              onClick={repairPipeline} 
              disabled={repairing || !diagnostics.profile?.primary_business_id}
            >
              {repairing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Repair Full Pipeline
            </Button>
            
            <Button 
              onClick={async () => {
                try {
                  const res = await base44.functions.invoke('generateOpportunities', {});
                  alert(`Generate Opportunities Result:\n${JSON.stringify(res.data, null, 2)}`);
                  await runDiagnostics();
                } catch (error) {
                  alert(`Error: ${error.message}`);
                }
              }}
              variant="outline"
              disabled={!diagnostics.profile?.primary_business_id}
            >
              Generate Opportunities Now
            </Button>

            <Button 
              onClick={async () => {
                try {
                  setRepairing(true);
                  const res = await base44.functions.invoke('generateNextBestActions', {});
                  setRepairing(false);
                  
                  const report = `=== GENERATE NEXT BEST ACTIONS REPORT ===\n\n` +
                    `Status: ${res.data.error ? 'FAILED' : 'SUCCESS'}\n\n` +
                    `Opportunities Found: ${res.data.total_candidates || 0}\n` +
                    `Filtered (Dismissed): ${res.data.filtered_dismissed || 0}\n\n` +
                    `Selected Opportunity:\n${JSON.stringify(res.data.primary, null, 2)}\n\n` +
                    `Insert Result: ${res.data.insert_result || (res.data.error ? res.data.details : 'N/A')}\n\n` +
                    `Full Response:\n${JSON.stringify(res.data, null, 2)}`;
                  
                  console.log(report);
                  alert(report);
                  await runDiagnostics();
                } catch (error) {
                  setRepairing(false);
                  alert(`Error: ${error.message}`);
                }
              }}
              variant="outline"
              disabled={!diagnostics.profile?.primary_business_id || repairing}
            >
              {repairing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Generate Next Best Action Now
            </Button>

            <Button 
              onClick={async () => {
                try {
                  const res = await base44.functions.invoke('createDiagnosticNextBestAction', {});
                  const report = `=== DIAGNOSTIC NEXT BEST ACTION INSERT ===\n\n` +
                    `Status: ${res.data.success ? '✅ SUCCESS' : '❌ FAILED'}\n\n` +
                    `📊 METRICS:\n` +
                    `• activeBusinessId: ${res.data.activeBusinessId}\n` +
                    `• profileId: ${res.data.profileId}\n` +
                    `• opportunitiesFound: ${res.data.opportunitiesFound}\n` +
                    `• finalNextBestActionsCount: ${res.data.finalNextBestActionsCount}\n` +
                    `• serviceRoleUsed: ${res.data.serviceRoleUsed}\n\n` +
                    `🎯 SELECTED OPPORTUNITY:\n` +
                    `${JSON.stringify(res.data.selectedOpportunity, null, 2)}\n\n` +
                    `📝 INSERT PAYLOAD:\n` +
                    `${JSON.stringify(res.data.insertPayload, null, 2)}\n\n` +
                    `💾 INSERT RESULT:\n` +
                    `${JSON.stringify(res.data.insertData, null, 2)}\n\n` +
                    `⚠️ ERRORS:\n` +
                    `${JSON.stringify(res.data.insertError, null, 2)}\n\n` +
                    `🔍 RLS CHECK:\n` +
                    `${JSON.stringify(res.data.rlsCheck, null, 2)}\n\n` +
                    `🔒 CONSTRAINT CHECK:\n` +
                    `${JSON.stringify(res.data.constraintCheck, null, 2)}\n\n` +
                    `📋 COLUMN CHECK:\n` +
                    `${JSON.stringify(res.data.columnCheck, null, 2)}`;
                  
                  console.log(report);
                  alert(report);
                  await runDiagnostics();
                } catch (error) {
                  alert(`Error: ${error.message}`);
                }
              }}
              variant="destructive"
              disabled={!diagnostics.profile?.primary_business_id}
            >
              <Activity className="w-4 h-4 mr-2" />
              Generate Next Best Action Now (Diagnostic)
            </Button>
          </div>

          {repairResults && (
            <div className="space-y-2">
              <h4 className="font-semibold">Repair Results:</h4>
              {repairResults.steps.length > 0 && (
                <div className="bg-green-50 text-green-800 p-3 rounded text-sm">
                  <strong>Completed:</strong>
                  <ul className="list-disc list-inside">
                    {repairResults.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
              {repairResults.errors.length > 0 && (
                <div className="bg-red-50 text-red-800 p-3 rounded text-sm">
                  <strong>Errors:</strong>
                  <ul className="list-disc list-inside">
                    {repairResults.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failure Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Failure Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>Why Opportunity Queue was empty (ROOT CAUSE):</strong>
            <p className="text-muted-foreground">
              BUG FOUND: getBusinessOpportunities was querying by profile_id but business_opportunities table uses business_id.
              This caused 0 results even when opportunities existed. FIXED to query by business_id.
            </p>
          </div>

          <div>
            <strong>Why Next Best Action is empty:</strong>
            <p className="text-muted-foreground">
              {diagnostics.opportunities.length === 0
                ? 'No business_opportunities exist - NBA generator requires opportunities as input'
                : diagnostics.nextBestActions.length === 0
                ? 'Opportunities exist but generateNextBestActions has not been run OR role check blocking generation'
                : 'Next best actions exist - dashboard should display primary action'}
            </p>
          </div>

          <div>
            <strong>Role Check (generateOpportunities):</strong>
            <p className="text-muted-foreground">
              Current role: <strong>{diagnostics.profile?.app_role || diagnostics.user?.role}</strong>
              Required: admin, super_admin, or advisor
              {diagnostics.profile?.app_role === 'owner' && (
                <span className="text-red-500 block mt-1">⚠️ Owner role cannot generate opportunities - only admin/advisor can</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}