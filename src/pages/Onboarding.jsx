/**
 * Onboarding — Enterprise Discovery™ Guided Workflow
 * 
 * Replaced old wizard with streamlined Galileo-guided experience:
 * 1. Welcome (Galileo greeting)
 * 2. Create Business (minimal: name, ownership, entity)
 * 3. Upload Documents (with Galileo explanation)
 * 4. Guided Assessments (sequential, no selection)
 * 
 * Reuses all existing assessment infrastructure.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useEnterpriseDiscovery } from '@/lib/enterpriseDiscovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, TrendingUp, CheckCircle2, Upload, Sparkles, FileText } from 'lucide-react';
import GalileoGuidanceCard from '@/components/galileo/GalileoGuidanceCard';
import { motion } from 'framer-motion';

const ENTITY_TYPES = [
  { id: 'sole_prop', label: 'Sole Proprietorship' },
  { id: 'llc', label: 'LLC' },
  { id: 's_corp', label: 'S-Corp' },
  { id: 'c_corp', label: 'C-Corp' },
  { id: 'partnership', label: 'Partnership' },
];

const OWNERSHIP_OPTIONS = [100, 90, 75, 50, 25, 10, 5];

export default function Onboarding() {
  const { supabaseProfile, fetchSupabaseProfile } = useAuth();
  const { 
    currentStep, 
    setCurrentStep, 
    showMessage, 
    addBusiness,
    setDocumentsUploaded,
    setAnalysisComplete,
    currentMessage,
    showGuidance,
  } = useEnterpriseDiscovery();
  
  const [step, setStep] = useState(1); // 1: welcome, 2: business, 3: upload, 4: assessments
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    business_name: supabaseProfile?.business_name || '',
    ownership_percentage: 100,
    entity_type: 'llc',
  });

  const updateForm = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // Initialize workflow on mount
  useEffect(() => {
    if (supabaseProfile) {
      // User already has profile — skip to upload or assessments
      showMessage('welcome');
      setStep(supabaseProfile.business_name ? 3 : 2);
    } else {
      showMessage('welcome');
    }
  }, []);

  const handleCreateBusiness = async () => {
    setError('');
    setLoading(true);

    try {
      // Create business via backend
      const res = await base44.functions.invoke('createBusinessEntity', {
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

      // Add to workflow state
      addBusiness(res.data.business);

      // Refresh profile
      await fetchSupabaseProfile();

      // Show Galileo guidance
      showMessage('business_created');

      // Move to upload step
      setStep(3);
      setCurrentStep('upload_documents');
    } catch (err) {
      setError(err.message || 'Failed to create business. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentsUploaded = () => {
    setDocumentsUploaded(true);
    showMessage('documents_analyzed');
    setStep(4);
    setCurrentStep('assessments');
  };

  // Step 1: Welcome
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.15), rgba(212,168,83,0.05))', border: '1.5px solid rgba(212,168,83,0.3)' }}>
              <TrendingUp className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gold-gradient">
              Welcome to V.I.S.I.O.N. Platform™
            </h1>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto leading-relaxed">
              Let's build your enterprise intelligence together. I'll guide you through each step and explain why it matters. Most business owners are finished in about 10–15 minutes.
            </p>
          </div>

          {/* Action */}
          <div className="rounded-2xl border border-border bg-card p-8">
            <Button 
              className="w-full h-12 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setStep(2)}
            >
              Get Started
              <CheckCircle2 className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {/* Galileo Guidance */}
          {showGuidance && currentMessage && (
            <div className="mt-8">
              <GalileoGuidanceCard
                title={currentMessage.title}
                message={currentMessage.message}
                onNext={() => setStep(2)}
                nextLabel="Continue"
              />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Step 2: Create Business
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.15), rgba(212,168,83,0.05))', border: '1.5px solid rgba(212,168,83,0.3)' }}>
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gold-gradient">
              Tell me about your business
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Just the basics to get started.
            </p>
          </div>

          {/* Form */}
          <div className="rounded-2xl border border-border bg-card p-8 space-y-5">
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
                  placeholder="Acme Corp"
                  value={form.business_name}
                  onChange={e => updateForm('business_name', e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Ownership % */}
            <div className="space-y-2">
              <Label>Your Ownership (%)</Label>
              <div className="flex flex-wrap gap-2">
                {OWNERSHIP_OPTIONS.map(pct => (
                  <button
                    key={pct}
                    onClick={() => updateForm('ownership_percentage', pct)}
                    className={`flex-1 min-w-[60px] py-2 rounded-lg text-sm font-medium transition-all border ${
                      form.ownership_percentage === pct
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Entity Type */}
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <div className="flex flex-wrap gap-2">
                {ENTITY_TYPES.map(entity => (
                  <button
                    key={entity.id}
                    onClick={() => updateForm('entity_type', entity.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      form.entity_type === entity.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {entity.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                className="flex-1 h-11" 
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button 
                className="flex-1 h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handleCreateBusiness}
                disabled={loading || !form.business_name}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> Create Business</>
                )}
              </Button>
            </div>
          </div>

          {/* Galileo Guidance */}
          {showGuidance && currentMessage && (
            <div className="mt-8">
              <GalileoGuidanceCard
                title={currentMessage.title}
                message={currentMessage.message}
                onNext={handleCreateBusiness}
                nextLabel="Continue"
                hideGuidance={() => {}}
              />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Step 3: Upload Documents
  if (step === 3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(212,168,83,0.15), rgba(212,168,83,0.05))', border: '1.5px solid rgba(212,168,83,0.3)' }}>
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gold-gradient">
              Upload Your Financials
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              I'll analyze these first to minimize the questions you need to answer.
            </p>
          </div>

          {/* Upload Card */}
          <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
            <a 
              href="/upload"
              className="block w-full h-12 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Go to Document Upload
            </a>
            <p className="text-xs text-muted-foreground text-center">
              Once you've uploaded your documents, click Continue below.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end">
            <Button 
              className="h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleDocumentsUploaded}
            >
              I've Uploaded Documents
              <CheckCircle2 className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {/* Galileo Guidance */}
          {showGuidance && currentMessage && (
            <div className="mt-8">
              <GalileoGuidanceCard
                title={currentMessage.title}
                message={currentMessage.message}
                onNext={handleDocumentsUploaded}
                nextLabel="Continue"
              />
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Step 4: Assessments (redirect to first assessment)
  if (step === 4) {
    window.location.href = '/assessments/profit-gap';
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground">Starting assessments…</p>
        </div>
      </div>
    );
  }

  return null;
}