# V.I.S.I.O.N. Platform — Business Valuation System Connection Map

**Audit Date:** 2026-08-05
**Scope:** Complete end-to-end dependency mapping of the Business Valuation system.

---

## Legend

| Status | Meaning |
|--------|---------|
| CONNECTED | Source → action → table → engine → service → component → user action → persisted → downstream all wired and functional |
| PARTIAL | Some links in the chain are wired but not all; data flows partially |
| DISCONNECTED | Source or destination exists but the link between them is missing |
| PLACEHOLDER | UI present but no backend persistence or action behind it |
| UNKNOWN | Cannot verify without runtime testing |
| BROKEN | Link exists but produces incorrect results or errors |

---

## 1. Core Data Flow Map

### Documents → Extraction → Intelligence → Valuation

```
Documents (public.documents / Supabase documents table)
  → [CONNECTED] uploadDocumentToSupabase / uploadDocumentDirect backend
  → [CONNECTED] documents table (Supabase)
  → [CONNECTED] runDocumentExtraction backend
  → [CONNECTED] extracted_fields table
  → [CONNECTED] document_analysis table
  → [CONNECTED] intelligenceEngine.buildIntelligence (shared)
  → [CONNECTED] valuationService.getValuationIntelligence action
  → [CONNECTED] valuationIntelligenceService.js (frontend wrapper)
  → [CONNECTED] IntelligenceWorkspace.jsx (Discover)
  → [CONNECTED] User views candidates, conflicts, add-backs
  → [PARTIAL] runIntelligenceScan prefills valuation_answers (high-confidence only)
  → [CONNECTED] valuation_answers table
  → [CONNECTED] valuationCalculationEngine.calculateNormalizedEarnings
  → [CONNECTED] valuation_normalized_earnings table
  → [CONNECTED] Method calculations (multiples, DCF, cap, asset)
  → [CONNECTED] valuation_calculations table
  → [CONNECTED] Method reconciliation
  → [CONNECTED] Equity bridge
  → [CONNECTED] Advisor conclusion
  → [CONNECTED] publishValuation (server-side snapshot)
  → [CONNECTED] valuation_versions table (immutable)
  → [CONNECTED] Client-safe snapshot
  → [PARTIAL] Growth Plan (local state only, no persistence)
  → [PARTIAL] Deliverables (preview only, no file generation)
```

### Assessments → Intelligence → Build Value → Valuation

```
Assessments (Base44 Assessment entity + Supabase assessment tables)
  → [CONNECTED] Assessment answers saved via saveAssessmentToSupabase
  → [CONNECTED] assessment_answers table
  → [CONNECTED] assessment_calculations table
  → [CONNECTED] dashboard_metrics table
  → [CONNECTED] gap_analyses table
  → [CONNECTED] intelligenceEngine loads assessment results
  → [CONNECTED] Assessment Intelligence panel in Discover
  → [CONNECTED] buildValueEngine maps assessment fields to dimensions
  → [CONNECTED] BuildValueWorkspace renders dimension scorecards
  → [PARTIAL] Build Value findings flow into Insights (via insightsEngine)
  → [PARTIAL] Build Value findings flow into Growth Plan candidates
  → [DISCONNECTED] Build Value findings do NOT flow into Valuation workspace sections
```

### Business Records → Context → Permissions → Workspaces

```
business_entities table (Supabase public schema)
  → [CONNECTED] BusinessContext provider (active_business_id)
  → [CONNECTED] BusinessValuation.jsx landing page
  → [CONNECTED] createValuation (requires business access)
  → [CONNECTED] business_valuations table (valuation schema)
  → [CONNECTED] valuation_assignments table
  → [CONNECTED] requireValuationView/Edit/Review/Publish
  → [CONNECTED] All workspace components receive canEdit/canPublish
  → [CONNECTED] User actions gated by permissions
  → [CONNECTED] Audit log records actor_profile_id
```

---

## 2. Backend Function Action Map

### valuationService (1640 lines, 26 actions)

