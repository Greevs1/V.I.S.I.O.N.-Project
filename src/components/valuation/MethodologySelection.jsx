/**
 * MethodologySelection — Phase 13.3
 * Advisor selects primary, secondary, supporting, and excluded methods.
 * Engine recommends methods based on business characteristics; advisor decides.
 */
import React, { useState, useEffect } from 'react';
import { saveMethodSelection, getMethodSelections, approveMethodSelection } from '@/lib/valuationCalculationService';
import { VALUATION_METHODOLOGIES, recommendMethodologies } from '@/lib/valuation/questionnaireDefinition';
import { Check, Loader2, Star, X } from 'lucide-react';

const ROLE_LABELS = {
  primary: { label: 'Primary', color: '#D4A853', bg: 'rgba(212,168,83,0.1)' },
  secondary: { label: 'Secondary', color: '#00D4FF', bg: 'rgba(0,212,255,0.1)' },
  supporting: { label: 'Supporting', color: '#10B981', bg: 'rgba(16,185,129,0.1)' },
  excluded: { label: 'Excluded', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
};

export default function MethodologySelection({ valuationId, answers = {} }) {
  const [selections, setSelections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    load();
  }, [valuationId]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMethodSelections(valuationId);
      setSelections(res.methodSelections || []);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  };

  const handleSelect = async (method, role) => {
    setSaving(method.method_key);
    try {
      await saveMethodSelection(valuationId, method.method_key, method.method_name, method.category, role, '', true);
      await load();
    } catch (err) {
      console.error('Failed to save method selection:', err);
    } finally {
      setSaving(null);
    }
  };

  const handleApprove = async (methodKey) => {
    setSaving(methodKey);
    try {
      await approveMethodSelection(valuationId, methodKey, true);
      await load();
    } catch (err) {
      console.error('Failed to approve method:', err);
    } finally {
      setSaving(null);
    }
  };

  const getSelection = (methodKey) => selections.find(s => s.method_key === methodKey);
  const recommendations = recommendMethodologies(answers);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-1">Methodology Selection</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Select the valuation methods to include. The engine recommends methods based on business characteristics,
          but the advisor makes the final decision.
        </p>
      </div>

      {/* Recommendations banner */}
      {(recommendations.primary.length > 0 || recommendations.secondary.length > 0) && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <p className="text-xs font-medium text-primary mb-1">Engine Recommendations</p>
          <p className="text-xs text-muted-foreground">
            Primary: {recommendations.primary.map(m => VALUATION_METHODOLOGIES.find(v => v.method_key === m)?.method_name || m).join(', ') || '—'}
            {' · '}
            Secondary: {recommendations.secondary.map(m => VALUATION_METHODOLOGIES.find(v => v.method_key === m)?.method_name || m).join(', ') || '—'}
          </p>
        </div>
      )}

      {/* Method cards */}
      <div className="grid gap-3">
        {VALUATION_METHODOLOGIES.map((method) => {
          const sel = getSelection(method.method_key);
          const role = sel?.selection_role;
          const roleInfo = role ? ROLE_LABELS[role] : null;
          const isRecommended = recommendations.primary.includes(method.method_key) || recommendations.secondary.includes(method.method_key);

          return (
            <div
              key={method.method_key}
              className="rounded-lg p-4"
              style={{
                background: roleInfo?.bg || 'rgba(255,255,255,0.02)',
                border: `1px solid ${roleInfo ? roleInfo.color + '30' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium">{method.method_name}</h4>
                    {isRecommended && <Star className="w-3.5 h-3.5 text-primary" />}
                    {roleInfo && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: roleInfo.color, background: roleInfo.bg }}>
                        {roleInfo.label}
                      </span>
                    )}
                    {sel?.advisor_approved && <Check className="w-3.5 h-3.5 text-green-500" />}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{method.description}</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    Category: <span className="capitalize">{method.category}</span>
                    {' · '}Best for: {method.best_for.join(', ')}
                  </p>
                </div>
              </div>

              {/* Role selector */}
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {Object.entries(ROLE_LABELS).map(([roleKey, info]) => (
                  <button
                    key={roleKey}
                    onClick={() => handleSelect(method, roleKey)}
                    disabled={saving === method.method_key}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                      role === roleKey ? 'opacity-100' : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{ color: info.color, background: info.bg, border: `1px solid ${info.color}30` }}
                  >
                    {info.label}
                  </button>
                ))}
                {sel && !sel.advisor_approved && (
                  <button
                    onClick={() => handleApprove(method.method_key)}
                    disabled={saving === method.method_key}
                    className="px-2.5 py-1 rounded text-[11px] font-medium bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500/20"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}