/**
 * ExpertRecommendations — smart match widget for sprint tasks and opportunities.
 * Additive only: pass context (specialties needed, reason) and it renders matched experts.
 * Does NOT modify sprint or opportunity logic.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useMembership } from '@/lib/useMembership';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import ExpertCard from './ExpertCard';

/**
 * Props:
 *  specialties  — string[]   e.g. ['CPA', 'Tax Strategy']
 *  reason       — string     e.g. 'Tax Gap + Entity Optimization Opportunity'
 *  maxShow      — number     default 3
 *  compact      — boolean    use compact card layout
 */
export default function ExpertRecommendations({ specialties = [], reason = '', maxShow = 3, compact = true }) {
  const { isPaid } = useMembership();
  const { supabaseProfile } = useAuth();
  const queryClient = useQueryClient();
  const clientProfileId = supabaseProfile?.id;
  const [expanded, setExpanded] = useState(false);

  const { data: experts = [] } = useQuery({
    queryKey: ['expert-profiles-directory'],
    queryFn: () => base44.entities.expert_profiles.filter({ expert_status: 'active' }, '-vision_recommended', 100),
    staleTime: 120_000,
    enabled: isPaid,
  });

  const { data: savedExperts = [] } = useQuery({
    queryKey: ['saved-experts', clientProfileId],
    queryFn: () => base44.entities.client_saved_experts.filter({ client_profile_id: clientProfileId }, '-updated_date', 200),
    enabled: !!clientProfileId && isPaid,
  });
  const savedIds = new Set(savedExperts.map(s => s.expert_profile_id).filter(Boolean));

  const saveMutation = useMutation({
    mutationFn: async (expert) => {
      await base44.entities.client_saved_experts.create({
        client_profile_id: clientProfileId,
        expert_profile_id: expert.id,
        name: expert.name,
        email: expert.email,
        specialty: expert.specialties?.[0] || '',
        relationship_type: 'saved',
        source: 'platform',
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-experts', clientProfileId] }),
  });

  if (!isPaid) return null;

  // Score experts by specialty match
  const scored = experts.map(e => {
    let score = 0;
    const eSpecs = (e.specialties || []).map(s => s.toLowerCase());
    specialties.forEach(s => {
      if (eSpecs.some(es => es.includes(s.toLowerCase()) || s.toLowerCase().includes(es))) score += 30;
    });
    if (e.vision_recommended) score += 15;
    if (e.featured) score += 8;
    if (e.verified) score += 5;
    if (e.accepting_new_clients !== false) score += 5;
    return { ...e, matchScore: Math.min(score, 99) };
  }).filter(e => e.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore);

  const shown = scored.slice(0, maxShow);
  if (shown.length === 0) return null;

  return (
    <div className="mt-3 border border-primary/15 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-primary/5 hover:bg-primary/8 transition-colors text-left">
        <Users className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-primary flex-1">Recommended Experts ({shown.length})</span>
        {reason && <span className="text-[10px] text-muted-foreground hidden sm:block mr-2">{reason}</span>}
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="p-3 space-y-2 bg-card/50">
          {shown.map(expert => (
            <ExpertCard
              key={expert.id}
              expert={expert}
              matchScore={expert.matchScore}
              matchReason={reason}
              compact={compact}
              saved={savedIds.has(expert.id)}
              onSave={() => !savedIds.has(expert.id) && saveMutation.mutate(expert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}