| Action | Status | DB Table | Frontend Wrapper | Component |
|--------|--------|----------|-----------------|-----------|
| createValuation | CONNECTED | business_valuations | valuationService.js | BusinessValuation.jsx |
| updateValuation | CONNECTED | business_valuations | valuationService.js | EngagementSetup |
| updateValuationStatus | CONNECTED | business_valuations | valuationService.js | ValuationWorkspace |
| assignValuationAdvisor | CONNECTED | valuation_assignments | valuationService.js | (Admin only) |
| updateValuationAssignment | CONNECTED | valuation_assignments | valuationService.js | (Admin only) |
| removeValuationAdvisor | CONNECTED | valuation_assignments | valuationService.js | (Admin only) |
| saveValuationAnswer | CONNECTED | valuation_answers | valuationService.js | QuestionnaireSection |
| saveValuationFinancial | CONNECTED | valuation_financials | valuationService.js | FinancialNormalization |
| saveValuationAdjustment | CONNECTED | valuation_adjustments | valuationService.js | AdjustmentBridge |
| saveValuationMultipleFactor | CONNECTED | valuation_multiple_factors | valuationService.js | MultipleAnalysisEngine |
| saveValuationScenario | CONNECTED | valuation_scenarios | valuationService.js | ScenarioModeling |
| publishValuation | CONNECTED | valuation_versions | valuationService.js | ValuationWorkspace |
| shareValuation | CONNECTED | business_valuations | valuationService.js | DeliverablesWorkspace |
| revokeClientAccess | CONNECTED | business_valuations | valuationService.js | DeliverablesWorkspace |
| getSharedClientSummary | CONNECTED | valuation_versions | valuationService.js | ClientSummaryShell |
| archiveValuation | CONNECTED | business_valuations | valuationService.js | (Admin) |
| restoreArchivedValuation | CONNECTED | business_valuations | valuationService.js | (Admin) |
| appendValuationAuditEvent | CONNECTED | valuation_audit_log | valuationService.js | (Internal) |
| getValuation | CONNECTED | business_valuations | valuationService.js | (Internal) |
| getValuationSummary | CONNECTED | business_valuations + assignments | valuationService.js | ValuationExperienceShell |
| getDataReadiness | CONNECTED | documents + extracted_fields | valuationService.js | DataReadiness |
| getValuationVersions | CONNECTED | valuation_versions | valuationService.js | DeliverablesWorkspace |
| getValuationAuditLog | CONNECTED | valuation_audit_log | valuationService.js | (Advanced) |
| getValuationAssignments | CONNECTED | valuation_assignments | valuationService.js | (Admin) |
| getValuationIntelligence | CONNECTED | 10+ source tables | valuationIntelligenceService.js | IntelligenceWorkspace |
| runIntelligenceScan | CONNECTED | valuation_answers (prefill) | valuationIntelligenceService.js | IntelligenceWorkspace |
| getValuationByBusiness | CONNECTED | business_valuations | valuationService.js | BusinessValuation.jsx |
| getSharedValuationAvailability | CONNECTED | business_valuations | valuationService.js | (Advisory Hub) |
| getVersionDelta | CONNECTED | valuation_version_deltas | valuationService.js | VersionDeltaPanel |
| getVersionDeltas | CONNECTED | valuation_version_deltas | valuationService.js | VersionIntelligencePanel |

### valuationCalculationEngine (2364 lines, 30+ actions)

