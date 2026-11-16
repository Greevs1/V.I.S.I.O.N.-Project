import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, XCircle, TrendingUp, Clock, Target, Zap, RefreshCw, Link2 } from 'lucide-react';
import { toast } from 'sonner';

const difficultyColors = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const statusColors = {
  recommended: 'bg-primary/20 text-primary border-primary/30',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  dismissed: 'bg-muted/20 text-muted-foreground border-muted/30',
};

const typeIcons = {
  data_review: <AlertCircle className="w-4 h-4" />,
  continue_roadmap: <Target className="w-4 h-4" />,
  opportunity: <TrendingUp className="w-4 h-4" />,
  complete_assessment: <CheckCircle2 className="w-4 h-4" />,
  upload_documents: <Zap className="w-4 h-4" />,
  wait_for_analysis: <Clock className="w-4 h-4" />,
};

export default function NextBestActionsAdvisor() {
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState(null);

  const { data: actions, isLoading, error, refetch } = useQuery({
    queryKey: ['nextBestActionsAdvisor'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getAllNextBestActions',
      });
      return res.data?.actions || [];
    },
    initialData: [],
  });

  const resetMutation = useMutation({
    mutationFn: async (actionId) => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'resetNextBestAction',
        data: { action_id: actionId },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Action reset to recommended');
      queryClient.invalidateQueries({ queryKey: ['nextBestActionsAdvisor'] });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const handleReset = (actionId) => {
    if (confirm('Reset this action to recommended status?')) {
      resetMutation.mutate(actionId);
    }
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
        <p className="font-medium">Failed to load actions</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No Recommended Actions</h3>
        <p className="text-sm text-muted-foreground">
          Complete assessments or upload documents to generate recommendations
        </p>
      </div>
    );
  }

  // Group by status
  const recommended = actions.filter(a => a.status === 'recommended' || a.status === 'in_progress');
  const accepted = actions.filter(a => a.status === 'accepted');
  const dismissed = actions.filter(a => a.status === 'dismissed');
  const completed = actions.filter(a => a.status === 'completed');

  const ActionCard = ({ action, isTop }) => (
    <Card className={`border-border ${isTop ? 'border-primary/30 bg-primary/5' : ''}`}>
      <CardHeader className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {typeIcons[action.action_type] || <TrendingUp className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                {isTop && (
                  <Badge className="bg-primary text-primary-foreground text-xs">Top</Badge>
                )}
                <Badge className={statusColors[action.status] || statusColors.recommended}>
                  {action.status.replace(/_/g, ' ')}
                </Badge>
                <Badge className={difficultyColors[action.difficulty_level] || difficultyColors.medium}>
                  {action.difficulty_level}
                </Badge>
                {action.metadata?.roadmap_item_id && (
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Sprint Linked
                  </Badge>
                )}
              </div>
              <CardTitle className="text-base">{action.title}</CardTitle>
              <CardDescription className="text-xs mt-1">{action.reason}</CardDescription>
            </div>
          </div>
          <div className="text-right shrink-0 ml-2">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className={`text-2xl font-bold ${
              action.priority_score >= 80 ? 'text-green-400' :
              action.priority_score >= 60 ? 'text-yellow-400' : 'text-muted-foreground'
            }`}>
              {action.priority_score}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{action.description}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {action.estimated_impact && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Est. Impact</p>
              <p className="text-sm font-semibold">${Math.round(action.estimated_impact / 1000)}K</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Time</p>
            <p className="text-sm font-semibold">{action.expected_time_days}d</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Category</p>
            <p className="text-sm font-medium capitalize">{action.category}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Source</p>
            <p className="text-sm font-medium">{action.source}</p>
          </div>
        </div>

        {action.metadata?.roadmap_item_id && (
          <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
            <span className="font-semibold">Sprint Item:</span> {action.metadata.roadmap_item_id}
          </div>
        )}

        {action.status === 'dismissed' && (
          <div className="flex justify-end pt-2 border-t border-border">
            <Button
              onClick={() => handleReset(action.id)}
              disabled={resetMutation.isPending}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reset to Recommended
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const Section = ({ title, items, emptyMsg }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <Badge variant="outline" className="text-xs">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-1">{emptyMsg}</p>
      ) : (
        items.map((a, i) => <ActionCard key={a.id} action={a} isTop={title === 'Recommended' && i === 0} />)
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Next Best Actions</h2>
          <p className="text-sm text-muted-foreground">All actions — accepted, dismissed, and sprint-linked</p>
        </div>
        <Badge variant="outline">{actions.length} total</Badge>
      </div>

      <Section title="Recommended" items={recommended} emptyMsg="No active recommendations." />
      <Section title="Accepted (Sprint)" items={accepted} emptyMsg="No accepted actions yet." />
      <Section title="Completed" items={completed} emptyMsg="No completed actions." />
      <Section title="Dismissed" items={dismissed} emptyMsg="No dismissed actions." />
    </div>
  );
}