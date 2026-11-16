/**
 * AdvancedWorkspaceContent — Phase 13.3E.1
 *
 * The full specialist workspace, preserved beneath the new six-workspace
 * architecture. Contains all 26 existing detailed valuation views, grouped
 * by category (Setup, Questionnaire, Calculation, Analysis, Output) and
 * surfaced through a two-level group selector instead of a single
 * horizontally-scrolling 26-item bar.
 *
 * No calculation, permission, audit, versioning, or publication logic is
 * changed here — this is a pure re-presentation of the existing components.
 */
import React, { useState } from 'react';
import { VALUATION_SECTIONS } from '@/lib/valuation/questionnaireDefinition';
import CalculationReadinessPanel from '../CalculationReadinessPanel';
import ValuationOverview from '../ValuationOverview';
import DataReadiness from '../DataReadiness';
import VersionTimeline from '../VersionTimeline';
import ClientSummaryShell from '../ClientSummaryShell';
import FinancialNormalization from '../FinancialNormalization';
import QuestionnaireSection from '../QuestionnaireSection';
import AdjustmentBridge from '../AdjustmentBridge';
import AdvisorReviewDashboard from '../AdvisorReviewDashboard';
import ReconciliationWorkflow from '../ReconciliationWorkflow';
import MethodologySelection from '../MethodologySelection';
import NormalizedEarningsEngine from '../NormalizedEarningsEngine';
import MultipleAnalysisEngine from '../MultipleAnalysisEngine';
import DCFWorkspace from '../DCFWorkspace';
import CapitalizationOfEarnings from '../CapitalizationOfEarnings';
import AssetApproach from '../AssetApproach';
import MethodReconciliation from '../MethodReconciliation';
import EquityValueBridge from '../EquityValueBridge';
import ConfidenceScoring from '../ConfidenceScoring';
import ValueDriverAnalysis from '../ValueDriverAnalysis';
import AdvisorConclusion from '../AdvisorConclusion';
import ScenarioModeling from '../ScenarioModeling';
import EnterpriseValueTimeline from '../EnterpriseValueTimeline';
import ExplainabilityPanel from '../ExplainabilityPanel';

const TABS = [
  { id: 'overview', label: 'Overview', group: 'Setup' },
  { id: 'data_readiness', label: 'Data Readiness', group: 'Setup' },
  { id: 'business_profile', label: 'Business Profile', group: 'Setup' },
  { id: 'financial_history', label: 'Financial History', group: 'Financials' },
  { id: 'recast_earnings', label: 'Recast Earnings', group: 'Financials' },
  { id: 'normalized_earnings', label: 'Normalized Earnings', group: 'Financials' },
  { id: 'revenue_quality', label: 'Revenue Quality', group: 'Questionnaire' },
  { id: 'growth_market', label: 'Growth & Market', group: 'Questionnaire' },
  { id: 'owner_dependency', label: 'Owner Dependency', group: 'Questionnaire' },
  { id: 'operational_maturity', label: 'Operational Maturity', group: 'Questionnaire' },
  { id: 'risk_transferability', label: 'Risk & Transferability', group: 'Questionnaire' },
  { id: 'methodology_selection', label: 'Methodology', group: 'Methods' },
  { id: 'multiple_analysis', label: 'Multiple Analysis', group: 'Methods' },
  { id: 'dcf_workspace', label: 'DCF', group: 'Methods' },
  { id: 'cap_earnings', label: 'Cap of Earnings', group: 'Methods' },
  { id: 'asset_approach', label: 'Asset Approach', group: 'Methods' },
  { id: 'method_reconciliation', label: 'Reconciliation', group: 'Methods' },
  { id: 'equity_bridge', label: 'Equity Bridge', group: 'Methods' },
  { id: 'confidence_scoring', label: 'Confidence', group: 'Methods' },
  { id: 'scenarios', label: 'Scenarios', group: 'Analysis' },
  { id: 'value_drivers', label: 'Value Drivers', group: 'Analysis' },
  { id: 'ev_timeline', label: 'EV Timeline', group: 'Analysis' },
  { id: 'advisor_review', label: 'Advisor Review', group: 'Analysis' },
  { id: 'advisor_conclusion', label: 'Conclusion', group: 'Analysis' },
  { id: 'client_summary', label: 'Client Summary', group: 'Output' },
  { id: 'version_history', label: 'Version History', group: 'Output' },
];

const GROUPS = ['Setup', 'Questionnaire', 'Financials', 'Methods', 'Analysis', 'Output'];

const TAB_SECTION_MAP = {
  business_profile: ['engagement_purpose', 'business_identity'],
  revenue_quality: ['revenue_quality', 'customer_concentration'],
  growth_market: ['growth_market', 'sales_engine', 'gross_margin'],
  owner_dependency: ['owner_dependency', 'management_team'],
  operational_maturity: ['operational_maturity', 'technology_data'],
  risk_transferability: ['legal_tax_risk', 'contracts_transferability', 'competitive_moat_ip'],
};

