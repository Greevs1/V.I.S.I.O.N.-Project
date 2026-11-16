/**
 * FinancialProfileTab — Phase 2C-A
 *
 * Displays and saves profile-scoped financial inputs that power the Freedom Engine.
 * These fields are NEVER tied to business_id and NEVER written to dashboard_metrics.
 *
 * Access:
 *   - Paying members (owner tier): edit own
 *   - Admin / Super Admin: edit (target_profile_id supported via prop)
 *   - Expert Advisor: view only
 *   - Free / non-paying users: locked (upgrade prompt shown)
 */

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { useMembership } from '@/lib/useMembership';
import { useAuth } from '@/lib/AuthContext';
import { Lock, ShieldCheck } from 'lucide-react';

const FIELDS = [
  {
    key: 'annual_personal_expenses',
    label: 'Annual Personal Expenses',
    hint: 'Total annual cost of your personal lifestyle (housing, food, travel, etc.)',
    prefix: '$',
    allowNegative: false,
  },
  {
    key: 'investable_assets',
    label: 'Investable Assets',
    hint: 'Liquid and investable personal assets excluding business equity (savings, brokerage, retirement accounts)',
    prefix: '$',
    allowNegative: false,
  },
  {
    key: 'total_personal_debt',
    label: 'Total Personal Debt',
    hint: 'All personal debt obligations (mortgage, student loans, consumer debt)',
    prefix: '$',
    allowNegative: false,
  },
  {
    key: 'passive_income',
    label: 'Annual Passive Income',
    hint: 'Income from non-business sources (rentals, dividends, royalties) — reduces your Freedom Number',
    prefix: '$',
    allowNegative: false,
  },
  {
    key: 'desired_lifestyle_adjustment',
    label: 'Desired Lifestyle Upgrade Buffer',
    hint: 'Annual buffer above current expenses for the lifestyle you want in freedom (travel, experiences)',
    prefix: '$',
    allowNegative: false,
  },
  {
    key: 'safe_withdrawal_rate',
    label: 'Safe Withdrawal Rate',
    hint: 'Annual drawdown rate from your invested portfolio (default: 4% — the Bengen Rule)',
    prefix: null,
    suffix: '%',
    allowNegative: false,
    isRate: true,
    defaultValue: 0.04,
  },
];

function parseNumeric(val) {
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function formatDisplay(val, field) {
  if (val === null || val === undefined || val === '') return '';
  if (field.isRate) return String(Math.round(parseFloat(val) * 100 * 100) / 100); // show as percent
  return String(val);
}

function toStored(displayVal, field) {
  const n = parseNumeric(displayVal);
  if (n === null) return null;
  if (field.isRate) return Math.max(0, n / 100); // store as decimal
  return Math.max(0, n);
}

export default function FinancialProfileTab({ targetProfileId = null }) {
  const { user } = useAuth();
  const { isPaid, isAdvisorOrAdmin } = useMembership();

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const isExpertAdvisor = user?.role === 'expert_advisor';

  // canEdit: paying member editing own, OR admin editing anyone
  const canEdit = (isPaid && !isExpertAdvisor) || isAdmin;

  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const payload = { action: 'getProfileFinancials' };
        if (targetProfileId) payload.target_profile_id = targetProfileId;
        const res = await base44.functions.invoke('supabaseProfileData', payload);
        const pf = res.data?.financials || {};
        // Populate form with display values
        const initial = {};
        FIELDS.forEach((f) => {
          if (f.isRate) {
            const stored = pf[f.key] ?? f.defaultValue ?? 0.04;
            initial[f.key] = formatDisplay(stored, f);
          } else {
            initial[f.key] = pf[f.key] != null ? String(pf[f.key]) : '';
          }
        });
        setForm(initial);
      } catch {
        setForm({});
      }
      setLoading(false);
    };
    load();
  }, [targetProfileId]);

  const validate = () => {
    const errs = {};
    FIELDS.forEach((f) => {
      const raw = form[f.key];
      if (raw === '' || raw === null || raw === undefined) return; // blanks are allowed
      const n = parseNumeric(raw);
      if (n === null) { errs[f.key] = 'Must be a number'; return; }
      if (!f.allowNegative && n < 0) { errs[f.key] = 'Must be 0 or greater'; }
      if (f.isRate && n > 20) { errs[f.key] = 'Rate seems too high (max 20%)'; }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload_data = {};
      FIELDS.forEach((f) => {
        const raw = form[f.key];
        if (raw === '' || raw === null || raw === undefined) {
          // SWR always gets stored — use default if blank
          if (f.isRate) payload_data[f.key] = f.defaultValue;
          else payload_data[f.key] = null;
        } else {
          payload_data[f.key] = toStored(raw, f);
        }
      });
      const payload = { action: 'upsertProfileFinancials', data: payload_data };
      if (targetProfileId) payload.target_profile_id = targetProfileId;
      await base44.functions.invoke('supabaseProfileData', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save. Please try again.');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Free user gate
  if (!canEdit && !isExpertAdvisor && !isAdvisorOrAdmin) {
    return (
      <div className="glass rounded-xl p-8 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <p className="text-sm font-semibold">Member Feature</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Profile Financial Intelligence is available to paying members. Upgrade to unlock the Freedom Engine and precision wealth planning.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Profile Financial Intelligence</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Profile-scoped inputs that power your Freedom Number™, Freedom Gap™, and Freedom Score™.
            These fields are personal — they never change when switching businesses.
          </p>
        </div>
        {isExpertAdvisor && !isAdmin && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground bg-secondary/50 border border-border rounded-full px-2.5 py-1">
            <ShieldCheck className="w-3 h-3" />
            View Only
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map((field) => (
          <FinancialField
            key={field.key}
            field={field}
            value={form[field.key] ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
            error={errors[field.key]}
            readOnly={!canEdit}
          />
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Financial Profile'}
          </Button>
          {saved && (
            <span className="text-xs text-emerald-400">Profile financials updated successfully.</span>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
        These inputs are strictly profile-scoped and are never written to business records or the dashboard. They are used exclusively by the Freedom Engine for paying members.
      </p>
    </div>
  );
}

function FinancialField({ field, value, onChange, error, readOnly }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {field.label}
      </label>
      <div className={`flex items-center gap-1 border rounded-md px-3 py-2 bg-secondary transition-colors ${
        error ? 'border-red-500/50' : 'border-border'
      } ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}>
        {field.prefix && <span className="text-muted-foreground text-sm select-none">{field.prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.isRate ? '4' : '0'}
          readOnly={readOnly}
          className="bg-transparent flex-1 outline-none text-sm disabled:cursor-not-allowed"
        />
        {field.suffix && <span className="text-muted-foreground text-sm select-none">{field.suffix}</span>}
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {!error && field.hint && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">{field.hint}</p>
      )}
    </div>
  );
}