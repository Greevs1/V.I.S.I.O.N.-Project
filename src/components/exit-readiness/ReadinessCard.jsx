import React from 'react';
import { ChevronRight, Calendar, User, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const categoryConfig = {
  financial:  { label: 'Financial',  bg: 'rgba(212,168,83,0.12)',  text: '#D4A853', border: 'rgba(212,168,83,0.25)' },
  legal:      { label: 'Legal',      bg: 'rgba(96,165,250,0.12)',  text: '#60A5FA', border: 'rgba(96,165,250,0.25)' },
  hr:         { label: 'HR',         bg: 'rgba(167,139,250,0.12)', text: '#A78BFA', border: 'rgba(167,139,250,0.25)' },
  operations: { label: 'Operations', bg: 'rgba(251,191,36,0.12)',  text: '#FBBF24', border: 'rgba(251,191,36,0.25)' },
};

const statusDot = {
  not_started:  { color: '#6B7280' },
  in_progress:  { color: '#D4A853' },
  under_review: { color: '#FBBF24' },
  completed:    { color: '#34D399' },
};

const priorityDot = {
  critical: '#EF4444',
  high:     '#F97316',
  medium:   '#FBBF24',
  low:      '#6B7280',
};

export default function ReadinessCard({ item, onClick, isDragging }) {
  const cat = categoryConfig[item.category] || categoryConfig.financial;
  const subtasksDone = (item.subtasks || []).filter(s => s.completed).length;
  const subtasksTotal = (item.subtasks || []).length;
  const dot = statusDot[item.status] || statusDot.not_started;

  return (
    <div
      onClick={() => onClick(item)}
      className="group cursor-pointer select-none"
      style={{
        background: isDragging ? 'rgba(212,168,83,0.06)' : 'rgba(255,255,255,0.03)',
        border: isDragging ? '1px solid rgba(212,168,83,0.3)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: '10px',
        padding: '14px',
        transition: 'border-color 0.15s, background 0.15s',
        transform: isDragging ? 'rotate(1deg) scale(1.02)' : 'none',
      }}
      onMouseEnter={e => {
        if (!isDragging) {
          e.currentTarget.style.border = '1px solid rgba(212,168,83,0.25)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        }
      }}
      onMouseLeave={e => {
        if (!isDragging) {
          e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)';
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        }
      }}
    >
      {/* Top row: category pill + priority dot + critical dot */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[9px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded-full"
          style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}
        >
          {cat.label}
        </span>
        <div className="flex items-center gap-1.5">
          {item.is_critical && (
            <AlertCircle className="w-3 h-3" style={{ color: '#EF4444' }} />
          )}
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: priorityDot[item.priority] || priorityDot.medium }}
            title={item.priority}
          />
        </div>
      </div>

      {/* Title + arrow */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-medium leading-snug flex-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {item.title}
        </p>
        <ChevronRight
          className="w-4 h-4 shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ color: '#D4A853' }}
        />
      </div>

      {/* Subtask progress bar */}
      {subtasksTotal > 0 && (
        <div className="mb-3 space-y-1">
          <div className="flex justify-between text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span>Subtasks</span>
            <span>{subtasksDone}/{subtasksTotal}</span>
          </div>
          <div className="h-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round((subtasksDone / subtasksTotal) * 100)}%`,
                background: '#D4A853',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          {item.assignee && (
            <span className="flex items-center gap-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <User className="w-2.5 h-2.5" />
              <span className="truncate max-w-[70px]">{item.assignee}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {item.due_date && (
            <span className="flex items-center gap-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <Calendar className="w-2.5 h-2.5" />
              {format(new Date(item.due_date), 'MMM d')}
            </span>
          )}
          {/* Status dot */}
          <div className="w-2 h-2 rounded-full" style={{ background: dot.color }} title={item.status} />
        </div>
      </div>
    </div>
  );
}