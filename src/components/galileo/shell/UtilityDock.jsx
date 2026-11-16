/**
 * UtilityDock — the centered, floating secondary navigation.
 *
 * Every item passed in is backed by a real destination. Earlier versions
 * rendered four hardcoded items in every mode while only some had handlers;
 * this dock renders exactly the items the caller can actually honour.
 *
 * Visually secondary to Ask Galileo: quiet glass, restrained gold when active.
 */

import React from 'react';

export default function UtilityDock({ items = [], activeKey = null }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Vision navigation"
      className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full vision-glass-raised vision-sheen px-1.5 py-1.5"
    >
      {items.map(({ key, icon: Icon, label, badge, onSelect }) => {
        const isActive = activeKey === key;
        return (
          <button
            key={key}
            type="button"
            onClick={onSelect}
            aria-current={isActive ? 'page' : undefined}
            className={[
              'relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5',
              'transition-all duration-200 vision-focus',
              isActive
                ? 'bg-vision-gold/[0.14] text-vision-bright'
                : 'text-white/45 hover:text-white/80 hover:bg-white/[0.045]',
            ].join(' ')}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="text-[11.5px] font-medium">{label}</span>
            {badge != null && badge !== '' && (
              <span className="rounded-full bg-vision-gold/20 px-1.5 py-0.5 text-[9px] font-semibold text-vision-champagne">
                {badge}
              </span>
            )}
            {isActive && (
              <span className="absolute -bottom-0.5 left-1/2 h-px w-5 -translate-x-1/2 rounded-full bg-vision-gold" />
            )}
          </button>
        );
      })}
    </nav>
  );
}