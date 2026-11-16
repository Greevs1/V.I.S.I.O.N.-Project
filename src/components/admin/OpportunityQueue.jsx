import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, CheckCircle2, Clock, AlertCircle, 
  DollarSign, Target, Calendar, ChevronRight,
  RefreshCw, Filter
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const categoryColors = {
  tax: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  profit: 'bg-green-500/20 text-green-400 border-green-500/30',
  value: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  operations: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  cash_flow: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  protection: 'bg-red-500/20 text-red-400 border-red-500/30',
  wealth: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  debt: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  growth: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const priorityColors = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-green-500/20 text-green-400',
};

const getPriorityLevel = (score) => {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
};

const formatCurrency = (value) => {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
};

export default function OpportunityQueue({ userEmail } = {}) {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const { data: opportunities, isLoading, error, refetch } = useQuery({
    queryKey: ['businessOpportunities', userEmail],
    queryFn: async () => {
      const payload = { action: 'getBusinessOpportunities' };
      if (userEmail) payload._router_user_email = userEmail;
      const res = await base44.functions.invoke('supabaseOpportunityData', payload);
      return res.data?.opportunities || [];
    },
    initialData: [],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const payload = userEmail ? { _router_user_email: userEmail } : {};
      const res = await base44.functions.invoke('generateOpportunities', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessOpportunities', userEmail] });
      refetch();
    },
  });

  const filteredOpportunities = opportunities.filter(opp => {
    const categoryMatch = categoryFilter === 'all' || opp.category === categoryFilter;
    const priorityMatch = priorityFilter === 'all' || getPriorityLevel(opp.priority_score) === priorityFilter;
    return categoryMatch && priorityMatch;
  });

  const stats = {
    total: opportunities.length,
    high: opportunities.filter(o => o.priority_score >= 75).length,
    medium: opportunities.filter(o => o.priority_score >= 50 && o.priority_score < 75).length,
    low: opportunities.filter(o => o.priority_score < 50).length,
    totalImpact: opportunities.reduce((sum, o) => sum + (o.estimated_impact || 0), 0),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        <p className="font-medium">Failed to load opportunities</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Opportunity Queue</h2>
          <p className="text-sm text-muted-foreground">
            AI-generated opportunities from business intelligence
          </p>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
          {generateMutation.isPending ? 'Generating...' : 'Generate Opportunities'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{stats.high}</p>
              <p className="text-xs text-muted-foreground">High Priority</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{stats.medium}</p>
              <p className="text-xs text-muted-foreground">Medium</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{stats.low}</p>
              <p className="text-xs text-muted-foreground">Low</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{formatCurrency(stats.totalImpact)}</p>
              <p className="text-xs text-muted-foreground">Total Impact</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="tax">Tax</SelectItem>
              <SelectItem value="profit">Profit</SelectItem>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="operations">Operations</SelectItem>
              <SelectItem value="cash_flow">Cash Flow</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="high">High (75+)</SelectItem>
            <SelectItem value="medium">Medium (50-74)</SelectItem>
            <SelectItem value="low">Low (&lt;50)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Opportunities List */}
      {filteredOpportunities.length === 0 ? (
        <div className="text-center py-12">
          <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Opportunities Found</h3>
          <p className="text-sm text-muted-foreground">
            Click "Generate Opportunities" to analyze business data
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOpportunities.map((opp) => (
            <Card key={opp.id} className="border-border/50 hover:border-primary/50 transition-colors">
              <CardHeader className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${categoryColors[opp.category]}`}>
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{opp.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={categoryColors[opp.category]} variant="outline">
                          {opp.category}
                        </Badge>
                        <Badge className={priorityColors[getPriorityLevel(opp.priority_score)]}>
                          Priority: {opp.priority_score}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {opp.source?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">{opp.description}</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Estimated Impact</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-primary" />
                      {formatCurrency(opp.estimated_impact)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Monthly Impact</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(opp.estimated_monthly_impact)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                    <p className="text-sm font-semibold">{opp.confidence_score}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Implementation</p>
                    <p className="text-sm font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {opp.implementation_time_days} days
                    </p>
                  </div>
                </div>

                {opp.estimated_value_creation || opp.estimated_tax_savings || opp.estimated_profit_improvement ? (
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                    {opp.estimated_value_creation ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Value Creation</p>
                        <p className="text-sm font-semibold text-purple-400">
                          {formatCurrency(opp.estimated_value_creation)}
                        </p>
                      </div>
                    ) : null}
                    {opp.estimated_tax_savings ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Tax Savings</p>
                        <p className="text-sm font-semibold text-blue-400">
                          {formatCurrency(opp.estimated_tax_savings)}
                        </p>
                      </div>
                    ) : null}
                    {opp.estimated_profit_improvement ? (
                      <div>
                        <p className="text-xs text-muted-foreground">Profit Improvement</p>
                        <p className="text-sm font-semibold text-green-400">
                          {formatCurrency(opp.estimated_profit_improvement)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}