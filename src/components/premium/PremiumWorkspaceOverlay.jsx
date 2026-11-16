/**
 * PremiumWorkspaceOverlay — Phase 9, item 3
 *
 * Wraps any premium workspace page. Instead of redirecting free/guest users
 * back to a gate, the page loads normally, is blurred, and this elegant
 * Apple-like overlay sits above it so the user understands what exists.
 *
 * Usage (inside a premium page's root element):
 *   <PremiumWorkspaceOverlay isPaid={isPaid} feature="Advisory Hub">
 *     <AdvisoryContent />
 *   </PremiumWorkspaceOverlay>
 *
 * Props:
 *   isPaid   — if true, renders children unmodified
 *   feature  — short label shown in the overlay
 *   children — the page content (rendered blurred when gated)
 *   onScheduleCall  — handler for "Schedule a Strategy Call"
 *   onBecomeMember  — handler for "Become a Member"
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';

export default function PremiumWorkspaceOverlay({
  isPaid = false,
  feature = 'This Workspace',
  children,
  onScheduleCall,
  onBecomeMember,
}) {
  if (isPaid) return <>{children}</>;

  return (
    <div className="relative min-h-[60vh]">
      {/* Blurred preview of the real page */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(7px)', opacity: 0.45 }}>
        {children}
      </div>

      {/* Elegant dark-glass overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-0 flex items-center justify-center p-6"
        style={{ background: 'rgba(8,8,12,0.72)', backdropFilter: 'blur(14px)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-md rounded-2xl p-7 text-center"
          style={{ background: 'rgba(22,22,22,0.96)', border: '1px solid rgba(212,168,83,0.22)' }}
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.2)' }}>
            <Lock className="w-5 h-5" style={{ color: '#D4A853' }} />
          </div>

          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: 'rgba(212,168,83,0.85)' }}>
            Premium Member Feature
          </p>
          <h2 className="text-xl font-display font-bold mb-3" style={{ color: '#F5F5F5' }}>
            {feature}
          </h2>
          <p className="text-[13px] leading-relaxed mb-7" style={{ color: 'rgba(255,255,255,0.66)' }}>
            This workspace becomes available when you become a V.I.S.I.O.N. member. Work directly with advisors. Access advanced planning. Unlock your complete execution platform.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={onScheduleCall}
              className="w-full px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: '#D4A853', color: '#08080C' }}
            >
              Schedule a Strategy Call
            </button>
            <button
              onClick={onBecomeMember}
              className="w-full px-5 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F5F5' }}
            >
              Become a Member
            </button>
            <button
              onClick={() => window.history.back()}
              className="w-full text-[12px] uppercase tracking-wider mt-1 transition-opacity hover:opacity-60"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Maybe Later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}