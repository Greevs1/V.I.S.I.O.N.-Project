import React, { useState } from 'react';
import { X, Clock, Calendar, Loader2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const REMINDER_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'before_due', label: 'Before Due Date' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom Date/Time' },
];

export default function ReminderModal({ onClose, taskId, sprintId, onSaved }) {
  const [selectedType, setSelectedType] = useState('before_due');
  const [customDate, setCustomDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'setReminder',
        data: {
          sprint_id: sprintId,
          task_id: taskId || null,
          reminder_type: selectedType,
          reminder_datetime: selectedType === 'custom' ? customDate : null,
        },
      });
      if (res.data?.note) setSavedNote(res.data.note);
      if (onSaved) onSaved(res.data?.reminder);
    } catch (e) {
      console.error('setReminder error:', e);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-xl w-full max-w-sm p-0 border border-border shadow-2xl" style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Set Reminder</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {savedNote ? (
            <div className="text-center py-4">
              <Bell className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{savedNote}</p>
              <Button size="sm" className="mt-3" onClick={onClose}>Done</Button>
            </div>
          ) : (
            <>
              {REMINDER_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="reminder_type"
                    value={opt.value}
                    checked={selectedType === opt.value}
                    onChange={() => setSelectedType(opt.value)}
                    className="accent-primary"
                  />
                  <div className="flex items-center gap-2">
                    {opt.value === 'custom' ? <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-medium">{opt.label}</span>
                  </div>
                </label>
              ))}

              {selectedType === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="w-full h-8 bg-secondary border border-border rounded-lg px-3 text-xs outline-none focus:border-primary/50"
                />
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs" onClick={handleSave} disabled={saving || (selectedType === 'custom' && !customDate)}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                  Save Reminder
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}