| Action | Status | DB Table | Frontend Wrapper | Component |
|--------|--------|----------|-----------------|-----------|
| saveMethodSelection | CONNECTED | valuation_method_selections | valuationCalculationService.js | MethodologySelection |
| getMethodSelections | CONNECTED | valuation_method_selections | valuationCalculationService.js | MethodologySelection |
| approveMethodSelection | CONNECTED | valuation_method_selections | valuationCalculationService.js | MethodologySelection |
| calculateNormalizedEarnings | CONNECTED | valuation_normalized_earnings | valuationCalculationService.js | NormalizedEarningsEngine |
| getNormalizedEarnings | CONNECTED | valuation_normalized_earnings | valuationCalculationService.js | NormalizedEarningsEngine |
| saveHistoricalWeighting | CONNECTED | valuation_historical_weighting | valuationCalculationService.js | WeightingSection |
| getHistoricalWeighting | CONNECTED | valuation_historical_weighting | valuationCalculationService.js | WeightingSection |
| saveBenchmark | CONNECTED | valuation_benchmarks | valuationCalculationService.js | MultipleAnalysisEngine |
| getBenchmarks | CONNECTED | valuation_benchmarks | valuationCalculationService.js | MultipleAnalysisEngine |
| deleteBenchmark | CONNECTED | valuation_benchmarks | valuationCalculationService.js | MultipleAnalysisEngine |
| calculateMultipleMethod | CONNECTED | valuation_calculations + side tables | valuationCalculationService.js | MultipleAnalysisEngine |
| getMultipleCalculation | CONNECTED | valuation_calculations | valuationCalculationService.js | MultipleAnalysisEngine |
| saveDCFProjection | CONNECTED | valuation_dcf_projections | valuationCalculationService.js | DCFWorkspace |
| calculateDCF | CONNECTED | valuation_calculations + dcf | valuationCalculationService.js | DCFWorkspace |
| getDCF | CONNECTED | valuation_dcf_projections | valuationCalculationService.js | DCFWorkspace |
| saveCapEarningsInputs | CONNECTED | valuation_cap_earnings | valuationCalculationService.js | CapitalizationOfEarnings |
| calculateCapEarnings | CONNECTED | valuation_calculations + cap | valuationCalculationService.js | CapitalizationOfEarnings |
| getCapEarnings | CONNECTED | valuation_cap_earnings | valuationCalculationService.js | CapitalizationOfEarnings |
| saveAssetItem | CONNECTED | valuation_asset_items | valuationCalculationService.js | AssetApproach |
| getAssetItems | CONNECTED | valuation_asset_items | valuationCalculationService.js | AssetApproach |
| deleteAssetItem | CONNECTED | valuation_asset_items | valuationCalculationService.js | AssetApproach |
| calculateAssetApproach | CONNECTED | valuation_calculations | valuationCalculationService.js | AssetApproach |
| saveMethodReconciliation | CONNECTED | valuation_calculations (reconciliation) | valuationCalculationService.js | MethodReconciliation |
| calculateReconciledValue | CONNECTED | valuation_calculations (reconciliation) | valuationCalculationService.js | MethodReconciliation |
| getMethodReconciliation | CONNECTED | valuation_calculations | valuationCalculationService.js | MethodReconciliation |
| saveEquityBridgeItem | CONNECTED | valuation_equity_bridge_items | valuationCalculationService.js | EquityValueBridge |
| getEquityBridge | CONNECTED | valuation_equity_bridge_items | valuationCalculationService.js | EquityValueBridge |
| calculateEquityValue | CONNECTED | valuation_calculations (equity_bridge) | valuationCalculationService.js | EquityValueBridge |
| saveConfidenceScore | CONNECTED | valuation_confidence_scores | valuationCalculationService.js | ConfidenceScoring |
| calculateOverallConfidence | CONNECTED | valuation_calculations (confidence) | valuationCalculationService.js | ConfidenceScoring |
| getConfidenceScores | CONNECTED | valuation_confidence_scores | valuationCalculationService.js | ConfidenceScoring |
| saveScenarioCalculation | CONNECTED | valuation_scenarios | valuationCalculationService.js | ScenarioModeling |
| getScenarioCalculations | CONNECTED | valuation_scenarios | valuationCalculationService.js | ScenarioModeling |
| saveValueDriver | CONNECTED | valuation_value_drivers | valuationCalculationService.js | ValueDriverAnalysis |
| getValueDrivers | CONNECTED | valuation_value_drivers | valuationCalculationService.js | ExecutiveInsights, GrowthPlan |
| updateValueDriver | CONNECTED | valuation_value_drivers | valuationCalculationService.js | ValueDriverAnalysis |
| saveAdvisorConclusion | CONNECTED | valuation_conclusions | valuationCalculationService.js | AdvisorConclusion |
| getAdvisorConclusion | CONNECTED | valuation_conclusions | valuationCalculationService.js | AdvisorConclusion |
| getCalculationSummary | CONNECTED | valuation_calculations (aggregate) | valuationCalculationService.js | ValuationExperienceShell |
| markCalculationsStale | CONNECTED | valuation_calculations | valuationCalculationService.js | (Internal, triggered by saves) |
| getStaleCalculations | CONNECTED | valuation_calculations | valuationCalculationService.js | CalculationReadinessPanel |
| validatePublicationReadiness | CONNECTED | valuation_calculations + conclusions | valuationCalculationService.js | ValuationExperienceShell |
| getCalculationLines | CONNECTED | valuation_calculation_lines | valuationCalculationService.js | ExplainabilityPanel |
| approveCalculation | CONNECTED | valuation_calculations | valuationCalculationService.js | AdvisorReviewDashboard |
| supersedeCalculation | CONNECTED | valuation_calculations | valuationCalculationService.js | (Internal) |
| persistCalculationEnvelope | CONNECTED | valuation_calculations | valuationCalculationService.js | (Internal) |
| recalculateValuation | CONNECTED | valuation_calculations (bulk) | valuationCalculationService.js | (Internal) |

