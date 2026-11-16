import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const assessmentData = [
  { name: 'Profit Gap', completed: 12 },
  { name: 'Value Gap', completed: 9 },
  { name: 'Tax Gap', completed: 11 },
  { name: 'Ops Gap', completed: 7 },
  { name: 'Freedom', completed: 5 },
  { name: 'Recast', completed: 8 },
];

const activityData = [
  { day: 'Mon', logins: 4, assessments: 2 },
  { day: 'Tue', logins: 7, assessments: 5 },
  { day: 'Wed', logins: 5, assessments: 3 },
  { day: 'Thu', logins: 9, assessments: 6 },
  { day: 'Fri', logins: 6, assessments: 4 },
  { day: 'Sat', logins: 2, assessments: 1 },
  { day: 'Sun', logins: 3, assessments: 2 },
];

const STAT_CARDS = [
  { label: 'Total Users', value: '24', change: '+3 this week', color: '#D4A853' },
  { label: 'Active Clients', value: '18', change: '+1 today', color: '#00D4FF' },
  { label: 'Assessments Completed', value: '52', change: '+7 this week', color: '#a855f7' },
  { label: 'Avg IQ™ Score', value: '61', change: '↑ 4pts vs last month', color: '#22c55e' },
];

export default function AdminAnalytics() {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{s.label}</p>
            <p className="text-3xl font-display font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.change}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Assessments Completed</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={assessmentData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="completed" fill="#D4A853" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Weekly Platform Activity</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="logins" stroke="#D4A853" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="assessments" stroke="#00D4FF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}