/**
 * assignSprintVerifier
 * Updates a Supabase sprint path with assigned verifier info and sends notification.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (!isAdmin) return Response.json({ error: 'Admins only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      sprint_id,
      verifier_profile_id,
      verifier_name,
      verifier_email,
      verifier_role,
      verifier_base44_id,
      assigned_by_profile_id,
      client_name,
    } = body;

    if (!sprint_id || !verifier_profile_id) {
      return Response.json({ error: 'sprint_id and verifier_profile_id required' }, { status: 400 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const nowISO = new Date().toISOString();

    // Try full update first; if columns missing, fall back to safe subset
    let updated, error;
    ({ data: updated, error } = await supabase
      .from('ninety_day_sprint_paths')
      .update({
        assigned_verifier_profile_id: verifier_profile_id,
        assigned_verifier_name: verifier_name || null,
        assigned_verifier_email: verifier_email || null,
        assigned_verifier_role: verifier_role || null,
        assigned_verifier_at: nowISO,
        assigned_verifier_by: assigned_by_profile_id || null,
        verification_assignment_status: 'assigned',
        updated_at: nowISO,
      })
      .eq('id', sprint_id)
      .select()
      .single());

    if (error?.message?.includes('column')) {
      // Columns not yet migrated — store in generated_context as fallback
      const fallbackPayload = {
        generated_context: JSON.stringify({
          assigned_verifier_profile_id: verifier_profile_id,
          assigned_verifier_name: verifier_name,
          assigned_verifier_email: verifier_email,
          assigned_verifier_role: verifier_role,
          verification_assignment_status: 'assigned',
          assigned_at: nowISO,
        }),
        updated_at: nowISO,
      };
      ({ data: updated, error } = await supabase
        .from('ninety_day_sprint_paths')
        .update(fallbackPayload)
        .eq('id', sprint_id)
        .select()
        .single());
    }

    if (error) {
      console.error('[assignSprintVerifier] update error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Notify the assigned verifier via their Base44 user ID
    if (verifier_base44_id) {
      try {
        await base44.functions.invoke('notificationService', {
          action: 'createNotification',
          data: {
            recipient_id: verifier_base44_id,
            notification_type: 'sprint_needs_expert_review',
            title: 'Sprint Verification Assigned to You',
            message: `You have been assigned to verify a Galileo-generated 90-Day Sprint for ${client_name || 'a client'}.`,
            related_entity_type: 'NinetyDaySprint',
            related_entity_id: sprint_id,
            action_url: '/advisory/command-center',
            priority: 'high',
          },
        });
      } catch (notifErr) {
        console.warn('[assignSprintVerifier] notification failed:', notifErr.message);
      }
    }

    return Response.json({ sprint: updated, success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});