import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function SupabaseStatus() {
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testSupabaseConnection = async () => {
    setLoading(true);
    setTestResult(null);

    try {
      console.log('[SupabaseStatus] Testing Supabase connection...');
      
      // Test 1: Check environment variables
      console.log('[SupabaseStatus] Test 1: Checking environment variables via backend...');
      const envRes = await base44.functions.invoke('supabaseHealthCheck', {});
      console.log('[SupabaseStatus] Environment check result:', envRes.data);

      // Test 2: Try to get signed upload URL
      console.log('[SupabaseStatus] Test 2: Testing storage upload URL generation...');
      const urlRes = await base44.functions.invoke('getSignedUploadUrl', {
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
      });

      if (urlRes.data?.success) {
        console.log('[SupabaseStatus] Storage test PASSED');
        setTestResult({
          success: true,
          message: 'Supabase storage connection is working correctly!',
          details: urlRes.data,
        });
        toast.success('Supabase connection test passed!');
      } else {
        console.log('[SupabaseStatus] Storage test FAILED:', urlRes.data?.error);
        setTestResult({
          success: false,
          message: 'Storage URL generation failed',
          error: urlRes.data?.error,
          details: urlRes.data?.details,
        });
        toast.error('Storage test failed: ' + urlRes.data?.error);
      }
    } catch (error) {
      console.error('[SupabaseStatus] Test FAILED:', error);
      setTestResult({
        success: false,
        message: 'Connection test failed',
        error: error.message,
      });
      toast.error('Test failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supabase Connection Diagnostic</h1>
        <p className="text-muted-foreground">Test your Supabase storage connection and configuration</p>
      </div>

      <Alert variant={testResult?.success ? 'default' : 'destructive'}>
        {testResult?.success ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        <AlertDescription>
          {testResult?.success 
            ? 'Supabase storage is configured correctly and ready for uploads.'
            : 'Supabase storage connection failed. Follow the steps below to fix.'
          }
        </AlertDescription>
      </Alert>

      <div className="glass rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Test Storage Connection</h2>
        <p className="text-sm text-muted-foreground">
          This will attempt to generate a signed upload URL for the client-documents bucket.
        </p>
        
        <Button 
          onClick={testSupabaseConnection} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            'Run Connection Test'
          )}
        </Button>

        {testResult && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Test Results:</h3>
            <pre className="text-xs overflow-auto max-h-64">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {!testResult?.success && (
        <div className="glass-gold rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-primary">How to Fix "Invalid Compact JWS" Error</h2>
          
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <p className="font-semibold">Step 1: Go to Supabase Dashboard</p>
              <p className="text-muted-foreground">Navigate to your project at https://supabase.com/dashboard</p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Step 2: Go to Project Settings</p>
              <p className="text-muted-foreground">Click on "Project Settings" in the left sidebar → "API"</p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Step 3: Copy Service Role Key</p>
              <p className="text-muted-foreground">
                Under "Project API keys", find the <strong>service_role</strong> key (NOT the anon key).
                Click "Copy" to copy it.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Step 4: Update Environment Variable</p>
              <p className="text-muted-foreground">
                Go to Base44 Dashboard → Settings → Environment Variables.
                Find <code>SUPABASE_SERVICE_ROLE_KEY</code> and paste the new key.
                Save the changes.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Step 5: Restart Backend Functions</p>
              <p className="text-muted-foreground">
                Go to Dashboard → Code → Functions → Select any function → Click "Deploy" (no changes needed).
                This reloads the environment variables.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-semibold">Step 6: Test Again</p>
              <p className="text-muted-foreground">
                Click the "Run Connection Test" button above to verify the fix.
              </p>
            </div>
          </div>

          <Alert className="mt-4 border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertDescription className="text-yellow-500">
              <strong>Important:</strong> The service_role key gives full admin access to your database.
              Never share it publicly or commit it to version control.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}