/**
 * EngagementSetup — Phase 13.2
 *
 * Advisor-led engagement setup: valuation purpose, standard of value,
 * valuation premise, valuation date, and methodology selection.
 *
 * The valuation conclusion comes first. Value-creation recommendations
 * come from evidence discovered during the valuation.
 */
import React, { useState, useEffect } from 'react';
import { VALUATION_METHODOLOGIES, recommendMethodologies } from '@/lib/valuation/questionnaireDefinition';
import { updateValuation } from '@/lib/valuationService';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Target, Scale, Calendar, FlaskConical, CheckCircle2 } from 'lucide-react';

const PURPOSE_OPTIONS = [
  { value: 'strategic_planning', label: 'Strategic Planning' },
  { value: 'exit_planning', label: 'Exit Planning' },
  { value: 'internal_ownership_planning', label: 'Internal Ownership Planning' },
  { value: 'potential_sale', label: 'Potential Sale' },
  { value: 'buyer_preparation', label: 'Buyer Preparation' },
  { value: 'capital_raise', label: 'Capital Raise' },
  { value: 'estate_planning', label: 'Estate Planning' },
  { value: 'tax_planning', label: 'Tax Planning' },
  { value: 'partner_transaction', label: 'Partner Transaction' },
  { value: 'other', label: 'Other' },
];

const STANDARD_OPTIONS = [
  { value: 'fair_market_value', label: 'Fair Market Value', desc: 'The price at which property would change hands between a willing buyer and willing seller' },
  { value: 'investment_value', label: 'Investment Value', desc: 'Value to a specific investor based on individual investment requirements' },
  { value: 'strategic_value', label: 'Strategic Value', desc: 'Value to a specific strategic buyer including synergies' },
  { value: 'fair_value', label: 'Fair Value', desc: 'Value determined under applicable accounting standards' },
  { value: 'indicative_enterprise_value', label: 'Indicative Enterprise Value', desc: 'Preliminary indication of enterprise value for planning purposes' },
];

const PREMISE_OPTIONS = [
  { value: 'going_concern', label: 'Going Concern', desc: 'Business continues to operate as an ongoing enterprise' },
  { value: 'orderly_liquidation', label: 'Orderly Liquidation', desc: 'Business assets sold in an orderly manner' },
  { value: 'asset_sale', label: 'Asset Sale', desc: 'Business sold as a collection of assets' },
  { value: 'stock_sale', label: 'Stock/Equity Sale', desc: 'Ownership interests transferred' },
  { value: 'controlling_interest', label: 'Controlling Interest', desc: 'Valuation of a controlling ownership position' },
  { value: 'minority_interest', label: 'Minority Interest', desc: 'Valuation of a non-controlling ownership position' },
];

const ENGAGEMENT_TYPES = [
  { value: 'enterprise_value_analysis', label: 'Enterprise Value Analysis™', desc: 'Default — advisor-led analysis without formal certification' },
  { value: 'calculation_of_value', label: 'Calculation of Value', desc: 'Limited scope calculation per professional standards' },
  { value: 'formal_valuation', label: 'Formal Valuation', desc: 'Comprehensive valuation engagement' },
  { value: 'certified_appraisal', label: 'Certified Appraisal', desc: 'Certified by a credentialed appraiser' },
  { value: 'fairness_opinion', label: 'Fairness Opinion', desc: 'Formal opinion on fairness of a transaction' },
];

