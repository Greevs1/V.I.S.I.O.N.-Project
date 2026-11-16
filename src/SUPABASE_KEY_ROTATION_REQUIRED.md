# Supabase Service Role Key - CRITICAL ISSUE IDENTIFIED

## Problem Summary

The `SUPABASE_SERVICE_ROLE_KEY` environment variable contains an **invalid/corrupted key**.

### Current State:
```
✅ VITE_SUPABASE_URL: EXISTS
❌ SUPABASE_SERVICE_ROLE_KEY: EXISTS BUT INVALID
   - Current length: 41 characters
   - Expected length: ~200+ characters
   - Format: INVALID (doesn't start with 'eyJ')
```

### Why This Fails:
A valid Supabase service role key is a **JWT token** that:
- Starts with `eyJ`
- Is typically 200-300 characters long
- Contains three base64-encoded parts separated by dots

Your current key (41 chars) is **too short** and **not a valid JWT**, causing:
- ❌ Storage API calls to fail with "Invalid Compact JWS"
- ❌ Authentication failures when accessing protected resources
- ❌ Database write operations to be rejected

## IMMEDIATE ACTION REQUIRED

### Step 1: Get New Service Role Key

1. Go to **https://supabase.com/dashboard**
2. Select your project: `tfrbswfrhrtgfcgonimb`
3. Navigate to **Settings** (gear icon) → **API**
4. Find **"Project API keys"** section
5. Click **"Reveal"** next to `service_role` key
6. **Copy the ENTIRE key** (should be ~200+ characters, starts with `eyJ`)

### Step 2: Update Base44 Environment Variable

1. Go to **Base44 Dashboard** → Your App → **Settings** → **Environment Variables**
2. Find `SUPABASE_SERVICE_ROLE_KEY`
3. **Delete the old value** and **paste the new key**
4. **Save** changes

### Step 3: Redeploy Backend Functions

1. Go to **Base44 Dashboard** → **Code** → **Functions**
2. Click **"Deploy All"** or deploy each function individually:
   - `getSignedUploadUrl`
   - `uploadDocumentDirect`
   - `supabaseUserData`
   - `supabaseHealthCheck`
3. Wait for all deployments to complete

### Step 4: Verify Fix

1. Test the health check:
   ```
   Base44 Dashboard → Code → Functions → supabaseHealthCheck → Test
   Payload: {}
   ```

2. **Expected Response:**
   ```json
   {
     "success": true,
     "service_role": true,
     "environment_check": {
       "urlExists": true,
       "keyExists": true,
       "keyLength": 200+,  // Should be 200+ now
       "keyFormat": "VALID"  // Should say VALID
     },
     "auth": { "connected": true },
     "database": { "connected": true },
     "storage": { "connected": true, "bucket_count": 2 },
     "all_services_connected": true
   }
   ```

3. Test document upload in your app

## Backend Functions Updated

All functions now include comprehensive logging:

### `supabaseHealthCheck`
- ✅ Logs environment variable existence (true/false)
- ✅ Logs key length in characters
- ✅ Validates JWT format (starts with 'eyJ')
- ✅ Warns if key is too short (< 100 chars)
- ✅ Tests Auth, Database, Storage connections

### `getSignedUploadUrl`
- ✅ Logs environment variable check
- ✅ Logs key length and format
- ✅ Detailed step-by-step execution logs
- ✅ Specific error messages for each failure point

### `uploadDocumentDirect`
- ✅ Logs environment variable verification
- ✅ Logs key validation results
- ✅ Comprehensive database operation logging
- ✅ Rollback mechanism on failures

### `supabaseUserData`
- ✅ Logs environment check at initialization
- ✅ Validates key format before use
- ✅ Logs all database operations

## Verification Checklist

After updating the key, verify:

- [ ] Environment variable updated in Base44
- [ ] Key length is 200+ characters
- [ ] Key format starts with `eyJ`
- [ ] All backend functions redeployed
- [ ] `supabaseHealthCheck` returns all services connected
- [ ] Document upload succeeds without "Invalid Compact JWS" error
- [ ] Files appear in Supabase Storage bucket `client-documents`
- [ ] Documents table inserts succeed
- [ ] Document_analysis table inserts succeed

## Contact Support If...

If you've rotated the key and it still fails:
1. Verify you copied the **entire** key (no missing characters)
2. Check there are **no extra spaces** or line breaks
3. Confirm you're using the **service_role** key (not anon/public key)
4. Contact Base44 support with the exact error logs

## Success Indicators

When the key is valid, you'll see:

```
[supabaseHealthCheck] ========== ENVIRONMENT VERIFICATION ==========
[supabaseHealthCheck] VITE_SUPABASE_URL exists: true
[supabaseHealthCheck] SUPABASE_SERVICE_ROLE_KEY exists: true
[supabaseHealthCheck] SUPABASE_SERVICE_ROLE_KEY length: 215 characters
[supabaseHealthCheck] Key format: Valid JWT format ✓
[supabaseHealthCheck] ========== ENVIRONMENT VERIFICATION COMPLETE ==========
[supabaseHealthCheck] Auth connected: true
[supabaseHealthCheck] Database connected: true
[supabaseHealthCheck] Storage connected: true
``