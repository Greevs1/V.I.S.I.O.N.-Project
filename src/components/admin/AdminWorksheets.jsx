import React, { useState } from 'react';
import { FileText, FolderOpen, Plus, MoreHorizontal, Trash2, UserPlus, Loader2, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import WorksheetEditor from './WorksheetEditor';
import AssignWorksheetModal from './AssignWorksheetModal';
import { SEED_TEMPLATES } from '@/lib/worksheetTemplates';

const FOLDERS = ['Worksheet Templates', 'Session Templates', 'Metric Templates'];

export default function AdminWorksheets() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(['Worksheet Templates']);
  const [selectedId, setSelectedId] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const { data: worksheets = [], isLoading } = useQuery({
    queryKey: ['worksheets'],
    queryFn: () => base44.entities.Worksheet.list('-created_date', 100)
  });

  const selected = worksheets.find((w) => w.id === selectedId);
  const byFolder = (folder) => worksheets.filter((w) => w.folder === folder);
  const deletedCount = 0; // could track soft-deletes later

  const handleNew = async (folder) => {
    const w = await base44.entities.Worksheet.create({ title: 'Untitled Worksheet', folder, status: 'draft', fields: [] });
    queryClient.invalidateQueries({ queryKey: ['worksheets'] });
    setSelectedId(w.id);
    if (!expanded.includes(folder)) setExpanded((e) => [...e, folder]);
  };

  const handleSave = async (data) => {
    if (selectedId) {
      await base44.entities.Worksheet.update(selectedId, data);
      queryClient.invalidateQueries({ queryKey: ['worksheets'] });
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.Worksheet.delete(id);
    queryClient.invalidateQueries({ queryKey: ['worksheets'] });
    if (selectedId === id) setSelectedId(null);
  };

  const seedTemplates = async () => {
    setSeeding(true);
    for (const t of SEED_TEMPLATES) {
      await base44.entities.Worksheet.create(t);
    }
    queryClient.invalidateQueries({ queryKey: ['worksheets'] });
    setSeeding(false);
  };

  const toggleFolder = (folder) => setExpanded((e) => e.includes(folder) ? e.filter((x) => x !== folder) : [...e, folder]);

  return (
    <div className="flex rounded-xl border border-border bg-card overflow-hidden" style={{ minHeight: 560 }}>
      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="w-4 h-4" />
            Worksheets
          </div>
          <button onClick={() => handleNew('Worksheet Templates')} className="text-muted-foreground hover:text-primary transition-colors" title="New worksheet">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Seed button if empty */}
        {worksheets.length === 0 && !isLoading &&
        <div className="p-3">
            <button
            onClick={seedTemplates}
            disabled={seeding}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
            
              {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Load CII Templates
            </button>
          </div>
        }

        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ?
          <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div> :

          FOLDERS.map((folder) =>
          <div key={folder}>
                <button
              onClick={() => toggleFolder(folder)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              
                  <div className="flex items-center gap-1.5">
                    <ChevronRight className={`w-3 h-3 transition-transform ${expanded.includes(folder) ? 'rotate-90' : ''}`} />
                    <FolderOpen className="w-3.5 h-3.5" />
                    {folder}
                    <span className="text-[10px] opacity-60">({byFolder(folder).length})</span>
                  </div>
                  <button
                onClick={(e) => {e.stopPropagation();handleNew(folder);}}
                className="opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-primary">
                
                    <Plus className="w-3 h-3" />
                  </button>
                </button>

                {expanded.includes(folder) && byFolder(folder).map((w) =>
            <div
              key={w.id}
              className={`flex items-center justify-between pl-7 pr-2 py-2 text-xs cursor-pointer transition-colors group ${
              selectedId === w.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'}`
              }
              onClick={() => setSelectedId(w.id)}>
              
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{w.title}</span>
                    </div>
                    <button
                onClick={(e) => {e.stopPropagation();handleDelete(w.id);}}
                className="p-0.5 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete">
                <Trash2 className="w-3 h-3" /></button>
                    {w.assigned_to?.length > 0 &&
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold ml-1 shrink-0 hidden">
                        {w.assigned_to.length}
                      </span>
              }
                  </div>
            )}

                {expanded.includes(folder) && byFolder(folder).length === 0 &&
            <button
              onClick={() => handleNew(folder)}
              className="pl-8 py-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground w-full text-left">
              
                    + New worksheet
                  </button>
            }
              </div>
          )
          }
        </div>

        <div className="px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Trash2 className="w-3 h-3" /> Recently Deleted ({deletedCount})
          </p>
        </div>
      </div>

      {/* Editor Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ?
        <WorksheetEditor
          key={selected.id}
          worksheet={selected}
          onSave={handleSave}
          onAssign={() => setAssigning(selected)} /> :


        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold">Select or create a worksheet</p>
              <p className="text-sm text-muted-foreground mt-1">Choose a worksheet from the sidebar or create a new one.</p>
            </div>
            {worksheets.length === 0 &&
          <Button
            onClick={seedTemplates}
            disabled={seeding}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 mt-2">
            
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Load CII Templates
              </Button>
          }
          </div>
        }
      </div>

      {/* Assign Modal */}
      {assigning &&
      <AssignWorksheetModal
        worksheet={assigning}
        onClose={() => setAssigning(null)}
        onAssigned={() => queryClient.invalidateQueries({ queryKey: ['worksheets'] })} />

      }
    </div>);

}