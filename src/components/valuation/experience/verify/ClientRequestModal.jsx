/**
 * ClientRequestModal — Phase 13.3E.3
 * Advisor creates a backend-mediated client request. The client sees only
 * assigned requests (client-facing page lands in a later phase).
 */
import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

const REQUEST_TYPES = [
  { value: 'confirmation', label: 'Confirmation' },
  { value: 'document', label: 'Document' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'missing_value', label: 'Missing Value' },
];

export default function ClientRequestModal({ item, valuationId, onClose, onSubmit }) {
  const [requestType, setRequestType] = useState(item?.item_type === 'missing_document' ? 'document' : 'confirmation');
  const [title, setTitle] = useState(item ? `Regarding: ${item.title}` : '');
  // Living Intelligence: improved pre-fill from existing item fields (no calculation)
  const [explanation, setExplanation] = useState(
    item ? `We need your help confirming ${item.title?.toLowerCase() || 'this information'} to complete your valuation.` : ''
  );
  const [whyItMatters, setWhyItMatters] = useState(
    item?.valuation_impact
      ? `This affects your ${item.valuation_impact.replace(/_/g, ' ')} and the overall accuracy of your valuation.`
      : 'This information is needed to ensure your valuation is accurate.'
  );
  const [requestedValue, setRequestedValue] = useState(item?.formatted_value || '');
  const [dueDate, setDueDate] = useState('');
  const [advisorNote, setAdvisorNote] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      valuation_id: valuationId,
      verification_item_id: item?.id || null,
      request_type: requestType,
      title: title.trim(),
      explanation: explanation.trim() || null,
      why_it_matters: whyItMatters.trim() || null,
      requested_value: requestedValue.trim() || null,
      due_date: dueDate || null,
      advisor_note: advisorNote.trim() || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Request from Client</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">Request type</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setRequestType(t.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${requestType === t.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Input label="Title" value={title} onChange={setTitle} placeholder="What is needed..." />
          <Textarea label="Plain-language explanation" value={explanation} onChange={setExplanation} placeholder="Explain in simple terms what you're asking for..." />
          <Textarea label="Why it matters" value={whyItMatters} onChange={setWhyItMatters} placeholder="Why this affects the valuation..." />
          <Input label="Requested value / document" value={requestedValue} onChange={setRequestedValue} placeholder="e.g. 2025 balance sheet" />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Due date" type="date" value={dueDate} onChange={setDueDate} />
          </div>
          <Textarea label="Advisor note (internal)" value={advisorNote} onChange={setAdvisorNote} placeholder="Internal note — not shown to client..." />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs">Cancel</button>
            <button onClick={handleSubmit} disabled={!title.trim()} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40">
              Send Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
      />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-muted-foreground">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full mt-1 rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground"
      />
    </div>
  );
}