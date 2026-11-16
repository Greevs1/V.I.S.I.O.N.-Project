import React, { useState } from 'react';
import { X, UserPlus, Loader2, Search, Calendar, Clock, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

const initials = (name) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function AssignWorksheetModal({ worksheet, onClose, onAssigned }) {
  const { supabaseProfile } = useAuth();
  const [selected, setSelected] = useState(new Set(worksheet?.assigned_to || []));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  
  // Scheduling options
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('17:00');
  const [assignTiming, setAssignTiming] = useState('immediately'); // 'immediately' | 'scheduled'
  const [scheduledFor, setScheduledFor] = useState('');
  const [reminderType, setReminderType] = useState('none'); // 'none' | '1_day' | '3_days' | '1_week'
  const [reminderMethod, setReminderMethod] = useState('in_app'); // 'in_app' | 'email' | 'both'

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users-for-assign'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list('-created_date', 200);
      // Enrich with Supabase profile IDs for proper assignment
      const enriched = [];
      for (const u of (allUsers || [])) {
        try {
          const res = await base44.functions.invoke('supabaseUserData', {
            action: 'getProfile',
            data: { _router_user_email: u.email },
          });
          enriched.push({
            ...u,
            supabaseProfileId: res.data?.profile?.id || null,
          });
        } catch {
          enriched.push({ ...u, supabaseProfileId: null });
        }
      }
      console.log('[AssignWorksheetModal] Users with profile IDs:', enriched.map(u => ({ email: u.email, base44Id: u.id, profileId: u.supabaseProfileId })));
      return enriched;
    },
  });

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  const toggle = (id) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleAssign = async () => {
    setSaving(true);
    
    // CRITICAL FIX: Validate inputs first
    if (!worksheet?.id) {
      alert('ERROR: No worksheet selected');
      setSaving(false);
      return;
    }
    
    const selectedBase44Ids = [...selected];
    if (selectedBase44Ids.length === 0) {
      alert('ERROR: No users selected');
      setSaving(false);
      return;
    }
    
    // Get admin profile info
    const adminProfileInfo = supabaseProfile ? {
      id: supabaseProfile.id,
      business_id: supabaseProfile.primary_business_id,
    } : { id: 'MISSING', business_id: 'MISSING' };
    
    // Build due date with time
    let dueDateTime = null;
    if (dueDate) {
      dueDateTime = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:59`;
    }
    
    // Build scheduled_for
    let scheduledFor = null;
    let status = 'assigned';
    if (assignTiming === 'scheduled' && scheduledFor) {
      scheduledFor = scheduledFor;
      status = 'scheduled';
    }
    
    // Build reminder settings
    const reminderSettings = {
      type: reminderType,
      method: reminderMethod,
      enabled: reminderType !== 'none',
    };
    
    // Call backend function for EACH selected user
    const assignmentResults = [];
    let anySuccess = false;
    
    for (const base44Id of selectedBase44Ids) {
      const userWithEmail = users.find(u => u.id === base44Id);
      if (!userWithEmail?.email) {
        assignmentResults.push({ email: 'unknown', success: false, error: 'No email found' });
        continue;
      }
      
      try {
        // DEBUG: Log exact function call
        const functionName = 'assignWorksheetToUser';
        const payload = {
          worksheet_id: worksheet.id,
          target_email: userWithEmail.email,
          due_date: dueDate,
          due_time: dueTime,
          assign_timing: assignTiming,
          scheduled_for: scheduledFor,
          reminder_type: reminderType,
          reminder_method: reminderMethod,
          action: 'assign',
        };
        
        console.log('[WorksheetAssign] ====== FUNCTION CALL DEBUG ======');
        console.log('[WorksheetAssign] Function name:', functionName);
        console.log('[WorksheetAssign] Payload:', payload);
        console.log('[WorksheetAssign] Calling base44.functions.invoke...');
        
        const res = await base44.functions.invoke(functionName, payload);
        
        console.log('[WorksheetAssign Result] Response status:', res.status);
        console.log('[WorksheetAssign Result] Response data:', res.data);
        console.log('[WorksheetAssign Result] ==========================================');
        
        if (res.data?.success && res.data?.assignment_id) {
          anySuccess = true;
          assignmentResults.push({
            email: userWithEmail.email,
            success: true,
            assignment_id: res.data.assignment_id,
            worksheet_id: worksheet.id,
            assigned_to_profile_id: res.data.assigned_to_profile_id,
            assigned_to_business_id: res.data.assigned_to_business_id,
            status: res.data.status,
            error: null,
          });
        } else {
          assignmentResults.push({
            email: userWithEmail.email,
            success: false,
            assignment_id: null,
            error: res.data?.error || 'Unknown error',
          });
        }
      } catch (err) {
        console.error('[AssignWorksheetModal] Assignment failed for', userWithEmail.email, ':', err.message);
        console.error('[AssignWorksheetModal] Full error:', err);
        assignmentResults.push({
          email: userWithEmail.email,
          success: false,
          assignment_id: null,
          error: err.message,
        });
      }
    }
    
    // Update Base44 Worksheet entity (backwards compatibility)
    const profileIds = selectedBase44Ids.map(id => {
      const u = users.find(user => user.id === id);
      return u?.supabaseProfileId || id;
    });
    
    try {
      await base44.entities.Worksheet.update(worksheet.id, { 
        assigned_to: profileIds,
        updated_at: new Date().toISOString(),
      });
      console.log('[AssignWorksheetModal] Base44 Worksheet.updated success');
    } catch (err) {
      console.error('[AssignWorksheetModal] Base44 Worksheet.update failed:', err.message);
    }
    
    const successCount = assignmentResults.filter(r => r.success).length;
    const failCount = assignmentResults.filter(r => !r.success).length;
    console.log('[AssignWorksheetModal] Results:', { successCount, failCount, details: assignmentResults });

    // Invalidate both admin and user-side queries
    window.dispatchEvent(new CustomEvent('worksheet-assigned'));
    onAssigned(assignmentResults);
    setSaving(false);
    
    // Only close modal if at least one assignment succeeded
    if (anySuccess) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Assign Worksheet</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{worksheet?.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full h-9 pl-9 pr-3 bg-secondary border border-border rounded-lg text-sm outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">No users found</p>
          )}
          {filtered.map(u => (
            <label key={u.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selected.has(u.id) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-secondary/50'
            }`}>
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="hidden" />
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {initials(u.full_name || u.email)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              {selected.has(u.id) && (
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                </div>
              )}
            </label>
          ))}
        </div>

        {/* Scheduling Options */}
        <div className="px-5 py-4 border-t border-border space-y-4">
          {/* Due Date */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Due Date</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="flex-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
              />
              <input
                type="time"
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="w-24 h-9 bg-secondary border border-border rounded-lg px-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Assign Timing */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Assign Timing</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={assignTiming === 'immediately'}
                  onChange={() => setAssignTiming('immediately')}
                  className="w-3.5 h-3.5"
                />
                <span className="text-sm">Immediately</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={assignTiming === 'scheduled'}
                  onChange={() => setAssignTiming('scheduled')}
                  className="w-3.5 h-3.5"
                />
                <span className="text-sm">Schedule for later</span>
              </label>
            </div>
            {assignTiming === 'scheduled' && (
              <div className="mt-2 flex gap-2">
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={e => setScheduledFor(e.target.value)}
                  className="flex-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
                />
              </div>
            )}
          </div>

          {/* Reminder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reminder</label>
              <select
                value={reminderType}
                onChange={e => setReminderType(e.target.value)}
                className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
              >
                <option value="none">None</option>
                <option value="1_day">1 day before</option>
                <option value="3_days">3 days before</option>
                <option value="1_week">1 week before</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Method</label>
              <select
                value={reminderMethod}
                onChange={e => setReminderMethod(e.target.value)}
                className="w-full h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/50"
              >
                <option value="in_app">In-app</option>
                <option value="email">Email</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{selected.size} user{selected.size !== 1 ? 's' : ''} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5" onClick={handleAssign} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Save & Assign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}