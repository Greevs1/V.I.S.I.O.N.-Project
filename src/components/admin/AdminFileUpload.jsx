import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const DOCUMENT_TYPES = [
  { value: 'agreement', label: 'Agreement' },
  { value: 'client_agreement', label: 'Client Agreement' },
  { value: 'engagement_letter', label: 'Engagement Letter' },
  { value: 'verification_document', label: 'Verification Document' },
  { value: 'business_tax_return', label: 'Business Tax Return' },
  { value: 'personal_tax_return', label: 'Personal Tax Return' },
  { value: 'profit_and_loss', label: 'Profit & Loss' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'debt_schedule', label: 'Debt Schedule' },
  { value: 'payroll_report', label: 'Payroll Report' },
  { value: 'insurance_document', label: 'Insurance Document' },
  { value: 'entity_document', label: 'Entity Document' },
  { value: 'buy_sell_agreement', label: 'Buy-Sell Agreement' },
  { value: 'estate_document', label: 'Estate Document' },
  { value: 'other', label: 'Other' }
];

export default function AdminFileUpload({ targetProfileId, targetBusinessId, profileName }) {
  const queryClient = useQueryClient();
  const [docType, setDocType] = useState('other');
  const [uploadProgress, setUploadProgress] = useState({});

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const fileId = `${file.name}-${Date.now()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 5, status: 'uploading' } }));

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const current = prev[fileId]?.progress || 0;
          if (current >= 90) return prev;
          return { ...prev, [fileId]: { ...prev[fileId], progress: current + 10 } };
        });
      }, 300);

      try {
        const base64File = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });

        const res = await base44.functions.invoke('adminUploadDocument', {
          target_profile_id: targetProfileId,
          target_business_id: targetBusinessId,
          file_name: file.name,
          file_type: file.type || 'application/pdf',
          file_size: file.size,
          document_type: docType,
          year: null,
          base64_file: base64File,
        });

        clearInterval(progressInterval);
        setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 100, status: 'completed' } }));

        if (!res.data?.success) {
          throw new Error(res.data?.error || 'Upload failed');
        }

        return res.data.document;
      } catch (error) {
        clearInterval(progressInterval);
        setUploadProgress(prev => ({ ...prev, [fileId]: { progress: 0, status: 'failed' } }));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-documents'] });
      setTimeout(() => setUploadProgress({}), 3000);
    }
  });

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    files.forEach(f => uploadMutation.mutate(f));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select 
          value={docType} 
          onChange={e => setDocType(e.target.value)}
          className="h-9 bg-secondary border border-border rounded-lg px-2 text-xs outline-none text-muted-foreground"
        >
          {DOCUMENT_TYPES.map(dt => (
            <option key={dt.value} value={dt.value}>{dt.label}</option>
          ))}
        </select>
      </div>
      
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="relative rounded-xl border-2 border-dashed border-border hover:border-primary/30 p-8 text-center transition-all cursor-pointer"
      >
        <input
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
          onChange={handleDrop}
          className="absolute inset-0 opacity-0 cursor-pointer"
          multiple
        />
        <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">
          Admin upload — linked to {profileName || 'this user'}
        </p>
      </div>

      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="glass rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{fileId.split('-').slice(0, -1).join('-')}</span>
                <span className="text-xs text-muted-foreground">{progress.progress}%</span>
              </div>
              <Progress value={progress.progress} className="h-1" />
              {progress.status === 'failed' && (
                <p className="text-xs text-destructive">Upload failed. Please try again.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}