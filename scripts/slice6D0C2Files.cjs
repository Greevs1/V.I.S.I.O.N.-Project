/**
 * The reviewed change surface of Phase 6D.0c.2 (Evidence-First Answer Engine).
 * Every historical change-surface guard admits exactly these files for the
 * slice — one list, so the guards cannot drift apart.
 */
module.exports = [
  'base44/shared/galileo/answerEngine/ontology.ts',
  'base44/shared/galileo/answerEngine/envelope.ts',
  'base44/shared/galileo/answerEngine/resolver.ts',
  'base44/shared/galileo/answerEngine/contract.ts',
  'base44/shared/galileo/answerEngine/pipeline.ts',
  // Final pre-publish cleanup — the ONE shared sensitive-field predicate now
  // imported by both the general evidence-first lane and the focused-document lane.
  'base44/shared/galileo/sensitiveFields.ts',
  'base44/functions/askGalileo/entry.ts',
  'base44/shared/galileo/provisionalEvidence.ts',
  'src/lib/galileo/factualAnswerView.js',
  'src/lib/galileo/nextStepResolver.js',
  'src/hooks/useAskGalileo.js',
  'src/components/galileo/home/FactualEvidenceBlock.jsx',
  'src/components/galileo/home/GalileoAnswerPanel.jsx',
  'src/scripts/documentKnowledgeCompletion.test.cjs',
  'scripts/evidenceFirstAnswerEngine.test.cjs',
  'scripts/slice6D0C2Files.cjs',
  'scripts/extractionIntegrity.test.cjs',
  'scripts/galileoContextActorBinding.test.cjs',
  'scripts/documentUploadClassification.test.cjs',
  'scripts/adminDocumentViewer.test.cjs',
  'scripts/documentSignedUrlAuthorization.test.cjs',
  'scripts/relationshipRevocationAccess.test.cjs',
  'scripts/adminCanonicalActor.test.cjs',
  'VISION_PHASE_6D_0C_2_EVIDENCE_FIRST_ANSWER_ENGINE.md',
];