export default function AdvancedWorkspaceContent({ valuationId, summary, calcSummary, readiness }) {
  const [activeGroup, setActiveGroup] = useState('Setup');
  const [activeTab, setActiveTab] = useState('overview');
  const [answers, setAnswers] = useState({});
  const [financials, setFinancials] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);

  const { valuation } = summary || {};
  const groupTabs = TABS.filter((t) => t.group === activeGroup);

  const selectGroup = (g) => {
    setActiveGroup(g);
    const first = TABS.find((t) => t.group === g);
    if (first) setActiveTab(first.id);
    setActiveSectionIdx(0);
  };

  const handleAnswer = (questionKey, value) => {
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <ValuationOverview summary={summary} />;
      case 'data_readiness':
        return <DataReadiness businessId={valuation?.business_id} />;
      case 'business_profile':
      case 'revenue_quality':
      case 'growth_market':
      case 'owner_dependency':
      case 'operational_maturity':
      case 'risk_transferability': {
        const sectionKeys = TAB_SECTION_MAP[activeTab] || [];
        const sections = VALUATION_SECTIONS.filter((s) => sectionKeys.includes(s.section_key));
        const currentSection = sections[activeSectionIdx] || sections[0];
        return (
          <div className="space-y-4">
            {sections.length > 1 && (
              <div className="flex gap-1 flex-wrap">
                {sections.map((s, idx) => (
                  <button
                    key={s.section_key}
                    onClick={() => setActiveSectionIdx(idx)}
                    className={`px-3 py-1.5 rounded text-xs font-medium ${activeSectionIdx === idx ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >
                    {s.section_name}
                  </button>
                ))}
              </div>
            )}
            {currentSection && (
              <QuestionnaireSection
                sectionKey={currentSection.section_key}
                answers={answers}
                onAnswer={handleAnswer}
                onSave={(sk, ans) => setAnswers((prev) => ({ ...prev, ...ans }))}
              />
            )}
          </div>
        );
      }
      case 'financial_history':
        return (
          <div className="space-y-6">
            <FinancialNormalization
              valuationId={valuationId}
              financials={financials}
              adjustments={adjustments}
              onSave={(periods, adjs) => { setFinancials(periods); setAdjustments(adjs); }}
            />
            <NormalizedEarningsEngine valuationId={valuationId} />
          </div>
        );
      case 'recast_earnings': {
        const latestPeriod = financials[financials.length - 1];
        return (
          <div className="space-y-6">
            <AdjustmentBridge period={latestPeriod} adjustments={adjustments} />
            <ReconciliationWorkflow reconciliationItems={[]} />
          </div>
        );
      }
      case 'normalized_earnings':
        return <NormalizedEarningsEngine valuationId={valuationId} />;
      case 'methodology_selection':
        return <MethodologySelection valuationId={valuationId} answers={answers} />;
      case 'multiple_analysis':
        return <MultipleAnalysisEngine valuationId={valuationId} />;
      case 'dcf_workspace':
        return <DCFWorkspace valuationId={valuationId} />;
      case 'cap_earnings':
        return <CapitalizationOfEarnings valuationId={valuationId} />;
      case 'asset_approach':
        return <AssetApproach valuationId={valuationId} />;
      case 'method_reconciliation':
        return <MethodReconciliation valuationId={valuationId} />;
      case 'equity_bridge':
        return <EquityValueBridge valuationId={valuationId} />;
      case 'confidence_scoring':
        return <ConfidenceScoring valuationId={valuationId} />;
      case 'scenarios':
        return <ScenarioModeling valuationId={valuationId} />;
      case 'value_drivers':
        return <ValueDriverAnalysis valuationId={valuationId} />;
      case 'ev_timeline':
        return <EnterpriseValueTimeline valuationId={valuationId} />;
      case 'advisor_review':
        return (
          <div className="space-y-6">
            <CalculationReadinessPanel valuationId={valuationId} />
            <AdvisorReviewDashboard
              valuation={valuation}
              answers={answers}
              financials={financials}
              adjustments={adjustments}
              calculationSummary={calcSummary}
              readiness={readiness}
            />
            <ExplainabilityPanel valuationId={valuationId} />
          </div>
        );
      case 'advisor_conclusion':
        return <AdvisorConclusion valuationId={valuationId} />;
      case 'client_summary':
        return <ClientSummaryShell />;
      case 'version_history':
        return (
          <div className="space-y-6">
            <VersionTimeline valuationId={valuationId} />
            <EnterpriseValueTimeline valuationId={valuationId} />
          </div>
        );
      default:
        return <div className="text-center py-12 text-muted-foreground text-sm">Tab not yet implemented.</div>;
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Advanced Workspace</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Full specialist access to every detailed valuation tool. Select a category, then a section.
        </p>
      </div>

      {/* Group selector */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            onClick={() => selectGroup(g)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeGroup === g ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Tabs within selected group */}
      <div className="flex flex-wrap gap-1.5">
        {groupTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActiveSectionIdx(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {renderTab()}
      </div>
    </div>
  );
}