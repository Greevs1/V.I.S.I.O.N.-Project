import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Send, Loader2, Clock, CheckCircle, ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BookingModal from '@/components/sprint/BookingModal';
import { useAuth } from '@/lib/AuthContext';
import { useMembership } from '@/lib/useMembership';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

const INQUIRY_TYPES = [
  'Tax Strategy', 'Value Growth', 'Profit Improvement', 'Operations',
  'Cash Flow', 'Protection', 'Wealth', 'Sprint Assistance',
  'Platform Support', 'Expert Network', 'Other',
];

const STATUS_CONFIG = {
  pending:      { label: 'Pending',      color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  in_progress:  { label: 'In Progress',  color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  resolved:     { label: 'Resolved',     color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  closed:       { label: 'Closed',       color: 'bg-secondary text-muted-foreground border-border' },
};

export default function Support() {
  const { user, supabaseProfile, isAuthenticated } = useAuth();
  const { isPaid } = useMembership();
  const [activeTab, setActiveTab] = useState('message');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    company: '', inquiry_type: 'Platform Support', message: '',
  });

  // Auto-fill from user profile
  useEffect(() => {
    if (!user) return;
    const fullName = user.full_name || supabaseProfile?.full_name || '';
    const parts = fullName.trim().split(' ');
    setForm(f => ({
      ...f,
      first_name: f.first_name || parts[0] || '',
      last_name:  f.last_name  || parts.slice(1).join(' ') || '',
      email:      f.email      || user.email || supabaseProfile?.email || '',
      phone:      f.phone      || supabaseProfile?.phone || '',
      company:    f.company    || supabaseProfile?.company || '',
    }));
  }, [user, supabaseProfile]);

  // Fetch recent requests for logged-in users
  const { data: recentRequests = [] } = useQuery({
    queryKey: ['concierge-requests', user?.id],
    queryFn: async () => {
      const all = await base44.entities.DocumentRequest.filter(
        { requested_for_profile_id: user?.id },
        '-created_date', 10
      );
      return all;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSend = async () => {
    if (!form.message.trim() || !form.email.trim()) return;
    setSending(true);
    // Use existing email integration
    await base44.integrations.Core.SendEmail({
      to: 'support@visionplatform.com',
      subject: `[Concierge] ${form.inquiry_type} — ${form.first_name} ${form.last_name}`,
      body: `Name: ${form.first_name} ${form.last_name}\nEmail: ${form.email}\nPhone: ${form.phone}\nCompany: ${form.company}\nInquiry Type: ${form.inquiry_type}\n\nMessage:\n${form.message}`,
    }).catch(() => {});
    setSending(false);
    setSubmitted(true);
  };

  const InputField = ({ label, value, onChange, placeholder, type = 'text' }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full mt-1 h-10 bg-secondary border border-border rounded-xl px-3 text-sm outline-none focus:border-primary/50 transition-colors" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="text-center space-y-2 pt-4">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary uppercase">V.I.S.I.O.N. Platform</p>
        <h1 className="text-4xl font-display font-bold">Concierge</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Need help implementing, planning, or making a decision?<br />
          Our team is here to help.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border border-border rounded-xl p-1 bg-secondary mx-auto w-fit">
        {[
          { id: 'message',  label: 'Send Message',         icon: MessageSquare },
          { id: 'schedule', label: 'Schedule Strategy Call', icon: Calendar },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Send Message ── */}
      {activeTab === 'message' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          {submitted ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-lg font-semibold">Message Sent</p>
              <p className="text-sm text-muted-foreground">Our team will respond within 1–2 business days.</p>
              <Button variant="outline" size="sm" onClick={() => setSubmitted(false)}>Send Another</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="First Name" value={form.first_name} onChange={set('first_name')} placeholder="Jane" />
                <InputField label="Last Name" value={form.last_name} onChange={set('last_name')} placeholder="Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Email *" value={form.email} onChange={set('email')} placeholder="jane@company.com" type="email" />
                <InputField label="Phone" value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" />
              </div>
              <InputField label="Company" value={form.company} onChange={set('company')} placeholder="Your business name" />
              <div>
                <label className="text-xs font-medium text-muted-foreground">Inquiry Type</label>
                <select value={form.inquiry_type} onChange={set('inquiry_type')}
                  className="w-full mt-1 h-10 bg-secondary border border-border rounded-xl px-3 text-sm outline-none focus:border-primary/50 transition-colors">
                  {INQUIRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Message *</label>
                <textarea value={form.message} onChange={set('message')}
                  placeholder="Describe what you need help with…"
                  rows={5}
                  className="w-full mt-1 bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors resize-none" />
              </div>
              <Button onClick={handleSend} disabled={sending || !form.message.trim() || !form.email.trim()}
                className="w-full h-11 text-sm font-semibold gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Send Message'}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Schedule Advisory Call ── */}
      {activeTab === 'schedule' && (
        <div className="glass rounded-2xl p-8 text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
            <Calendar className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-display font-bold">Schedule Strategy Call</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Book a 30-minute call with our team to get help with strategy,
              implementation, or next steps.
            </p>
          </div>
          <Button size="lg" onClick={() => setBookingOpen(true)} className="gap-2 px-8 font-semibold">
            <Calendar className="w-4 h-4" /> Book Call
          </Button>
          <p className="text-xs text-muted-foreground">Typically available within 1–3 business days</p>
        </div>
      )}

      {/* ── Recent Requests ── */}
      {isAuthenticated && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Requests</p>
          {recentRequests.length === 0 ? (
            <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">
              No recent requests yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentRequests.map(req => {
                const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                return (
                  <div key={req.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{req.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {req.created_date ? format(new Date(req.created_date), 'MMM d, yyyy') : '—'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium border rounded-full px-2.5 py-0.5 shrink-0 ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Expert Network CTA ── */}
      {isPaid ? (
        <div className="glass-gold rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Need specialized help?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Connect with vetted experts matched to your needs.</p>
          </div>
          <Link to="/expert-network">
            <Button size="sm" className="gap-2 shrink-0">
              <Users className="w-3.5 h-3.5" /> Find an Expert
            </Button>
          </Link>
        </div>
      ) : (
        <div className="glass rounded-2xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Want help choosing the right next step?</p>
          <p className="text-xs text-muted-foreground">Schedule a strategy call with our team.</p>
          <Button variant="outline" size="sm" onClick={() => { setActiveTab('schedule'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="gap-2">
            <Calendar className="w-3.5 h-3.5" /> Schedule a Strategy Call
          </Button>
        </div>
      )}

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}