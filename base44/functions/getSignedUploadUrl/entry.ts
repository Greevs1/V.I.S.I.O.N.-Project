/**
 * getSignedUploadUrl — DEPRECATED
 *
 * This signed URL upload flow has been replaced by uploadDocumentToSupabase
 * which handles the full pipeline securely via service role on the backend.
 *
 * Kept to avoid 404s from any legacy references. Will be removed in a future cleanup.
 */

Deno.serve(async () => {
  return Response.json(
    {
      error: 'Deprecated upload flow. Use uploadDocumentToSupabase.',
      deprecated: true,
      replacement: 'uploadDocumentToSupabase',
    },
    { status: 410 }
  );
});