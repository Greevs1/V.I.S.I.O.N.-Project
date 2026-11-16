/**
 * calendarService — unified calendar operations for V.I.S.I.O.N. Platform.
 *
 * Supports: Google Calendar (OAuth via app_user connector), iCal/Outlook (.ics)
 *
 * Actions:
 *   getConnections       — list connected calendar providers
 *   disconnectProvider   — disconnect a provider
 *   getBookings          — list user's bookings
 *   addBooking           — manually add a booking
 *   updateBooking        — update booking details (reschedule)
 *   cancelBooking        — mark booking cancelled
 *   generateBookingIcs   — ICS download for a booking
 *   generateTaskIcs      — ICS download for a sprint task
 *   generateSprintIcs    — ICS download for full sprint (delegates to ninetyDaySprint)
 *   syncBookingToGoogle  — push booking to Google Calendar
 *   syncTaskToGoogle     — push sprint task to Google Calendar
 *   syncSprintToGoogle   — push all sprint tasks to Google Calendar
 *   getSyncEvents        — list synced calendar events
 *   deleteSyncEvent      — cancel/remove a synced event from calendar
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireBusinessContext } from '../../shared/businessScope/activeBusiness.ts';

// Google Calendar connector ID — same as used by syncRoadmapToCalendar
const GCAL_CONNECTOR_ID = '6a2c49775072452eff268d30';

function getSupabase() {
  const rawUrl = Deno.env.get('VITE_SUPABASE_URL') || '';
  const SUPABASE_URL = rawUrl.replace(/\/(rest\/v1\/?|auth\/v1\/?|storage\/v1\/?).*$/, '').replace(/\/$/, '');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getGoogleToken(base44) {
  try {
    const conn = await base44.asServiceRole.connectors.getCurrentAppUserConnection(GCAL_CONNECTOR_ID);
    return conn.accessToken;
  } catch {
    return null;
  }
}

async function getProfile(sb, email) {
  const { data } = await sb.from('profiles').select('id, primary_business_id').eq('email', email).maybeSingle();
  return data;
}

function buildICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VISION Platform//Calendar Service//EN'];
  for (const ev of events) {
    const uid = ev.uid || `${ev.source_type || 'event'}_${ev.source_id || Date.now()}`;
    const start = ev.isAllDay
      ? `DTSTART;VALUE=DATE:${ev.start_date.replace(/-/g, '')}`
      : `DTSTART:${ev.start_time.replace(/[:-]/g, '').replace(/\.\d+/, '')}`;
    const end = ev.isAllDay
      ? `DTEND;VALUE=DATE:${ev.end_date ? ev.end_date.replace(/-/g, '') : ev.start_date.replace(/-/g, '')}`
      : `DTEND:${ev.end_time ? ev.end_time.replace(/[:-]/g, '').replace(/\.\d+/, '') : ev.start_time.replace(/[:-]/g, '').replace(/\.\d+/, '')}`;

    let desc = ev.description || '';
    if (ev.extra) {
      desc += '\\n\\n' + Object.entries(ev.extra)
        .filter(([,v]) => v)
        .map(([k, v]) => `${k}: ${v}`).join('\\n');
    }
    desc += '\\n\\nManaged by V.I.S.I.O.N. Platform\\u2122';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@vision-platform`,
      start,
      end,
      `SUMMARY:${ev.title}`,
      `DESCRIPTION:${desc}`,
      ev.location ? `LOCATION:${ev.location}` : '',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getSupabase();
    const body = await req.json().catch(() => ({}));
    const { action, data = {} } = body;

    const profile = sb ? await getProfile(sb, user.email) : null;
    const profileId = profile?.id;
    // Phase 6.9B — canonical business resolution. Was `profile?.primary_business_id`.
    const { businessId, denial: bizDenial } = await requireBusinessContext(
      sb, profile, data?.active_business_id, 'calendarService'
    );
    if (bizDenial) return bizDenial;

    // ── GET CONNECTIONS ────────────────────────────────────────────────────
    if (action === 'getConnections') {
      const connections = [];
      // Check Google Calendar
      const googleToken = await getGoogleToken(base44);
      if (googleToken) {
        try {
          const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
            headers: { Authorization: `Bearer ${googleToken}` },
          });
          if (calRes.ok) {
            const calData = await calRes.json();
            connections.push({
              provider: 'google',
              connected: true,
              account_email: calData.id || 'primary',
              calendar_name: calData.summary || 'Google Calendar',
              calendar_id: calData.id,
            });
          }
        } catch { /* token may be expired */ }
      }
      if (!connections.find(c => c.provider === 'google')) {
        connections.push({ provider: 'google', connected: false });
      }
      connections.push({ provider: 'outlook', connected: false, note: 'iCal/Outlook (.ics download available)' });
      connections.push({ provider: 'ical', connected: true, note: 'Apple Calendar / iCal (.ics download available)' });

      return Response.json({ connections });
    }

    // ── DISCONNECT PROVIDER ───────────────────────────────────────────────
    if (action === 'disconnectProvider') {
      const { provider } = data;
      if (provider === 'google') {
        await base44.asServiceRole.connectors.disconnectAppUser(GCAL_CONNECTOR_ID);
      }
      return Response.json({ disconnected: true, provider });
    }

    // ── GET BOOKINGS ──────────────────────────────────────────────────────
    if (action === 'getBookings') {
      const bookings = await base44.entities.UserBooking.filter(
        { created_by_id: user.id }, '-booking_date', 100
      );
      return Response.json({ bookings: bookings || [] });
    }

    // ── ADD BOOKING ──────────────────────────────────────────────────────
    if (action === 'addBooking') {
      const booking = await base44.entities.UserBooking.create({
        title: data.title,
        description: data.description || '',
        booking_date: data.booking_date,
        end_date: data.end_date || null,
        timezone: data.timezone || 'America/Phoenix',
        location: data.location || '',
        attendees: data.attendees || [],
        status: 'scheduled',
        source: data.source || 'manual',
        provider: data.provider || '',
        business_id: businessId || null,
      });
      return Response.json({ booking });
    }

    // ── UPDATE BOOKING ────────────────────────────────────────────────────
    if (action === 'updateBooking') {
      const { booking_id, ...updates } = data;
      const booking = await base44.entities.UserBooking.update(booking_id, updates);
      return Response.json({ booking });
    }

    // ── CANCEL BOOKING ────────────────────────────────────────────────────
    if (action === 'cancelBooking') {
      const { booking_id } = data;
      const booking = await base44.entities.UserBooking.update(booking_id, { status: 'cancelled' });
      // Also cancel any synced events
      const syncedEvents = await base44.asServiceRole.entities.CalendarSyncEvent.filter(
        { source_type: 'booking', source_id: booking_id }
      );
      for (const ev of syncedEvents) {
        if (ev.provider === 'google' && ev.provider_event_id) {
          const gToken = await getGoogleToken(base44);
          if (gToken) {
            try {
              await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.provider_event_id}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${gToken}` } }
              );
            } catch {}
          }
        }
        await base44.asServiceRole.entities.CalendarSyncEvent.update(ev.id, { status: 'cancelled' });
      }
      return Response.json({ booking });
    }

    // ── GENERATE BOOKING ICS ──────────────────────────────────────────────
    if (action === 'generateBookingIcs') {
      const { booking_id } = data;
      const bookings = await base44.entities.UserBooking.filter({ id: booking_id });
      const b = bookings?.[0];
      if (!b) return Response.json({ error: 'Booking not found' }, { status: 404 });

      const isAllDay = !b.booking_date.includes('T');
      const ev = {
        uid: `booking_${b.id}`,
        title: b.title,
        description: b.description || '',
        location: b.location || '',
        source_type: 'booking',
        source_id: b.id,
        isAllDay,
        start_date: isAllDay ? b.booking_date.split('T')[0] : null,
        start_time: isAllDay ? null : b.booking_date,
        end_date: isAllDay && b.end_date ? b.end_date.split('T')[0] : (isAllDay ? b.booking_date.split('T')[0] : null),
        end_time: !isAllDay && b.end_date ? b.end_date : null,
        extra: {
          'Booking:': b.title,
          'Date/Time:': b.booking_date,
        },
      };

      const ics = buildICS([ev]);
      return new Response(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="booking-${b.title.replace(/[^a-z0-9]/gi, '_')}.ics"`,
        },
      });
    }

    // ── GENERATE TASK ICS ─────────────────────────────────────────────────
    if (action === 'generateTaskIcs') {
      const { task_id } = data;
      if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
      const { data: tasks } = await sb.from('ninety_day_sprint_tasks')
        .select('*').eq('id', task_id).maybeSingle();
      if (!tasks) return Response.json({ error: 'Task not found' }, { status: 404 });

      const t = tasks;
      const isAllDay = !t.due_date || !t.due_date.includes('T');
      const ev = {
        uid: `sprint_task_${t.id}`,
        title: `[Sprint] ${t.title}`,
        description: t.description || '',
        source_type: 'sprint_task',
        source_id: t.id,
        isAllDay: true,
        start_date: t.due_date ? t.due_date.split('T')[0] : '',
        end_date: t.due_date ? t.due_date.split('T')[0] : '',
        extra: {
          'Priority:': t.priority,
          'Ease:': t.ease,
          'Impact:': t.impact,
          'Expected:': t.expected_outcome || '',
          'Assigned:': t.assigned_to_name || '',
          'Sprint Path:': t.path_id || '',
        },
      };

      const ics = buildICS([ev]);
      return new Response(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="task-${t.title.replace(/[^a-z0-9]/gi, '_')}.ics"`,
        },
      });
    }

    // ── GENERATE SPRINT ICS ────────────────────────────────────────────────
    if (action === 'generateSprintIcs') {
      // Delegate to existing ninetyDaySprint function
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'generateICS',
        data: { sprint_id: data.sprint_id },
      });
      // ninetyDaySprint returns a Response directly
      if (res instanceof Response) return res;
      return Response.json(res);
    }

    // ── SYNC BOOKING TO GOOGLE ─────────────────────────────────────────────
    if (action === 'syncBookingToGoogle') {
      const { booking_id } = data;
      const gToken = await getGoogleToken(base44);
      if (!gToken) return Response.json({ error: 'Google Calendar not connected' }, { status: 401 });

      const bookings = await base44.entities.UserBooking.filter({ id: booking_id });
      const b = bookings?.[0];
      if (!b) return Response.json({ error: 'Booking not found' }, { status: 404 });

      // Check for existing sync
      const existing = await base44.entities.CalendarSyncEvent.filter(
        { source_type: 'booking', source_id: booking_id, provider: 'google' }
      );

      const eventDate = b.booking_date?.split('T')[0];
      const description = [
        b.description || '',
        b.location ? `Location: ${b.location}` : '',
        '',
        'Managed by V.I.S.I.O.N. Platform™',
      ].filter(Boolean).join('\n');

      const eventBody = {
        summary: b.title,
        description,
        start: { date: eventDate },
        end: { date: b.end_date?.split('T')[0] || eventDate },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
      };

      let result;
      if (existing.length > 0 && existing[0].provider_event_id) {
        const evId = existing[0].provider_event_id;
        const updRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${evId}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
        );
        if (updRes.ok) {
          result = await updRes.json();
        } else if (updRes.status === 404) {
          const createRes = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            { method: 'POST', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
          );
          if (!createRes.ok) return Response.json({ error: 'Failed to create event' }, { status: 500 });
          result = await createRes.json();
        } else {
          return Response.json({ error: 'Failed to update event' }, { status: 500 });
        }
      } else {
        const createRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          { method: 'POST', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
        );
        if (!createRes.ok) {
          const errText = await createRes.text();
          return Response.json({ error: `Google API error: ${errText}` }, { status: 500 });
        }
        result = await createRes.json();
      }

      // Save sync record
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CalendarSyncEvent.update(existing[0].id, {
          provider_event_id: result.id,
          status: 'synced',
          last_synced_at: new Date().toISOString(),
          title: b.title,
          description: b.description || '',
          start_time: b.booking_date,
          end_time: b.end_date || null,
        });
      } else {
        await base44.entities.CalendarSyncEvent.create({
          source_type: 'booking',
          source_id: booking_id,
          provider: 'google',
          provider_event_id: result.id,
          title: b.title,
          description: b.description || '',
          start_time: b.booking_date,
          end_time: b.end_date || null,
          timezone: b.timezone || 'America/Phoenix',
          status: 'synced',
          last_synced_at: new Date().toISOString(),
          business_id: businessId || null,
        });
      }

      return Response.json({ synced: true, event_id: result.id, link: result.htmlLink });
    }

    // ── SYNC TASK TO GOOGLE ────────────────────────────────────────────────
    if (action === 'syncTaskToGoogle') {
      const { task_id } = data;
      const gToken = await getGoogleToken(base44);
      if (!gToken) return Response.json({ error: 'Google Calendar not connected' }, { status: 401 });

      if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
      const { data: tasks } = await sb.from('ninety_day_sprint_tasks').select('*').eq('id', task_id).maybeSingle();
      if (!tasks) return Response.json({ error: 'Task not found' }, { status: 404 });

      const t = tasks;
      if (!t.due_date) return Response.json({ error: 'Task has no due date' }, { status: 400 });

      const existing = await base44.entities.CalendarSyncEvent.filter(
        { source_type: 'sprint_task', source_id: task_id, provider: 'google' }
      );

      const eventDate = t.due_date.split('T')[0];
      const description = [
        t.description || '',
        t.expected_outcome ? `Expected: ${t.expected_outcome}` : '',
        '',
        `Priority: ${t.priority || 'Medium'} | Ease: ${t.ease || 'Medium'} | Impact: ${t.impact || 'Medium'}`,
        t.assigned_to_name ? `Assigned: ${t.assigned_to_name}` : '',
        '',
        'Managed by V.I.S.I.O.N. Platform™ — 90-Day Sprint',
      ].filter(Boolean).join('\n');

      const eventBody = {
        summary: `[Sprint] ${t.title}`,
        description,
        start: { date: eventDate },
        end: { date: eventDate },
        colorId: t.priority === 'critical' || t.priority === 'high' ? '11' : '5',
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
      };

      let result;
      if (existing.length > 0 && existing[0].provider_event_id) {
        const evId = existing[0].provider_event_id;
        const updRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${evId}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
        );
        if (updRes.ok) {
          result = await updRes.json();
        } else if (updRes.status === 404) {
          const createRes = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            { method: 'POST', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
          );
          if (!createRes.ok) return Response.json({ error: 'Failed to create event' }, { status: 500 });
          result = await createRes.json();
        } else {
          return Response.json({ error: 'Failed to update event' }, { status: 500 });
        }
      } else {
        const createRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          { method: 'POST', headers: { Authorization: `Bearer ${gToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
        );
        if (!createRes.ok) return Response.json({ error: 'Google API failed' }, { status: 500 });
        result = await createRes.json();
      }

      if (existing.length > 0) {
        await base44.asServiceRole.entities.CalendarSyncEvent.update(existing[0].id, {
          provider_event_id: result.id,
          status: 'synced',
          last_synced_at: new Date().toISOString(),
          title: t.title,
          start_time: t.due_date,
        });
      } else {
        await base44.entities.CalendarSyncEvent.create({
          source_type: 'sprint_task',
          source_id: task_id,
          provider: 'google',
          provider_event_id: result.id,
          title: t.title,
          description: t.description || '',
          start_time: t.due_date,
          timezone: 'America/Phoenix',
          status: 'synced',
          last_synced_at: new Date().toISOString(),
          business_id: businessId || null,
          sprint_id: t.path_id || null,
        });
      }

      return Response.json({ synced: true, event_id: result.id, link: result.htmlLink });
    }

    // ── SYNC SPRINT TO GOOGLE ──────────────────────────────────────────────
    if (action === 'syncSprintToGoogle') {
      // Delegate to existing syncRoadmapToCalendar which already handles sprint tasks
      const gToken = await getGoogleToken(base44);
      if (!gToken) return Response.json({ error: 'Google Calendar not connected' }, { status: 401 });

      const res = await base44.functions.invoke('syncRoadmapToCalendar', {
        action: 'syncSprintTasks',
        sprint_id: data.sprint_id || null,
        connector_id: GCAL_CONNECTOR_ID,
      });

      // Also create CalendarSyncEvent records for each synced task
      if (res.events) {
        for (const ev of res.events) {
          const existing = await base44.entities.CalendarSyncEvent.filter(
            { source_type: 'sprint_task', source_id: ev.task_id, provider: 'google' }
          );
          if (existing.length === 0) {
            await base44.entities.CalendarSyncEvent.create({
              source_type: 'sprint_task',
              source_id: ev.task_id,
              provider: 'google',
              provider_event_id: ev.event_id,
              title: ev.title,
              start_time: ev.date,
              status: 'synced',
              last_synced_at: new Date().toISOString(),
              business_id: businessId || null,
            });
          }
        }
      }

      return Response.json(res);
    }

    // ── GET SYNC EVENTS ────────────────────────────────────────────────────
    if (action === 'getSyncEvents') {
      const filter = { created_by_id: user.id };
      if (data.source_type) filter.source_type = data.source_type;
      if (data.source_id) filter.source_id = data.source_id;
      const events = await base44.entities.CalendarSyncEvent.filter(filter, '-created_date', 200);
      return Response.json({ events: events || [] });
    }

    // ── DELETE SYNC EVENT ──────────────────────────────────────────────────
    if (action === 'deleteSyncEvent') {
      const { event_id } = data;
      const events = await base44.entities.CalendarSyncEvent.filter({ id: event_id });
      const ev = events?.[0];
      if (!ev) return Response.json({ error: 'Sync event not found' }, { status: 404 });

      // Try to delete from provider
      if (ev.provider === 'google' && ev.provider_event_id) {
        const gToken = await getGoogleToken(base44);
        if (gToken) {
          try {
            await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.provider_event_id}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${gToken}` } }
            );
          } catch { /* best effort */ }
        }
      }

      await base44.asServiceRole.entities.CalendarSyncEvent.update(event_id, { status: 'cancelled' });
      return Response.json({ deleted: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('[calendarService] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});