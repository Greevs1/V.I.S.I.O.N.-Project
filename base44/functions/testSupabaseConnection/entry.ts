/**
 * testSupabaseConnection - Diagnostic function to identify Supabase connection issues
 * 
 * This function tests multiple connection methods and returns detailed diagnostics
 * without exposing sensitive secret values.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    function_version: '1.0.0',
    environment: {},
    supabase_config: {},
    tests: {},
    root_cause: null,
  };

  try {
    // STEP 1: Authenticate user (admin only)
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    results.environment = {
      user_email: user.email,
      user_role: user.role,
      platform: 'base44',
      runtime: 'deno',
    };

    // STEP 2: Read environment variables
    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const nodeEnv = Deno.env.get('NODE_ENV');
    const base44Env = Deno.env.get('BASE44_ENV');

    results.environment.node_env = nodeEnv || 'not_set';
    results.environment.base44_env = base44Env || 'not_set';
    results.environment.deploy_timestamp = new Date().toISOString();

    // STEP 3: Safe diagnostics (no secret exposure)
    const cleanedUrl = rawUrl 
      ? rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '')
      : null;

    results.supabase_config = {
      rawUrl_exists: !!rawUrl,
      rawUrl_length: rawUrl ? rawUrl.length : 0,
      cleanedUrl: cleanedUrl,
      cleanedUrl_length: cleanedUrl ? cleanedUrl.length : 0,
      serviceKey_exists: !!serviceKey,
      serviceKey_length: serviceKey ? serviceKey.length : 0,
      serviceKey_prefix_10: serviceKey ? serviceKey.substring(0, 10) : null,
      serviceKey_suffix_6: serviceKey ? serviceKey.substring(serviceKey.length - 6) : null,
      serviceKey_starts_with_eyJ: serviceKey ? serviceKey.startsWith('eyJ') : false,
      serviceKey_starts_with_sb_secret: serviceKey ? serviceKey.startsWith('sb_secret_') : false,
      serviceKey_format: serviceKey 
        ? (serviceKey.startsWith('eyJ') ? 'JWT' 
           : serviceKey.startsWith('sb_secret_') ? 'supabase_cli' 
           : 'unknown')
        : 'missing',
    };

    // Check for common issues
    const issues = [];
    if (!rawUrl) issues.push('VITE_SUPABASE_URL is missing');
    if (!serviceKey) issues.push('SUPABASE_SERVICE_ROLE_KEY is missing');
    if (serviceKey && serviceKey.length < 20) issues.push(`Service key too short (${serviceKey.length} chars, expected 200+)`);
    if (serviceKey && !serviceKey.startsWith('eyJ') && !serviceKey.startsWith('sb_secret_')) issues.push('Service key has unknown format (should start with eyJ or sb_secret_)');
    if (rawUrl && rawUrl.includes('/rest/v1/')) issues.push('URL includes /rest/v1/ - will be cleaned');

    results.supabase_config.detected_issues = issues;

    // STEP 4: Test A - Supabase JS Client
    console.log('[testSupabaseConnection] TEST A: Supabase JS Client...');
    try {
      if (!cleanedUrl || !serviceKey) {
        results.tests.testA_supabase_client = {
          status: 'skipped',
          error: 'Missing configuration',
        };
      } else {
        const client = createClient(cleanedUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data, error } = await client.from('profiles').select('id').limit(1);
        
        results.tests.testA_supabase_client = {
          status: error ? 'failed' : 'success',
          method: 'supabase-js createClient',
          url_used: cleanedUrl,
          key_length_used: serviceKey.length,
          rows_returned: data ? data.length : 0,
          error_message: error ? error.message : null,
          error_code: error ? error.code : null,
          error_details: error ? error.details : null,
          error_hint: error ? error.hint : null,
        };
      }
    } catch (err) {
      results.tests.testA_supabase_client = {
        status: 'failed',
        method: 'supabase-js createClient',
        error_type: err.constructor.name,
        error_message: err.message,
        error_stack: err.stack?.split('\n')[0],
      };
    }

    // STEP 5: Test B - Direct REST API to /rest/v1/profiles
    console.log('[testSupabaseConnection] TEST B: Direct REST API...');
    try {
      if (!cleanedUrl || !serviceKey) {
        results.tests.testB_rest_api = {
          status: 'skipped',
          error: 'Missing configuration',
        };
      } else {
        const restUrl = `${cleanedUrl}/rest/v1/profiles?select=id&limit=1`;
        const response = await fetch(restUrl, {
          method: 'GET',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
        });

        const responseText = await response.text();
        let responseBody;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = responseText.substring(0, 200);
        }

        results.tests.testB_rest_api = {
          status: response.ok ? 'success' : 'failed',
          method: 'fetch REST API',
          url_used: restUrl,
          status_code: response.status,
          status_text: response.statusText,
          headers_received: Object.fromEntries(response.headers.entries()),
          response_body: responseBody,
        };
      }
    } catch (err) {
      results.tests.testB_rest_api = {
        status: 'failed',
        method: 'fetch REST API',
        error_type: err.constructor.name,
        error_message: err.message,
      };
    }

    // STEP 6: Test C - Auth API to /auth/v1/user
    console.log('[testSupabaseConnection] TEST C: Auth API...');
    try {
      if (!cleanedUrl || !serviceKey) {
        results.tests.testC_auth_api = {
          status: 'skipped',
          error: 'Missing configuration',
        };
      } else {
        const authUrl = `${cleanedUrl}/auth/v1/user`;
        const response = await fetch(authUrl, {
          method: 'GET',
          headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
          },
        });

        const responseText = await response.text();
        let responseBody;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = responseText.substring(0, 200);
        }

        results.tests.testC_auth_api = {
          status: response.ok ? 'success' : 'failed',
          method: 'fetch Auth API',
          url_used: authUrl,
          status_code: response.status,
          status_text: response.statusText,
          response_body: responseBody,
        };
      }
    } catch (err) {
      results.tests.testC_auth_api = {
        status: 'failed',
        method: 'fetch Auth API',
        error_type: err.constructor.name,
        error_message: err.message,
      };
    }

    // STEP 7: Determine root cause
    const testA = results.tests.testA_supabase_client;
    const testB = results.tests.testB_rest_api;
    const testC = results.tests.testC_auth_api;

    let rootCause = 'Unknown - review test results';

    if (!rawUrl) {
      rootCause = 'VITE_SUPABASE_URL environment variable is missing';
    } else if (!serviceKey) {
      rootCause = 'SUPABASE_SERVICE_ROLE_KEY environment variable is missing';
    } else if (serviceKey.length < 20) {
      rootCause = `SUPABASE_SERVICE_ROLE_KEY is too short (${serviceKey.length} chars). Expected 200+ character JWT. The key may be truncated or incorrectly copied.`;
    } else if (testB?.status_code === 401 || testC?.status_code === 401) {
      rootCause = 'Invalid API key (401 Unauthorized). The SUPABASE_SERVICE_ROLE_KEY value is incorrect. Get the correct key from Supabase Dashboard → Project Settings → API → service_role secret';
    } else if (testB?.status_code === 400 || testC?.status_code === 400) {
      rootCause = 'Bad request (400). URL may be malformed or key format incompatible';
    } else if (testB?.status_code === 404 || testC?.status_code === 404) {
      rootCause = 'Not found (404). Supabase URL is incorrect or project does not exist';
    } else if (testB?.status_code === 503 || testC?.status_code === 503) {
      rootCause = 'Service unavailable (503). Supabase project may be paused or down';
    } else if (testA?.error_message?.includes('Invalid API key')) {
      rootCause = 'Supabase client reports "Invalid API key". The service_role key is wrong or expired';
    } else if (testA?.error_message?.includes('JWT')) {
      rootCause = 'JWT validation error. The service_role key format is invalid or corrupted';
    } else if (testA?.status === 'success' || testB?.status === 'success') {
      rootCause = 'Connection successful - no issue detected';
    } else if (testA?.error_message?.includes('fetch failed')) {
      rootCause = 'Network error - cannot reach Supabase. Check URL and firewall settings';
    }

    results.root_cause = rootCause;

    // STEP 8: Add recommendations
    results.recommendations = [];
    
    if (serviceKey && serviceKey.length < 100) {
      results.recommendations.push(
        'The service key appears truncated. Go to Supabase Dashboard → Project Settings → API and copy the FULL service_role secret (should be 200+ characters)'
      );
    }
    
    if (serviceKey && !serviceKey.startsWith('eyJ')) {
      results.recommendations.push(
        'Service key should start with "eyJ" (JWT format). Verify you copied the service_role key, not the anon key'
      );
    }

    if (rawUrl && !rawUrl.includes('supabase.co')) {
      results.recommendations.push(
        'Supabase URL should contain "supabase.co". Verify VITE_SUPABASE_URL is correct'
      );
    }

    results.recommendations.push(
      'After updating secrets in Base44 Dashboard → Settings → Secrets, you must redeploy all functions via Dashboard → Code → Functions → Deploy All'
    );

    results.execution_time_ms = Date.now() - startTime;

    return Response.json(results);

  } catch (error) {
    return Response.json({
      error: error.message,
      error_stack: error.stack,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
});