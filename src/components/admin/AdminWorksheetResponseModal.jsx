import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

export default function AdminWorksheetResponseModal({ worksheet, targetProfileId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState(null);
  const [template, setTemplate] = useState(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [respRes, tmplRes] = await Promise.all([
        base44.functions.invoke('worksheetResponses', {
          action: 'getAdminWorksheetResponse',
          data: {
            targetProfileId,
            worksheetId: worksheet.id,
            assignmentId: worksheet.assignment_id || null,
          },
        }),
        base44.functions.invoke('worksheetResponses', {
          action: 'getWorksheetTemplate',
          data: { worksheetId: worksheet.id },
        }),
      ]);
      setResponse(respRes.data?.response || null);
      setTemplate(tmplRes.data?.worksheet || null);
    } catch (e) {
      console.error('[AdminWorksheetResponseModal] load failed:', e);
    }
    setLoading(false);
  };

  const fields = template?.fields || [];
  const responseData = response?.response_data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold">{worksheet.title}</h2>
            {response?.submitted_at && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Submitted {format(new Date(response.submitted_at), 'MMM d, yyyy h:mm a')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !response ? (
            <p className="text-sm text-muted-foreground text-center py-12">No response data found for this worksheet.</p>
          ) : (
            <div className="space-y-5">
              {fields
                .filter(f => !['heading', 'paragraph', 'divider'].includes(f.type))
                .map(field => {
                  const val = responseData[field.id];
                  return (
                    <div key={field.id} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{field.label}</p>
                      <div className="bg-secondary rounded-lg px-3 py-2 text-sm">
                        {val === undefined || val === null || val === ''
                          ? <span className="text-muted-foreground italic">Not answered</span>
                          : typeof val === 'boolean'
                          ? <span className="flex items-center gap-1.5">{val ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : '✗'} {val ? 'Yes' : 'No'}</span>
                          : String(val)}
                      </div>
                    </div>
                  );
                })}
              {/* Show any extra keys not in template */}
              {Object.keys(responseData).filter(k => !fields.find(f => f.id === k)).map(k => (
                <div key={k} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{k}</p>
                  <div className="bg-secondary rounded-lg px-3 py-2 text-sm">{String(responseData[k])}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}