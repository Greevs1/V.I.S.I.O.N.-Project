/**
 * ExpertCard — reusable card for displaying an expert profile.
 */
import React from 'react';
import { ExternalLink, Calendar, CheckCircle, Star, Trophy, Target } from 'lucide-react';

const SPECIALTY_COLORS = {
  'Tax Strategy': '#22c55e',
  'CPA': '#22c55e',
  'Wealth Management': '#3b82f6',
  'Exit Planning': '#D4A853',
  'Asset Protection': '#A855F7',
  'Operations': '#f59e0b',
  'Insurance': '#06b6d4',
  'Legal': '#ef4444',
  'M&A': '#D4A853',
  'HR': '#3b82f6',
};

function Badge({ expert }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {expert.vision_recommended && (
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
          <Trophy className="w-2.5 h-2.5" /> V.I.S.I.O.N. Recommended
        </span>
      )}
      {expert.featured && (
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <Star className="w-2.5 h-2.5" /> Featured
        </span>
      )}
      {expert.verified && (
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle className="w-2.5 h-2.5" /> Verified
        </span>
      )}
    </div>
  );
}

export default function ExpertCard({ expert, matchScore, matchReason, onSave, saved, compact = false }) {
  const initials = (expert.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleBook = () => {
    if (expert.calendar_booking_url) {
      window.open(expert.calendar_booking_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (compact) {
    return (
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
          {expert.photo_url
            ? <img src={expert.photo_url} alt={expert.name} className="w-full h-full object-cover" />
            : <span className="text-sm font-bold text-primary">{initials}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{expert.name}</p>
            {matchScore && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                {matchScore}% Match
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{expert.title || (expert.specialties?.[0] ?? '')}</p>
          {matchReason && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{matchReason}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {expert.calendar_booking_url && (
            <button onClick={handleBook}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors">
              <Calendar className="w-3 h-3" /> Book
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-5 space-y-3 hover:border-primary/20 transition-all">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
          {expert.photo_url
            ? <img src={expert.photo_url} alt={expert.name} className="w-full h-full object-cover" />
            : <span className="text-base font-bold text-primary">{initials}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{expert.name}</p>
              <p className="text-xs text-muted-foreground">{expert.title}</p>
              {expert.location && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{expert.location}</p>}
            </div>
            {matchScore && (
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-emerald-400">{matchScore}%</span>
                <p className="text-[10px] text-muted-foreground">Match</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Badges */}
      <Badge expert={expert} />

      {/* Match reason */}
      {matchReason && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
          <Target className="w-3 h-3 text-primary shrink-0" />
          <p className="text-[11px] text-muted-foreground">{matchReason}</p>
        </div>
      )}

      {/* Specialties */}
      {expert.specialties?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {expert.specialties.slice(0, 4).map(s => (
            <span key={s} className="text-[10px] px-2 py-0.5 rounded-full border"
              style={{ color: SPECIALTY_COLORS[s] || '#9ca3af', borderColor: `${SPECIALTY_COLORS[s] || '#9ca3af'}40`, background: `${SPECIALTY_COLORS[s] || '#9ca3af'}10` }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {expert.years_experience && <span>{expert.years_experience}+ yrs experience</span>}
        {expert.verified_outcome_count > 0 && <span>{expert.verified_outcome_count} verified outcomes</span>}
        {expert.accepting_new_clients === false && <span className="text-amber-400">Limited availability</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {expert.calendar_booking_url && (
          <button onClick={handleBook}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors">
            <Calendar className="w-3.5 h-3.5" /> Book Consultation
          </button>
        )}
        {onSave && (
          <button onClick={onSave}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
              saved ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}>
            {saved ? '✓ Saved' : '+ Save'}
          </button>
        )}
        {expert.linkedin_url && (
          <a href={expert.linkedin_url} target="_blank" rel="noopener noreferrer"
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}