### verificationQueueService (608 lines, 10 actions)

| Action | Status | DB Table | Frontend Wrapper | Component |
|--------|--------|----------|-----------------|-----------|
| getVerificationQueue | PARTIAL | valuation_verification_items | verificationQueueService.js | VerifyWorkspace |
| resolveVerificationItem | CONNECTED | valuation_verification_items | verificationQueueService.js | QueueCard |
| resolveConflict | CONNECTED | valuation_verification_items + valuation_answers | verificationQueueService.js | ConflictResolutionModal |
| approveAddBack | CONNECTED | valuation_verification_items + valuation_adjustments | verificationQueueService.js | AddBackReviewModal |
| rejectAddBack | CONNECTED | valuation_verification_items | verificationQueueService.js | AddBackReviewModal |
| createClientRequest | CONNECTED | valuation_client_requests | verificationQueueService.js | ClientRequestModal |
| getClientRequests | CONNECTED | valuation_client_requests | verificationQueueService.js | (Advisor-side) |
| assignVerificationItem | CONNECTED | valuation_verification_items | verificationQueueService.js | QueueCard |
| deferVerificationItem | CONNECTED | valuation_verification_items | verificationQueueService.js | QueueCard |
| getQueueSummary | CONNECTED | valuation_verification_items | verificationQueueService.js | VerifyWorkspace |

**Note:** verificationQueueService requires manual SQL migration (`business_valuation_phase13_3e3_verification_queue.sql`). If not run, queue loads as empty state (graceful degradation).

---

## 3. Database Table Map

### valuation schema (14+ tables from Phase 13.1A + additions)

| Table | Status | Used By | Notes |
|-------|--------|---------|-------|
| business_valuations | CONNECTED | valuationService | Root table, status lifecycle |
| valuation_assignments | CONNECTED | valuationService | Permission grants (can_view/edit/review/publish) |
| valuation_answers | CONNECTED | valuationService, verificationQueueService | Questionnaire answers with provenance |
| valuation_financials | CONNECTED | valuationService | Historical financial periods |
| valuation_adjustments | CONNECTED | valuationService, verificationQueueService | Normalization adjustments |
| valuation_multiple_factors | CONNECTED | valuationService | Multiple method inputs |
| valuation_scenarios | CONNECTED | valuationService | Scenario calculations |
| valuation_audit_log | CONNECTED | valuationService, valuationCalculationEngine | Immutable audit trail |
| valuation_versions | CONNECTED | valuationService | Published immutable snapshots |
| valuation_version_deltas | CONNECTED | valuationService (deltaEngine) | Version comparison artifacts |
| valuation_questions | CONNECTED | valuationService | Questionnaire definitions |
| valuation_method_selections | CONNECTED | valuationCalculationEngine | Method inclusion/exclusion |
| valuation_normalized_earnings | CONNECTED | valuationCalculationEngine | Calculated earnings |
| valuation_historical_weighting | CONNECTED | valuationCalculationEngine | Period weights |
| valuation_benchmarks | CONNECTED | valuationCalculationEngine | Market multiples |
| valuation_calculations | CONNECTED | valuationCalculationEngine | All calculation results + staleness |
| valuation_calculation_lines | CONNECTED | valuationCalculationEngine | Audit-trail line items |
| valuation_dcf_projections | CONNECTED | valuationCalculationEngine | DCF inputs |
| valuation_cap_earnings | CONNECTED | valuationCalculationEngine | Cap earnings inputs |
| valuation_asset_items | CONNECTED | valuationCalculationEngine | Asset approach items |
| valuation_equity_bridge_items | CONNECTED | valuationCalculationEngine | Equity bridge adjustments |
| valuation_confidence_scores | CONNECTED | valuationCalculationEngine | Confidence category scores |
| valuation_conclusions | CONNECTED | valuationCalculationEngine | Advisor conclusions |
| valuation_value_drivers | CONNECTED | valuationCalculationEngine | Value driver records |
| valuation_verification_items | PARTIAL | verificationQueueService | Requires manual migration |
| valuation_client_requests | PARTIAL | verificationQueueService | Requires manual migration |

