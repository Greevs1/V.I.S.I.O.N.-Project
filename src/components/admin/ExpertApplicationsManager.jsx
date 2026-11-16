/**
 * ExpertApplicationsManager — Admin review panel for expert applications.
 * Lives in Admin → Expert Network tab.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Loader2, CheckCircle, XCircle, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_STYLES = {
  pending:      'bg-secondary text-muted-foreground border-border',
  under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected:     'bg-red-500/15 text-red-400 border-red-500/30',
};

export default function ExpertApplicationsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [reviewNotes, setReviewNotes] = useState({});

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['expert-applications', filter],
    queryFn: () => base44.entities.expert_applications.filter(
      filter !== 'all' ? { application_status: filter } : {},
      '-updated_date', 100
    ),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }) => {
      await base44.entities.expert_applications.update(id, {
        application_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.email || 'admin',
        reviewer_notes: notes || '',
      });
      // On approval: create expert_profile
      if (status === 'approved') {
        const app = applications.find(a => a.id === id);
        if (app) {
          await base44.entities.expert_profiles.create({
            application_id: id,
            name: app.name,
            email: app.email,
            company_name: app.company_name,
            bio: app.bio,
            location: app.location,
            website: app.website,
            linkedin_url: app.linkedin_url,
            years_experience: app.years_experience,
            specialties: app.specialties || [],
            industries: app.industries_served || [],
            credentials: app.credentials || [],
            revenue_ranges: app.revenue_ranges_served || [],
            states_licensed: app.states_licensed || [],
            calendar_booking_url: app.calendar_booking_url,
            expert_type: 'network_expert',
            expert_status: 'active',
            verified: false,
            featured: false,
            vision_recommended: false,
            accepting_new_clients: true,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expert-applications'] });
      queryClient.invalidateQueries({ queryKey: ['expert-profiles-directory'] });
    },
  });

  const tabs = ['pending', 'under_review', 'approved', 'rejected', 'all'];

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
              filter === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>{t.replace('_', ' ')}</button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && applications.length === 0 && (
        <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
          No {filter !== 'all' ? filter.replace('_', ' ') : ''} applications.
        </div>
      )}

      <div className="space-y-3">
        {applications.map(app => {
          const open = expandedId === app.id;
          return (
            <div key={app.id} className="glass rounded-xl overflow-hidden">
              <button onClick={() => setExpandedId(open ? null : app.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{app.name}</p>
                    <span className={`text-[10px] border rounded-full px-2 py-0.5 capitalize ${STATUS_STYLES[app.application_status] || ''}`}>
                      {app.application_status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{app.email} · {app.company_name}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {app.specialties?.slice(0, 3).join(', ')} · {app.location}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground shrink-0">
                  {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : '—'}
                </p>
                {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-border">
                  <div className="pt-3 grid grid-cols-2 gap-3 text-xs">
                    {[
                      ['Location', app.location],
                      ['Phone', app.phone],
                      ['Website', app.website],
                      ['LinkedIn', app.linkedin_url],
                      ['Experience', app.years_experience ? `${app.years_experience} years` : '—'],
                      ['Booking URL', app.calendar_booking_url],
                    ].map(([label, val]) => val ? (
                      <div key={label}>
                        <span className="text-muted-foreground">{label}: </span>
                        <span className="font-medium">{val}</span>
                      </div>
                    ) : null)}
                  </div>
                  {app.bio && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Bio</p>
                      <p className="text-xs text-muted-foreground">{app.bio}</p>
                    </div>
                  )}
                  {app.credentials?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Credentials</p>
                      <p className="text-xs">{app.credentials.join(', ')}</p>
                    </div>
                  )}
                  {app.specialties?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Specialties</p>
                      <div className="flex flex-wrap gap-1.5">
                        {app.specialties.map(s => (
                          <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {app.application_status === 'pending' || app.application_status === 'under_review' ? (
                    <div className="space-y-3 pt-2 border-t border-border">
                      <textarea
                        value={reviewNotes[app.id] || ''}
                        onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                        placeholder="Reviewer notes (optional)…"
                        rows={2}
                        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary/40 resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="text-xs gap-1.5"
                          onClick={() => updateMutation.mutate({ id: app.id, status: 'under_review', notes: reviewNotes[app.id] })}
                          disabled={updateMutation.isPending}>
                          <Eye className="w-3 h-3" /> Mark Under Review
                        </Button>
                        <Button size="sm" className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => updateMutation.mutate({ id: app.id, status: 'approved', notes: reviewNotes[app.id] })}
                          disabled={updateMutation.isPending}>
                          <CheckCircle className="w-3 h-3" /> Approve + Create Profile
                        </Button>
                        <Button size="sm" variant="destructive" className="text-xs gap-1.5"
                          onClick={() => updateMutation.mutate({ id: app.id, status: 'rejected', notes: reviewNotes[app.id] })}
                          disabled={updateMutation.isPending}>
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                      </div>
                      {app.reviewer_notes && (
                        <p className="text-[10px] text-muted-foreground">Previous notes: {app.reviewer_notes}</p>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        Reviewed {app.reviewed_at ? new Date(app.reviewed_at).toLocaleDateString() : '—'}
                        {app.reviewed_by ? ` by ${app.reviewed_by}` : ''}
                      </p>
                      {app.reviewer_notes && <p className="text-xs mt-1">{app.reviewer_notes}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}