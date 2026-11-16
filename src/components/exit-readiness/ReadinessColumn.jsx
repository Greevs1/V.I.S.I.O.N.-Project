import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import ReadinessCard from './ReadinessCard';

const columnConfig = {
  not_started:  { label: 'Not Started',  accent: '#6B7280', borderColor: 'rgba(107,114,128,0.2)' },
  in_progress:  { label: 'In Progress',  accent: '#D4A853', borderColor: 'rgba(212,168,83,0.25)' },
  under_review: { label: 'Under Review', accent: '#FBBF24', borderColor: 'rgba(251,191,36,0.2)'  },
  completed:    { label: 'Completed',    accent: '#34D399', borderColor: 'rgba(52,211,153,0.2)'  },
};

export default function ReadinessColumn({ status, items, onCardClick }) {
  const cfg = columnConfig[status] || columnConfig.not_started;

  return (
    <div
      className="flex flex-col rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${cfg.borderColor}`,
        minHeight: '200px',
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: cfg.accent }} />
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: cfg.accent }}>
            {cfg.label}
          </h3>
        </div>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
          style={{
            background: `${cfg.accent}18`,
            color: cfg.accent,
            border: `1px solid ${cfg.accent}30`,
          }}
        >
          {items.length}
        </span>
      </div>

      {/* Drop zone */}
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 p-3 space-y-2.5"
            style={{
              background: snapshot.isDraggingOver ? `${cfg.accent}08` : 'transparent',
              transition: 'background 0.15s',
              minHeight: '80px',
            }}
          >
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                  >
                    <ReadinessCard
                      item={item}
                      onClick={onCardClick}
                      isDragging={dragSnapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {items.length === 0 && !snapshot.isDraggingOver && (
              <div
                className="flex items-center justify-center h-14 rounded-lg"
                style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
              >
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Drop here</p>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}