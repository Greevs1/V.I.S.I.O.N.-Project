import React, { useState, useEffect } from 'react';
import { Search, X, Loader2, FileText, Upload, Paperclip, ExternalLink } from 'lucide-react';
import UploadDropdown from '@/components/documents/UploadDropdown';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function AttachDocumentModal({ onClose, taskId, sprintId, onAttached }) {
  const { role } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [attaching, setAttaching] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDataRoomDocuments',
        data: {},
      });
      setDocuments(res.data?.documents || []);
    } catch (e) {
      console.error('getDataRoomDocuments error:', e);
    }
    setLoading(false);
  };

  const filtered = documents.filter(d =>
    (d.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.document_type || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAttach = async (doc) => {
    setAttaching(doc.id);
    try {
      await base44.functions.invoke('ninetyDaySprint', {
        action: 'attachDocument',
        data: {
          task_id: taskId,
          sprint_id: sprintId,
          document_id: doc.id,
          document_name: doc.name,
        },
      });
      if (onAttached) onAttached();
      onClose();
    } catch (e) {
      console.error('attachDocument error:', e);
    }
    setAttaching(null);
  };

  const handleUpload = async (filesOrEvent) => {
    const file = filesOrEvent?.target?.files?.[0] || (filesOrEvent instanceof FileList || Array.isArray(filesOrEvent) ? filesOrEvent[0] : null);
    if (!file) return;
    setUploading(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1]);
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      // Upload via canonical backend
      const uploadRes = await base44.functions.invoke('uploadDocumentToSupabase', {
        file_name: file.name,
        file_content: base64,
        content_type: file.type,
        storage_bucket: 'documents',
        file_scope: 'client_document',
        uploaded_from: 'sprint_task',
      });

      if (uploadRes.data?.document) {
        // Attach the uploaded document
        await base44.functions.invoke('ninetyDaySprint', {
          action: 'attachDocument',
          data: {
            task_id: taskId,
            sprint_id: sprintId,
            document_id: uploadRes.data.document.id,
            document_name: uploadRes.data.document.name || file.name,
          },
        });
        if (onAttached) onAttached();
        onClose();
      }
    } catch (e) {
      console.error('Upload error:', e);
    }
    setUploading(false);
  };

  const handleOpenDocument = async (doc) => {
    try {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getDocumentSignedUrl',
        data: { documentId: doc.id },
      });
      if (res.data?.signedUrl) {
        window.open(res.data.signedUrl, '_blank');
      }
    } catch (e) {
      console.error('getDocumentSignedUrl error:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-xl w-full max-w-md p-0 border border-border shadow-2xl" style={{ backgroundColor: '#141418' }}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Attach Document</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Data Room documents..."
              className="w-full h-8 bg-secondary border border-border rounded-lg pl-8 pr-3 text-xs outline-none focus:border-primary/50"
            />
          </div>
        </div>

        <div className="p-3 border-b border-border">
          <UploadDropdown
            onFilesSelected={(files) => handleUpload({ target: { files } })}
            onDriveImport={() => { loadDocuments(); if (onAttached) onAttached(); }}
            multiple={false}
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? 'Uploading...' : 'Upload new document to Data Room'}
            </div>
          </UploadDropdown>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No documents found</p>
          ) : (
            filtered.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {doc.document_type || 'Document'}
                    {doc.file_size ? ` · ${(doc.file_size / 1024).toFixed(0)}KB` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenDocument(doc)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="Open"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleAttach(doc)}
                    disabled={attaching === doc.id}
                  >
                    {attaching === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Attach'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}