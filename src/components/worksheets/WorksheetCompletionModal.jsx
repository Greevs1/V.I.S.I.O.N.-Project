import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Send, Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useQueryClient } from '@tanstack/react-query';

function renderFieldContent(field) {
  if (field.type === 'heading') {
    return <h3 className="text-lg font-semibold mb-2">{field.label}</h3>;
  }
  if (field.type === 'paragraph') {
    return (
      <div 
        className="text-sm text-muted-foreground mb-4 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: field.content || '' }}
      />
    );
  }
  if (field.type === 'divider') {
    return <hr className="border-border my-4" />;
  }
  return null;
}

function FieldInput({ field, value, onChange, error }) {
  if (['heading', 'paragraph', 'divider'].includes(field.type)) {
    return renderFieldContent(field);
  }

  const baseInputClasses = "w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors";
  const errorClasses = error ? "border-destructive focus:border-destructive" : "";

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <textarea
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={`${baseInputClasses} ${errorClasses} resize-none h-24`}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'text') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <input
          type="text"
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={`${baseInputClasses} ${errorClasses}`}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          placeholder={field.placeholder}
          className={`${baseInputClasses} ${errorClasses}`}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          className={`${baseInputClasses} ${errorClasses}`}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'dropdown') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <select
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          className={`${baseInputClasses} ${errorClasses}`}
        >
          <option value="">Select...</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-2 cursor-pointer py-2">
        <input
          type="checkbox"
          checked={value || false}
          onChange={e => onChange(field.id, e.target.checked)}
          className="w-4 h-4 mt-0.5"
        />
        <span className="text-sm text-muted-foreground flex-1">
          {field.label}
          {field.required && <span className="text-destructive text-xs"> *</span>}
        </span>
        {error && <p className="text-xs text-destructive w-full">{error}</p>}
      </label>
    );
  }

  if (field.type === 'signature') {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.required && <span className="text-destructive text-xs">*</span>}
        </label>
        <div className="h-20 bg-secondary border border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
          Signature field (placeholder - implement canvas if needed)
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return null;
}

export default function WorksheetCompletionModal({ worksheet, assignmentId, onClose, onCompleted }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [worksheetData, setWorksheetData] = useState(null);
  const [responses, setResponses] = useState({});
  const [errors, setErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved

  useEffect(() => {
    loadWorksheet();
  }, []);

  const loadWorksheet = async () => {
    setLoading(true);
    try {
      // Get worksheet template
      const templateRes = await base44.functions.invoke('worksheetResponses', {
        action: 'getWorksheetTemplate',
        data: { worksheetId: worksheet.id },
      });
      setWorksheetData(templateRes.data.worksheet);

      // Get existing user response
      const responseRes = await base44.functions.invoke('worksheetResponses', {
        action: 'getUserResponse',
        data: { worksheetId: worksheet.id, assignmentId },
      });

      if (responseRes.data.response) {
        setResponses(responseRes.data.response.response_data || {});
      }
    } catch (err) {
      console.error('[WorksheetCompletionModal] Load failed:', err);
      toast.error('Failed to load worksheet');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId, value) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => ({ ...prev, [fieldId]: null }));
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      const res = await base44.functions.invoke('worksheetResponses', {
        action: 'saveDraft',
        data: {
          worksheetId: worksheet.id,
          worksheetAssignmentId: assignmentId,
          responseData: responses,
        },
      });

      if (res.data.success) {
        setSaveStatus('saved');
        toast.success('Draft saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
    } catch (err) {
      console.error('[WorksheetCompletionModal] Save failed:', err);
      toast.error('Failed to save draft');
      setSaveStatus('idle');
    } finally {
      setSaving(false);
    }
  };

  const validateRequired = () => {
    if (!worksheetData) return true;
    
    const requiredFields = (worksheetData.fields || [])
      .filter(f => f.required && !['heading', 'paragraph', 'divider'].includes(f.type));
    
    const newErrors = {};
    requiredFields.forEach(f => {
      const value = responses[f.id];
      if (!value || (typeof value === 'string' && !value.trim())) {
        newErrors[f.id] = 'This field is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateRequired()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!confirm('Submit this worksheet? You won\'t be able to edit after submission.')) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('worksheetResponses', {
        action: 'submit',
        data: {
          worksheetId: worksheet.id,
          worksheetAssignmentId: assignmentId,
          responseData: responses,
        },
      });

      if (res.data.success) {
        toast.success('Worksheet submitted successfully!');
        // Invalidate both user and admin worksheet queries so Completed tab refreshes
        queryClient.invalidateQueries({ queryKey: ['my-assigned-worksheets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-user-worksheets'] });
        onCompleted?.();
        onClose();
      }
    } catch (err) {
      console.error('[WorksheetCompletionModal] Submit failed:', err);
      if (err.response?.data?.missingFields) {
        toast.error(`Missing fields: ${err.response.data.missingFields.join(', ')}`);
      } else {
        toast.error('Failed to submit worksheet');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl w-full max-w-3xl p-8 text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading worksheet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold">{worksheetData?.title || worksheet.title}</h2>
            {worksheetData?.description && (
              <p className="text-xs text-muted-foreground mt-1" dangerouslySetInnerHTML={{ __html: worksheetData.description }} />
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {(worksheetData?.fields || []).map(field => (
            <FieldInput
              key={field.id}
              field={field}
              value={responses[field.id]}
              onChange={handleFieldChange}
              error={errors[field.id]}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-secondary/20">
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Saved
              </span>
            )}
            {Object.keys(errors).length > 0 && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {Object.keys(errors).length} required field(s) missing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saving || submitting}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Draft
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}