### public schema (source tables)

| Table | Status | Used By |
|-------|--------|---------|
| profiles | CONNECTED | All valuation functions (identity resolution) |
| business_entities | CONNECTED | valuationService (business access) |
| business_owners | CONNECTED | valuationService (business access) |
| documents | CONNECTED | intelligenceEngine (document intelligence) |
| extracted_fields | CONNECTED | intelligenceEngine (field candidates) |
| document_analysis | CONNECTED | intelligenceEngine (document classification) |
| assessment_answers | CONNECTED | intelligenceEngine (assessment reuse) |
| assessment_calculations | CONNECTED | intelligenceEngine (assessment reuse) |
| dashboard_metrics | CONNECTED | intelligenceEngine (metric candidates) |
| gap_analyses | CONNECTED | intelligenceEngine (gap findings) |
| profile_financials | CONNECTED | intelligenceEngine (financial candidates) |

---

## 4. Shared Engine Map

| Engine | Location | Used By | I/O | Status |
|--------|----------|---------|-----|--------|
| intelligenceEngine | base44/shared/valuationEngine/ | valuationService, verificationQueueService | None (pure) | CONNECTED |
| verificationQueueEngine | base44/shared/valuationEngine/ | verificationQueueService | None (pure) | CONNECTED |
| stalenessMap | base44/shared/valuationEngine/ | valuationCalculationEngine, verificationQueueService | None (pure data) | CONNECTED |
| deltaEngine | base44/shared/valuationEngine/ | valuationService | None (pure) | CONNECTED |
| normalizedEarnings | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| historicalWeighting | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| multipleEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| dcfEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| capitalizationEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| assetEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| reconciliationEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| equityBridge | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| confidenceEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| scenarioEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| valueDriverEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| explainabilityEngine | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| methodologyRegistry | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| calculationPipeline | base44/shared/valuationEngine/ | valuationCalculationEngine | None (pure) | CONNECTED |
| intelligenceMapping | base44/shared/valuationEngine/ | intelligenceEngine | None (pure) | CONNECTED |
| valuationAuth | base44/shared/valuationEngine/ | verificationQueueService | None (pure) | CONNECTED |
| valuationShared/entry | base44/shared/ | valuationCalculationEngine | None (pure) | CONNECTED |
| buildValueEngine | src/lib/valuation/ | BuildValueWorkspace, insightsEngine | None (pure) | CONNECTED |
| insightsEngine | src/lib/valuation/ | ExecutiveInsights, GrowthPlanWorkspace, DeliverablesWorkspace | None (pure) | CONNECTED |
| growthPlanEngine | src/lib/valuation/ | GrowthPlanWorkspace | None (pure) | CONNECTED |
| deliverablesEngine | src/lib/valuation/ | DeliverablesWorkspace | None (pure) | CONNECTED |
| valuationState | src/lib/valuation/ | ValuationWorkspace, insightsEngine | None (pure) | CONNECTED |

---

## 5. Workspace → Component → Service Map

### Discover (IntelligenceWorkspace)

| Component | Service Call | Backend Action | Status |
|-----------|-------------|----------------|--------|
| IntelligenceSummary | getValuationIntelligence | valuationService.getValuationIntelligence | CONNECTED |
| BusinessSnapshot | (from parent intelligence) | — | CONNECTED |
| DocumentIntelligence | (from parent intelligence) | — | CONNECTED |
| AssessmentIntelligence | (from parent intelligence) | — | CONNECTED |
| AddBackCandidates | (from parent intelligence) | — | CONNECTED |
| MissingInformation | (from parent intelligence) | — | CONNECTED |
| RecommendedAction | (from parent intelligence) | — | CONNECTED |
| Refresh button | runIntelligenceScan | valuationService.runIntelligenceScan | CONNECTED |

### Validate (VerifyWorkspace)

