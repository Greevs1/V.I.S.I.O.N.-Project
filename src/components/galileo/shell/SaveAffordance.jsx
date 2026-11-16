/**
 * SaveAffordance — lightweight bookmark/save button.
 *
 * Appears on insights (opportunities, scenarios, strategies).
 * Click → brief "Saved." acknowledgment. No modal.
 * Session-scoped for anonymous users.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Check } from 'lucide-react';
import { saveItem, isSaved } from '@/lib/galileo/saveManager';
import { useBusinessContext } from '@/lib/BusinessContext';

export default function SaveAffordance({ type, title, data }) {
  // Canonical active business. Null for guests, so guest Magic Loop saves keep
  // using the guest/session store exactly as before.
  const { context: bizContext } = useBusinessContext();
  const businessId = bizContext?.active_business_id || null;

  const [saved, setSaved] = useState(() => isSaved(data, businessId));
  const [showAck, setShowAck] = useState(false);

  // Re-resolve against the active business. This affordance also renders on the
  // /galileo route, which sits outside the layout remount boundary, so it cannot
  // rely on a remount to pick up a business switch.
  useEffect(() => {
    setSaved(isSaved(data, businessId));
  }, [data, businessId]);

  const handleSave = (e) => {
    e?.stopPropagation();
    if (saved) return;
    saveItem({ type, title, data }, businessId);
    setSaved(true);
    setShowAck(true);
    setTimeout(() => setShowAck(false), 1500);
  };

  return (
    <div className="relative">
      <button
        onClick={handleSave}
        className={`flex items-center gap-1.5 text-[11px] transition-colors ${
          saved ? 'text-[#D4A853]/60' : 'text-white/30 hover:text-white/60'
        }`}
      >
        {saved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
        {saved ? 'Saved' : 'Save'}
      </button>
      <AnimatePresence>
        {showAck && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute top-full left-0 mt-1 text-[10px] text-[#D4A853] font-medium"
          >
            Saved.
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}