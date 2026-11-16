import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SPECIALTY_OPTIONS = [
  'Tax Strategy', 'CPA / Accounting', 'Wealth Management', 'Insurance',
  'Estate Planning', 'Asset Protection', 'Exit Planning', 'EOS / Fractional COO',
  'Operations', 'HR / People Ops', 'Payroll', 'Financing / Capital',
  'M&A Advisory', 'Legal / Attorney', 'Real Estate', 'Bookkeeping',
];

const INDUSTRY_OPTIONS = [
  'Professional Services', 'Healthcare', 'Construction', 'Real Estate',
  'Technology', 'Retail / E-commerce', 'Restaurants / Food & Bev',
  'Manufacturing', 'Transportation / Logistics', 'Financial Services', 'Other',
];

const REVENUE_RANGES = ['Under $500K', '$500K–$1M', '$1M–$5M', '$5M–$10M', '$10M+'];

function MultiSelect({ label, options, selected, onChange }) {
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              selected.includes(o)
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export default function ApplyAsExpert() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company_name: '', location: '',
    website: '', linkedin_url: '', bio: '',
    years_experience: '', calendar_booking_url: '',
    credentials: [], specialties: [], industries_served: [],
    revenue_ranges_served: [], states_licensed: [],
  });
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name || !form.email) { setError('Name and email are required.'); return; }
    setSaving(true);
    setError('');
    await base44.entities.expert_applications.create({
      ...form,
      years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      application_status: 'pending',
      submitted_at: new Date().toISOString(),
    });
    setSaving(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="glass rounded-2xl p-12 text-center space-y-4 max-w-lg mx-auto">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
        <h2 className="text-lg font-display font-bold">Application Submitted!</h2>
        <p className="text-sm text-muted-foreground">
          Thank you for applying to the V.I.S.I.O.N. Expert Network. Our team will review your application
          and reach out within 5–7 business days.
        </p>
      </div>
    );
  }

  const Input = ({ label, field, placeholder, type = 'text', required }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && ' *'}</label>
      <input type={type} value={form[field]} onChange={set(field)} placeholder={placeholder}
        className="w-full mt-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/40" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Hero */}
      <div className="glass rounded-xl p-6 space-y-2">
        <h2 className="text-lg font-display font-bold">Apply to Join the V.I.S.I.O.N. Expert Network</h2>
        <p className="text-sm text-muted-foreground">
          Join a curated network of professionals who help business owners accelerate their path to financial freedom.
          Applications are reviewed manually. All approved experts are vetted.
        </p>
      </div>

      {/* Form */}
      <div className="glass rounded-xl p-6 space-y-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal & Business Info</p>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" field="name" placeholder="Jane Smith" required />
          <Input label="Email" field="email" placeholder="jane@firm.com" type="email" required />
          <Input label="Phone" field="phone" placeholder="+1 (555) 000-0000" />
          <Input label="Company / Firm" field="company_name" placeholder="Smith Tax Advisory" />
          <Input label="Location" field="location" placeholder="Phoenix, AZ" />
          <Input label="Years of Experience" field="years_experience" placeholder="10" type="number" />
          <Input label="Website" field="website" placeholder="https://yourfirm.com" />
          <Input label="LinkedIn URL" field="linkedin_url" placeholder="https://linkedin.com/in/..." />
        </div>
        <Input label="Booking / Calendar URL" field="calendar_booking_url" placeholder="https://calendly.com/yourname" />
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bio / About</label>
          <textarea value={form.bio} onChange={set('bio')} placeholder="Tell us about your background, expertise, and how you help clients…"
            rows={4}
            className="w-full mt-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Credentials / Certifications</label>
          <input value={form.credentials.join(', ')}
            onChange={e => setForm(f => ({ ...f, credentials: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            placeholder="CPA, CFP, JD, ChFC, etc. (comma separated)"
            className="w-full mt-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/40" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">States Licensed (comma separated)</label>
          <input value={form.states_licensed.join(', ')}
            onChange={e => setForm(f => ({ ...f, states_licensed: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
            placeholder="Arizona, California, Texas"
            className="w-full mt-1 h-9 bg-secondary border border-border rounded-lg px-3 text-sm outline-none focus:border-primary/40" />
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expertise & Focus</p>
        <MultiSelect label="Specialties" options={SPECIALTY_OPTIONS} selected={form.specialties}
          onChange={v => setForm(f => ({ ...f, specialties: v }))} />
        <MultiSelect label="Industries Served" options={INDUSTRY_OPTIONS} selected={form.industries_served}
          onChange={v => setForm(f => ({ ...f, industries_served: v }))} />
        <MultiSelect label="Revenue Ranges Served" options={REVENUE_RANGES} selected={form.revenue_ranges_served}
          onChange={v => setForm(f => ({ ...f, revenue_ranges_served: v }))} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={saving} className="w-full h-11 text-sm font-semibold">
        {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting…</> : 'Submit Application'}
      </Button>

      <p className="text-[11px] text-muted-foreground text-center pb-4">
        By submitting, you agree to our network standards. All applications are reviewed within 5–7 business days.
      </p>
    </div>
  );
}