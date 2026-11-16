import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Loader2, Sparkles, Calendar, FileText, Users, Zap, ShieldCheck, ClipboardList, BookOpen, X, Target, Info, Award, Star, Building } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { AnimatePresence } from 'framer-motion';
import chimeUrl from '@/assets/notification-chime.wav';
import NotificationBubble from '@/components/notifications/NotificationBubble';
import {
  createArrivalTracker,
  isAssignmentArrival,
  playArrivalChime,
} from '@/lib/notifications/notificationArrival';

const TYPE_ICON = {
  reminder_due: Calendar,
  task_assigned: ClipboardList,
  document_request_assigned: FileText,
  resource_assigned: BookOpen,
  team_invite: Users,
  booking_scheduled: Calendar,
  booking_cancelled: Calendar,
  booking_rescheduled: Calendar,
  sprint_task_completed: Zap,
  sprint_completed: Zap,
  galileo_update: Sparkles,
  role_updated: ShieldCheck,
  permission_updated: ShieldCheck,
  weekly_digest: Info,
  achievement_sprint_milestone: Award,
  achievement_assessment_complete: Award,
  achievement_opportunity_milestone: Star,
  achievement_sprint_created: Target,
  achievement_document_milestone: FileText,
  achievement_iq_milestone: Building,
};

const CATEGORY_COLOR = {
  action_required: 'text-red-400',
  reminder: 'text-amber-400',
  information: 'text-blue-400',
  success: 'text-emerald-400',
  achievement: 'text-purple-400',
  system: 'text-muted-foreground',
};

const PRIORITY_DOT = {
  critical: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-muted-foreground',
};

