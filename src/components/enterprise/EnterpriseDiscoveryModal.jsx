/**
 * EnterpriseDiscoveryModal — Add Business Workflow
 * 
 * Modal for adding a new business to the enterprise.
 * Collects minimal info: Business Name, Ownership %, Entity Type.
 * 
 * After creation, redirects to document upload.
 */

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useEnterpriseDiscovery } from '@/lib/enterpriseDiscovery';
import { X, Building2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const ENTITY_TYPES = [
  { id: 'sole_prop', label: 'Sole Proprietorship' },
  { id: 'llc', label: 'LLC' },
  { id: 's_corp', label: 'S-Corp' },
  { id: 'c_corp', label: 'C-Corp' },
  { id: 'partnership', label: 'Partnership' },
];

export default function EnterpriseDiscoveryModal({ isOpen, onClose, onBusinessAdded }) {
  const { supabaseProfile, fetchSupabaseProfile } = useAuth();
  const { showMessage } = useEnterpriseDiscovery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    business_name: '',
    ownership_percentage: 100,
    entity_type: 'llc',
  });

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      // Create business entity via backend
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'createBusinessEntity',
        data: {
          business_name: form.business_name,
          ownership_percentage: form.ownership_percentage,
          entity_type: form.entity_type,
        },
      });

      if (!res.data?.business) {
        throw new Error('Failed to create business');
      }

      // Refresh profile to get updated business list
      await fetchSupabaseProfile();

      // Show Galileo guidance
      showMessage('business_created');

      // Notify parent
      onBusinessAdded?.(res.data.business);

      // Close modal
      onClose();

      toast.success('Business created successfully');
    } catch (err) {
      setError(err.message || 'Failed to create business. Please try again.');
      toast.error('Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-display font-bold">Add Another Business</h2>
                <p className="text-xs text-muted-foreground">Expand your enterprise intelligence</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            {/* Business Name */}
            <div className="space-y-2">
              <Label>Business Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-10 h-11"
                  placeholder="Acme Holdings LLC"
                  value={form.business_name}
                  onChange={e => updateForm('business_name', e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Ownership % */}
            <div className="space-y-2">
              <Label>Ownership Percentage</Label>
              <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-secondary">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={form.ownership_percentage}
                  onChange={e => updateForm('ownership_percentage', Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="flex-1 bg-transparent border-0 outline-none h-auto p-0"
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Entity Type */}
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {ENTITY_TYPES.map(e => (
                  <button
                    key={e.id}
                    onClick={() => updateForm('entity_type', e.id)}
                    className={`h-11 rounded-lg border text-sm font-medium transition-all ${
                      form.entity_type === e.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Info note */}
            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              <p>After creating the business, you'll be guided to upload financial documents so I can begin analysis immediately.</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/30">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || !form.business_name}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Create Business
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}