export default function EngagementSetup({ valuation, onUpdate }) {
  const [config, setConfig] = useState({
    valuation_purpose: valuation?.valuation_purpose || '',
    standard_of_value: valuation?.standard_of_value || '',
    valuation_premise: valuation?.valuation_premise || '',
    valuation_date: valuation?.valuation_date || '',
    engagement_type: 'enterprise_value_analysis',
  });
  const [methodologySelection, setMethodologySelection] = useState({
    primary: null, secondary: [], supporting: [], excluded: [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const recommendations = recommendMethodologies(config);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateValuation(valuation.id, {
        valuation_purpose: config.valuation_purpose,
        standard_of_value: config.standard_of_value,
        valuation_premise: config.valuation_premise,
        valuation_date: config.valuation_date,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to save engagement config:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleMethodology = (methodKey, category) => {
    setMethodologySelection(prev => {
      const next = { ...prev };
      if (category === 'primary') {
        next.primary = next.primary === methodKey ? null : methodKey;
      } else {
        const list = next[category] || [];
        next[category] = list.includes(methodKey)
          ? list.filter(m => m !== methodKey)
          : [...list, methodKey];
      }
      return next;
    });
  };

  const isComplete = config.valuation_purpose && config.standard_of_value && config.valuation_premise && config.valuation_date;

  return (
    <div className="space-y-8">
      {/* Disclosure Banner */}
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.2)' }}>
        <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">Valuation Standard Disclosure</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This platform produces an <strong className="text-primary">Enterprise Value Analysis™</strong> — an advisor-led analysis
            that stands beside a thorough business valuation. It is not a Certified Appraisal unless explicitly selected
            and issued under the appropriate credentialed standard. Different purposes and standards may produce different conclusions.
          </p>
        </div>
      </div>

      {/* Purpose */}
      <Section icon={Target} title="Valuation Purpose" subtitle="Why is this valuation being performed?">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {PURPOSE_OPTIONS.map(opt => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              selected={config.valuation_purpose === opt.value}
              onClick={() => setConfig(p => ({ ...p, valuation_purpose: opt.value }))}
            />
          ))}
        </div>
      </Section>

      {/* Standard of Value */}
      <Section icon={Scale} title="Standard of Value" subtitle="Which value standard applies?">
        <div className="space-y-2">
          {STANDARD_OPTIONS.map(opt => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.desc}
              selected={config.standard_of_value === opt.value}
              onClick={() => setConfig(p => ({ ...p, standard_of_value: opt.value }))}
            />
          ))}
        </div>
      </Section>

      {/* Valuation Premise */}
      <Section icon={Scale} title="Valuation Premise" subtitle="Under what assumption is the business being valued?">
        <div className="space-y-2">
          {PREMISE_OPTIONS.map(opt => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.desc}
              selected={config.valuation_premise === opt.value}
              onClick={() => setConfig(p => ({ ...p, valuation_premise: opt.value }))}
            />
          ))}
        </div>
      </Section>

      {/* Valuation Date */}
      <Section icon={Calendar} title="Valuation Date" subtitle="The date as of which the value is determined. Preserved in every version.">
        <input
          type="date"
          value={config.valuation_date}
          onChange={e => setConfig(p => ({ ...p, valuation_date: e.target.value }))}
          className="w-full max-w-xs px-4 py-2.5 rounded-lg bg-secondary text-foreground text-sm border border-border focus:border-primary focus:outline-none"
        />
      </Section>

      {/* Engagement Type */}
      <Section icon={FlaskConical} title="Engagement Type" subtitle="Determines client-facing disclosure language.">
        <div className="space-y-2">
          {ENGAGEMENT_TYPES.map(opt => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              description={opt.desc}
              selected={config.engagement_type === opt.value}
              onClick={() => setConfig(p => ({ ...p, engagement_type: opt.value }))}
            />
          ))}
        </div>
      </Section>

      {/* Methodology Selection */}
      <Section icon={FlaskConical} title="Valuation Methodologies" subtitle="The advisor selects which methods to apply. Recommendations are based on business characteristics.">
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.15)' }}>
          <p className="text-xs font-semibold text-accent mb-1">System Recommendations</p>
          <p className="text-xs text-muted-foreground">
            Primary: {recommendations.primary.join(', ') || '—'} | Secondary: {recommendations.secondary.join(', ') || '—'} | Supporting: {recommendations.supporting.join(', ') || '—'}
          </p>
        </div>
        <div className="space-y-3">
          {VALUATION_METHODOLOGIES.map(method => {
            const isPrimary = methodologySelection.primary === method.method_key;
            const isSecondary = methodologySelection.secondary.includes(method.method_key);
            const isSupporting = methodologySelection.supporting.includes(method.method_key);
            const isExcluded = methodologySelection.excluded.includes(method.method_key);
            return (
              <div key={method.method_key} className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{method.method_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{method.description}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-wider">{method.category} approach</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <MethodButton label="Primary" selected={isPrimary} onClick={() => toggleMethodology(method.method_key, 'primary')} />
                    <MethodButton label="Secondary" selected={isSecondary} onClick={() => toggleMethodology(method.method_key, 'secondary')} />
                    <MethodButton label="Supporting" selected={isSupporting} onClick={() => toggleMethodology(method.method_key, 'supporting')} />
                    <MethodButton label="Exclude" selected={isExcluded} onClick={() => toggleMethodology(method.method_key, 'excluded')} variant="danger" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-4">
        <Button onClick={handleSave} disabled={!isComplete || saving} className="bg-primary text-primary-foreground">
          {saving ? 'Saving...' : 'Save Engagement Configuration'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-accent">
            <CheckCircle2 className="w-4 h-4" /> Saved
          </span>
        )}
        {!isComplete && (
          <span className="text-xs text-muted-foreground">Complete all required fields to save</span>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

function OptionCard({ label, description, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-all ${selected ? 'bg-primary/10 border-primary' : 'bg-secondary/50 border-border hover:border-primary/40'}`}
      style={{ border: `1px solid ${selected ? 'rgba(212,168,83,0.4)' : 'rgba(255,255,255,0.06)'}` }}
    >
      <p className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>{label}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </button>
  );
}

function MethodButton({ label, selected, onClick, variant }) {
  const base = 'px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-all';
  const styles = selected
    ? variant === 'danger' ? 'bg-destructive/20 text-destructive border-destructive/40' : 'bg-primary text-primary-foreground'
    : 'bg-secondary text-muted-foreground hover:text-foreground';
  return (
    <button onClick={onClick} className={`${base} ${styles}`} style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      {label}
    </button>
  );
}