/**
 * supabaseAgreementData — reserved for future Supabase-scoped queries
 * Agreements are currently stored in the Base44 Agreement entity.
 * This function is available for advisor/admin scoping if the table is migrated to Supabase.
 */
Deno.serve(async () => {
  return Response.json({ message: 'Agreements use Base44 entity. No Supabase table required.' });
});