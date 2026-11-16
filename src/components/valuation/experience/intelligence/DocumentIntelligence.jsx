/**
 * DocumentIntelligence — per-category document readiness panel.
 * Shows present/missing/processing, extraction confidence, fields extracted.
 * Expandable to show individual documents.
 */
import React, { useState } from 'react';
import { ChevronDown, FileText, CheckCircle2, Clock, AlertCircle, FileQuestion } from 'lucide-react';

export default function DocumentIntelligence({ documentIntelligence }) {
  const [expanded, setExpanded] = useState(null);
  const cats = documentIntelligence || [];
  const present = cats.filter((c) => c.present).length;
  const total = cats.length;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Document Intelligence</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{present} of {total} document categories available. Missing categories inform the next data request.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cats.map((cat) => {
          const isOpen = expanded === cat.key;
          const status = !cat.present ? 'missing' : cat.processing > 0 ? 'processing' : cat.needs_review > 0 ? 'needs_review' : 'complete';
          const statusCfg = {
            missing: { color: '#6B7280', icon: FileQuestion, label: 'Missing' },
            processing: { color: '#F59E0B', icon: Clock, label: 'Processing' },
            needs_review: { color: '#F59E0B', icon: AlertCircle, label: 'Needs Review' },
            complete: { color: '#22c55e', icon: CheckCircle2, label: 'Ready' },
          }[status];
          const Icon = statusCfg.icon;
          return (
            <div key={cat.key} className="rounded-lg" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => cat.present && setExpanded(isOpen ? null : cat.key)} className="w-full flex items-center gap-2 p-2.5 text-left">
                <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: cat.present ? '#00D4FF' : '#6B7280' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{cat.label}</p>
                  {cat.present && <p className="text-[10px] text-muted-foreground">{cat.count} doc(s) · {cat.fields_extracted} fields</p>}
                </div>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ color: statusCfg.color, background: `${statusCfg.color}15` }}>{statusCfg.label}</span>
                {cat.present && <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
              </button>
              {isOpen && cat.present && (
                <div className="px-2.5 pb-2.5 space-y-1.5">
                  {cat.documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-foreground/80 truncate">{d.name}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{d.fields_extracted} fields{d.confidence ? ` · ${d.confidence}%` : ''}</span>
                    </div>
                  ))}
                  {cat.extraction_confidence > 0 && (
                    <p className="text-[10px] text-muted-foreground pt-1">Avg extraction confidence: {cat.extraction_confidence}%</p>
                  )}
                </div>
              )}
              {!cat.present && (
                <div className="px-2.5 pb-2.5">
                  <p className="text-[11px] text-muted-foreground italic">Upload to enable automatic extraction.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}