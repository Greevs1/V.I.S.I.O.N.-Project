import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, RefreshCw, Link2, Link2Off, CheckCircle2, AlertCircle, Clock, Loader2, ListChecks, Target } from 'lucide-react';
import { toast } from 'sonner';

const CONNECTOR_ID = '6a2c49775072452eff268d30';

export default function CalendarSync() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncTarget, setSyncTarget] = useState('roadmap'); // 'roadmap' | 'sprint'

  const fetchStatus = async () => {
    try {
      const res = await base44.functions.invoke('syncRoadmapToCalendar', {
        action: 'status',
        connector_id: CONNECTOR_ID,
      });
      setStatusData(res.data);
      setConnected(true);
    } catch {
      setConnected(false);
      setStatusData(null);
    }
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await fetchStatus();
      setLoading(false);
    });
  }, []);

  const handleConnect = async () => {
    const url = await base44.connectors.connectAppUser(CONNECTOR_ID);
    const popup = window.open(url, '_blank');
    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        fetchStatus();
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Calendar? All synced items will be removed from your calendar on next sync.')) return;
    await base44.connectors.disconnectAppUser(CONNECTOR_ID);
    setConnected(false);
    setStatusData(null);
    toast.success('Google Calendar disconnected');
  };

  const handleSync = async () => {
    setSyncing(true);
    const action = syncTarget === 'sprint' ? 'syncSprintTasks' : 'sync';
    const label = syncTarget === 'sprint' ? 'sprint task' : 'roadmap item';
    try {
      const res = await base44.functions.invoke('syncRoadmapToCalendar', {
        action,
        connector_id: CONNECTOR_ID,
      });
      const { synced, errors, message } = res.data;
      if (synced > 0) {
        toast.success(`Synced ${synced} ${label}${synced !== 1 ? 's' : ''} to your calendar`);
      } else if (message) {
        toast.info(message);
      }
      if (errors?.length > 0) {
        toast.error(`${errors.length} item(s) failed to sync`);
      }
      await fetchStatus();
    } catch (err) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Calendar className="w-10 h-10 text-primary mx-auto" />
            <p className="text-muted-foreground">Sign in to sync your items with Google Calendar.</p>
            <Button onClick={() => base44.auth.redirectToLogin()}>Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          Google Calendar Sync
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sync sprint milestones and tasks directly to your Google Calendar.
        </p>
      </div>

      {/* Connection Card */}
      <Card className={connected ? 'border-green-500/30 bg-green-500/5' : 'border-border'}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {connected ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
              )}
              {connected ? 'Calendar Connected' : 'Not Connected'}
            </CardTitle>
            <Badge variant={connected ? 'default' : 'secondary'} className={connected ? 'bg-green-500/20 text-green-400 border-green-500/30' : ''}>
              {connected ? 'Active' : 'Disconnected'}
            </Badge>
          </div>
          {connected && statusData?.calendar_name && (
            <CardDescription className="text-xs">
              Connected to: <span className="text-foreground font-medium">{statusData.calendar_name}</span>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {connected ? (
            <>
              {/* Sync Target Selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSyncTarget('roadmap')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    syncTarget === 'roadmap'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" /> Strategic Items
                </button>
                <button
                  onClick={() => setSyncTarget('sprint')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    syncTarget === 'sprint'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" /> Sprint Tasks
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Items with Due Dates
                  </p>
                  <p className="text-2xl font-bold">{statusData?.roadmap_items_with_due_dates ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Sync Target</p>
                  <p className="text-sm font-semibold text-primary">
                    {syncTarget === 'sprint' ? 'Sprint Tasks' : 'Strategic Items'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex-1"
                >
                  {syncing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" /> Sync {syncTarget === 'sprint' ? 'Sprint Tasks' : 'Strategic Items'} Now</>
                  )}
                </Button>
                <Button variant="outline" onClick={handleDisconnect}>
                  <Link2Off className="w-4 h-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect your Google Calendar to automatically push sprint milestones, task due dates, and strategic deadlines directly to your calendar.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Critical / High priority items appear in red</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Medium priority in yellow</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Low priority in green</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> 1-day reminder included on each event</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Syncs both Strategic items and 90-Day Sprint tasks</li>
              </ul>
              <Button onClick={handleConnect} className="w-full">
                <Link2 className="w-4 h-4 mr-2" />
                Connect Google Calendar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>• Only items with a due date are synced — dismissed and completed items are excluded.</p>
          <p>• Each sync updates existing calendar events or creates new ones — no duplicates.</p>
          <p>• Sprint tasks include title, description, priority, ease, impact, expected outcome, and status.</p>
          <p>• Strategic items include title, category, priority, estimated value, and status.</p>
          <p>• Your calendar data stays private — only you can see your synced events.</p>
        </CardContent>
      </Card>
    </div>
  );
}