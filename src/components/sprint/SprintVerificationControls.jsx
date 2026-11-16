import React, { useState } from 'react';
import { ShieldCheck, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function SprintVerificationControls({ sprint, onVerified, fetchSprint }) {
  const { role, supabaseProfile } = useAuth();
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(sprint?.verification_notes || '');
  const [isVerifying, setIsVerifying] = useState(false);

  const isAdmin = role === 'admin' || role === 'super_admin';
  const isExpertAdvisor = role === 'expert_advisor';
  const myProfileId = supabaseProfile?.id;

  // Expert advisor can verify if they are assigned as verifier OR have sprint access
  const isAssignedVerifier = isExpertAdvisor && sprint?.assigned_verifier_profile_id === myProfileId;
  const hasSprintAccess = isExpertAdvisor && supabaseProfile?.sprint_access === true;

  // Only show controls for admin/super_admin or assigned expert advisor
  if (!isAdmin && !isAssignedVerifier && !hasSprintAccess) {
    return null;
  }

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'expertVerifySprint',
        data: {
          sprint_id: sprint.id,
          verified: true,
          notes: notes.trim(),
        },
      });

      if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        // Also update verification_assignment_status on the Base44 entity
        try {
          await base44.entities.NinetyDaySprint.updateMany(
            { id: sprint.id },
            { $set: { verification_assignment_status: 'completed' } }
          );
        } catch { /* best effort */ }
        toast.success('Sprint marked as expert verified');
        onVerified?.();
        fetchSprint?.();
      }
    } catch (err) {
      toast.error('Failed to verify sprint');
      console.error(err);
    }
    setIsVerifying(false);
  };

  const handleRequestChanges = async () => {
    if (!notes.trim()) {
      toast.error('Please add verification notes explaining what changes are needed');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await base44.functions.invoke('ninetyDaySprint', {
        action: 'expertVerifySprint',
        data: {
          sprint_id: sprint.id,
          verified: false,
          notes: notes.trim(),
        },
      });

      if (res.data?.error) {
        toast.error(res.data.error);
      } else {
        try {
          await base44.entities.NinetyDaySprint.updateMany(
            { id: sprint.id },
            { $set: { verification_assignment_status: 'changes_requested' } }
          );
        } catch { /* best effort */ }
        toast.success('Changes requested - client notified');
        onVerified?.();
        fetchSprint?.();
      }
    } catch (err) {
      toast.error('Failed to request changes');
      console.error(err);
    }
    setIsVerifying(false);
  };

  return (
    <div className="rounded-xl border border-border p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">Expert Verification Controls</h4>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Review this Galileo-generated sprint and mark it as expert verified, or request changes with notes.
      </p>

      {/* Notes textarea */}
      <div className="mb-3">
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {showNotes ? 'Hide Notes' : 'Add Verification Notes'}
        </button>

        {showNotes && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about your review (required when requesting changes)..."
            className="min-h-[80px] text-xs bg-secondary border-border"
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleVerify}
          disabled={isVerifying}
          className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          {isVerifying ? 'Verifying...' : 'Mark Expert Verified'}
        </Button>

        <Button
          onClick={handleRequestChanges}
          disabled={isVerifying}
          variant="outline"
          className="gap-1.5 text-xs h-8 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
        >
          <X className="w-3.5 h-3.5" />
          {isVerifying ? 'Processing...' : 'Request Changes'}
        </Button>
      </div>
    </div>
  );
}