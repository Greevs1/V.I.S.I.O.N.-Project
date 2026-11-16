/**
 * Enterprise Discovery™ Workflow State Management
 * 
 * Manages the deterministic onboarding flow:
 * 1. Create Business → 2. Upload Documents → 3. Auto-Analysis → 4. Guided Assessments
 * 
 * Reuses existing assessment infrastructure. No new assessments created.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Assessment paths by business number
const FIRST_BUSINESS_ASSESSMENTS = [
  'profit_gap',
  'value_gap',
  'recast_ebitda',
  'tax_gap',
  'operations_gap',
  'freedom_assessment',
];

const ADDITIONAL_BUSINESS_ASSESSMENTS = [
  'profit_gap',
  'value_gap',
  'recast_ebitda',
  'operations_gap',
];

// Galileo event messages
const GALILEO_MESSAGES = {
  welcome: {
    title: "Welcome to V.I.S.I.O.N. Platform™",
    message: "Let's build your enterprise intelligence together. I'll guide you through each step and explain why it matters. Most business owners are finished in about 10–15 minutes.",
  },
  business_created: {
    title: "Great start",
    message: "Now, if you have financial documents available, upload them now. I'll analyze them first so I can complete as much of your assessment automatically before asking you any questions.",
  },
  documents_analyzed: {
    title: "Perfect",
    message: "I've already learned quite a bit from your documents. Now I just need to fill in a few remaining gaps before I can begin identifying opportunities.",
  },
  assessment_completed: {
    profit_gap: "This helps me understand where profit is leaking.",
    value_gap: "Now I can estimate how much additional value could be created.",
    recast_ebitda: "This allows me to normalize earnings for valuation.",
    tax_gap: "This helps identify opportunities that affect your personal and business tax strategy.",
    operations_gap: "This shows me how efficiently the business can scale.",
    freedom_assessment: "This connects your businesses to your personal financial goals.",
  },
  portfolio_activated: {
    title: "Your enterprise just became more powerful",
    message: "I can now identify opportunities across your companies, coordinate tax strategies, evaluate roll-up potential, and optimize your overall ownership structure.",
  },
  entity_discovered: {
    title: "I found another business",
    message: "I discovered another business that appears to belong to your enterprise. Would you like to add it?",
  },
};

export const useEnterpriseDiscovery = create(
  persist(
    (set, get) => ({
      // Workflow state
      currentStep: 'welcome', // welcome | create_business | upload_documents | analyzing | assessments | complete
      currentAssessmentIndex: 0,
      businessCount: 0,
      
      // Business data
      businesses: [],
      currentBusiness: null,
      
      // Document analysis
      documentsUploaded: false,
      analysisComplete: false,
      prefillData: null,
      
      // Assessment routing
      assessmentPath: FIRST_BUSINESS_ASSESSMENTS,
      completedAssessments: [],
      
      // Galileo guidance
      showGuidance: true,
      currentMessage: null,
      
      // Portfolio mode
      portfolioEnabled: false,
      
      // Actions
      setCurrentStep: (step) => set({ currentStep: step }),
      
      initializeWorkflow: (businessCount, completedAssessments = []) => {
        const isMultiBusiness = businessCount > 1;
        set({
          businessCount,
          assessmentPath: isMultiBusiness ? ADDITIONAL_BUSINESS_ASSESSMENTS : FIRST_BUSINESS_ASSESSMENTS,
          completedAssessments,
          currentAssessmentIndex: 0,
          portfolioEnabled: isMultiBusiness,
          currentStep: businessCount > 0 ? 'upload_documents' : 'create_business',
        });
      },
      
      addBusiness: (business) => {
        const businesses = [...get().businesses, business];
        const businessCount = businesses.length;
        set({
          businesses,
          currentBusiness: business,
          businessCount,
          portfolioEnabled: businessCount > 1,
          currentStep: 'upload_documents',
        });
        
        // Set appropriate assessment path
        set({
          assessmentPath: businessCount === 1 ? FIRST_BUSINESS_ASSESSMENTS : ADDITIONAL_BUSINESS_ASSESSMENTS,
          currentAssessmentIndex: 0,
        });
      },
      
      setDocumentsUploaded: (uploaded) => set({ documentsUploaded: uploaded }),
      
      setAnalysisComplete: (prefillData) => set({ 
        analysisComplete: true, 
        prefillData,
        currentStep: 'assessments' 
      }),
      
      completeAssessment: (assessmentType) => {
        const completed = [...get().completedAssessments, assessmentType];
        const currentIndex = get().currentAssessmentIndex;
        const assessmentPath = get().assessmentPath;
        
        set({
          completedAssessments: completed,
          currentAssessmentIndex: currentIndex + 1,
          currentStep: currentIndex + 1 >= assessmentPath.length ? 'complete' : 'assessments',
        });
      },
      
      getCurrentAssessment: () => {
        const { currentAssessmentIndex, assessmentPath } = get();
        return assessmentPath[currentAssessmentIndex] || null;
      },
      
      getNextAssessment: () => {
        const { currentAssessmentIndex, assessmentPath } = get();
        return assessmentPath[currentAssessmentIndex + 1] || null;
      },
      
      isAssessmentComplete: (assessmentType) => {
        return get().completedAssessments.includes(assessmentType);
      },
      
      getProgressPercent: () => {
        const { currentAssessmentIndex, assessmentPath } = get();
        return Math.round((currentAssessmentIndex / assessmentPath.length) * 100);
      },
      
      // Galileo messages
      showMessage: (messageKey, data = {}) => {
        const message = GALILEO_MESSAGES[messageKey];
        if (message) {
          set({ 
            currentMessage: {
              ...message,
              ...data,
            },
            showGuidance: true,
          });
        }
      },
      
      hideGuidance: () => set({ showGuidance: false, currentMessage: null }),
      
      enablePortfolio: () => {
        set({ portfolioEnabled: true });
        get().showMessage('portfolio_activated');
      },
      
      reset: () => set({
        currentStep: 'welcome',
        currentAssessmentIndex: 0,
        businessCount: 0,
        businesses: [],
        currentBusiness: null,
        documentsUploaded: false,
        analysisComplete: false,
        prefillData: null,
        assessmentPath: FIRST_BUSINESS_ASSESSMENTS,
        completedAssessments: [],
        showGuidance: true,
        currentMessage: null,
        portfolioEnabled: false,
      }),
    }),
    {
      name: 'vision-enterprise-discovery',
      partialize: (state) => ({
        businessCount: state.businessCount,
        businesses: state.businesses,
        completedAssessments: state.completedAssessments,
        portfolioEnabled: state.portfolioEnabled,
      }),
    }
  )
);