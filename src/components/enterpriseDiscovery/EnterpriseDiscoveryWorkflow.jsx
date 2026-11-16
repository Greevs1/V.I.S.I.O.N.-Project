/**
 * Enterprise Discovery Workflow Component
 * 
 * Orchestrates the complete onboarding experience:
 * 1. Welcome → 2. Create Business → 3. Upload Documents → 4. Guided Assessments
 * 
 * Reuses existing assessment pages and document upload infrastructure.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useEnterpriseDiscovery } from '@/lib/enterpriseDiscovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import GalileoGuidanceCard from './GalileoGuidanceCard';

const ENTITY_TYPES = [
  { id: 'sole_prop', label: 'Sole Proprietorship' },
  { id: 'llc', label: 'LLC' },
  { id: 's_corp', label: 'S-Corp' },
  { id: 'c_corp', label: 'C-Corp' },
  { id: 'partnership', label: 'Partnership' },
];

export default function EnterpriseDiscoveryWorkflow() {
  const navigate = useNavigate();
  const { supabaseProfile, fetchSupabaseProfile } = useAuth();
  const {
    currentStep,
    currentBusiness,
    assessmentPath,
    currentAssessmentIndex,
    documentsUploaded,
    analysisComplete,
    portfolioEnabled,
    currentMessage,
    setCurrentStep,
    addBusiness,
    setDocumentsUploaded,
    setAnalysisComplete,
    completeAssessment,
    getCurrentAssessment,
    showMessage,
    hideGuidance,
    enablePortfolio,
  } = useEnterpriseDiscovery();

  const [businessForm, setBusinessForm] = useState({
    name: '',
    ownership: 100,
    entityType: 'llc',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize workflow on mount
  useEffect(() => {
    if (supabaseProfile) {
      // Fetch existing businesses and assessments
      initializeFromProfile();
    }
  }, [supabaseProfile]);

  const initializeFromProfile = async () => {
    try {
      const res = await base44.functions.invoke('supabaseUserData', { 
        action: 'getFullProfile' 
      });
      const businesses = res.data?.businesses || [];
      const completedAssessments = res.data?.completedAssessments || [];
      
      useEnterpriseDiscovery.getState().initializeWorkflow(
        businesses.length,
        completedAssessments
      );
    } catch (err) {
      console.warn('Failed to initialize profile:', err);
    }
  };

  const handleCreateBusiness = async () => {
    setError('');
    setLoading(true);

    try {
      // Create business via existing backend function
      const result = await base44.functions.invoke('supabaseUserData', {
        action: 'createBusiness',
        data: {
          business_name: businessForm.name,
          ownership_percentage: businessForm.ownership,
          entity_type: businessForm.entityType,
        },
      });

      const business = result.data?.business;
      if (!business) throw new Error('Failed to create business');

      addBusiness(business);
      showMessage('business_created');
    } catch (err) {
      setError(err.message || 'Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentsUploaded = () => {
    setDocumentsUploaded(true);
    // Trigger automatic analysis
    runDocumentAnalysis();
  };

  const runDocumentAnalysis = async () => {
    try {
      // Use existing document analysis pipeline
      const result = await base44.functions.invoke('runDocumentExtraction', {});
      const prefillData = result.data?.prefillData || null;
      
      setAnalysisComplete(prefillData);
      showMessage('documents_analyzed');
    } catch (err) {
      console.warn('Document analysis failed (non-blocking):', err);
      setAnalysisComplete({});
      showMessage('documents_analyzed');
    }
  };

  const getCurrentAssessmentRoute = () => {
    const assessment = getCurrentAssessment();
    const routes = {
      profit_gap: '/assessments/profit-gap',
      value_gap: '/assessments/value-gap',
      recast_ebitda: '/assessments/recast-ebitda',
      tax_gap: '/assessments/tax-gap',
      operations_gap: '/assessments/operations-gap',
      freedom_assessment: '/assessments/freedom',
    };
    return routes[assessment] || '/dashboard';
  };

  const handleAssessmentComplete = async (assessmentType, answers, results) => {
    try {
      // Save assessment to Supabase (reuses existing infrastructure)
      await base44.functions.invoke('saveAssessmentToSupabase', {
        assessment_type: assessmentType,
        answers,
        results,
      });

      completeAssessment(assessmentType);

      // Show Galileo's contextual message
      const messageKey = assessmentType;
      const message = useEnterpriseDiscovery.getState().currentMessage;
      
      // Navigate to next assessment or dashboard
      const nextAssessment = useEnterpriseDiscovery.getState().getNextAssessment();
      if (!nextAssessment) {
        // All assessments complete - redirect to dashboard
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Failed to save assessment:', err);
    }
  };

  // Render workflow steps
  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="max-w-2xl mx-auto">
            <GalileoGuidanceCard
              title={useEnterpriseDiscovery.getState().currentMessage?.title || "Welcome to V.I.S.I.O.N. Platform™"}
              message={useEnterpriseDiscovery.getState().currentMessage?.message || "Let's build your enterprise intelligence together. I'll guide you through each step and explain why it matters. Most business owners are finished in about 10–15 minutes."}
              onContinue={() => setCurrentStep('create_business')}
              showContinueButton={true}
            />
          </div>
        );

      case 'create_business':
        return (
          <div className="max-w-2xl mx-auto space-y-6">
            <GalileoGuidanceCard
              title="Let's start with your business"
              message="Tell me about the business you want to analyze first."
            />

            <div className="rounded-xl border bg-card p-6 space-y-5">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-10 h-11"
                    placeholder="Acme Corp"
                    value={businessForm.name}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ownership Percentage</Label>
                <div className="flex items-center gap-2 border border-border rounded-md px-3 py-2 bg-secondary">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={businessForm.ownership}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, ownership: parseInt(e.target.value) || 0 }))}
                    className="bg-transparent flex-1 outline-none text-sm border-none"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Entity Type</Label>
                <div className="flex flex-wrap gap-2">
                  {ENTITY_TYPES.map(entity => (
                    <button
                      key={entity.id}
                      onClick={() => setBusinessForm(prev => ({ ...prev, entityType: entity.id }))}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all border ${
                        businessForm.entityType === entity.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {entity.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
              )}

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1 h-11" 
                  onClick={() => setCurrentStep('welcome')}
                >
                  Back
                </Button>
                <Button 
                  className="flex-1 h-11" 
                  onClick={handleCreateBusiness}
                  disabled={loading || !businessForm.name}
                >
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</> : 'Continue'}
                </Button>
              </div>
            </div>
          </div>
        );

      case 'upload_documents':
        return (
          <div className="max-w-2xl mx-auto space-y-6">
            <GalileoGuidanceCard
              title="Great"
              message="If you have financial documents available, upload them now. I'll analyze them first so I can complete as much of your assessment automatically before asking you any questions."
            />

            <div className="rounded-xl border bg-card p-6">
              <div className="text-center py-8">
                <Upload className="w-12 h-12 mx-auto text-primary mb-4" />
                <h3 className="font-semibold text-lg mb-2">Upload Your Documents</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Supported: P&L, Balance Sheet, Tax Returns, Payroll Reports
                </p>
                <Button 
                  onClick={() => navigate('/upload')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Go to Upload
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 h-11"
                onClick={() => setCurrentStep('create_business')}
              >
                Back
              </Button>
              <Button 
                className="flex-1 h-11"
                onClick={handleDocumentsUploaded}
              >
                {documentsUploaded ? 'Analyzing...' : 'I\'ve Uploaded Documents'}
              </Button>
            </div>
          </div>
        );

      case 'assessments':
        const currentAssessment = getCurrentAssessment();
        const progress = useEnterpriseDiscovery.getState().getProgressPercent();
        
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <GalileoGuidanceCard
              title="Perfect"
              message="I've already learned quite a bit from your documents. Now I just need to fill in a few remaining gaps before I can begin identifying opportunities."
            />

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Assessment Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Assessment Navigation */}
            <div className="rounded-xl border bg-card p-6">
              <h3 className="font-semibold mb-4">Current Assessment</h3>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium capitalize">{currentAssessment?.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentAssessmentIndex + 1} of {assessmentPath.length}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => navigate(getCurrentAssessmentRoute())}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Start Assessment
                </Button>
              </div>

              {/* Assessment List */}
              <div className="space-y-2">
                {assessmentPath.map((assessment, index) => {
                  const isComplete = index < currentAssessmentIndex;
                  const isCurrent = index === currentAssessmentIndex;
                  
                  return (
                    <div 
                      key={assessment}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        isComplete 
                          ? 'border-primary/30 bg-primary/5' 
                          : isCurrent 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 ${
                          isCurrent ? 'border-primary' : 'border-muted-foreground'
                        }`} />
                      )}
                      <span className={`text-sm ${
                        isComplete ? 'text-primary' : isCurrent ? 'font-medium' : 'text-muted-foreground'
                      }`}>
                        {assessment.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="max-w-2xl mx-auto">
            <GalileoGuidanceCard
              title="Excellent work!"
              message={portfolioEnabled 
                ? "Your enterprise intelligence is now active. I can identify opportunities across your companies, coordinate strategies, and optimize your ownership structure."
                : "Your business intelligence is now complete. Let me show you what I've discovered."
              }
              onContinue={() => navigate('/dashboard')}
              isComplete={true}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-gold-gradient mb-2">
            Enterprise Discovery™
          </h1>
          <p className="text-sm text-muted-foreground">
            Your guided journey to business intelligence
          </p>
        </div>

        {/* Progress Bar */}
        {currentStep === 'assessments' && (
          <div className="glass rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium">Assessment Progress</span>
              <span className="text-sm text-muted-foreground">{useEnterpriseDiscovery.getState().getProgressPercent()}% complete</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${useEnterpriseDiscovery.getState().getProgressPercent()}%` }}
              />
            </div>
          </div>
        )}

        {/* Workflow Content */}
        {renderStep()}
      </div>
    </div>
  );
}