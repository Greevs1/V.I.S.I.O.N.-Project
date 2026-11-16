/**
 * Supabase Client Utility
 * 
 * Provides a centralized, well-logged Supabase client initialization.
 * All backend functions should use this instead of inline initialization.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Initialize Supabase client with service role key.
 * 
 * Logs:
 * - Environment variable existence (true/false)
 * - Variable length (for key validation)
 * - Connection test results
 * 
 * @returns {Object} { client, config, logs }
 */
export function createSupabaseClient() {
  const logs = [];
  const log = (msg) => {
    console.log('[SupabaseClient]', msg);
    logs.push(msg);
  };
  const error = (msg) => {
    console.error('[SupabaseClient] ERROR:', msg);
    logs.push(`ERROR: ${msg}`);
  };

  log('========== INITIALIZATION START ==========');
  
  // STEP 1: Read environment variables
  log('STEP 1: Reading environment variables...');
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  const envExists = {
    url: !!rawUrl,
    key: !!serviceKey
  };
  
  log(`  VITE_SUPABASE_URL exists: ${envExists.url}`);
  log(`  SUPABASE_SERVICE_ROLE_KEY exists: ${envExists.key}`);
  
  if (!envExists.url || !envExists.key) {
    error('CRITICAL: Missing required environment variables');
    error(`  Has URL: ${envExists.url}`);
    error(`  Has Key: ${envExists.key}`);
    throw new Error('Supabase configuration missing. Check environment variables.');
  }
  
  // STEP 2: Validate and clean URL
  log('STEP 2: Cleaning Supabase URL...');
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  log(`  Cleaned URL: ${SUPABASE_URL.substring(0, 40)}...`);
  
  // STEP 3: Log key metadata (never log the actual key)
  log('STEP 3: Validating service role key...');
  log(`  Key length: ${serviceKey.length} characters`);
  log(`  Key format: ${serviceKey.startsWith('eyJ') ? 'Valid JWT format' : 'WARNING: Not JWT format'}`);
  
  if (serviceKey.length < 20) {
    error(`Key too short (${serviceKey.length} chars). Expected ~200+ character JWT.`);
    throw new Error('Invalid service role key length');
  }
  
  // STEP 4: Initialize client
  log('STEP 4: Creating Supabase client...');
  const client = createClient(SUPABASE_URL, serviceKey, {
    auth: { 
      autoRefreshToken: false, 
      persistSession: false 
    }
  });
  
  log('STEP 5: Testing connections...');
  
  return {
    client,
    config: {
      url: SUPABASE_URL,
      keyLength: serviceKey.length,
      keyExists: envExists.key,
      urlExists: envExists.url
    },
    logs,
    testConnections: async () => {
      const results = {
        auth: { connected: false, error: null },
        database: { connected: false, error: null },
        storage: { connected: false, error: null, bucketCount: 0 }
      };
      
      // Test Auth
      try {
        log('  Testing Auth API...');
        const authResult = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
        results.auth.connected = !authResult.error;
        results.auth.error = authResult.error?.message || null;
        log(`    Auth: ${results.auth.connected ? '✓ Connected' : '✗ Failed'}${authResult.error ? ` - ${authResult.error.message}` : ''}`);
      } catch (err) {
        results.auth.connected = false;
        results.auth.error = err.message;
        log(`    Auth: ✗ Failed - ${err.message}`);
      }
      
      // Test Database
      try {
        log('  Testing Database API...');
        const dbResult = await client.rpc('version');
        results.database.connected = !dbResult.error || dbResult.error.code === 'PGRST202';
        results.database.error = results.database.connected ? null : (dbResult.error?.message || null);
        log(`    Database: ${results.database.connected ? '✓ Connected' : '✗ Failed'}${results.database.error ? ` - ${results.database.error}` : ''}`);
      } catch (err) {
        results.database.connected = false;
        results.database.error = err.message;
        log(`    Database: ✗ Failed - ${err.message}`);
      }
      
      // Test Storage
      try {
        log('  Testing Storage API...');
        const storageResult = await client.storage.listBuckets();
        results.storage.connected = !storageResult.error;
        results.storage.error = storageResult.error?.message || null;
        results.storage.bucketCount = storageResult.data?.length || 0;
        log(`    Storage: ${results.storage.connected ? '✓ Connected' : '✗ Failed'}${storageResult.error ? ` - ${storageResult.error.message}` : ''} (${results.storage.bucketCount} buckets)`);
      } catch (err) {
        results.storage.connected = false;
        results.storage.error = err.message;
        log(`    Storage: ✗ Failed - ${err.message}`);
      }
      
      const allConnected = results.auth.connected && results.database.connected && results.storage.connected;
      log(`========== CONNECTION TEST ${allConnected ? 'PASSED' : 'FAILED'} ========== `);
      
      return { results, allConnected };
    }
  };
}

/**
 * Get environment variable status without creating a client.
 * Useful for quick health checks.
 */
export function getSupabaseEnvStatus() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  return {
    urlExists: !!rawUrl,
    keyExists: !!serviceKey,
    keyLength: serviceKey?.length || 0,
    urlCleaned: rawUrl?.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '') || null
  };
}