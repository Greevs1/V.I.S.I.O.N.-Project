/**
 * uploadDocumentDirect — DEPRECATED
 *
 * This function was used as step 3 of the old signed URL upload flow.
 * It has been replaced by uploadDocumentToSupabase which handles the full
 * pipeline (storage + metadata) in a single backend call.
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