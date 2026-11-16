/**
 * AddBusinessModal
 *
 * One call → orchestrateBusinessCreation → full pipeline.
 * On success: context switch + invalidation + navigate to 4-assessment setup.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useBusinessContext } from '@/lib/BusinessContext';
import { useNavigate } from 'react-router-dom';

export default function AddBusinessModal({ open, onClose }) {
  const { setActiveContext, activeContext } = useAuth();
  const { reloadBusinessContext, invalidateDashboard } = useBusinessContext();
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!businessName.trim()) { setError('Business name is required.'); return; }
    setLoading(true);
    setError('');

    try {
      const res = await base44.functions.invoke('orchestrateBusinessCreation', {
        name: businessName.trim(),
        industry: industry.trim() || undefined,
        ownership_percentage: 100,
        entity_type: 'Operating Company',
        is_additional_business: true,
      });

      const result = res.data;
      if (!result?.success || !result?.business?.id) {
        const errMsg = result?.message || result?.error || "I couldn't create that business yet. Please try once more.";
        console.error('[AddBusinessModal] Creation failed:', result?.stage, result?.debug_id, errMsg);
        throw new Error(errMsg);
      }

      const newBusinessId = result.business.id;

      setCreated(true);

      // Switch context immediately — before reload
      setActiveContext({
        type: 'business',
        businessId: newBusinessId,
        businessIds: [...(activeContext?.businessIds || []), newBusinessId],
      });

      // Persist to sessionStorage
      try {
        sessionStorage.setItem('vision_active_context', JSON.stringify({
          type: 'business',
          businessId: newBusinessId,
          businessIds: [...(activeContext?.businessIds || []), newBusinessId],
          initialized: true,
        }));
      } catch {}

      // Reload server-side ownership list + invalidate all dashboard queries
      await reloadBusinessContext();
      invalidateDashboard();

      // Brief confirmation, then launch constrained 4-assessment setup
      setTimeout(() => {
        onClose();
        navigate(`/assessments/profit-gap?new_business=1&business_id=${newBusinessId}`);
      }, 1000);

    } catch (err) {
      setError(err.message || "I couldn't create that business yet. Please try once more.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.22 }}
        className="w-full max-w-md rounded-2xl p-8 space-y-6"
        style={{ background: '#0D0D10', border: '1px solid rgba(212,168,83,0.2)' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(212,168,83,0.12)' }}>
              <Building2 className="w-5 h-5" style={{ color: '#D4A853' }} />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold">Add a Business</h2>
              <p className="text-xs text-muted-foreground">Attached to your current profile</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {created ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <CheckCircle className="w-10 h-10" style={{ color: '#10B981' }} />
              <p className="font-semibold">Business added.</p>
              <p className="text-sm text-muted-foreground">Launching your setup…</p>
            </motion.div>
          ) : (
            <motion.div key="form" className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Business Name
                </label>
                <input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. Apex Roofing LLC"
                  className="w-full h-11 bg-secondary border border-border rounded-lg px-4 text-sm outline-none focus:border-primary/50 transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  Industry <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  placeholder="e.g. residential HVAC, SaaS, dental"
                  className="w-full h-11 bg-secondary border border-border rounded-lg px-4 text-sm outline-none focus:border-primary/50 transition-colors"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <p className="text-xs text-muted-foreground leading-relaxed">
                This business will be added to your profile. You'll complete a quick assessment to build its Intelligence Profile.
              </p>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading || !businessName.trim()}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}