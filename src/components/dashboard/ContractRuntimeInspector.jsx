/**
 * ContractRuntimeInspector — DEVELOPMENT ONLY.
 *
 * Renders the raw contract values and derived card props to verify
 * the contract-to-UI data flow. Gate behind ?diag=1 URL param.
 *
 * Remove after live verification is complete.
 */
import React from 'react';

export default function ContractRuntimeInspector({ activeBusinessId, contract, contractLoading, contractError }) {
  if (!activeBusinessId) return null;

  return (
    <div
      className="layer-inspector fixed bottom-4 left-4 max-w-md max-h-[60vh] overflow-y-auto rounded-lg p-4 text-xs font-mono"
      style={{ background: 'rgba(0,0,0,0.95)', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      <div className="text-yellow-400 font-bold mb-2">CONTRACT RUNTIME INSPECTOR</div>

      <div className="text-white/60 mb-2">
        active_business_id: {activeBusinessId}
      </div>

      {contractLoading && <div className="text-blue-400 mb-2">⏳ Contract loading...</div>}
      {contractError && <div className="text-red-400 mb-2">❌ Error: {contractError.message}</div>}
      {!contractLoading && !contract && <div className="text-red-400 mb-2">⚠ Contract is null</div>}

      {contract && (
        <>
          <div className="text-green-400 mb-1">✓ Contract loaded</div>
          <div className="text-white/60 mb-2">
            business_id: {contract.business_id}<br />
            contract_version: {contract.contract_version}<br />
            generated_at: {contract.generated_at}
          </div>

          <div className="text-white/80 space-y-1">
            <div className="text-yellow-400 font-semibold">Assessments (completion):</div>
            {contract.assessments &&
              Object.entries(contract.assessments).map(([type, a]) => (
                <div key={type} className="pl-2">
                  {type}: <span className={a.completed ? 'text-green-400' : 'text-red-400'}>completed={String(a.completed)}</span>
                </div>
              ))}

            <div className="text-yellow-400 font-semibold pt-2">Tax:</div>
            <div className="pl-2">annual_tax_gap: {contract.tax?.annual_tax_gap ?? 'null'}</div>

            <div className="text-yellow-400 font-semibold pt-2">Profitability:</div>
            <div className="pl-2">recast_ebitda: {contract.profitability?.recast_ebitda ?? 'null'}</div>
            <div className="pl-2">total_addbacks: {contract.profitability?.total_addbacks ?? 'null'}</div>
            <div className="pl-2">recast_value_impact: {contract.profitability?.recast_value_impact ?? 'null'}</div>
            <div className="pl-2">profit_gap: {contract.profitability?.profit_gap ?? 'null'}</div>

            <div className="text-yellow-400 font-semibold pt-2">Valuation:</div>
            <div className="pl-2">current_value: {contract.valuation?.current_value ?? 'null'}</div>
            <div className="pl-2">value_gap: {contract.valuation?.value_gap ?? 'null'}</div>

            <div className="text-yellow-400 font-semibold pt-2">Operations:</div>
            <div className="pl-2">operations_score: {contract.operations?.operations_score ?? 'null'}</div>

            <div className="text-yellow-400 font-semibold pt-2">Freedom:</div>
            <div className="pl-2">freedom_score: {contract.freedom?.freedom_score ?? 'null'}</div>

            <div className="text-yellow-400 font-semibold pt-2">IQ:</div>
            <div className="pl-2">business_iq: {contract.business_iq ?? 'null'}</div>
          </div>
        </>
      )}
    </div>
  );
}