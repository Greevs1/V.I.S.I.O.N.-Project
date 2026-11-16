/**
 * syncRoadmapToCalendar — syncs roadmap items with due dates to the user's Google Calendar.
 *
 * Actions:
 *   sync    — push all roadmap items with due_date to Google Calendar
 *   status  — check connection status + counts
 *   remove  — remove a specific calendar event (by roadmap_item_id)
 *
 * Uses APP_USER connector mode — each user connects their own calendar.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Replace with your registered connector ID after registration
const CONNECTOR_ID = Deno.env.get('GCAL_CONNECTOR_ID') || '';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
    const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const { action, connector_id } = body;

    // Use provided connector_id (sent from frontend) or fall back to env
    const resolvedConnectorId = connector_id || CONNECTOR_ID;
    if (!resolvedConnectorId) {
      return Response.json({ error: 'Google Calendar connector not configured' }, { status: 500 });
    }

    // Get user's Google Calendar OAuth token
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(resolvedConnectorId);
      accessToken = conn.accessToken;
    } catch (connErr) {
      return Response.json({
        error: 'not_connected',
        message: 'Google Calendar not connected. Please connect your calendar first.',
      }, { status: 401 });
    }

    const authHeader = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // Get user profile for Supabase scoping
    const { data: profile } = await sb.from('profiles').select('id, primary_business_id, app_role').eq('email', user.email).maybeSingle();
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const role = profile.app_role || user.role;
    const isAdminOrAdvisor = ['super_admin', 'advisor', 'admin'].includes(role);

    if (action === 'status') {
      // Try a lightweight API call to verify token
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: authHeader,
      });

      if (!calRes.ok) {
        return Response.json({ connected: false, error: 'Calendar API error' });
      }

      const calData = await calRes.json();

      // Count roadmap items with due_dates
      let riQuery = sb.from('roadmap_items').select('id, due_date').not('due_date', 'is', null);
      if (!isAdminOrAdvisor) {
        riQuery = riQuery.eq('profile_id', profile.id);
      }
      const { data: items } = await riQuery;

      return Response.json({
        connected: true,
        calendar_name: calData.summary || 'Primary Calendar',
        calendar_id: calData.id,
        roadmap_items_with_due_dates: (items || []).length,
      });
    }

    if (action === 'syncSprintTasks') {
      // Fetch sprint tasks with due dates
      const { sprint_id } = body;

      let taskQuery = sb.from('ninety_day_sprint_tasks')
        .select('id, title, description, due_date, status, priority, ease, impact, expected_outcome, sprint_cal_event_id, assigned_to_name, path_id')
        .not('due_date', 'is', null)
        .neq('is_deleted', true);

      if (!isAdminOrAdvisor) {
        taskQuery = taskQuery.eq('profile_id', profile.id);
      }
      if (sprint_id) {
        taskQuery = taskQuery.eq('path_id', sprint_id);
      }

      const { data: sprintTasks, error: stErr } = await taskQuery;
      if (stErr) throw new Error(stErr.message);
      if (!sprintTasks || sprintTasks.length === 0) {
        return Response.json({ synced: 0, skipped: 0, errors: [], message: 'No sprint tasks with due dates found' });
      }

      const results = { synced: 0, skipped: 0, errors: [], events: [] };

      for (const task of sprintTasks) {
        try {
          const eventDate = task.due_date.split('T')[0];
          const title = `[Sprint] ${task.title}`;
          const description = [
            task.description || '',
            task.expected_outcome ? `Expected: ${task.expected_outcome}` : '',
            '',
            `Priority: ${task.priority || 'Medium'}`,
            `Ease: ${task.ease || 'Medium'}`,
            `Impact: ${task.impact || 'Medium'}`,
            `Status: ${task.status || 'Not Started'}`,
            task.assigned_to_name ? `Assigned: ${task.assigned_to_name}` : '',
            '',
            'Managed by V.I.S.I.O.N. Platform™ — 90-Day Sprint',
          ].filter(Boolean).join('\n');

          const eventBody = {
            summary: title,
            description,
            start: { date: eventDate },
            end: { date: eventDate },
            colorId: task.priority === 'critical' || task.priority === 'high' ? '11' : task.priority === 'medium' ? '5' : '10',
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: 1440 }],
            },
          };

          let eventRes;
          if (task.sprint_cal_event_id) {
            eventRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.sprint_cal_event_id}`,
              { method: 'PUT', headers: authHeader, body: JSON.stringify(eventBody) }
            );
            if (eventRes.status === 404) {
              eventRes = await fetch(
                'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                { method: 'POST', headers: authHeader, body: JSON.stringify(eventBody) }
              );
            }
          } else {
            eventRes = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events',
              { method: 'POST', headers: authHeader, body: JSON.stringify(eventBody) }
            );
          }

          if (eventRes.ok) {
            const eventData = await eventRes.json();
            await sb.from('ninety_day_sprint_tasks').update({
              sprint_cal_event_id: eventData.id,
              updated_at: new Date().toISOString(),
            }).eq('id', task.id);

            results.synced++;
            results.events.push({ task_id: task.id, event_id: eventData.id, title: task.title, date: eventDate });
          } else {
            const errData = await eventRes.json().catch(() => ({}));
            results.errors.push({ task_id: task.id, title: task.title, error: errData.error?.message || 'Unknown error' });
          }
        } catch (itemErr) {
          results.errors.push({ task_id: task.id, title: task.title, error: itemErr.message });
        }
      }

      return Response.json(results);
    }

    if (action === 'sync') {
      // Fetch roadmap items for this user
      let riQuery = sb.from('roadmap_items')
        .select('id, title, description, due_date, status, priority, category, estimated_value_created, business_id, gcal_event_id')
        .not('due_date', 'is', null)
        .not('status', 'in', '("Dismissed","Verified")');

      if (!isAdminOrAdvisor) {
        riQuery = riQuery.eq('profile_id', profile.id);
      } else if (body.business_id) {
        riQuery = riQuery.eq('business_id', body.business_id);
      }

      const { data: items, error: riErr } = await riQuery;
      if (riErr) throw new Error(riErr.message);
      if (!items || items.length === 0) {
        return Response.json({ synced: 0, skipped: 0, errors: [], message: 'No roadmap items with due dates found' });
      }

      const results = { synced: 0, skipped: 0, errors: [], events: [] };

      for (const item of items) {
        try {
          const eventDate = item.due_date.split('T')[0]; // YYYY-MM-DD
          const title = `[CII Roadmap] ${item.title}`;
          const description = [
            item.description || '',
            '',
            `Category: ${item.category || 'General'}`,
            `Priority: ${item.priority || 'Medium'}`,
            `Status: ${item.status || 'Not Started'}`,
            item.estimated_value_created
              ? `Estimated Value: $${Math.round(item.estimated_value_created).toLocaleString()}`
              : '',
            '',
            'Managed by Capital Impact Intelligence™',
          ].filter(Boolean).join('\n');

          const eventBody = {
            summary: title,
            description,
            start: { date: eventDate },
            end: { date: eventDate },
            colorId: item.priority === 'High' ? '11' : item.priority === 'Medium' ? '5' : '10', // red/yellow/green
            reminders: {
              useDefault: false,
              overrides: [{ method: 'popup', minutes: 1440 }], // 1 day before
            },
          };

          let eventRes;
          if (item.gcal_event_id) {
            // Update existing event
            eventRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${item.gcal_event_id}`,
              { method: 'PUT', headers: authHeader, body: JSON.stringify(eventBody) }
            );
            if (eventRes.status === 404) {
              // Event was deleted from calendar — create fresh
              eventRes = await fetch(
                'https://www.googleapis.com/calendar/v3/calendars/primary/events',
                { method: 'POST', headers: authHeader, body: JSON.stringify(eventBody) }
              );
            }
          } else {
            // Create new event
            eventRes = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events',
              { method: 'POST', headers: authHeader, body: JSON.stringify(eventBody) }
            );
          }

          if (eventRes.ok) {
            const eventData = await eventRes.json();
            // Store the event ID back on the roadmap item
            await sb.from('roadmap_items').update({
              gcal_event_id: eventData.id,
              updated_at: new Date().toISOString(),
            }).eq('id', item.id);

            results.synced++;
            results.events.push({ roadmap_id: item.id, event_id: eventData.id, title: item.title, date: eventDate });
          } else {
            const errData = await eventRes.json().catch(() => ({}));
            results.errors.push({ roadmap_id: item.id, title: item.title, error: errData.error?.message || 'Unknown error' });
          }
        } catch (itemErr) {
          results.errors.push({ roadmap_id: item.id, title: item.title, error: itemErr.message });
        }
      }

      return Response.json(results);
    }

    if (action === 'remove') {
      const { roadmap_item_id } = body;
      if (!roadmap_item_id) return Response.json({ error: 'roadmap_item_id required' }, { status: 400 });

      const { data: item } = await sb.from('roadmap_items')
        .select('id, profile_id, gcal_event_id, title')
        .eq('id', roadmap_item_id).maybeSingle();

      if (!item) return Response.json({ error: 'Roadmap item not found' }, { status: 404 });
      if (!isAdminOrAdvisor && item.profile_id !== profile.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      if (!item.gcal_event_id) return Response.json({ removed: false, message: 'No calendar event linked' });

      const delRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${item.gcal_event_id}`,
        { method: 'DELETE', headers: authHeader }
      );

      if (delRes.ok || delRes.status === 404) {
        await sb.from('roadmap_items').update({ gcal_event_id: null, updated_at: new Date().toISOString() }).eq('id', roadmap_item_id);
        return Response.json({ removed: true, title: item.title });
      }

      const errData = await delRes.json().catch(() => ({}));
      return Response.json({ removed: false, error: errData.error?.message || 'Delete failed' });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});