// Backend function: verifies Supabase connectivity using the service role key.
// This is the ONLY place the service role key is used — never in the frontend.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // ========== ENVIRONMENT VARIABLE VERIFICATION ==========
    console.log('========== SUPABASE ENVIRONMENT CHECK ==========');
    const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const envStatus = {
      urlExists: !!rawUrl,
      keyExists: !!SERVICE_ROLE_KEY,
      keyLength: SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY.length : 0
    };
    
    console.log('[ENV CHECK] VITE_SUPABASE_URL exists:', envStatus.urlExists);
    console.log('[ENV_CHECK] SUPABASE_SERVICE_ROLE_KEY exists:', envStatus.keyExists);
    console.log('[ENV_CHECK] SUPABASE_SERVICE_ROLE_KEY length:', `${envStatus.keyLength} characters`);
    
    if (!rawUrl || !SERVICE_ROLE_KEY) {
      console.error('[ENV_CHECK] CRITICAL: Missing environment variables!');
      return Response.json({
        success: false,
        service_role: false,
        error: 'Missing Supabase environment variables',
        env_vars: envStatus,
      });
    }
    
    // Clean URL
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    console.log('[ENV_CHECK] Cleaned Supabase URL:', SUPABASE_URL.substring(0, 50) + '...');
    console.log('[ENV_CHECK] Service role key format:', SERVICE_ROLE_KEY.startsWith('eyJ') ? 'Valid JWT format' : 'WARNING: Not JWT format');
    console.log('========== ENVIRONMENT CHECK COMPLETE ==========');

    // ========== CLIENT INITIALIZATION ==========
    console.log('[CLIENT] Initializing Supabase client with service role...');
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    console.log('[CLIENT] Client initialized successfully');

    // ========== CONNECTION TESTS ==========
    console.log('========== TESTING SUPABASE CONNECTIONS ==========');
    
    // Test 1: Auth
    console.log('[TEST] Testing Auth API (admin.listUsers)...');
    const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
    const authConnected = !usersError;
    console.log(`[TEST] Auth: ${authConnected ? '✓ SUCCESS' : '✗ FAILED'}${usersError ? ` - ${usersError.message}` : ''}`);
    
    // Test 2: Database
    console.log('[TEST] Testing Database API (rpc version)...');
    const { data: dbData, error: dbError } = await adminClient.rpc('version');
    const dbConnected = !dbError || dbError.code === 'PGRST202';
    console.log(`[TEST] Database: ${dbConnected ? '✓ SUCCESS' : '✗ FAILED'}${dbError ? ` - ${dbError.message}` : ''}`);
    
    // Test 3: Storage
    console.log('[TEST] Testing Storage API (listBuckets)...');
    const { data: buckets, error: bucketsError } = await adminClient.storage.listBuckets();
    const storageConnected = !bucketsError;
    console.log(`[TEST] Storage: ${storageConnected ? '✓ SUCCESS' : '✗ FAILED'}${bucketsError ? ` - ${bucketsError.message}` : ''} (${buckets?.length || 0} buckets)`);
    
    const allConnected = authConnected && dbConnected && storageConnected;
    console.log(`========== CONNECTION TEST ${allConnected ? 'PASSED ✓' : 'FAILED ✗'} ========== `);

    return Response.json({
      success: true,
      service_role: true,
      project_url: rawUrl,
      environment_check: {
        urlExists: envStatus.urlExists,
        keyExists: envStatus.keyExists,
        keyLength: envStatus.keyLength,
        keyFormat: SERVICE_ROLE_KEY.startsWith('eyJ') ? 'JWT' : 'INVALID'
      },
      auth: {
        connected: authConnected,
        error: usersError?.message || null,
        user_count_sample: usersData?.users?.length ?? null,
      },
      database: {
        connected: dbConnected,
        error: dbConnected ? null : (dbError?.message || null),
      },
      storage: {
        connected: storageConnected,
        error: bucketsError?.message || null,
        bucket_count: buckets?.length ?? null,
      },
      all_services_connected: allConnected,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ success: false, service_role: false, error: error.message }, { status: 500 });
  }
});