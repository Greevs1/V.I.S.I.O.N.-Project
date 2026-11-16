import React from 'react';
import { FileText, Trash2, RotateCcw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { motion } from 'framer-motion';
import { docTypes, statusConfig } from './uploadConfig';

export default function FileQueue({ 
  selectedFiles, 
  fileStates, 
  isUploading, 
  batchProgress,
  onRemoveFile, 
  onRetryFile 
}) {
  return (
    <div className="space-y-4">
      {/* Batch Progress */}
      {isUploading && (
        <div className="glass rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span>Batch Progress</span>
            <span>{batchProgress.percentage}% ({batchProgress.completed}/{batchProgress.total})</span>
          </div>
          <Progress value={batchProgress.percentage} className="h-2" />
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {batchProgress.completed} completed
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-400" />
              {batchProgress.uploading} uploading
            </span>
            {batchProgress.failed > 0 && (
              <span className="flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-400" />
                {batchProgress.failed} failed
              </span>
            )}
          </div>
        </div>
      )}

      {/* Individual File Progress */}
      {selectedFiles.map(({ id, file }) => {
        const state = fileStates[id] || { progress: 0, status: 'queued', error: null };
        const status = statusConfig[state.status] || statusConfig.queued;
        const StatusIcon = status.icon;

        return (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-lg p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {docTypes.find((d) => d.value === file.docType)?.label}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{state.progress}%</span>
                {state.status === 'failed' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6"
                    onClick={() => onRetryFile(id)}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                )}
                {state.status !== 'completed' && state.status !== 'uploading' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6"
                    onClick={() => onRemoveFile(id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            <Progress value={state.progress} className="h-1" />
            {state.error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {state.error}
              </p>
            )}
            {state.status !== 'failed' && (
              <Badge variant="outline" className={`${status.bg} ${status.color} border-transparent text-xs gap-1`}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </Badge>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}