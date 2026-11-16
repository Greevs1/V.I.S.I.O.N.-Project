/**
 * Galileo Guidance Card Component
 * 
 * Displays Galileo's contextual guidance during the Enterprise Discovery™ workflow.
 * Shows brief, encouraging messages that explain why each step matters.
 */

import React from 'react';
import { Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

export default function GalileoGuidanceCard({ 
  title, 
  message, 
  onContinue, 
  isComplete = false,
  showContinueButton = true,
}) {
  if (!title && !message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative rounded-2xl overflow-hidden mb-6"
      style={{ 
        background: 'linear-gradient(135deg, rgba(212,168,83,0.08) 0%, rgba(0,212,255,0.06) 100%)', 
        border: '1px solid rgba(212,168,83,0.25)' 
      }}
    >
      <div className="p-6 flex items-start gap-4">
        {/* Galileo Icon */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(212,168,83,0.15)', border: '1.5px solid rgba(212,168,83,0.3)' }}>
          {isComplete ? (
            <CheckCircle2 className="w-6 h-6 text-primary" />
          ) : (
            <Sparkles className="w-6 h-6 text-primary" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2">
          {title && (
            <h3 className="text-lg font-display font-bold text-gold-gradient">{title}</h3>
          )}
          
          {message && (
            <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          )}

          {showContinueButton && onContinue && (
            <div className="pt-3">
              <Button 
                onClick={onContinue}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}