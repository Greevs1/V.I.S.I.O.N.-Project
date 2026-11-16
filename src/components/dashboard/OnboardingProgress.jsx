import React, { useState, useEffect } from 'react';
import { Upload, Target, Compass, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const steps = [
{ icon: Upload, label: 'Upload Financials', key: 'upload' },
{ icon: Target, label: 'Complete Assessments', key: 'assess' },
{ icon: Compass, label: 'Unlock GPS & Execution', key: 'execute' }];


const ASSESSMENT_TYPES = ['profit_gap', 'value_gap', 'tax_gap', 'operations_gap', 'freedom_assessment'];

export default function OnboardingProgress({ bis, completedSteps = [] }) {
  const { isAuthenticated, activeContext } = useAuth();
  const [hasDocuments, setHasDocuments] = useState(bis?.onboarding?.hasDocuments ?? false);
  const [hasAssessments, setHasAssessments] = useState(bis?.onboarding?.hasAssessmentData ?? false);

  // Only run independent fetch when BIS is not provided (backward compat)
  useEffect(() => {
    if (bis) {
      setHasDocuments(bis.onboarding.hasDocuments);
      setHasAssessments(bis.onboarding.hasAssessmentData);
      return;
    }
    const checkData = async () => {
      try {
        if (isAuthenticated) {
          const docsRes = await base44.functions.invoke('supabaseUserData', {
            action: 'getDocuments',
            data: { businessId: activeContext?.businessId }
          });
          const docs = docsRes.data?.documents || [];
          setHasDocuments(docs.filter((d) => d.file_url && !d.file_url.includes('placeholder')).length > 0);

          // Supabase Single Source of Truth — read assessment status from Supabase, not Base44
          const summaryRes = await base44.functions.invoke('supabaseUserData', {
            action: 'getAssessmentSummary',
            data: { businessId: activeContext?.businessId }
          });
          const summary = summaryRes.data?.summary || {};
          const hasAnyAssessment = ASSESSMENT_TYPES.some(t => {
            if (t === 'profit_gap') return summary.profit_gap_amount != null;
            if (t === 'value_gap') return summary.value_gap_amount != null;
            if (t === 'tax_gap') return summary.tax_gap_annual != null;
            if (t === 'operations_gap') return summary.operations_score != null;
            if (t === 'freedom_assessment') return summary.freedom_score != null;
            return false;
          });
          setHasAssessments(hasAnyAssessment);
        } else {
          try {
            const q = JSON.parse(sessionStorage.getItem('vision_guest_doc_queue') || '[]');
            setHasDocuments(q.filter((d) => d.name && d.size > 0).length > 0);
          } catch {setHasDocuments(false);}
        }
      } catch {/* non-fatal */}
    };
    checkData();
  }, [bis, isAuthenticated, activeContext?.businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveSteps = [
  ...(hasDocuments ? ['upload'] : []),
  ...(hasAssessments || completedSteps.includes('assess') ? ['assess'] : []),
  ...completedSteps.filter((s) => s !== 'assess')];


  return null;




























}