/**
 * createBusinessEntity — Create a new business entity for the user's enterprise
 * 
 * Creates a business record and sets up ownership linkage.
 * Used by Enterprise Discovery™ workflow.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const { action, data } = body;

    if (action === 'createBusinessEntity') {
      // Resolve profile
      const { data: profile } = await sb
        .from('profiles')
        .select('id, primary_business_id')
        .eq('email', user.email)
        .maybeSingle();

      if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

      const profileId = profile.id;

      // Create business entity
      const { data: business, error: bizErr } = await sb
        .from('business_entities')
        .insert({
          business_name: data.business_name,
          entity_type: data.entity_type || 'llc',
          created_by_profile_id: profileId,
        })
        .select()
        .single();

      if (bizErr) throw new Error(`Failed to create business: ${bizErr.message}`);

      // Create ownership record
      const { error: ownerErr } = await sb
        .from('business_owners')
        .insert({
          profile_id: profileId,
          business_id: business.id,
          ownership_percentage: data.ownership_percentage || 100,
          ownership_type: 'direct_individual',
          is_primary_owner: !profile.primary_business_id, // First business is primary
        });

      if (ownerErr) throw new Error(`Failed to create ownership record: ${ownerErr.message}`);

      // Update profile's primary_business_id if this is the first business
      if (!profile.primary_business_id) {
        await sb.from('profiles').update({ primary_business_id: business.id }).eq('id', profileId);
      }

      return Response.json({
        success: true,
        business: {
          id: business.id,
          business_name: business.business_name,
          entity_type: business.entity_type,
          ownership_percentage: data.ownership_percentage,
        },
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});