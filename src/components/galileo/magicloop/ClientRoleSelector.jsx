/**
 * ClientRoleSelector — one contextual question for professionals.
 *
 * Captures the professional role so Galileo can adjust language/context.
 * Not the full Lens system — just a role capture for Phase 1.
 */

import React from 'react';
import { motion } from 'framer-motion';

export default function ClientRoleSelector({ roles, onSelect }) {
  return (
    <div className="flex flex-col items-center text-center max-w-xl mx-auto px-6 pt-8">
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight"
      >
        What best describes your role?
      </motion.p>
      <p className="text-sm text-white/45 mt-2 mb-8">
        This helps me speak your language.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
        {roles.map((role, i) => (
          <motion.button
            key={role}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(role)}
            className="px-4 py-3.5 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-white/75 hover:border-[#D4A853]/40 hover:text-white hover:bg-[#D4A853]/[0.04] transition-all"
          >
            {role}
          </motion.button>
        ))}
      </div>
    </div>
  );
}