import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, XCircle, TrendingUp, Clock, Target, Zap } from 'lucide-react';
import { toast } from 'sonner';

const difficultyColors = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeIcons = {
  data_review: <AlertCircle className="w-5 h-5" />,
  continue_sprint: <Target className="w-5 h-5" />,
  opportunity: <TrendingUp className="w-5 h-5" />,
  complete_assessment: <CheckCircle2 className="w-5 h-5" />,
  upload_documents: <Zap className="w-5 h-5" />,
  wait_for_analysis: <Clock className="w-5 h-5" />,
};

export default function NextBestAction() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: actions, isLoading, error } = useQuery({
    queryKey: ['nextBestActions'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getNextBestActions',
      });
      return res.data?.actions || [];
    },
    initialData: [],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const acceptMutation = useMutation({
    mutationFn: async (actionId) => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'acceptNextBestAction',
        action_id: actionId,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Action accepted! Check your sprint plan for next steps.');
      queryClient.invalidateQueries({ queryKey: ['nextBestActions'] });
      queryClient.invalidateQueries({ queryKey: ['sprintItems'] });
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (actionId) => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'dismissNextBestAction',
        action_id: actionId,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Action dismissed');
      queryClient.invalidateQueries({ queryKey: ['nextBestActions'] });
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const handleAccept = (actionId) => {
    if (confirm('Accept this recommendation? This will add it to your sprint plan.')) {
      acceptMutation.mutate(actionId);
    }
  };

  const handleDismiss = (actionId) => {
    if (confirm('Dismiss this recommendation? We won\'t suggest it again.')) {
      dismissMutation.mutate(actionId);
    }
  };

  // Show only primary action to owners
  const primaryAction = actions[0];

  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading recommendations...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm">Failed to load recommendations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!primaryAction) {
    return (
      <Card className="border-border">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Next Best Action</CardTitle>
          <CardDescription className="text-xs">
            Personalized recommendations for your business
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No actions available right now</p>
            <p className="text-xs mt-1">Complete assessments or upload documents to get recommendations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5">
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {typeIcons[primaryAction.action_type] || <TrendingUp className="w-5 h-5" />}
            </div>
            <div>
              <CardTitle className="text-base">{primaryAction.title}</CardTitle>
              <CardDescription className="text-xs">
                {primaryAction.reason}
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30">
            Priority: {primaryAction.priority_score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{primaryAction.description}</p>

        <div className="grid grid-cols-3 gap-4">
          {primaryAction.estimated_impact && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Estimated Impact</p>
              <p className="text-sm font-semibold">
                ${Math.round(primaryAction.estimated_impact / 1000)}K
              </p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Expected Time</p>
            <p className="text-sm font-semibold">
              {primaryAction.expected_time_days} {primaryAction.expected_time_days === 1 ? 'day' : 'days'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Difficulty</p>
            <Badge className={difficultyColors[primaryAction.difficulty_level] || difficultyColors.medium}>
              {primaryAction.difficulty_level}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            onClick={() => handleAccept(primaryAction.id)}
            disabled={acceptMutation.isPending || dismissMutation.isPending}
            className="flex-1"
            size="sm"
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Accept
          </Button>
          <Button
            onClick={() => handleDismiss(primaryAction.id)}
            disabled={acceptMutation.isPending || dismissMutation.isPending}
            variant="outline"
            size="sm"
          >
            <XCircle className="w-4 h-4 mr-1" />
            Dismiss
          </Button>
          <Button
            onClick={() => setExpanded(!expanded)}
            variant="ghost"
            size="sm"
          >
            Details
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs space-y-2">
            <p><strong>Category:</strong> {primaryAction.category}</p>
            <p><strong>Source:</strong> {primaryAction.source}</p>
            {primaryAction.due_date && (
              <p><strong>Due Date:</strong> {new Date(primaryAction.due_date).toLocaleDateString()}</p>
            )}
            {primaryAction.metadata && (
              <pre className="mt-2 p-2 bg-background rounded overflow-auto text-[10px]">
                {JSON.stringify(primaryAction.metadata, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}