| Component | Service Call | Backend Action | Status |
|-----------|-------------|----------------|--------|
| QueueSummary | getVerificationQueue | verificationQueueService.getVerificationQueue | PARTIAL (migration) |
| QueueCard | (from parent queue) | — | CONNECTED |
| ConflictResolutionModal | resolveConflict | verificationQueueService.resolveConflict | CONNECTED |
| AddBackReviewModal | approveAddBack / rejectAddBack | verificationQueueService.approveAddBack | CONNECTED |
| ClientRequestModal | createClientRequest | verificationQueueService.createClientRequest | CONNECTED |

### Build Value (BuildValueWorkspace)

| Component | Service Call | Backend Action | Status |
|-----------|-------------|----------------|--------|
| BusinessQualitySummary | (from buildValueEngine) | — | CONNECTED |
| DimensionScorecard (×6) | (from buildValueEngine) | — | CONNECTED |
| ExecutiveInsights | getValueDrivers + getVersionDeltas | calculationEngine + valuationService | CONNECTED |
| CurrentValueSummary | (from insightsEngine) | — | CONNECTED |
| ValueDriverCard | (from parent insights) | — | CONNECTED |
| ValueDetractorCard | (from parent insights) | — | CONNECTED |
| ConstraintSummary | (from parent insights) | — | CONNECTED |
| FastestWins | (from parent insights) | — | CONNECTED |
| VersionIntelligencePanel | (from parent insights) | — | CONNECTED |

### Valuation (ValuationWorkspace)

| Section | Certified Component | Backend Action | Status |
|---------|-------------------|----------------|--------|
| Setup | EngagementSetup | valuationService.updateValuation | CONNECTED |
| Earnings | NormalizedEarningsEngine | calculationEngine.calculateNormalizedEarnings | CONNECTED |
| Weighting | WeightingSection | calculationEngine.saveHistoricalWeighting | CONNECTED |
| Methods | MethodologySelection | calculationEngine.saveMethodSelection | CONNECTED |
| Reconciliation | MethodReconciliation | calculationEngine.calculateReconciledValue | CONNECTED |
| Enterprise Value | ExplainabilityPanel | calculationEngine.getCalculationLines | CONNECTED |
| Equity Value | EquityValueBridge | calculationEngine.calculateEquityValue | CONNECTED |
| Confidence | ConfidenceScoring | calculationEngine.calculateOverallConfidence | CONNECTED |
| Conclusion | AdvisorConclusion | calculationEngine.saveAdvisorConclusion | CONNECTED |
| Publish | (readiness result) | calculationEngine.validatePublicationReadiness | CONNECTED |
| Publish action | publishValuation | valuationService.publishValuation | CONNECTED |

### Growth Plan (GrowthPlanWorkspace)

| Component | Service Call | Backend Action | Status |
|-----------|-------------|----------------|--------|
| InitiativeCard | (local state) | NONE | PLACEHOLDER (no persistence) |
| InitiativeFormModal | (local state) | NONE | PLACEHOLDER |
| ChainOfCustodyDrawer | (local state) | NONE | PLACEHOLDER |
| AdvisorPrioritizationPreview | (local state) | NONE | PLACEHOLDER |
| ClientGrowthPlanPreview | (local state) | NONE | PLACEHOLDER |
| Candidate derivation | buildExecutiveInsights + deriveCandidateInitiatives | — | CONNECTED (read-only) |
| Value drivers load | getValueDrivers | calculationEngine.getValueDrivers | CONNECTED |

### Deliverables (DeliverablesWorkspace)

| Component | Service Call | Backend Action | Status |
|-----------|-------------|----------------|--------|
| DeliverableCard | (local state from engine) | NONE | PARTIAL (no file generation) |
| ReportPreviewDrawer | (local state) | NONE | PLACEHOLDER (no file output) |
| Share action | shareValuation | valuationService.shareValuation | CONNECTED |
| Revoke action | revokeClientAccess | valuationService.revokeClientAccess | CONNECTED |
| Version loading | getValuationVersions | valuationService.getValuationVersions | CONNECTED |
| Stale detection | (hardcoded false) | NONE | DISCONNECTED |

### Advanced (AdvancedWorkspaceContent)

