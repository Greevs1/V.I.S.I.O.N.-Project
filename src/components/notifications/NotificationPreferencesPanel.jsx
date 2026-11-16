import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const PREF_GROUPS = [
  {
    label: 'General',
    items: [
      { key: 'in_app_notifications_enabled', label: 'In-App Notifications', desc: 'Show notifications in the bell icon' },
      { key: 'email_notifications_enabled', label: 'Email Notifications', desc: 'Send email for enabled notification types' },
    ],
  },
  {
    label: 'Notifications',
    items: [
      { key: 'task_assignment_notifications_enabled', label: 'Task Assignments', desc: 'When a sprint task is assigned to you' },
      { key: 'reminder_notifications_enabled', label: 'Reminders', desc: 'When a sprint reminder becomes due' },
      { key: 'document_request_notifications_enabled', label: 'Document Requests', desc: 'When a document is requested from you' },
      { key: 'resource_assignment_notifications_enabled', label: 'Resource Assignments', desc: 'When a consulting resource is assigned to you' },
      { key: 'team_invite_notifications_enabled', label: 'Team Invites', desc: 'When you are invited to a team' },
      { key: 'booking_notifications_enabled', label: 'Bookings', desc: 'When a booking is scheduled, cancelled, or rescheduled' },
      { key: 'sprint_completion_notifications_enabled', label: 'Sprint Completion', desc: 'When sprint tasks or full sprints are completed' },
      { key: 'galileo_update_notifications_enabled', label: 'Galileo Updates', desc: 'When Galileo generates new opportunities or insights' },
      { key: 'weekly_summary_enabled', label: 'Weekly Summary', desc: 'Receive a weekly summary of your progress' },
    ],
  },
];

const DEFAULTS = {
  in_app_notifications_enabled: true,
  email_notifications_enabled: true,
  reminder_notifications_enabled: true,
  task_assignment_notifications_enabled: true,
  document_request_notifications_enabled: true,
  resource_assignment_notifications_enabled: true,
  team_invite_notifications_enabled: true,
  booking_notifications_enabled: true,
  sprint_completion_notifications_enabled: true,
  galileo_update_notifications_enabled: true,
  weekly_summary_enabled: false,
};

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-secondary border border-border'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}

export default function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('notificationService', { action: 'getNotificationPreferences' });
        if (res.data?.preferences) {
          setPrefs({ ...DEFAULTS, ...res.data.preferences });
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.functions.invoke('notificationService', {
        action: 'updateNotificationPreferences',
        data: { preferences: prefs },
      });
      setSaved(true);
      toast.success('Notification preferences saved');
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      toast.error('Failed to save preferences');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6 space-y-6">
      <h2 className="text-lg font-semibold">Notification Preferences</h2>

      {PREF_GROUPS.map(group => (
        <div key={group.label} className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
          <div className="space-y-1 rounded-lg border border-border overflow-hidden">
            {group.items.map((item, idx) => (
              <div
                key={item.key}
                className={`flex items-center justify-between px-4 py-3 ${idx < group.items.length - 1 ? 'border-b border-border/50' : ''} hover:bg-secondary/20 transition-colors`}
              >
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                <Toggle
                  checked={prefs[item.key] !== false}
                  onChange={(val) => setPrefs(p => ({ ...p, [item.key]: val }))}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Preferences'}
      </Button>
    </div>
  );
}