import React from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function GalileoButton({ onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full glass-gold shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-shadow"
    >
      <Sparkles className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium text-primary">Ask Galileo</span>
    </motion.button>
  );
}