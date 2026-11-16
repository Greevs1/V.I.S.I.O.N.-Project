import React, { useState } from 'react';
import { FileText, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const DOC_TYPE_LABELS = {
  business_tax_return: 'Business Tax Return',
  personal_tax_return: 'Personal Tax Return',
  profit_and_loss: 'Profit & Loss',
  balance_sheet: 'Balance Sheet',
  payroll_report: 'Payroll Report',
  agreement: 'Agreement',
  consulting_resource: 'Resource',
  other: 'Document',
};

function formatBytes(b) {
  if (!b) return null;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export default function AssignedResourceCard({ resource, onOpen, onDownload, onPreviewRequest }) {
  const typeLabel = DOC_TYPE_LABELS[resource.document_type] || (resource.document_type || 'Document').replace(/_/g, ' ');
  const size = formatBytes(resource.file_size);
  const assignedDate = resource.created_at;
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePreview = async (e) => {
    e.stopPropagation();
    setPreviewLoading(true);
    try {
      const res = await base44.functions.invoke('worksheetResponses', {
        action: 'getResourceSignedUrl',
        data: { resourceId: resource.id },
      });
      const url = res.data?.signedUrl || resource.file_url;
      if (url) {
        onPreviewRequest?.(resource, url);
      }
    } catch {
      if (resource.file_url) {
        onPreviewRequest?.(resource, resource.file_url);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="glass rounded-xl p-5 hover:border-primary/20 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <span className="text-[11px] border rounded-full px-2.5 py-0.5 bg-primary/15 text-primary border-primary/30">
          {typeLabel}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors line-clamp-2">
        {resource.name || 'Untitled Resource'}
      </h3>

      {/* Metadata */}
      <div className="space-y-1.5 mb-3">
        {assignedDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Assigned: {format(new Date(assignedDate), 'MMM d, yyyy')}</span>
          </div>
        )}
        {size && (
          <p className="text-xs text-muted-foreground">{size}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-3 border-t border-border/50">
        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded disabled:opacity-50"
          title="Preview"
        >
          {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}