// Fallback icon colors for notifications without category
const TYPE_COLOR = {
  sprint_completed: 'text-emerald-400',
  sprint_task_completed: 'text-emerald-400',
  galileo_update: 'text-primary',
  role_updated: 'text-amber-400',
  permission_updated: 'text-amber-400',
  booking_cancelled: 'text-red-400',
  team_invite: 'text-accent',
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateToNotification = useNotificationNavigation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  // Arrivals — "something just came in", which is a narrower thing than
  // "something is unread".
  const [arrivals, setArrivals] = useState([]);
  // Where the bell is. The bubble renders in the global overlay layer (so no
  // workspace can trap it), but it must still arrive FROM the bell — so the
  // position is measured on the bell itself rather than guessed in the bubble.
  const [anchor, setAnchor] = useState(null);
  const trackerRef = useRef(null);
  const lastUnreadRef = useRef(null);
  const dropdownRef = useRef(null);
  const pollRef = useRef(null);
  const bellRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return null;
    try {
      const res = await base44.functions.invoke('notificationService', { action: 'getUnreadCount' });
      const count = res.data?.count || 0;
      setUnreadCount(count);
      return count;
    } catch {
      return null;
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('notificationService', { action: 'getNotifications', data: { limit: 50 } });
      setNotifications(res.data?.notifications || []);
      setUnreadCount((res.data?.notifications || []).filter(n => !n.is_read).length);
    } catch {}
    setLoading(false);
  }, [user]);

  // ── ARRIVALS ───────────────────────────────────────────────────────────────
  // There is no realtime channel for notifications in this app: the bell has
  // always learned about them by polling. That mechanism is REUSED here rather
  // than replaced — the same poll that keeps the badge honest also answers
  // whether anything genuinely NEW has appeared. No second realtime
  // architecture, and no second notification record.
  const detectArrivals = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    try {
      const res = await base44.functions.invoke('notificationService', {
        action: 'getNotifications',
        data: { limit: 8 },
      });
      const list = res.data?.notifications || [];
      // The tracker records everything it sees and returns only what arrived
      // after this session opened — never an old unread notice (§23).
      const fresh = tracker.diff(list).filter(isAssignmentArrival);
      if (fresh.length === 0) return;
      setArrivals((prev) => [
        ...prev,
        ...fresh.filter((item) => !prev.some((existing) => existing.id === item.id)),
      ]);
      // The recipient is the only person who holds this notification, so the
      // assigner can never hear their own action (§27). Sound is enhancement
      // only: a blocked chime never costs the bubble (§25).
      playArrivalChime(chimeUrl);
    } catch {}
  }, []);

  const pollForArrivals = useCallback(async () => {
    if (!user) return;
    const count = await fetchUnreadCount();
    if (count === null) return;
    const previous = lastUnreadRef.current;
    lastUnreadRef.current = count;

    if (previous === null) {
      // First pass: learn what already exists. Nothing is "new" because the app
      // just opened — this is what stops a refresh or a remount from replaying.
      await detectArrivals();
      return;
    }
    if (count <= previous) return;
    await detectArrivals();
  }, [user, fetchUnreadCount, detectArrivals]);

  useEffect(() => {
    if (!user) return;
    // Per-mount on purpose: a remount starts a fresh tracker, so it cannot
    // replay notifications it has already announced.
    trackerRef.current = createArrivalTracker();
    lastUnreadRef.current = null;
    pollForArrivals();
    pollRef.current = setInterval(pollForArrivals, 15000);
    return () => clearInterval(pollRef.current);
  }, [user, pollForArrivals]);

  // ── The bubble's anchor ──────────────────────────────────────────────────
  // Measured from the bell. The header is fixed, so a resize (or a zoom) is the
  // only thing that moves it; there is nothing to follow on scroll.
  const measureAnchor = useCallback(() => {
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) {
      setAnchor(null);
      return;
    }
    setAnchor({
      top: Math.round(rect.bottom + 12),
      right: Math.max(12, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useEffect(() => {
    if (arrivals.length === 0) {
      setAnchor(null);
      return;
    }
    measureAnchor();
    window.addEventListener('resize', measureAnchor);
    return () => window.removeEventListener('resize', measureAnchor);
  }, [arrivals.length, measureAnchor]);

  // Fetch full list when opening
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = async (notif) => {
    if (notif.is_read) return;
    try {
      await base44.functions.invoke('notificationService', {
        action: 'markNotificationRead',
        data: { notification_id: notif.id },
      });
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await base44.functions.invoke('notificationService', { action: 'markAllNotificationsRead' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
    setMarkingAll(false);
  };

  const handleClick = async (notif) => {
    markRead(notif);
    // Track click analytics
    try {
      await base44.functions.invoke('notificationService', {
        action: 'trackNotificationEvent',
        data: { notification_id: notif.id, event_type: 'clicked' },
      });
    } catch {}
    // ONE destination resolver decides where a click goes (see
    // @/lib/notifications/notificationDestination): the exact business first,
    // then the exact object, then the surface that can act on it. `action_url`
    // remains the fallback for notice types that carry no authoritative ids.
    const result = await navigateToNotification(notif);
    if (result?.navigated) {
      setOpen(false);
    } else if (result?.reason === 'business_unavailable') {
      // Said plainly, and nothing is opened — never the wrong business's data.
      toast.error('That business is not available on this account');
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={bellRef}
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/50"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full bg-primary text-primary-foreground px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] flex flex-col z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
          style={{ backdropFilter: 'blur(20px)', background: 'rgba(14,14,20,0.97)', borderColor: '#24242A' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-medium bg-primary/15 text-primary border border-primary/30 rounded-full px-1.5 py-0.5">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                  title="Mark all as read"
                >
                  {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                  All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/60">You'll see updates here when things happen.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map(notif => {
                  const Icon = TYPE_ICON[notif.notification_type] || Bell;
                  const dotColor = PRIORITY_DOT[notif.priority] || PRIORITY_DOT.medium;
                  const timeAgo = notif.created_date
                    ? formatDistanceToNow(new Date(notif.created_date), { addSuffix: true })
                    : '';

                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-secondary/30 ${!notif.is_read ? 'bg-primary/3' : ''}`}
                    >
                      {/* Unread dot */}
                      <div className="shrink-0 mt-1.5">
                        {!notif.is_read ? (
                          <span className={`w-2 h-2 rounded-full ${dotColor} block`} />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent block" />
                        )}
                      </div>

                      {/* Icon with category color */}
                      <div className={`w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 ${notif.notification_category ? CATEGORY_COLOR[notif.notification_category] : (TYPE_COLOR[notif.notification_type] || 'text-muted-foreground')}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <p className={`text-xs font-medium leading-snug ${notif.is_read ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {notif.title}
                          </p>
                          {/* Category badge */}
                          {notif.notification_category && (
                            <span className={`text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-secondary/50 border border-border/50 ${CATEGORY_COLOR[notif.notification_category] || 'text-muted-foreground'}`}>
                              {notif.notification_category.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        {notif.message && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo}</p>
                      </div>

                      {/* Mark read */}
                      {!notif.is_read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markRead(notif); }}
                          className="shrink-0 p-1 text-muted-foreground hover:text-primary rounded transition-colors mt-0.5"
                          title="Mark as read"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border shrink-0">
              <button
                onClick={() => { navigate('/settings?tab=notifications'); setOpen(false); }}
                className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                Manage notification preferences →
              </button>
            </div>
          )}
        </div>
      )}

      {/* The arrival bubble. It is the SAME notification, opened through the
          SAME click path as a bell item — identical read behaviour, identical
          destination resolver — so there is no second navigation to drift.
          Hidden while the dropdown is open: the owner is already looking at the
          list, and one arrival at a time is shown, never a stack (§33).
          It portals itself into the global overlay layer, so it is visible above
          every workspace surface; it renders once the bell has been measured, so
          it arrives at the bell rather than at a default corner. */}
      <AnimatePresence>
        {!open && arrivals.length > 0 && anchor && (
          <NotificationBubble
            notification={arrivals[0]}
            more={arrivals.length - 1}
            anchor={anchor}
            onOpen={() => {
              const next = arrivals[0];
              setArrivals((prev) => prev.slice(1));
              handleClick(next);
            }}
            onDismiss={() => setArrivals((prev) => prev.slice(1))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}