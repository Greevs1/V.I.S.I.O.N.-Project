/**
 * assignWorksheetToUser - DEBUG VERSION with extensive logging
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const logs = [];
  const log = (msg, data) => {
    logs.push({ msg, data, time: new Date().toISOString() });
    console.log('[DEBUG]', msg, data);
  };

  try {
    log('========== FUNCTION START ==========');
    const base44 = createClientFromRequest(req);
    log('Created base44 client from request');
    
    const user = await base44.auth.me();
    log('Auth user:', { email: user?.email, role: user?.role, id: user?.id });
    
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      return Response.json({ error: 'Admin access required', logs }, { status: 403 });
    }

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    log('Supabase config:', { url_exists: !!rawUrl, key_exists: !!SERVICE_KEY, key_length: SERVICE_KEY?.length });
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured', logs }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    log('Created Supabase client');

    const body = await req.json().catch(() => ({}));
    const { 
      worksheet_id, 
      target_email, 
      due_date, 
      due_time,
      assign_timing = 'immediately',
      scheduled_for,
      reminder_type = 'none',
      reminder_method = 'in_app',
      action = 'assign'
    } = body;

    log('Request body:', body);

    // Get admin profile
    log('Querying admin profile for:', user.email);
    const { data: adminProfile, error: adminProfileErr } = await sb.from('profiles')
      .select('id, primary_business_id')
      .eq('email', user.email)
      .maybeSingle();
    
    if (adminProfileErr) log('Admin profile error:', adminProfileErr);
    log('Admin profile:', adminProfile);
    
    if (!adminProfile) {
      return Response.json({ error: 'Admin profile not found', logs }, { status: 404 });
    }

    const adminProfileId = adminProfile.id;
    log('Admin profile ID:', adminProfileId);

    // Validate worksheet_id
    if (!worksheet_id) {
      return Response.json({ error: 'worksheet_id required', logs }, { status: 400 });
    }

    // Verify worksheet exists in Base44
    log('Checking worksheet exists in Base44:', worksheet_id);
    try {
      const worksheet = await base44.asServiceRole.entities.Worksheet.get(worksheet_id);
      log('Worksheet found:', { id: worksheet?.id, title: worksheet?.title, status: worksheet?.status });
      if (!worksheet) {
        return Response.json({ error: 'Worksheet not found', logs }, { status: 404 });
      }
    } catch (err) {
      log('Worksheet check error:', err.message);
      return Response.json({ error: 'Invalid worksheet_id: ' + err.message, logs }, { status: 400 });
    }

    // ASSIGN WORKSHEET
    if (action === 'assign') {
      if (!target_email) {
        return Response.json({ error: 'target_email required', logs }, { status: 400 });
      }

      // Get target profile
      log('Querying target profile for:', target_email);
      const { data: targetProfile, error: targetProfileErr } = await sb.from('profiles')
        .select('id, primary_business_id')
        .eq('email', target_email.toLowerCase())
        .maybeSingle();

      if (targetProfileErr) log('Target profile error:', targetProfileErr);
      log('Target profile:', targetProfile);

      if (!targetProfile) {
        return Response.json({ error: `User not found: ${target_email}`, logs }, { status: 404 });
      }

      const targetProfileId = targetProfile.id;
      const targetBusinessId = targetProfile.primary_business_id;
      log('Target profile ID:', targetProfileId, 'Business ID:', targetBusinessId);

      // Check for existing active assignment
      const { data: existing, error: existingErr } = await sb.from('worksheet_assignments')
        .select('id, status')
        .eq('worksheet_id', worksheet_id)
        .eq('assigned_to_profile_id', targetProfileId)
        .in('status', ['assigned', 'scheduled', 'in_progress'])
        .maybeSingle();

      if (existingErr) log('Existing assignment check error:', existingErr);
      log('Existing assignment:', existing);

      if (existing) {
        return Response.json({ 
          error: 'Worksheet already assigned to this user',
          already_assigned: true,
          assignment_id: existing.id,
          logs 
        }, { status: 400 });
      }

      // Build assignment payload
      const now = new Date().toISOString();
      
      let dueDateTime = null;
      if (due_date) {
        dueDateTime = due_time ? `${due_date}T${due_time}:00` : `${due_date}T23:59:59`;
      }

      let scheduledFor = null;
      let status = 'assigned';
      
      if (assign_timing === 'scheduled' && scheduled_for) {
        scheduledFor = scheduled_for;
        status = 'scheduled';
      }

      const reminderSettings = {
        type: reminder_type,
        method: reminder_method,
        enabled: reminder_type !== 'none',
      };

      log('Insert payload:', {
        worksheet_id,
        assigned_to_profile_id: targetProfileId,
        assigned_to_business_id: targetBusinessId,
        assigned_by_profile_id: adminProfileId,
        status,
        due_date: dueDateTime,
        scheduled_for: scheduledFor,
        reminder_settings: reminderSettings,
      });

      // Create worksheet_assignments record
      const { data: assignment, error: insertErr } = await sb.from('worksheet_assignments')
        .insert({
          worksheet_id,
          assigned_to_profile_id: targetProfileId,
          assigned_to_business_id: targetBusinessId,
          assigned_by_profile_id: adminProfileId,
          status,
          due_date: dueDateTime,
          scheduled_for: scheduledFor,
          reminder_settings: reminderSettings,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (insertErr) {
        log('INSERT ERROR:', insertErr);
        return Response.json({ error: insertErr.message, logs }, { status: 500 });
      }

      log('✓ INSERT SUCCESS:', assignment);

      // Update Base44 Worksheet entity
      try {
        const worksheet = await base44.asServiceRole.entities.Worksheet.get(worksheet_id);
        const currentAssigned = worksheet.assigned_to || [];
        if (!currentAssigned.includes(targetProfileId)) {
          await base44.entities.Worksheet.update(worksheet_id, {
            assigned_to: [...currentAssigned, targetProfileId],
            updated_at: now,
          });
          log('✓ Base44 entity updated');
        }
      } catch (err) {
        log('Base44 update failed (non-fatal):', err.message);
      }

      // Fire notification
      try {
        const allUsers = await base44.asServiceRole.entities.User.filter({ email: target_email.toLowerCase() });
        const recipientUser = allUsers?.[0];
        
        if (recipientUser) {
          const worksheet = await base44.asServiceRole.entities.Worksheet.get(worksheet_id);
          
          await base44.asServiceRole.entities.Notification.create({
            recipient_id: recipientUser.id,
            recipient_profile_id: targetProfileId,
            sender_id: user.id,
            business_id: targetBusinessId,
            notification_type: 'worksheet_assigned',
            notification_category: 'action_required',
            title: 'New Worksheet Assigned',
            message: `Your advisory team has assigned "${worksheet.title}" for you to complete.`,
            related_entity_type: 'Worksheet',
            related_entity_id: worksheet_id,
            action_url: '/advisory/resources',
            priority: 'medium',
            metadata: {
              worksheet_title: worksheet.title,
              due_date: dueDateTime,
              scheduled_for: scheduledFor,
            },
          });
          log('✓ Notification sent');
        }
      } catch (notifErr) {
        log('Notification failed (non-fatal):', notifErr.message);
      }

      return Response.json({
        success: true,
        assignment_id: assignment.id,
        worksheet_id,
        assigned_to_profile_id: targetProfileId,
        assigned_to_email: target_email,
        status,
        due_date: dueDateTime,
        scheduled_for: scheduledFor,
        logs,
      });
    }

    return Response.json({ error: `Unknown action: ${action}`, logs }, { status: 400 });

  } catch (err) {
    log('CATCH ERROR:', err.message);
    return Response.json({ error: err.message, logs }, { status: 500 });
  }
});