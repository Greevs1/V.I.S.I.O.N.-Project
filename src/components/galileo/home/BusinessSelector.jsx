/**
 * BusinessSelector — subtle business context selector.
 *
 * For professional users (advisors), this eventually becomes a client list.
 * For owners, it shows their current business.
 *
 *   Acme HVAC ▾
 *
 * Changing Business changes the entire Galileo context.
 * Do not mix data between businesses. Keep the shell identical.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2, Check } from 'lucide-react';

export default function BusinessSelector({ currentBusiness, businesses = [], onSelect }) {
  const [open, setOpen] = useState(false);

  if (!currentBusiness && businesses.length === 0) return null;

  // With nothing to switch to, this is context — not a control. Rendering a
  // button whose dropdown can never open would be a dead control. It reads as
  // a name floating in the glass: no plate, no icon, no chevron to promise a
  // menu that does not exist.
  if (businesses.length === 0) {
    return (
      <div className="inline-flex min-w-0 items-center px-1">
        <span
          className="truncate text-[12.5px] font-medium text-white/80"
          style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)' }}
        >
          {currentBusiness?.name || 'Select business'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 transition-colors duration-200 hover:bg-white/[0.06] vision-focus"
      >
        <span
          className="truncate text-[12.5px] font-medium text-white/80"
          style={{ textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)' }}
        >
          {currentBusiness?.name || 'Select business'}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 text-white/35 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && businesses.length > 0 && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 mt-1.5 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[hsl(var(--vision-raised))]/95 shadow-2xl backdrop-blur-xl z-40"
            >
              {businesses.map((biz) => (
                <button
                  key={biz.id}
                  onClick={() => {
                    onSelect?.(biz);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <Building2 className="w-3.5 h-3.5 text-white/35 shrink-0" />
                  <span className="flex-1 text-[12px] text-white/65 truncate">
                    {biz.name}
                  </span>
                  {currentBusiness?.id === biz.id && (
                    <Check className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}