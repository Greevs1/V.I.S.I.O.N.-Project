import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Building2, Calendar, Lock, Link2, Users, User, Plus, Download, X, Bell, TrendingUp } from
'lucide-react';
import MyTeam from '@/pages/admin/MyTeam';
import NotificationPreferencesPanel from '@/components/notifications/NotificationPreferencesPanel';
import FinancialProfileTab from '@/components/settings/FinancialProfileTab';
import { useMembership } from '@/lib/useMembership';

const TABS = [
{ id: 'general', label: 'General', icon: User },
{ id: 'organization', label: 'Organization', icon: Building2 },
{ id: 'financial', label: 'Financial Profile', icon: TrendingUp },
{ id: 'bookings', label: 'My Bookings', icon: Calendar },
{ id: 'security', label: 'Security', icon: Lock },
{ id: 'integrations', label: 'Integrations', icon: Link2 },
{ id: 'notifications', label: 'Notifications', icon: Bell },
{ id: 'team', label: 'My Team', icon: Users, adminOnly: true }];


export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, supabaseProfile } = useAuth();
  const { isPaid, isAdvisorOrAdmin } = useMembership();

  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  const isOwnerOrAdmin = ['owner', 'admin', 'super_admin'].includes(user?.role);

  const getTab = () => {
    const p = new URLSearchParams(location.search).get('tab');
    return p || 'general';
  };
  const [activeTab, setActiveTab] = useState(getTab);

  useEffect(() => {
    setActiveTab(getTab());
  }, [location.search]);

  const switchTab = (id) => {
    navigate(`/settings?tab=${id}`, { replace: true });
  };

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isOwnerOrAdmin);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase mb-2">Platform Settings</p>
        <h1 className="text-3xl font-display font-bold">Settings</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border pb-0 overflow-x-auto">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              active ?
              'border-primary text-foreground' :
              'border-transparent text-muted-foreground hover:text-foreground'}`
              }>
              
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>);

        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'general' && <GeneralTab user={user} />}
        {activeTab === 'notifications' && <NotificationPreferencesPanel />}
        {activeTab === 'organization' && <OrganizationTab supabaseProfile={supabaseProfile} />}
        {activeTab === 'financial' && <FinancialProfileTab />}
        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'security' && <SecurityTab user={user} />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'team' && isOwnerOrAdmin && <MyTeam />}
        {activeTab === 'team' && !isOwnerOrAdmin &&
        <div className="glass rounded-xl p-12 text-center text-muted-foreground text-sm">
            You don't have access to team management.
          </div>
        }
      </div>
    </div>);

}

// ── General ──────────────────────────────────────────────────────────────────
function GeneralTab({ user }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || null);
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || ''
  });
  const fileInputRef = React.useRef(null);

  const initials = user?.full_name ?
  user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() :
  user?.email?.[0]?.toUpperCase() || 'U';

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {alert('Photo must be under 5 MB.');return;}
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setAvatarUrl(file_url);
    await base44.auth.updateMe({ avatar_url: file_url });
    setUploadingPhoto(false);
  };

  const save = async () => {
    setSaving(true);
    await base44.auth.updateMe({ full_name: form.full_name });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="glass rounded-xl p-6 space-y-6 w-full">
      <h2 className="text-lg font-semibold">Profile Information</h2>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          {avatarUrl ?
          <img src={avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border border-border" /> :

          <div className="w-16 h-16 rounded-full bg-primary/20 border border-border flex items-center justify-center text-xl font-bold text-primary">
              {initials}
            </div>
          }
          {uploadingPhoto &&
          <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          }
        </div>
        <div>
          <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
          <p className="text-xs text-muted-foreground mb-2">{user?.role}</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
            {uploadingPhoto ? 'Uploading…' : 'Change Photo'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Full Name">
          <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          className="bg-secondary border-border" />
        </Field>
        <Field label="Email Address">
          <Input value={form.email} disabled className="bg-secondary border-border opacity-60 cursor-not-allowed" />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here.</p>
        </Field>
        <Field label="Role">
          <Input value={user?.role || '—'} disabled className="bg-secondary border-border opacity-60 cursor-not-allowed" />
        </Field>
      </div>
      <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </div>);

}

// ── Organization ─────────────────────────────────────────────────────────────
function OrganizationTab({ supabaseProfile }) {
  const [form, setForm] = useState({
    business_name: supabaseProfile?.business_name || '',
    industry: supabaseProfile?.industry || '',
    website: supabaseProfile?.website || '',
    phone: supabaseProfile?.phone || ''
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await base44.functions.invoke('supabaseProfileData', {
      action: 'updateBusinessProfile',
      data: form
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="glass rounded-xl p-6 space-y-6 w-full">
      <h2 className="text-lg font-semibold">Organization Profile</h2>
      <div className="space-y-4">
        <Field label="Business Name">
          <Input value={form.business_name} onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
          className="bg-secondary border-border" />
        </Field>
        <Field label="Industry">
          <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
          className="bg-secondary border-border" />
        </Field>
        <Field label="Website">
          <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          placeholder="https://" className="bg-secondary border-border" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="bg-secondary border-border" />
        </Field>
      </div>
      <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Changes'}
      </Button>
    </div>);

}

// ── Bookings ─────────────────────────────────────────────────────────────────
function BookingsTab() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('calendarService', { action: 'getBookings' });
      setBookings(res.data?.bookings || []);
    } catch {setBookings([]);}
    setLoading(false);
  };

  useEffect(() => {fetchBookings();}, []);

  const handleSyncGoogle = async (bookingId) => {
    setActionLoading(`sync-google-${bookingId}`);
    try {
      const res = await base44.functions.invoke('calendarService', { action: 'syncBookingToGoogle', data: { booking_id: bookingId } });
      if (res.data?.error === 'Google Calendar not connected') {
        alert('Please connect Google Calendar first in the Integrations tab.');
      } else if (res.data?.synced) {
        alert('Booking added to Google Calendar!');
      }
    } catch (e) {
      alert(e?.response?.data?.error || 'Sync failed');
    }
    setActionLoading(null);
  };

  const handleDownloadIcs = async (bookingId) => {
    setActionLoading(`ics-${bookingId}`);
    try {
      const res = await base44.functions.invoke('calendarService', { action: 'generateBookingIcs', data: { booking_id: bookingId } });
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'booking.ics';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setActionLoading(null);
  };

  const handleCancel = async (bookingId, hasCancelUrl) => {
    if (hasCancelUrl) {
      alert('Cancel/reschedule link unavailable. Please contact support.');
      return;
    }
    if (!confirm('Cancel this booking?')) return;
    setActionLoading(`cancel-${bookingId}`);
    try {
      await base44.functions.invoke('calendarService', { action: 'cancelBooking', data: { booking_id: bookingId } });
      fetchBookings();
    } catch {}
    setActionLoading(null);
  };

  const upcoming = bookings.filter((b) => b.status === 'scheduled' && new Date(b.booking_date) >= new Date());
  const past = bookings.filter((b) => b.status === 'completed' || new Date(b.booking_date) < new Date());
  const cancelled = bookings.filter((b) => b.status === 'cancelled');

  return (
    <div className="w-full max-w-none">
      <div className="glass rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">My Bookings</h2>
          <p className="text-xs text-muted-foreground mt-1">Upcoming and past strategy calls.</p>
        </div>

        {loading ?
        <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div> :
        bookings.length === 0 ?
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center space-y-3">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No bookings yet.</p>
            <a href="/strategy-call"><Button size="sm" className="text-xs">Request Strategy Call</Button></a>
          </div> :

        <div className="space-y-4">
            {/* Upcoming */}
            {upcoming.length > 0 &&
          <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Upcoming</p>
                <div className="space-y-2">
                  {upcoming.map((b) =>
              <BookingCard
                key={b.id}
                booking={b}
                actionLoading={actionLoading}
                onSyncGoogle={() => handleSyncGoogle(b.id)}
                onDownloadIcs={() => handleDownloadIcs(b.id)}
                onCancel={() => handleCancel(b.id, !!b.cancel_url)} />

              )}
                </div>
              </div>
          }

            {/* Past */}
            {past.length > 0 &&
          <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Past</p>
                <div className="space-y-2 opacity-70">
                  {past.map((b) =>
              <BookingCard
                key={b.id}
                booking={b}
                actionLoading={actionLoading}
                past />

              )}
                </div>
              </div>
          }

            {/* Cancelled */}
            {cancelled.length > 0 &&
          <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cancelled</p>
                <div className="space-y-2 opacity-50">
                  {cancelled.map((b) =>
              <div key={b.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                      <p className="text-xs line-through text-muted-foreground">{b.title}</p>
                    </div>
              )}
                </div>
              </div>
          }
          </div>
        }
      </div>

      {showAddModal &&
      <AddBookingModal
        onClose={() => setShowAddModal(false)}
        onSaved={() => {setShowAddModal(false);fetchBookings();}} />

      }
    </div>);

}

function BookingCard({ booking, actionLoading, onSyncGoogle, onDownloadIcs, onCancel, past }) {
  const dateStr = booking.booking_date ?
  new Date(booking.booking_date).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }) :
  '—';

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3.5 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{booking.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</p>
          {booking.description &&
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{booking.description}</p>
          }
          {booking.location &&
          <p className="text-[10px] text-primary mt-0.5 truncate">{booking.location}</p>
          }
        </div>
        <span className={`text-[9px] font-medium border rounded-full px-1.5 py-0.5 ${
        booking.status === 'scheduled' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
        booking.status === 'completed' ? 'border-primary/30 text-primary bg-primary/10' :
        'border-red-500/30 text-red-400 bg-red-500/10'}`
        }>
          {booking.status}
        </span>
      </div>

      {!past &&
      <div className="flex items-center gap-1.5 flex-wrap">
          <Button
          size="sm" variant="outline" className="text-[10px] h-6 px-2"
          onClick={onSyncGoogle}
          disabled={!!actionLoading}>
          
            <Calendar className="w-3 h-3 mr-1" />
            {actionLoading === `sync-google-${booking.id}` ? 'Syncing…' : 'Google'}
          </Button>
          <Button
          size="sm" variant="outline" className="text-[10px] h-6 px-2"
          onClick={onDownloadIcs}
          disabled={!!actionLoading}>
          
            <Download className="w-3 h-3 mr-1" />
            {actionLoading === `ics-${booking.id}` ? '…' : 'iCal/Outlook'}
          </Button>
          <Button
          size="sm" variant="outline" className="text-[10px] h-6 px-2"
          onClick={() => onDownloadIcs && onDownloadIcs()}
          disabled={!!actionLoading}>
          
            <Download className="w-3 h-3 mr-1" />
            Apple
          </Button>
          <div className="flex-1" />
          <Button
          size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-muted-foreground hover:text-red-400"
          onClick={onCancel}
          disabled={!!actionLoading}>
          
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
        </div>
      }
    </div>);

}

function AddBookingModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', description: '', booking_date: '', end_date: '',
    location: '', timezone: 'America/Phoenix'
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title || !form.booking_date) return;
    setSaving(true);
    try {
      await base44.functions.invoke('calendarService', {
        action: 'addBooking',
        data: {
          title: form.title,
          description: form.description,
          booking_date: new Date(form.booking_date).toISOString(),
          end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
          location: form.location
        }
      });
      onSaved();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save booking');
    }
    setSaving(false);
  };

  return (
    <div className="layer-panel fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Booking</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Title</label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Strategy Call with Advisor" className="bg-secondary border-border text-xs h-8" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Date & Time</label>
            <Input type="datetime-local" value={form.booking_date}
            onChange={(e) => setForm((f) => ({ ...f, booking_date: e.target.value }))}
            className="bg-secondary border-border text-xs h-8" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">End (optional)</label>
            <Input type="datetime-local" value={form.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            className="bg-secondary border-border text-xs h-8" />
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Location / Meeting Link</label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Zoom link or office address" className="bg-secondary border-border text-xs h-8" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="flex-1 text-xs" onClick={handleSave} disabled={saving || !form.title || !form.booking_date}>
            {saving ? 'Saving…' : 'Save Booking'}
          </Button>
        </div>
      </div>
    </div>);

}

// ── Security ─────────────────────────────────────────────────────────────────
function SecurityTab({ user }) {
  const [resetSent, setResetSent] = useState(false);
  const [sending, setSending] = useState(false);
  const handleLogout = () => base44.auth.logout('/login');

  const handlePasswordReset = async () => {
    setSending(true);
    try {
      await base44.auth.resetPasswordRequest(user?.email);
    } catch {}
    setSending(false);
    setResetSent(true);
  };

  return (
    <div className="w-full max-w-none">
      <div className="glass rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold">Account Security</h2>

        {/* Logged in as */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Logged in as</p>
          <p className="text-sm font-medium">{user?.email}</p>
          <p className="text-xs text-muted-foreground capitalize">Role: {user?.role || 'user'}</p>
        </div>

        {/* Password reset */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Password</p>
            <p className="text-xs text-muted-foreground mt-0.5">Send a password reset link to your email address.</p>
          </div>
          {resetSent ?
          <p className="text-xs text-emerald-400 font-medium">✓ Reset link sent — check your inbox.</p> :

          <Button size="sm" variant="outline" className="text-xs" onClick={handlePasswordReset} disabled={sending}>
              {sending ? 'Sending…' : 'Send Password Reset Email'}
            </Button>
          }
        </div>

        {/* Two-factor */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
          <p className="text-xs text-muted-foreground">Enhanced 2FA options coming in a future update.</p>
        </div>

        {/* Sign out */}
        <div className="pt-2 border-t border-border">
          <Button variant="destructive" onClick={handleLogout} size="sm">Sign Out of All Devices</Button>
        </div>
      </div>
    </div>);

}

// ── Integrations ─────────────────────────────────────────────────────────────
function IntegrationsTab() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('calendarService', { action: 'getConnections' });
      setConnections(res.data?.connections || []);
    } catch {setConnections([]);}
    setLoading(false);
  };

  useEffect(() => {fetchConnections();}, []);

  const handleConnect = async (provider) => {
    if (provider === 'google') {
      setActionLoading('google');
      try {
        const url = await base44.connectors.connectAppUser('6a2c49775072452eff268d30');
        const popup = window.open(url, '_blank');
        const timer = setInterval(() => {
          if (!popup || popup.closed) {
            clearInterval(timer);
            fetchConnections();
            setActionLoading(null);
          }
        }, 500);
      } catch {setActionLoading(null);}
    }
  };

  const handleDisconnect = async (provider) => {
    if (!confirm(`Disconnect ${provider === 'google' ? 'Google Calendar' : provider}? This will stop syncing.`)) return;
    setActionLoading(provider);
    try {
      await base44.functions.invoke('calendarService', { action: 'disconnectProvider', data: { provider } });
      fetchConnections();
    } catch {}
    setActionLoading(null);
  };

  const conn = (p) => connections.find((c) => c.provider === p);

  if (loading) {
    return (
      <div className="glass rounded-xl p-8 flex items-center justify-center max-w-lg">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  return (
    <div className="w-full max-w-none">
      <div className="glass rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-semibold">Calendar Integrations</h2>
        <p className="text-xs text-muted-foreground">
          Connect your calendar to sync bookings and sprint tasks directly to your schedule.
        </p>

        {/* Google Calendar */}
        <div className={`rounded-lg border p-4 ${conn('google')?.connected ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-secondary/30'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Google Calendar</p>
                <p className="text-[10px] text-muted-foreground">
                  {conn('google')?.connected ? `Connected — ${conn('google')?.calendar_name || 'Primary'}` : 'Not connected'}
                </p>
              </div>
            </div>
            {conn('google')?.connected ?
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleDisconnect('google')} disabled={actionLoading === 'google'}>
                {actionLoading === 'google' ? 'Disconnecting…' : 'Disconnect'}
              </Button> :

            <Button size="sm" className="text-xs h-7" onClick={() => handleConnect('google')} disabled={actionLoading === 'google'}>
                {actionLoading === 'google' ? 'Connecting…' : 'Connect'}
              </Button>
            }
          </div>
        </div>

        {/* Outlook */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Outlook Calendar</p>
                <p className="text-[10px] text-muted-foreground">Download .ics files for Outlook import</p>
              </div>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 border border-border rounded-full px-2 py-0.5">
              .ics Available
            </span>
          </div>
        </div>

        {/* Apple Calendar */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Apple Calendar / iCal</p>
                <p className="text-[10px] text-muted-foreground">Download .ics files — opens in Apple Calendar</p>
              </div>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground bg-secondary/50 border border-border rounded-full px-2 py-0.5">
              .ics Available
            </span>
          </div>
        </div>
      </div>
    </div>);

}

// ── Shared ────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>);

}