import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import RequireAdminRole from '@/components/authz/RequireAdminRole';
import { AssessmentProvider } from '@/lib/AssessmentContext';
import { BusinessContextEngineProvider } from '@/lib/BusinessContext';
import Onboarding from '@/pages/Onboarding';
import EnterpriseJourney from '@/pages/EnterpriseJourney';
import JourneySignup from '@/pages/JourneySignup';
import GalileoReimagined from '@/pages/galileo/GalileoReimagined';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Layout
import AppLayout from '@/components/layout/AppLayout';

// Pages
import Dashboard from '@/pages/Dashboard';
import DocumentUpload from '@/pages/DocumentUpload';
import DataRoom from '@/pages/DataRoom';
import DocumentRequests from '@/pages/DocumentRequests';
import Support from '@/pages/Support';

// Assessments
import ProfitGap from '@/pages/assessments/ProfitGap';
import ValueGap from '@/pages/assessments/ValueGap';
import RecastEBITDA from '@/pages/assessments/RecastEBITDA';
import TaxGap from '@/pages/assessments/TaxGap';
import OperationsGap from '@/pages/assessments/OperationsGap';
import FreedomAssessment from '@/pages/assessments/FreedomAssessment';
import CostOfInaction from '@/pages/assessments/CostOfInaction';
import StrategicRoadmap from '@/pages/assessments/StrategicRoadmap';

// Admin
import AdminView from '@/pages/admin/AdminView';
import AdminBusinessValuations from '@/pages/admin/AdminBusinessValuations';
import MyTeam from '@/pages/admin/MyTeam';
import TestOpportunityEngine from '@/pages/TestOpportunityEngine';
import TestNextBestAction from '@/pages/TestNextBestAction';
import RepairOpportunityEngine from '@/pages/RepairOpportunityEngine';
import CalendarSync from '@/pages/CalendarSync';
import TestGalileoContext from '@/pages/TestGalileoContext';
import TestGalileoInsights from '@/pages/TestGalileoInsights';
import TestAskGalileo from '@/pages/TestAskGalileo';
import StrategyCall from '@/pages/StrategyCall';
import Agreements from '@/pages/Agreements';
import Settings from '@/pages/Settings';
import KnowledgeBase from '@/pages/KnowledgeBase';
import ExpertAdvisorsView from '@/pages/ExpertAdvisorsView';
import ExpertNetwork from '@/pages/ExpertNetwork';

// Advisory
import CommandCenter from '@/pages/advisory/CommandCenter';
import SupabaseStatus from '@/pages/SupabaseStatus';
import ExitReadiness from '@/pages/advisory/ExitReadiness';
import MASimulator from '@/pages/advisory/MASimulator';
import ResourceLibrary from '@/pages/advisory/ResourceLibrary';
import BusinessValuation from '@/pages/advisory/BusinessValuation';
import ValuationExperienceShell from '@/components/valuation/experience/ValuationExperienceShell';

/**
 * The Invisible Threshold™ — Home Route Gate
 *
 * Authenticated  → role-based destination (no interruption)
 * Unauthenticated → Galileo (Magic Loop, no login redirect)
 * Loading        → silent spinner (never flashes login)
 */
