import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Shield, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const ALLOWED_ROLES = ['super_admin', 'admin', 'expert_advisor'];

const SCOPE_OPTIONS = [
  { value: 'household', label: 'Household' },
  { value: 'business', label: 'Business' },
  { value: 'hybrid', label: 'Hybrid' },
];

const DOC_TYPE_OPTIONS = [
  { value: 'business_tax_return', label: 'Business Tax Return' },
  { value: 'personal_tax_return', label: 'Personal Tax Return' },
  { value: 'profit_and_loss', label: 'Profit & Loss' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'debt_schedule', label: 'Debt Schedule' },
  { value: 'payroll_report', label: 'Payroll Report' },
  { value: 'insurance_document', label: 'Insurance Document' },
  { value: 'entity_document', label: 'Entity Document' },
  { value: 'buy_sell_agreement', label: 'Buy-Sell Agreement' },
  { value: 'estate_document', label: 'Estate Document' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'other', label: 'Other' },
];

/**
 * DocumentClassificationOverride
 * Allows authorized admins/advisors to correct document scope, business assignment, and type.
 * Audit trail: updates DocumentClassification + creates ClientNote.
 */
export default function DocumentClassificationOverride({ document, onOverrideSuccess }) {
  const { role, allBusinesses } = useAuth();

  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState(document?.document_scope || '');
  const [businessId, setBusinessId] = useState(document?.business_id || '');
  const [documentType, setDocumentType] = useState(document?.document_type || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset form whenever the document changes
  useEffect(() => {
    setScope(document?.document_scope || '');
    setBusinessId(document?.business_id || '');
    setDocumentType(document?.document_type || '');
    setSaved(false);
  }, [document?.id]);

  // Enforce scope safety rules on scope change
  const handleScopeChange = (newScope) => {
    setScope(newScope);
    if (newScope === 'household') {
      setBusinessId(''); // must be null for household
    }
  };

  if (!ALLOWED_ROLES.includes(role)) return null;
  if (!document) return null;

  const isDirty =
    scope !== (document.document_scope || '') ||
    businessId !== (document.business_id || '') ||
    documentType !== (document.document_type || '');

  const isValid = () => {
    if (!scope) return false;
    if (scope === 'business' && !businessId) return false;
    return true;
  };

  const handleSave = async () => {
    if (!isValid()) {
      toast.error('Business is required when scope is "Business".');
      return;
    }

    setSaving(true);
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'overrideDocumentClassification',
        data: {
          documentId: document.id,
          documentName: document.name,
          newScope: scope,
          newBusinessId: businessId || null,
          newDocumentType: documentType || document.document_type,
          previousScope: document.document_scope || null,
          previousBusinessId: document.business_id || null,
          previousDocumentType: document.document_type || null,
        },
      });

      if (res.data?.error) throw new Error(res.data.error);

      setSaved(true);
      toast.success('Document classification updated.');
      if (onOverrideSuccess) onOverrideSuccess({
        ...document,
        document_scope: scope,
        business_id: businessId || null,
        document_type: documentType || document.document_type,
      });

      // Collapse after brief success display
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(`Override failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-amber-500/20 rounded-lg bg-amber-500/5 overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
            Admin Override
          </span>
          <span className="text-[10px] text-amber-400/60 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
            {role.replace('_', ' ')}
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-amber-400/60" />
          : <ChevronDown className="w-3.5 h-3.5 text-amber-400/60" />}
      </button>

      {/* Override form */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-amber-500/10 pt-3">

          {/* Scope */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Document Scope
            </label>
            <div className="flex gap-2">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleScopeChange(opt.value)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    scope === opt.value
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-secondary border-border text-muted-foreground hover:border-amber-500/30 hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {scope === 'household' && (
              <p className="text-[10px] text-amber-400/70">Household scope will remove business assignment.</p>
            )}
            {scope === 'business' && !businessId && (
              <p className="text-[10px] text-red-400">Business is required for this scope.</p>
            )}
          </div>

          {/* Business Assignment */}
          {scope !== 'household' && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Business Assignment {scope === 'business' ? <span className="text-red-400">*</span> : <span className="text-muted-foreground/50">(optional)</span>}
              </label>
              <Select value={businessId || '__none__'} onValueChange={v => setBusinessId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs bg-secondary border-border">
                  <SelectValue placeholder="Select business…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No business (profile-level) —</SelectItem>
                  {(allBusinesses || []).map(biz => (
                    <SelectItem key={biz.id} value={biz.id}>
                      {biz.name || biz.business_name || biz.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Document Type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Document Type <span className="text-muted-foreground/50">(optional correction)</span>
            </label>
            <Select value={documentType || '__keep__'} onValueChange={v => setDocumentType(v === '__keep__' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs bg-secondary border-border">
                <SelectValue placeholder="Keep existing…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep__">— Keep existing ({document.document_type || 'unknown'}) —</SelectItem>
                {DOC_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Save Button */}
          <Button
            size="sm"
            className="w-full h-8 text-xs gap-2"
            disabled={!isDirty || saving || !isValid()}
            onClick={handleSave}
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            ) : saved ? (
              <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Saved</>
            ) : (
              'Save Classification Override'
            )}
          </Button>

          {/* Current state reminder */}
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Changes are audited. Previous values are recorded in the client activity log.
          </p>
        </div>
      )}
    </div>
  );
}