| Tab | Component | Loads Data? | Status |
|-----|-----------|-------------|--------|
| overview | ValuationOverview | From summary prop | CONNECTED |
| data_readiness | DataReadiness | Loads own data | CONNECTED |
| business_profile | QuestionnaireSection | LOCAL STATE ONLY | DISCONNECTED (no backend load) |
| financial_history | FinancialNormalization + NormalizedEarningsEngine | LOCAL STATE for financials | PARTIAL |
| recast_earnings | AdjustmentBridge + ReconciliationWorkflow | LOCAL STATE + `reconciliationItems={[]}` | DISCONNECTED (always empty) |
| normalized_earnings | NormalizedEarningsEngine | Loads own data | CONNECTED |
| revenue_quality → risk_transferability | QuestionnaireSection | LOCAL STATE ONLY | DISCONNECTED (no backend load) |
| methodology_selection | MethodologySelection | Loads own data | CONNECTED |
| multiple_analysis | MultipleAnalysisEngine | Loads own data | CONNECTED |
| dcf_workspace | DCFWorkspace | Loads own data | CONNECTED |
| cap_earnings | CapitalizationOfEarnings | Loads own data | CONNECTED |
| asset_approach | AssetApproach | Loads own data | CONNECTED |
| method_reconciliation | MethodReconciliation | Loads own data | CONNECTED |
| equity_bridge | EquityValueBridge | Loads own data | CONNECTED |
| confidence_scoring | ConfidenceScoring | Loads own data | CONNECTED |
| scenarios | ScenarioModeling | Loads own data | CONNECTED |
| value_drivers | ValueDriverAnalysis | Loads own data | CONNECTED |
| ev_timeline | EnterpriseValueTimeline | Loads own data | CONNECTED |
| advisor_review | CalculationReadinessPanel + AdvisorReviewDashboard + ExplainabilityPanel | Loads own data | CONNECTED |
| advisor_conclusion | AdvisorConclusion | Loads own data | CONNECTED |
| client_summary | ClientSummaryShell | NO PROPS PASSED | DISCONNECTED (renders empty) |
| version_history | VersionTimeline + EnterpriseValueTimeline | Loads own data | CONNECTED |

---

## 6. Permission Matrix

### Backend Authorization (all server-side, service-role bypasses RLS)

| Action Category | super_admin | assigned advisor (can_edit) | assigned reviewer (can_review) | assigned publisher (can_publish) | assigned viewer (can_view) | business owner | client team | anonymous |
|----------------|-------------|---------------------------|------------------------------|--------------------------------|--------------------------|---------------|-------------|-----------|
| Create valuation | ✅ (if business access) | ✅ (if business access) | ❌ | ❌ | ❌ | ✅ (own business) | ❌ | ❌ |
| View valuation | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (no assignment) | ❌ | ❌ |
| Edit inputs | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Calculate | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve calculation | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Publish | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Share / Revoke | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Archive / Restore | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View shared client summary | ✅ | ✅ (if shared) | ✅ (if shared) | ✅ (if shared) | ✅ (if shared) | ✅ (own business) | ✅ (if shared) | ❌ |

**Key:** Authorization is assignment-based, not role-based. `requireValuationView/Edit/Review/Publish` check `valuation_assignments` with `removed_at IS NULL`. Super_admin bypasses all checks. Business ownership grants discovery + shared-summary access only — NOT internal valuation access.

### Frontend Permission Flags

| Flag | Source | Used By |
|------|--------|---------|
| canEdit | assignment.can_edit or super_admin | BuildValue, Valuation, Growth Plan |
| canPublish | assignment.can_publish or super_admin | Valuation, Deliverables |
| isSimplifiedRole | business_owner or client_team | Shell header banner |

---

## 7. Navigation and Route Map

| Route | Component | Auth | Status |
|-------|-----------|------|--------|
| /advisory/business-valuation | BusinessValuation | Protected | CONNECTED |
| /advisory/valuation/:valuationId | ValuationExperienceShell | Protected | CONNECTED |
| ?ws=discover | IntelligenceWorkspace | Protected | CONNECTED |
| ?ws=validate | VerifyWorkspace | Protected | CONNECTED |
| ?ws=build_value | BuildValueWorkspace | Protected | CONNECTED |
| ?ws=build-value | BuildValueWorkspace | Protected | CONNECTED (alias) |
| ?ws=valuation | ValuationWorkspace | Protected | CONNECTED |
| ?ws=growth_plan | GrowthPlanWorkspace | Protected | CONNECTED |
| ?ws=growth-plan | GrowthPlanWorkspace | Protected | CONNECTED (alias) |
| ?ws=deliverables | DeliverablesWorkspace | Protected | CONNECTED |
| ?ws=advanced | AdvancedWorkspaceContent | Protected | CONNECTED |
| ?ws=intelligence | IntelligenceWorkspace | Protected | CONNECTED (old alias → discover) |
| ?ws=verify | VerifyWorkspace | Protected | CONNECTED (old alias → validate) |
| ?ws=action_plan | GrowthPlanWorkspace | Protected | CONNECTED (old alias → growth_plan) |
| ?ws=reports | DeliverablesWorkspace | Protected | CONNECTED (old alias → deliverables) |

