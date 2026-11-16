/**
 * buildConnectionsList — the Connections sheet's rows, from real BIS data only.
 * No hardcoded providers, no implied integrations that are not wired.
 */
export function buildConnectionsList(home) {
  const connections = [];
  const docs = home.contract?.recent_documents || [];
  const docReadiness = home.contract?.document_readiness;

  for (const doc of docs.slice(0, 8)) {
    connections.push({
      id: `doc_${doc.id}`,
      name: doc.name || 'Financial document',
      icon: 'file',
      analyzed: doc.status === 'completed',
      connected: false,
      improves: doc.document_type ? [doc.document_type] : null,
    });
  }

  if (!(docReadiness && docReadiness.total_documents > 0)) {
    connections.push({
      id: 'financials',
      name: 'Financial Statements',
      icon: 'file',
      connected: false,
      improves: ['Profit', 'Value', 'Cash'],
    });
  }

  return connections;
}