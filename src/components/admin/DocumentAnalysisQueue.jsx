import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { FileText, Clock, CheckCircle, AlertCircle, RefreshCw, Eye, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

export default function DocumentAnalysisQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['documentAnalysisQueue'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', { 
        action: 'getDocumentAnalysisQueue' 
      });
      return res.data?.documents || [];
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ documentId, newStatus }) => {
      const res = await base44.functions.invoke('updateDocumentAnalysisStatus', {
        document_id: documentId,
        status: newStatus
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documentAnalysisQueue'] });
      toast.success('Document status updated');
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    }
  });

  const runExtractionMutation = useMutation({
    mutationFn: async ({ documentAnalysisId }) => {
      const res = await base44.functions.invoke('runDocumentExtraction', {
        documentAnalysisId
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documentAnalysisQueue'] });
      queryClient.invalidateQueries({ queryKey: ['extractedFieldsReviewQueue'] });
      toast.success(`Extraction complete: ${data.extractedFieldsCount} fields extracted (${data.averageConfidence}% avg confidence)`);
    },
    onError: (error) => {
      toast.error(`Extraction failed: ${error.message}`);
    }
  });

  const statusColors = {
    queued: 'bg-blue-500/20 text-blue-400',
    analyzing: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
    needs_review: 'bg-orange-500/20 text-orange-400',
    pending_analysis: 'bg-purple-500/20 text-purple-400',
  };

  const statusIcons = {
    queued: <Clock className="w-3 h-3" />,
    analyzing: <RefreshCw className="w-3 h-3 animate-spin" />,
    completed: <CheckCircle className="w-3 h-3" />,
    failed: <AlertCircle className="w-3 h-3" />,
    needs_review: <Eye className="w-3 h-3" />,
    pending_analysis: <Clock className="w-3 h-3" />,
  };

  const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold">Document Analysis Queue</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage documents awaiting analysis and review
        </p>
      </div>

      {!queueData || queueData.length === 0 ? (
        <Card className="glass">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No documents in queue</h3>
            <p className="text-sm text-muted-foreground">
              Documents uploaded by users will appear here for analysis
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {queueData.length} document{queueData.length !== 1 ? 's' : ''} in queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="w-[250px]">Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueData.map((doc) => (
                  <TableRow key={doc.id} className="border-border/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span>{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {doc.document_type?.replace(/_/g, ' ') || 'other'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.business_name || 'My Business'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(doc.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[doc.upload_status] || statusColors.queued}>
                        {statusIcons[doc.upload_status]}
                        <span className="ml-1.5 capitalize">{doc.upload_status?.replace(/_/g, ' ') || 'queued'}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {(doc.upload_status === 'queued' || doc.upload_status === 'pending_analysis') && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => runExtractionMutation.mutate({ 
                              documentAnalysisId: doc.analysis_id 
                            })}
                            disabled={runExtractionMutation.isPending}
                          >
                            <Wand2 className="w-3 h-3 mr-1.5" />
                            Run Extraction
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ 
                            documentId: doc.id, 
                            newStatus: 'needs_review' 
                          })}
                        >
                          Needs Review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ 
                            documentId: doc.id, 
                            newStatus: 'completed' 
                          })}
                        >
                          Mark Completed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ 
                            documentId: doc.id, 
                            newStatus: 'queued' 
                          })}
                        >
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}