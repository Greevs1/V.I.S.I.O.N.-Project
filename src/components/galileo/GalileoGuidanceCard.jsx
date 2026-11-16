/**
 * GalileoGuidanceCard — Enterprise Discovery™ Guidance Component
 * 
 * Displays Galileo's contextual guidance messages during the onboarding workflow.
 * Short, encouraging messages that explain why each step matters.
 * 
 * Usage:
 * - Shows during business creation
 * - Shows after document upload
 * - Shows after each assessment completion
 * - Shows when portfolio mode activates
 */

import React from 'react';
import { Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function GalileoGuidanceCard({ 
  title, 
  message, 
  onNext, 
  nextLabel = 'Continue',
  showProgress = false,
  progressPercent = 0,
  hideGuidance,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="glass-gold rounded-2xl border border-primary/30 p-6 space-y-4"
    >
      {/* Header with Galileo icon */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-display font-bold text-primary">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{message}</p>
        </div>
        {hideGuidance && (
          <button 
            onClick={hideGuidance}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress bar (optional) */}
      {showProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="text-primary font-semibold">{progressPercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action button */}
      {onNext && (
        <div className="flex justify-end pt-2">
          <Button 
            onClick={onNext}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            {nextLabel}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </motion.div>
  );
}