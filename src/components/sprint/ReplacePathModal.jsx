import React, { useState } from 'react';
import { X, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ReplacePathModal({ open, onClose, activePaths, onReplace }) {
  if (!open) return null;

  return (
    <div className="layer-panel fixed inset-0 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#141418', border: '1px solid #24242A' }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid #24242A' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Replace Existing Active Path</h3>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-4">
            You currently have {activePaths.length} active sprint paths. Choose one to replace:
          </p>
          <div className="space-y-2">
            {activePaths.map((path, i) => (
              <button
                key={path.id || i}
                onClick={() => onReplace(path.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-secondary/40"
                style={{ backgroundColor: 'rgba(245,245,245,0.03)', border: '1px solid #24242A' }}
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{path.title || path.path_title || `Path ${i + 1}`}</p>
                  {path.path_goal && <p className="text-[10px] text-muted-foreground truncate">{path.path_goal}</p>}
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            The selected path will be archived but retain all progress. The newly promoted opportunity becomes active.
          </p>
          <div className="flex justify-end mt-4">
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}