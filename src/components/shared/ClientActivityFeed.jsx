/**
 * ClientActivityFeed — reusable activity feed component
 * mode: 'client_dashboard' | 'admin_client' | 'expert_advisor'
 * Fetches Notification records filtered by profile_id / business_id
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, FileText, TrendingUp, LogIn, Settings, CheckCircle, Loader2, ClipboardList } from 'lucide-react';

const TYPE_META = {
  reminder_due:                 { color: '#D4A853', icon: Activity },
  task_assigned:                { color: '#00D4FF', icon: ClipboardList },
  document_request_assigned:    { color: '#D4A853', icon: FileText },
  resource_assigned:            { color: '#22c55e', icon: FileText },
  sprint_task_completed:        { color: '#22c55e', icon: CheckCircle },
  sprint_completed:             { color: '#22c55e', icon: CheckCircle },
  galileo_update:               { color: '#A855F7', icon: TrendingUp },
  achievement_sprint_milestone: { color: '#D4A853', icon: CheckCircle },
  achievement_assessment_complete: { color: '#A855F7', icon: TrendingUp },
  weekly_digest:                { color: '#00D4FF', icon: Activity },
  default:                      { color: '#9CA3AF', icon: Activity },
};

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ClientActivityFeed({ profileId, businessId, mode = 'admin_client', limit = 20 }) {
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['client-activity-feed', profileId, businessId, mode],
    queryFn: async () => {
      const filters = {};
      if (profileId) filters.recipient_profile_id = profileId;
      // fetch up to `limit` notifications for this profile
      const items = await base44.entities.Notification.filter(filters, '-created_date', limit);
      return items || [];
    },
    enabled: !!(profileId || businessId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!notifications.length) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {notifications.map(n => {
        const meta = TYPE_META[n.notification_type] || TYPE_META.default;
        const Icon = meta.icon;
        return (
          <div key={n.id} className="flex items-center gap-3 py-3 px-1 hover:bg-secondary/20 rounded-lg transition-colors">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: `${meta.color}20` }}>
              <Icon className="w-4 h-4" style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{n.title}</p>
              {n.message && <p className="text-xs text-muted-foreground truncate">{n.message}</p>}
            </div>
            <p className="text-[11px] text-muted-foreground shrink-0 ml-2">{timeAgo(n.created_date)}</p>
          </div>
        );
      })}
    </div>
  );
}