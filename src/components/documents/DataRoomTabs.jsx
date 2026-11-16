import React from 'react';

/**
 * DataRoomTabs — Phase 1D
 * Renders a horizontally-scrollable segmented pill filter for multi-business users.
 * Single-business users: renders nothing (caller controls visibility).
 *
 * Props:
 *   tabs        — array of { id, label, count }
 *   activeTab   — currently selected tab id
 *   onSelect    — (tabId) => void
 */
export default function DataRoomTabs({ tabs, activeTab, onSelect }) {
  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex items-center gap-1.5 w-max">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`
                flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-medium
                whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }
              `}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`
                  text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center
                  ${isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                  }
                `}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}