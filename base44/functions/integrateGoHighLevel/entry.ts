import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is admin (for CRM operations)
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const apiKey = Deno.env.get('GHL_API_KEY');
        if (!apiKey) {
            return Response.json({ error: 'GHL_API_KEY not configured' }, { status: 500 });
        }

        const body = await req.json();
        const { action, locationId, contactId, data } = body;

        const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28'
        };

        // Handle different actions
        switch (action) {
            case 'getLocations': {
                // Get all locations
                const res = await fetch(`${GHL_BASE_URL}/locations`, { headers });
                const locations = await res.json();
                return Response.json({ locations });
            }

            case 'getContacts': {
                // Get contacts from a location
                if (!locationId) {
                    return Response.json({ error: 'locationId required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/contacts?limit=100`, { headers });
                const contacts = await res.json();
                return Response.json({ contacts });
            }

            case 'createContact': {
                // Create a new contact
                if (!locationId || !data) {
                    return Response.json({ error: 'locationId and data required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/contacts`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                const contact = await res.json();
                return Response.json({ contact });
            }

            case 'updateContact': {
                // Update an existing contact
                if (!locationId || !contactId || !data) {
                    return Response.json({ error: 'locationId, contactId, and data required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/contacts/${contactId}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(data)
                });
                const contact = await res.json();
                return Response.json({ contact });
            }

            case 'getContact': {
                // Get a specific contact
                if (!locationId || !contactId) {
                    return Response.json({ error: 'locationId and contactId required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/contacts/${contactId}`, { headers });
                const contact = await res.json();
                return Response.json({ contact });
            }

            case 'addNote': {
                // Add a note to a contact
                if (!locationId || !contactId || !data?.note) {
                    return Response.json({ error: 'locationId, contactId, and note required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/contacts/${contactId}/notes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ note: data.note })
                });
                const note = await res.json();
                return Response.json({ note });
            }

            case 'getConversations': {
                // Get conversations for a contact
                if (!locationId || !contactId) {
                    return Response.json({ error: 'locationId and contactId required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/conversations?contactId=${contactId}`, { headers });
                const conversations = await res.json();
                return Response.json({ conversations });
            }

            case 'sendMessage': {
                // Send a message in a conversation
                if (!locationId || !data?.conversationId || !data?.message) {
                    return Response.json({ error: 'locationId, conversationId, and message required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/conversations/${data.conversationId}/messages`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ message: data.message, type: data.type || 'text' })
                });
                const message = await res.json();
                return Response.json({ message });
            }

            case 'getOpportunities': {
                // Get opportunities (deals/pipeline)
                if (!locationId) {
                    return Response.json({ error: 'locationId required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/opportunities?limit=100`, { headers });
                const opportunities = await res.json();
                return Response.json({ opportunities });
            }

            case 'createOpportunity': {
                // Create a new opportunity
                if (!locationId || !data) {
                    return Response.json({ error: 'locationId and data required' }, { status: 400 });
                }
                const res = await fetch(`${GHL_BASE_URL}/locations/${locationId}/opportunities`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(data)
                });
                const opportunity = await res.json();
                return Response.json({ opportunity });
            }

            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }

    } catch (error) {
        console.error('GHL integration error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});