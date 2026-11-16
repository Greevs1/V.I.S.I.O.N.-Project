/**
 * SystemFolderPanel
 * ==================
 * Left sidebar showing System Folders and Custom Folders.
 * Additive only — does not change any upload/download/viewer logic.
 */
import React, { useState } from 'react';
import { SYSTEM_FOLDERS, groupDocumentsByFolder } from '@/lib/documentReadiness';
import { FolderOpen, Folder, Plus, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';

export default function SystemFolderPanel({ documents = [], selectedFolder, onSelectFolder, draggingDoc, onDropToFolder }) {
  const { role, supabaseProfile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = role === 'super_admin';
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [dropTarget, setDropTarget] = useState(null); // folder id being hovered during drag

  const profileId = supabaseProfile?.id;

  // Custom folders stored in Base44 entity
  const { data: customFolders = [] } = useQuery({
    queryKey: ['custom-folders', profileId],
    queryFn: () => base44.entities.DocumentFolder
      ? base44.entities.DocumentFolder.filter({ profile_id: profileId }, 'label', 100)
      : Promise.resolve([]),
    enabled: !!profileId,
    staleTime: 60_000,
  });

  const createFolder = useMutation({
    mutationFn: async (name) => {
      await base44.entities.DocumentFolder.create({
        profile_id: profileId,
        label: name,
        is_system: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-folders', profileId] });
      setNewFolderName('');
      setShowAddCustom(false);
    },
  });

  const groups = groupDocumentsByFolder(documents);

  const renderFolder = (folder, isSystem = true) => {
    if (!folder) return null;
    const count = isSystem ? (groups[folder.id]?.length || 0) : (folder.doc_count || 0);
    const isActive = selectedFolder === folder.id;
    const isDragOver = draggingDoc && dropTarget === folder.id;

    return (
      <button
        key={folder.id}
        onClick={() => onSelectFolder(isActive ? null : folder.id)}
        onDragOver={draggingDoc ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(folder.id); } : undefined}
        onDragLeave={draggingDoc ? () => setDropTarget(null) : undefined}
        onDrop={draggingDoc ? (e) => {
          e.preventDefault();
          setDropTarget(null);
          if (onDropToFolder) onDropToFolder(draggingDoc, folder.id);
        } : undefined}
        className={`w-full flex flex-col px-2.5 py-1.5 rounded-lg text-left transition-all text-sm ${
          isDragOver
            ? 'bg-primary/30 text-primary ring-1 ring-primary/50 scale-[1.02]'
            : isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Folder className={`w-3.5 h-3.5 shrink-0 ${isActive || isDragOver ? 'text-primary' : ''}`} />
          <span className="flex-1 truncate text-[13px]">{folder.label}</span>
          <span className="text-[10px] shrink-0 opacity-60">{count > 0 ? count : ''}</span>
          {isSystem && <Lock className="w-2.5 h-2.5 shrink-0 opacity-30" />}
        </div>
        {isDragOver && (
          <span className="text-[10px] text-primary/80 mt-0.5 pl-5">Drop to move here</span>
        )}
      </button>
    );
  };

  return (
    <div className="w-52 shrink-0 space-y-4 sticky top-4 self-start max-h-[calc(100vh-160px)] overflow-y-auto overscroll-contain pr-1">
      {/* All Documents */}
      <button
        onClick={() => onSelectFolder(null)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all text-sm font-medium ${
          selectedFolder === null
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
        }`}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[13px]">All Documents</span>
        <span className="text-[10px] shrink-0 opacity-60">{documents.length}</span>
      </button>

      {/* System Folders */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2.5 mb-1.5">System Folders</p>
        <div className="space-y-0.5">
          {SYSTEM_FOLDERS.filter(f => f.id !== 'other').map(f => renderFolder(f, true))}
          {renderFolder(SYSTEM_FOLDERS.find(f => f.id === 'other'), true)}
        </div>
      </div>

      {/* Custom Folders */}
      {(customFolders.length > 0 || true) && (
        <div>
          <div className="flex items-center justify-between px-2.5 mb-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Custom Folders</p>
            <button onClick={() => setShowAddCustom(s => !s)}
              className="text-muted-foreground hover:text-primary transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {showAddCustom && (
            <div className="mb-2 px-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newFolderName.trim()) createFolder.mutate(newFolderName.trim()); if (e.key === 'Escape') setShowAddCustom(false); }}
                placeholder="Folder name…"
                className="w-full h-7 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/40"
              />
              <p className="text-[10px] text-muted-foreground mt-1 px-1">Press Enter to create</p>
            </div>
          )}
          <div className="space-y-0.5">
            {customFolders.map(f => renderFolder({ id: f.id, label: f.label }, false))}
            {customFolders.length === 0 && !showAddCustom && (
              <p className="text-[11px] text-muted-foreground/50 px-2.5 py-1">No custom folders yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}