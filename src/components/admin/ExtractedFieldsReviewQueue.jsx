import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  CheckCircle2, XCircle, AlertCircle, Edit3, Clock, 
  Save, X, FileBox, PlusCircle, Check, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { useOpenDocument } from '@/lib/visionWorkspace/openDocument';
import ExplainWithGalileo from '@/components/galileo/explain/ExplainWithGalileo';
import { termForDocumentField } from '@/lib/galileo/glossary';
import { CONTRACT_QUERY_KEY } from '@/hooks/useBusinessIntelligenceContract';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import LearnConfirmation from '@/components/dataroom/LearnConfirmation';

const statusColors = {
  pending_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  corrected: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  needs_clarification: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

const statusIcons = {
  pending_review: <Clock className="w-3 h-3" />,
  accepted: <CheckCircle2 className="w-3 h-3" />,
  corrected: <Edit3 className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
  needs_clarification: <AlertCircle className="w-3 h-3" />,
};

/**
 * One extracted fact, stated the way the owner needs to judge it:
 * field · value · period · source · confidence, then accept / correct / reject.
 *
 * The source is a link into the EXISTING document viewer through the one document
 * opening contract — confirming a number means being able to see where it came
 * from without leaving the flow.
 */
function FieldReviewCard({ field, onSave, onCancel }) {
  const openDocument = useOpenDocument();
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [acceptedValue, setAcceptedValue] = useState(field.accepted_value || field.field_value || '');
  const [acceptedNormalizedValue, setAcceptedNormalizedValue] = useState(
    field.accepted_normalized_value ?? field.normalized_value ?? ''
  );
  const [notes, setNotes] = useState(field.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const confidenceColor = (score) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  // The period the value belongs to. Taken from the extraction metadata, falling
  // back to the document's own year — stated only when it is actually known.
  const period = field.metadata?.fiscal_year
    ? `FY ${field.metadata.fiscal_year}`
    : field.document_year
      ? `FY ${field.document_year}`
      : field.metadata?.period_end
        ? `As of ${new Date(field.metadata.period_end).toLocaleDateString()}`
        : '—';

  const toNormalized = (raw) => {
    if (raw === '' || raw === null || raw === undefined) return null;
    return isNaN(Number(raw)) ? raw : Number(raw);
  };

  const save = async (payload) => {
    setIsSaving(true);
    try {
      await onSave({ fieldId: field.id, notes: payload.notes ?? (notes || null), ...payload });
      onCancel();
    } catch (error) {
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAccept = () => save({
    reviewStatus: 'accepted',
    acceptedValue: field.field_value,
    acceptedNormalizedValue: toNormalized(field.normalized_value),
  });

  const handleCorrect = () => {
    if (!String(acceptedValue).trim()) {
      toast.error('Enter the corrected value');
      return;
    }
    save({
      reviewStatus: 'corrected',
      acceptedValue,
      acceptedNormalizedValue: toNormalized(acceptedNormalizedValue),
    });
  };

  const handleReject = () => save({ reviewStatus: 'rejected' });

  const handleClarify = () => {
    if (!notes.trim()) {
      toast.error('Notes are required for "Needs clarification"');
      return;
    }
    save({ reviewStatus: 'needs_clarification', notes });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              {/* Accounting language straight out of the document, explained where
                  it is shown. The original document is untouched (§27), and the
                  figure being reviewed sits in the same card, so understanding and
                  proof stay together (§29). */}
              <p className="text-sm font-semibold">
                {termForDocumentField(field.field_label) ? (
                  <ExplainWithGalileo
                    term={termForDocumentField(field.field_label).id}
                    surface="document_review"
                    businessValue={field.accepted_value || field.field_value || null}
                  >
                    {field.field_label}
                  </ExplainWithGalileo>
                ) : (
                  field.field_label
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {field.document_name} • {field.document_type?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <Badge className={statusColors[field.review_status]}>
            {statusIcons[field.review_status]}
            <span className="ml-1 text-xs">{field.review_status.replace(/_/g, ' ')}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Extracted Value</p>
            <p className="text-sm font-mono bg-muted p-2 rounded">{field.field_value || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Period</p>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              {period}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Confidence</p>
            <p className={`text-sm font-semibold ${confidenceColor(field.confidence_score)}`}>
              {field.confidence_score ? `${parseFloat(field.confidence_score).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Source</p>
            {field.document_id ? (
              <button
                type="button"
                onClick={() => openDocument(field.document_id)}
                className="text-sm font-medium text-primary hover:underline text-left"
                title="Open the source document"
              >
                {field.document_name}
              </button>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">—</p>
            )}
          </div>
        </div>

        {isCorrecting && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Corrected Value</label>
              <Input
                value={acceptedValue}
                onChange={(e) => setAcceptedValue(e.target.value)}
                placeholder="Enter the correct value"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Numeric Value</label>
              <Input
                value={acceptedNormalizedValue}
                onChange={(e) => setAcceptedNormalizedValue(e.target.value)}
                placeholder="Number used in calculations"
                type="text"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth recording about this value…"
            className="min-h-[60px]"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
          <Button variant="outline" onClick={handleReject} disabled={isSaving}>
            <XCircle className="w-3 h-3 mr-1" />
            Reject
          </Button>
          <Button variant="outline" onClick={handleClarify} disabled={isSaving}>
            <AlertCircle className="w-3 h-3 mr-1" />
            Needs clarification
          </Button>
          {isCorrecting ? (
            <Button onClick={handleCorrect} disabled={isSaving}>
              <Save className="w-3 h-3 mr-1" />
              {isSaving ? 'Saving…' : 'Save correction'}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsCorrecting(true)} disabled={isSaving}>
                <Edit3 className="w-3 h-3 mr-1" />
                Correct
              </Button>
              <Button onClick={handleAccept} disabled={isSaving}>
                <Check className="w-3 h-3 mr-1" />
                {isSaving ? 'Saving…' : 'Accept'}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentGroup({ document, fields, onFieldSave, onCreateSnapshot }) {
  const [expandedFields, setExpandedFields] = useState({});
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);
  const [snapshotType, setSnapshotType] = useState('historical');
  const [isLatest, setIsLatest] = useState(false);
  const [updateDashboard, setUpdateDashboard] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const toggleField = (fieldId) => {
    setExpandedFields(prev => ({ ...prev, [fieldId]: !prev[fieldId] }));
  };

  // Check if all fields are reviewed (no pending_review)
  const allFieldsReviewed = fields.every(f => f.review_status !== 'pending_review');
  const hasAcceptedOrCorrected = fields.some(f => ['accepted', 'corrected'].includes(f.review_status));
  const canCreateSnapshot = allFieldsReviewed && hasAcceptedOrCorrected;

  // Count reviewed vs pending
  const reviewedCount = fields.filter(f => ['accepted', 'corrected', 'rejected'].includes(f.review_status)).length;
  const pendingCount = fields.filter(f => f.review_status === 'pending_review').length;

  const handleCreateSnapshot = async () => {
    setIsCreating(true);
    try {
      await onCreateSnapshot({
        documentId: document.id,
        snapshotType,
        isLatest,
        updateDashboard,
      });
      setShowSnapshotDialog(false);
      setSnapshotType('historical');
      setIsLatest(false);
      setUpdateDashboard(false);
    } catch (error) {
      toast.error(`Failed to create snapshot: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Card className="border-border">
        <CardHeader className="py-4 bg-secondary/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileBox className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">{document.document_name}</p>
                <p className="text-xs text-muted-foreground">
                  {document.business_name} • {document.document_type?.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {fields.length} field{fields.length !== 1 ? 's' : ''}
              </Badge>
              {canCreateSnapshot && (
                <Button
                  size="sm"
                  onClick={() => setShowSnapshotDialog(true)}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <PlusCircle className="w-3 h-3 mr-1" />
                  Create Snapshot
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <span className="text-muted-foreground">
              Reviewed: <span className="font-semibold text-green-400">{reviewedCount}</span> / {fields.length}
            </span>
            {pendingCount > 0 && (
              <span className="text-muted-foreground">
                Pending: <span className="font-semibold text-yellow-400">{pendingCount}</span>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {fields.map((field) => (
            <div key={field.id}>
              {expandedFields[field.id] ? (
                <FieldReviewCard
                  field={field}
                  onSave={onFieldSave}
                  onCancel={() => toggleField(field.id)}
                />
              ) : (
                <Card className="border-border/50 hover:border-primary/50 transition-colors">
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium">{field.field_label}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground font-mono">
                              {field.field_value || '—'}
                            </span>
                            <Badge className={statusColors[field.review_status]} variant="outline">
                              {statusIcons[field.review_status]}
                              <span className="ml-1 text-[10px]">{field.review_status.replace(/_/g, ' ')}</span>
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${
                          field.confidence_score >= 90 ? 'text-green-400' :
                          field.confidence_score >= 70 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {field.confidence_score ? `${parseFloat(field.confidence_score).toFixed(0)}%` : '—'}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleField(field.id)}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Snapshot Creation Dialog */}
      <Dialog open={showSnapshotDialog} onOpenChange={setShowSnapshotDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Snapshot from Approved Fields</DialogTitle>
            <DialogDescription>
              Create a business metric snapshot using accepted and corrected field values from this document.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Snapshot Type</Label>
              <Select value={snapshotType} onValueChange={setSnapshotType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="historical">Historical</SelectItem>
                  <SelectItem value="tax_year">Tax Year</SelectItem>
                  <SelectItem value="projected">Projected</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {document.document_type === 'business_tax_return' ? 'Defaults to tax_year for tax documents' : 'Defaults to historical for financial statements'}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isLatest"
                checked={isLatest}
                onCheckedChange={setIsLatest}
              />
              <Label htmlFor="isLatest" className="text-sm">
                Make latest business snapshot
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="updateDashboard"
                checked={updateDashboard}
                onCheckedChange={setUpdateDashboard}
              />
              <Label htmlFor="updateDashboard" className="text-sm">
                Also update current dashboard metrics
              </Label>
            </div>

            <div className="bg-secondary rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold">Summary</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fields to map:</span>
                <span className="font-semibold text-green-400">
                  {fields.filter(f => ['accepted', 'corrected'].includes(f.review_status)).length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fields skipped:</span>
                <span className="font-semibold text-muted-foreground">
                  {fields.filter(f => f.review_status === 'rejected').length}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Document:</span>
                <span className="font-medium">{document.document_name}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnapshotDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSnapshot} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Snapshot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ExtractedFieldsReviewQueue({ summary = null, businessId = null }) {
  const queryClient = useQueryClient();
  const [expandedDocuments, setExpandedDocuments] = useState({});
  const [learned, setLearned] = useState([]);

  const { data: fieldsData, isLoading, error, refetch } = useQuery({
    queryKey: ['extractedFieldsReview', businessId],
    queryFn: async () => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'getExtractedFieldsReviewQueue',
        data: { businessId },
      });
      return res.data?.fields || [];
    },
    initialData: [],
  });

  // Group fields by document
  const groupedFields = useMemo(() => {
    const groups = {};
    fieldsData.forEach(field => {
      const docKey = `${field.document_id}_${field.document_name}`;
      if (!groups[docKey]) {
        groups[docKey] = {
          document: {
            id: field.document_id,
            document_name: field.document_name,
            document_type: field.document_type,
            business_name: field.business_name,
            business_id: field.business_id,
          },
          fields: [],
        };
      }
      groups[docKey].fields.push(field);
    });
    return groups;
  }, [fieldsData]);

  // Calculate counts
  const counts = useMemo(() => {
    const initial = { pending_review: 0, accepted: 0, corrected: 0, rejected: 0, needs_clarification: 0, total: fieldsData.length };
    return fieldsData.reduce((acc, field) => {
      acc[field.review_status] = (acc[field.review_status] || 0) + 1;
      return acc;
    }, initial);
  }, [fieldsData]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke('supabaseUserData', {
        action: 'updateExtractedFieldReview',
        ...data,
      });
      return res.data;
    },
    onSuccess: () => {
      // Promotion changes governed information, so every surface that reads it
      // is invalidated here — no browser refresh. The derived metrics are
      // recalculated server-side by the same call (existing CIQ path).
      queryClient.invalidateQueries({ queryKey: ['extractedFieldsReview'] });
      queryClient.invalidateQueries({ queryKey: ['extraction-review-summary'] });
      queryClient.invalidateQueries({ queryKey: ['data-room-documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: [CONTRACT_QUERY_KEY] });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    },
  });

  // A lightweight, real confirmation of what was just promoted. No diff engine:
  // it states only the fields the owner actually confirmed in this session.
  const handleFieldSave = async (data) => {
    const result = await updateMutation.mutateAsync(data);
    if (data.reviewStatus === 'accepted' || data.reviewStatus === 'corrected') {
      const source = fieldsData.find(f => f.id === data.fieldId);
      const period = source?.metadata?.fiscal_year
        ? `FY ${source.metadata.fiscal_year}`
        : source?.document_year ? `FY ${source.document_year}` : null;
      setLearned(prev => [...prev, {
        id: data.fieldId,
        label: source?.field_label || result?.field?.field_label || 'Extracted fact',
        value: data.reviewStatus === 'corrected' ? data.acceptedValue : (source?.field_value || result?.field?.accepted_value),
        period,
      }]);
      toast.success(`${source?.field_label || 'Fact'} confirmed`);
    }
  };

  // Snapshot creation mutation
  const createSnapshotMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke('createSnapshotFromReviewedFields', data);
      return res.data;
    },
    onSuccess: (result) => {
      toast.success(result.message || 'Snapshot created successfully');
      queryClient.invalidateQueries({ queryKey: ['extractedFieldsReview'] });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create snapshot');
    },
  });

  const handleCreateSnapshot = async (data) => {
    await createSnapshotMutation.mutateAsync(data);
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
        <p className="font-medium">Failed to load extracted fields</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  if (fieldsData.length === 0) {
    return (
      <div className="space-y-6">
        {learned.length > 0 && <LearnConfirmation learned={learned} />}
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-400" />
          <h3 className="text-lg font-semibold mb-2">Everything Vision found is confirmed</h3>
          <p className="text-sm text-muted-foreground">
            {summary?.totals?.ready
              ? `${summary.totals.ready} confirmed ${summary.totals.ready === 1 ? 'fact is' : 'facts are'} in use across Business Intelligence.`
              : 'Nothing is waiting on your review. Upload a financial document and Vision will analyze it.'}
          </p>
        </div>
      </div>
    );
  }

  // Header counts: REAL totals when the caller supplies them (server-computed),
  // otherwise the counts of what this queue actually loaded.
  const display = summary?.totals
    ? {
        total: summary.totals.total,
        pending_review: summary.totals.pending_review,
        accepted: summary.totals.accepted,
        corrected: summary.totals.corrected,
        rejected: summary.totals.rejected,
        needs_clarification: summary.totals.needs_clarification,
      }
    : counts;

  return (
    <div className="space-y-6">
      {learned.length > 0 && <LearnConfirmation learned={learned} />}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Confirm what Vision found</h2>
          <p className="text-sm text-muted-foreground">
            Extracted figures are not used throughout Business Intelligence until you confirm them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Total: {display.total}
          </Badge>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
            Pending: {display.pending_review}
          </Badge>
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
            Accepted: {display.accepted}
          </Badge>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
            Corrected: {display.corrected}
          </Badge>
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
            Rejected: {display.rejected}
          </Badge>
          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
            Clarification: {display.needs_clarification}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        {Object.values(groupedFields).map(({ document, fields }) => (
          <DocumentGroup
            key={document.document_id}
            document={document}
            fields={fields}
            onFieldSave={handleFieldSave}
            onCreateSnapshot={handleCreateSnapshot}
          />
        ))}
      </div>
    </div>
  );
}