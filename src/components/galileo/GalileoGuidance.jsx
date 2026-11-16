import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnterpriseDiscovery } from '@/lib/enterpriseDiscovery';

/**
 * GalileoGuidance — Event-driven guidance overlay
 * 
 * Displays contextual messages from Galileo at key workflow milestones.
 * Short, encouraging, and actionable. No typing required.
 */
export default function GalileoGuidance({ onNext, continueLabel = 'Continue' }) {
  const { currentMessage, showGuidance, hideGuidance } = useEnterpriseDiscovery();

  if (!showGuidance || !currentMessage) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="fixed bottom-24 right-8 z-50 max-w-md"
      >
        <div className="glass-gold rounded-2xl p-6 border-2 border-primary/30 shadow-2xl">
          {/* Header */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-primary mb-1">
                {currentMessage.title || 'Next Step'}
              </h3>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {currentMessage.message}
              </p>
            </div>
          </div>

          {/* Action */}
          <div className="flex items-center justify-end gap-2 pt-2">
            {onNext && (
              <Button 
                onClick={() => {
                  hideGuidance();
                  onNext();
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
              >
                {continueLabel}
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
            {!onNext && (
              <Button 
                onClick={hideGuidance}
                variant="outline"
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Got it
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}