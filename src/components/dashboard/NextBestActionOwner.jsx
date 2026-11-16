import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, CheckCircle2, XCircle, Clock, AlertCircle,
  ArrowRight, Target, DollarSign, Calendar, ChevronRight, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useBusinessContext } from '@/lib/BusinessContext';
import { fetchNbaRecommendations } from '@/lib/nbaRecommendations';

const difficultyColors = {
  easy: 'bg-green-500/20 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hard: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeIcons = {
  opportunity: <Target className="w-5 h-5" />,
  data_review: <AlertCircle className="w-5 h-5" />,
  continue_sprint: <Clock className="w-5 h-5" />,
  complete_assessment: <CheckCircle2 className="w-5 h-5" />,
  upload_documents: <DollarSign className="w-5 h-5" />,
  wait_for_analysis: <Clock className="w-5 h-5" />,
};

export default function NextBestActionOwner({ isPaid = true }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const { context, bisVersion } = useBusinessContext();
  const activeBusinessId = context.active_business_id;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['nextBestActionOwner', activeBusinessId, bisVersion],
    queryFn: async () => {
      if (!activeBusinessId) return { fallback: 'onboarding_required', primary: null };
      // Step 1: Try DB-only (fast path — no BIE build needed)
      let res = await base44.functions.invoke('supabaseUserData', {
        action: 'getNextBestAction',
        data: { business_id: activeBusinessId },
      });
      // Step 2: DB empty → build canonical BIE recommendations and generate
      if (!res.data?.primary && res.data?.reason === 'no_actions') {
        const recommendations = await fetchNbaRecommendations(activeBusinessId);
        if (recommendations.length === 0) return { primary: null, secondaries: [], reason: 'no_recommendations' };
        res = await base44.functions.invoke('supabaseUserData', {
          action: 'getNextBestAction',
          data: { business_id: activeBusinessId, recommendations, canonical_version: 1 },
        });
      }
      return res.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const acceptMutation = useMutation({
    mutationFn: async (actionId) => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'acceptNextBestAction',
        data: { action_id: actionId },
      });
      return res.data;
    },
    onSuccess: (result) => {
      const sprintLinked = result?.roadmap_linked;
      toast.success(sprintLinked
        ? 'Action accepted and added to your sprint plan!'
        : 'Action accepted! Track progress in your sprint plan.'
      );
      queryClient.invalidateQueries({ queryKey: ['nextBestActionOwner'] });
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
        data: { action_id: actionId },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Action dismissed. We won\'t recommend this again.');
      queryClient.invalidateQueries({ queryKey: ['nextBestActionOwner'] });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  const handleAccept = () => {
    if (data?.primary) {
      acceptMutation.mutate(data.primary.id);
    }
  };

  const handleDismiss = () => {
    if (data?.primary && confirm('Dismiss this recommendation?')) {
      dismissMutation.mutate(data.primary.id);
    }
  };

  // Handle fallback cases
  if (data?.fallback === 'onboarding_required') {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="py-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Get Started
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Complete your onboarding to receive personalized recommendations.
          </p>
          <Button className="w-full">
            Complete Onboarding
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="py-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <CardTitle className="text-lg">Generating Recommendations...</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Analyzing your business data to find the best next step
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.primary) {
    return (
      <Card className="border-border">
        <CardHeader className="py-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-muted-foreground" />
            No Recommendations Yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {error?.message || 'Complete assessments or upload financial documents to get started.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const action = data.primary;
  const secondaryActions = data.secondaries || [];
  const hiddenCount = isPaid ? 0 : secondaryActions.length;

  return (
    <div className="space-y-2">
    <Card className={`border-primary/30 bg-gradient-to-br from-primary/5 to-transparent`}>
      <CardHeader className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              {typeIcons[action.action_type] || <TrendingUp className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-primary text-primary-foreground text-xs">
                  Next Best Action
                </Badge>
                <Badge className={difficultyColors[action.difficulty_level] || difficultyColors.medium}>
                  {action.difficulty_level}
                </Badge>
              </div>
              <CardTitle className="text-lg">{action.title}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {action.reason}
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Priority</p>
            <p className={`text-2xl font-bold ${
              action.priority_score >= 80 ? 'text-green-400' :
              action.priority_score >= 60 ? 'text-yellow-400' : 'text-muted-foreground'
            }`}>
              {action.priority_score}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{action.description}</p>

        <div className="grid grid-cols-2 gap-3">
          {action.estimated_impact && (
            <div className="p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3 h-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Est. Impact</p>
              </div>
              <p className="text-lg font-bold">
                ${Math.round(action.estimated_impact / 1000)}K
              </p>
            </div>
          )}
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Expected Time</p>
            </div>
            <p className="text-lg font-bold">{action.expected_time_days} days</p>
          </div>
        </div>

        {showDetails && action.metadata && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-2">
            <p className="font-semibold">Details:</p>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <p>Category: <span className="text-foreground capitalize">{action.category}</span></p>
              <p>Source: <span className="text-foreground">{action.source}</span></p>
              {action.metadata.confidence_score && (
                <p>Confidence: <span className="text-foreground">{Math.round(action.metadata.confidence_score)}%</span></p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border">
          <Button 
            onClick={handleAccept} 
            disabled={acceptMutation.isPending}
            className="flex-1"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {acceptMutation.isPending ? 'Accepting...' : 'Accept'}
          </Button>
          <Button 
            onClick={handleDismiss} 
            disabled={dismissMutation.isPending}
            variant="outline"
          >
            <XCircle className="w-4 h-4 mr-2" />
            {dismissMutation.isPending ? 'Dismissing...' : 'Dismiss'}
          </Button>
        </div>

        <Button
          onClick={() => setShowDetails(!showDetails)}
          variant="ghost"
          size="sm"
          className="w-full text-xs"
        >
          <ChevronRight className={`w-3 h-3 mr-1 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
          {showDetails ? 'Hide' : 'View'} Details
        </Button>
      </CardContent>
    </Card>
    {!isPaid && hiddenCount > 0 && (
      <div className="p-3 rounded-xl border border-border bg-secondary/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5 text-primary" />
          <span>{hiddenCount} more recommendation{hiddenCount > 1 ? 's' : ''} available for members</span>
        </div>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate('/strategy-call')}>Upgrade</Button>
      </div>
    )}
    </div>
  );
}