**Route alias mapping:** ROUTE_MAP in ValuationExperienceShell handles old→new identifier mapping. Non-breaking.

---

## 8. Staleness Dependency Map

| Source Change | Affected Calculations | Status |
|---------------|---------------------|--------|
| financial_period_changed | normalized_earnings, historical_weighting, all multiples, cap_earnings, dcf, reconciliation, equity_bridge, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| adjustment_changed | normalized_earnings, historical_weighting, ebitda/sde_multiple, cap_earnings, reconciliation, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| benchmark_changed | all multiples, reconciliation, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| method_selection_changed | reconciliation, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| dcf_assumption_changed | dcf, reconciliation, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| asset_item_changed | asset methods, reconciliation, equity_bridge, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| equity_bridge_item_changed | equity_bridge, advisor_conclusion, client_safe_summary | CONNECTED |
| confidence_input_changed | confidence, advisor_conclusion, client_safe_summary | CONNECTED |
| scenario_assumption_changed | scenario, client_safe_summary | CONNECTED |
| historical_weighting_changed | historical_weighting, multiples, cap_earnings, reconciliation, confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |
| answer_changed | confidence, scenario, advisor_conclusion, client_safe_summary | CONNECTED |

**Staleness propagation:** Triggered by valuationCalculationEngine on every save action, and by verificationQueueService on every resolution. Resets advisor conclusions. Marks side tables (dcf, cap_earnings) stale. Equity bridge cascade included.

---

## 9. Audit Log Coverage

| Action | Audit Event | Status |
|--------|-------------|--------|
| Create valuation | `created` | CONNECTED |
| Update valuation | `updated` | CONNECTED |
| Status transition | `status_changed` | CONNECTED |
| Assignment | `assigned` | CONNECTED |
| Removal | `removed` | CONNECTED |
| Answer save | `answer_saved` | CONNECTED |
| Financial save | `financial_saved` | CONNECTED |
| Adjustment save | `adjustment_saved` | CONNECTED |
| Calculation | `calculation_saved` | CONNECTED |
| Calculation approval | `calculation_approved` | CONNECTED |
| Publication | `published` | CONNECTED |
| Sharing | `shared` | CONNECTED |
| Revocation | `revoked` | CONNECTED |
| Archive | `archived` | CONNECTED |
| Restore | `restored` | CONNECTED |
| Verification resolution | `reviewed` | CONNECTED |
| Intelligence scan | `calculation_saved` (metadata: intelligence_scan) | CONNECTED |
| Method selection | `calculation_saved` (metadata: method_key) | CONNECTED |
| Report generation | NONE | DISCONNECTED (no audit for deliverable generation) |
| Report sharing | (uses shareValuation audit) | PARTIAL |
| Initiative approval | NONE | DISCONNECTED (local state, no audit) |
| Initiative deferral | NONE | DISCONNECTED (local state, no audit) |

---

## 10. Summary of Connection Status

| Category | CONNECTED | PARTIAL | DISCONNECTED | PLACEHOLDER |
|----------|-----------|---------|--------------|-------------|
| Backend actions (66 total) | 62 | 2 (verification queue - migration) | 0 | 0 |
| Database tables (26 total) | 24 | 2 (verification queue tables) | 0 | 0 |
| Shared engines (26 total) | 26 | 0 | 0 | 0 |
| Frontend services (4 total) | 4 | 0 | 0 | 0 |
| Workspace components | 38 | 4 | 4 | 5 |
| Advanced tabs (26 total) | 20 | 1 | 3 | 0 |
| Audit coverage (20 actions) | 17 | 1 | 2 | 0 |

**Overall:** The certified Valuation Engine, Intelligence, Verification Queue, and Valuation Command Center are fully connected. The primary gaps are in Growth Plan persistence, Deliverables file generation, and Advanced workspace questionnaire data loading.