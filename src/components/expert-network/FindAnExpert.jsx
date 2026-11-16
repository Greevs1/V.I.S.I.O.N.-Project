import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react';
import ExpertCard from './ExpertCard';
// The specialty vocabulary lives in ONE place (expertSpecialties) so the Sprint
// expert pill and this directory can never disagree about role names.
import { EXPERT_SPECIALTIES } from '@/lib/expertSpecialties';

const REVENUE_RANGES = ['Under $500K', '$500K–$1M', '$1M–$5M', '$5M–$10M', '$10M+'];

export default function FindAnExpert({ initialSpecialty = null }) {
  const { supabaseProfile } = useAuth();
  const queryClient = useQueryClient();
  const clientProfileId = supabaseProfile?.id;

  const [search, setSearch] = useState('');
  // An expertise arriving from a Sprint task pre-applies the EXISTING specialty
  // filter, and only when it is a real value in the taxonomy. A role that is not
  // one of those values is never squeezed into a filter that would return
  // nothing: the requested expertise is shown as context instead.
  const [selectedSpecialties, setSelectedSpecialties] = useState(
    initialSpecialty && EXPERT_SPECIALTIES.includes(initialSpecialty) ? [initialSpecialty] : []
  );
  const [revenueFilter, setRevenueFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(!!initialSpecialty);

  const { data: experts = [], isLoading } = useQuery({
    queryKey: ['expert-profiles-directory'],
    queryFn: () => base44.entities.expert_profiles.filter({ expert_status: 'active' }, '-vision_recommended', 100),
    staleTime: 60_000,
  });

  const { data: savedExperts = [] } = useQuery({
    queryKey: ['saved-experts', clientProfileId],
    queryFn: () => base44.entities.client_saved_experts.filter({ client_profile_id: clientProfileId }, '-updated_date', 200),
    enabled: !!clientProfileId,
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

  const toggleSpecialty = (s) => setSelectedSpecialties(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  );

  const filtered = experts.filter(e => {
    if (recommendedOnly && !e.vision_recommended) return false;
    if (acceptingOnly && e.accepting_new_clients === false) return false;
    if (revenueFilter && !e.revenue_ranges?.includes(revenueFilter)) return false;
    if (stateFilter && !e.states_licensed?.some(s => s.toLowerCase().includes(stateFilter.toLowerCase()))) return false;
    if (selectedSpecialties.length > 0 && !selectedSpecialties.some(s => e.specialties?.includes(s))) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const searchable = `${e.name} ${e.title} ${e.specialties?.join(' ')} ${e.credentials?.join(' ')} ${e.location}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  // Sort: vision_recommended first, then featured, then verified
  const sorted = [...filtered].sort((a, b) => {
    const scoreA = (a.vision_recommended ? 3 : 0) + (a.featured ? 2 : 0) + (a.verified ? 1 : 0);
    const scoreB = (b.vision_recommended ? 3 : 0) + (b.featured ? 2 : 0) + (b.verified ? 1 : 0);
    return scoreB - scoreA;
  });

  return (
    <div className="space-y-4">
      {/* Search + filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, specialty, credential, location…"
            className="w-full h-10 bg-secondary border border-border rounded-xl pl-10 pr-4 text-sm outline-none focus:border-primary/40" />
        </div>
        <button onClick={() => setShowFilters(f => !f)}
          className={`flex items-center gap-1.5 h-10 px-4 rounded-xl border text-sm font-medium transition-colors ${
            showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
          }`}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
          {(selectedSpecialties.length > 0 || revenueFilter || stateFilter || recommendedOnly || acceptingOnly) && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
              {selectedSpecialties.length + (revenueFilter ? 1 : 0) + (stateFilter ? 1 : 0) + (recommendedOnly ? 1 : 0) + (acceptingOnly ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="glass rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Specialty</p>
            <div className="flex flex-wrap gap-1.5">
              {EXPERT_SPECIALTIES.map(s => (
                <button key={s} onClick={() => toggleSpecialty(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedSpecialties.includes(s)
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Revenue Range</p>
              <select value={revenueFilter} onChange={e => setRevenueFilter(e.target.value)}
                className="w-full h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none">
                <option value="">Any</option>
                {REVENUE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">State</p>
              <input value={stateFilter} onChange={e => setStateFilter(e.target.value)}
                placeholder="e.g. Arizona"
                className="w-full h-8 bg-secondary border border-border rounded-lg px-2 text-xs outline-none focus:border-primary/40" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={recommendedOnly} onChange={e => setRecommendedOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-yellow-500" />
              V.I.S.I.O.N. Recommended Only
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={acceptingOnly} onChange={e => setAcceptingOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded" />
              Accepting New Clients
            </label>
          </div>
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {isLoading ? 'Loading experts…' : `${sorted.length} expert${sorted.length !== 1 ? 's' : ''} found`}
      </p>

      {/* Expert grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <p className="text-sm text-muted-foreground">No experts match your filters.</p>
          {experts.length === 0 && (
            <p className="text-xs text-muted-foreground/60 mt-1">The expert network is being built — check back soon.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(expert => (
            <ExpertCard
              key={expert.id}
              expert={expert}
              saved={savedIds.has(expert.id)}
              onSave={() => !savedIds.has(expert.id) && saveMutation.mutate(expert)}
            />
          ))}
        </div>
      )}
    </div>
  );
}