function HomeGate() {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings, role, isLoadingProfile, supabaseProfile } = useAuth();

  // Still resolving auth — show a minimal silent spinner
  if (isLoadingAuth || isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  // Not authenticated — Galileo is the default entry experience (Magic Loop).
  // The Phase 3–5.1 pilot flag is retired. EnterpriseJourney remains registered
  // at /journey but is no longer the default anonymous entry surface.
  if (!isAuthenticated) {
    return <GalileoReimagined />;
  }

  // Authenticated but profile still loading
  if (isLoadingProfile && supabaseProfile === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Role-based destination
  switch (role) {
    case 'super_admin': return <Navigate to="/admin" replace />;
    case 'advisor':     return <Navigate to="/advisory/command-center" replace />;
    case 'team_member': return <Navigate to="/team" replace />;
    case 'owner':
    default:            return <Navigate to="/galileo" replace />;
  }
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Only block render for authenticated users — guests enter the Journey immediately.
  // isAuthenticated is false by default; we only know it's true once auth resolves.
  // So: block only when auth is still loading AND a token exists (i.e. likely authenticated).
  if (isLoadingAuth && isLoadingPublicSettings) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }
  // All other authError types (auth_required, unknown) are non-fatal —
  // treat as unauthenticated guest; HomeGate and ProtectedRoute handle routing.

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* /home — one definition of Home: the owner's Galileo surface.
          Kept outside AppLayout so no legacy chrome flashes before the handoff. */}
      <Route path="/home" element={<Navigate to="/galileo" replace />} />

      {/* Enterprise Journey — chrome-less experience (no auth required).
          Retained as a route; no longer the default entry experience. */}
      <Route path="/journey" element={<EnterpriseJourney />} />
      {/* Journey Signup — dedicated Blueprint save screen (no auth required) */}
      <Route path="/journey-signup" element={<JourneySignup />} />
      {/* Galileo Reimagined — Phase 1 Magic Loop (feature-flagged, chrome-less) */}
      <Route path="/galileo" element={<GalileoReimagined />} />

      {/* Onboarding — protected but outside AppLayout */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* Public routes - accessible without auth */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<DocumentUpload />} />
        {/* Assessments - public */}
        <Route path="/assessments/profit-gap" element={<ProfitGap />} />
        <Route path="/assessments/value-gap" element={<ValueGap />} />
        <Route path="/assessments/recast-ebitda" element={<RecastEBITDA />} />
        <Route path="/assessments/tax-gap" element={<TaxGap />} />
        <Route path="/assessments/operations-gap" element={<OperationsGap />} />
        <Route path="/assessments/freedom" element={<FreedomAssessment />} />
        <Route path="/assessments/cost-of-inaction" element={<CostOfInaction />} />
        <Route path="/assessments/roadmap" element={<StrategicRoadmap />} />
      </Route>

      {/* Home — The Invisible Threshold™: Journey for guests, Dashboard for members */}
      <Route path="/" element={<HomeGate />} />

      {/* Protected app routes */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/journey" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/data-room" element={<DataRoom />} />
          <Route path="/document-requests" element={<DocumentRequests />} />
          <Route path="/support" element={<Support />} />

          {/* Advisory */}
          <Route path="/advisory/command-center" element={<CommandCenter />} />
          <Route path="/advisory/exit-readiness" element={<ExitReadiness />} />
          <Route path="/advisory/ma-simulator" element={<MASimulator />} />
          <Route path="/advisory/resources" element={<ResourceLibrary />} />
          <Route path="/advisory/business-valuation" element={<BusinessValuation />} />
          <Route path="/advisory/valuation/:valuationId" element={<ValuationExperienceShell />} />
          {/* Developer diagnostic — its only entry point is the admin-only menu block. */}
          <Route path="/dev/supabase-status" element={<RequireAdminRole><SupabaseStatus /></RequireAdminRole>} />

          {/* Admin */}
          {/* Admin surface — canonical admin / super_admin only (see RequireAdminRole). */}
          <Route path="/admin" element={<RequireAdminRole><AdminView /></RequireAdminRole>} />
          <Route path="/admin/business-valuations" element={<AdminBusinessValuations />} />
          <Route path="/team" element={<MyTeam />} />
          <Route path="/test/opportunities" element={<TestOpportunityEngine />} />
          <Route path="/test/next-best-action" element={<TestNextBestAction />} />
          <Route path="/test/repair-engine" element={<RepairOpportunityEngine />} />
          <Route path="/test/galileo-context" element={<TestGalileoContext />} />
          <Route path="/test/galileo-insights" element={<TestGalileoInsights />} />
          <Route path="/test/ask-galileo" element={<TestAskGalileo />} />
          <Route path="/calendar-sync" element={<CalendarSync />} />
          <Route path="/strategy-call" element={<StrategyCall />} />
          <Route path="/agreements" element={<Agreements />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/expert-advisors" element={<ExpertAdvisorsView />} />
          <Route path="/expert-network" element={<ExpertNetwork />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <BusinessContextEngineProvider>
          <AssessmentProvider>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </AssessmentProvider>
        </BusinessContextEngineProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App