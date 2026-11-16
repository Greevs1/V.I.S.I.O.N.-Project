import React from 'react';
import { Lock, Upload, FileText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useOpenDocuments } from '@/lib/visionWorkspace/openDocument';

export default function DataRequirementOverlay({ onDismiss }) {
  const navigate = useNavigate();
  // Uploading is a Galileo document-overlay action, not a separate page.
  const openDocs = useOpenDocuments();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative h-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-background" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-display font-bold">Unlock Your V.I.S.I.O.N. Platform™</h2>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span className="text-primary">V</span>alue <span className="text-primary">I</span>ntelligence & <span className="text-primary">S</span>trategic <span className="text-primary">I</span>nsight <span className="text-primary">O</span>ptimization <span className="text-primary text-base">N</span>etwork
          </p>
            <p className="text-sm leading-relaxed mx-1">IQ™ dashboard requires business data to generate meaningful insights. Complete these two steps to see your personalized analysis.

            </p>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="glass rounded-xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">1</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">Upload Financial Documents</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload your profit & loss, balance sheet, and tax returns. Our AI will extract and analyze your financial data automatically.
                </p>
                <Button
                  size="sm"
                  onClick={() => openDocs({ mode: 'upload' })}
                  className="gap-1.5 text-xs">
                  
                  <Upload className="w-3.5 h-3.5" /> Upload Documents
                </Button>
              </div>
            </div>

            <div className="glass rounded-xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-accent">2</span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold mb-1">Complete Business Assessments</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Answer questions about your business to uncover hidden value, tax savings, and operational improvements.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/assessments/profit-gap')}
                  className="gap-1.5 text-xs">
                  
                  <FileText className="w-3.5 h-3.5" /> Start Assessments
                </Button>
              </div>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span>Upload</span>
            </div>
            <ArrowRight className="w-3 h-3" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span>Assess</span>
            </div>
            <ArrowRight className="w-3 h-3" />
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span>Discover</span>
            </div>
          </div>

          {/* Dismiss button */}
          {onDismiss &&
          <div className="pt-4 border-t border-border">
              <button
              onClick={onDismiss}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
              
                I'll complete these steps later
              </button>
            </div>
          }
        </div>
      </div>
    </div>);

}