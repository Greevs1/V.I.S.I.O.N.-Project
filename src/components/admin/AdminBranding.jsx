import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Palette, Type, Globe, Save, Loader2 } from 'lucide-react';

const ACCENT_PRESETS = [
  { name: 'Gold', value: '43 70% 58%' },
  { name: 'Cyan', value: '187 100% 42%' },
  { name: 'Emerald', value: '142 71% 45%' },
  { name: 'Purple', value: '262 83% 58%' },
  { name: 'Rose', value: '346 77% 49%' },
  { name: 'Orange', value: '25 95% 53%' },
];

export default function AdminBranding() {
  const [platformName, setPlatformName] = useState('V.I.S.I.O.N. Platform™');
  const [tagline, setTagline] = useState('Your business. Optimized.');
  const [accent, setAccent] = useState('43 70% 58%');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Platform Identity</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Platform Name</label>
            <input value={platformName} onChange={e => setPlatformName(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Tagline</label>
            <input value={tagline} onChange={e => setTagline(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Accent Color</label>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map(p => (
              <button key={p.value} onClick={() => setAccent(p.value)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  accent === p.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border hover:bg-secondary text-muted-foreground'
                }`}>
                <div className="w-3 h-3 rounded-full" style={{ background: `hsl(${p.value})` }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">White Label Settings</h3>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Custom Domain</label>
          <input placeholder="app.yourcompany.com"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Support Email</label>
          <input placeholder="support@yourcompany.com"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 text-muted-foreground" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}