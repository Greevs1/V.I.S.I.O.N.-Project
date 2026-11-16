import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from 'recharts';

/**
 * Accepts either:
 *  - legacy `data` prop: array of { date, score } (historical data from dashboard_metrics)
 *  - new `snapshots` prop: array of { snapshot_date, metric_value } from business_metric_snapshots
 * IMPORTANT: Parent component must ensure at least 3 data points before rendering this component.
 */
export default function HistoricalChart({ data, snapshots }) {
  // Build chart data from real data only - no fallback to dummy data
  let chartData = [];
  if (snapshots && snapshots.length > 0) {
    chartData = snapshots.map(s => ({
      date: new Date(s.snapshot_date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      score: Math.round(s.metric_value),
    }));
    // Deduplicate by date (keep last per date)
    const seen = new Map();
    for (const row of chartData) seen.set(row.date, row);
    chartData = Array.from(seen.values());
  } else if (data && data.length > 0) {
    chartData = data;
  }
  const isRealData = chartData && chartData.length > 0;
  // Don't render chart with insufficient data - parent should handle this check
  if (!isRealData || chartData.length < 3) {
    return null;
  }

  return (
    <div className="glass rounded-xl p-6">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="iqGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(43, 70%, 58%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(43, 70%, 58%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              tick={{ fill: 'hsl(0, 0%, 55%)', fontSize: 11 }} 
              axisLine={false} 
              tickLine={false} 
            />
            <YAxis 
              tick={{ fill: 'hsl(0, 0%, 55%)', fontSize: 11 }} 
              axisLine={false} 
              tickLine={false}
              domain={[0, 100]}
            />
            <Tooltip 
              contentStyle={{ 
                background: 'hsl(0, 0%, 8%)', 
                border: '1px solid hsl(0, 0%, 16%)',
                borderRadius: '8px',
                fontSize: '12px'
              }} 
            />
            <Area 
              type="monotone" 
              dataKey="score" 
              stroke="hsl(43, 70%, 58%)" 
              strokeWidth={2}
              fill="url(#iqGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}