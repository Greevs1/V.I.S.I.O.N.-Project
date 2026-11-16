import React from 'react';
import { ClipboardList, Clock, CheckCircle, Eye, Trash2, Bell } from 'lucide-react';
import { format } from 'date-fns';

function getStatusColor(status) {
  switch (status) {
    case 'completed': return 'bg-emerald-500';
    case 'in_progress': return 'bg-blue-500';
    case 'scheduled': return 'bg-amber-500';
    case 'assigned': return 'bg-primary';
    case 'cancelled': return 'bg-muted-foreground';
    default: return 'bg-muted-foreground';
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'completed': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'in_progress': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    case 'scheduled': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'assigned': return 'bg-primary/15 text-primary border-primary/30';
    case 'cancelled': return 'bg-muted-foreground/15 text-muted-foreground border-border';
    default: return 'bg-secondary text-muted-foreground border-border';
  }
}

export default function WorksheetCard({ worksheet, onClick, isAdmin = false, onCancel }) {
  const status = worksheet.assignment_status || worksheet.status;
  const dueDate = worksheet.due_date;
  const scheduledFor = worksheet.scheduled_for;
  const assignedAt = worksheet.assigned_at;

  const handleCancel = (e) => {
    e.stopPropagation();
    onCancel?.(worksheet.assignment_id);
  };

  return (
    <div 
      className="glass rounded-xl p-5 hover:border-primary/20 transition-all cursor-pointer group"
      onClick={() => onClick?.(worksheet)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
          <ClipboardList className="w-5 h-5 text-accent" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] border rounded-full px-2.5 py-0.5 ${getStatusBadge(status)}`}>
            {status === 'in_progress' ? 'In Progress' : status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors line-clamp-2">
        {worksheet.title}
      </h3>

      {/* Description */}
      {worksheet.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2" dangerouslySetInnerHTML={{ __html: worksheet.description }} />
      )}

      {/* Metadata */}
      <div className="space-y-2 mb-3">
        {dueDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Due: {format(new Date(dueDate), 'MMM d, yyyy')}</span>
          </div>
        )}
        
        {scheduledFor && status === 'scheduled' && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <Clock className="w-3 h-3" />
            <span>Scheduled: {format(new Date(scheduledFor), 'MMM d, yyyy')}</span>
          </div>
        )}

        {assignedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Assigned: {format(new Date(assignedAt), 'MMM d, yyyy')}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <span className="text-[11px] border rounded-full px-2.5 py-0.5 bg-primary/10 text-primary border-primary/30">
            {worksheet.fields?.length || 0} field{worksheet.fields?.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded">
            <Eye className="w-3.5 h-3.5" />
          </button>
          {isAdmin && status !== 'completed' && (
            <button 
              onClick={handleCancel}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {isAdmin && (
            <button className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded">
              <Bell className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}