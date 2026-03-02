import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ZohoTokenResponse {
    access_token: string;
    expires_in: number;
    api_domain: string;
    token_type: string;
}

async function getZohoAccessToken() {
    const clientId = Deno.env.get('ZOHO_CLIENT_ID');
    const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
    const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Zoho OAuth credentials are not configured');
    }

    const tokenUrl = `https://accounts.zoho.in/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;

    const response = await fetch(tokenUrl, { method: 'POST' });
    const data: ZohoTokenResponse = await response.json();

    if (!response.ok) {
        throw new Error(`Failed to get Zoho access token: ${JSON.stringify(data)}`);
    }

    return data.access_token;
}

// Helper to verify Zoho Webhook signature
async function verifySignature(payload: string, signatureHeader: string | null) {
    if (!signatureHeader) return false;

    // Zoho signature format: t=<timestamp>,v=<signature>
    const parts = signatureHeader.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    const vPart = parts.find(p => p.startsWith('v='));

    if (!tPart || !vPart) return false;

    const timestamp = tPart.split('=')[1];
    const signature = vPart.split('=')[1];
    const signingKey = Deno.env.get('ZOHO_PAYMENTS_WEBHOOK_SECRET');

    if (!signingKey) return false;

    const dataToSign = `${timestamp}.${payload}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(dataToSign);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const expectedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return expectedSignature === signature;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Check if it's a webhook request from Zoho
    const signatureHeader = req.headers.get('X-Zoho-Webhook-Signature');
    if (signatureHeader) {
        try {
            const rawBody = await req.text();
            const isValid = await verifySignature(rawBody, signatureHeader);

            if (!isValid) {
                console.error('Invalid Webhook Signature');
                return new Response('Unauthorized', { status: 401 });
            }

            const payload = JSON.parse(rawBody);
            console.log('Received Zoho Webhook:', payload);

            // Handle event types (e.g., payment.success)
            // if (payload.event === 'payment.success') { ... }

            return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (err) {
            console.error('Webhook Error:', err);
            return new Response('Error', { status: 500 });
        }
    }

    try {
        const { action, amount, currency = 'INR', customer_id, order_id, email } = await req.json();
        const orgId = Deno.env.get('ZOHO_USER_ID');

        if (action === 'create-link') {
            const accessToken = await getZohoAccessToken();
            const linkUrl = `https://payments.zoho.in/api/v1/paymentlinks`;

            const payload = {
                amount: parseFloat(amount),
                currency_code: currency,
                organization_id: orgId,
                email: email || 'customer@storyseed.in',
                return_url: `${req.headers.get('origin')}/pay-event/${order_id}?status=success`,
                reference_id: `${order_id}_${Date.now()}`,
                description: `Payment for Event ${order_id}`
            };

            const response = await fetch(linkUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const linkData = await response.json();

            if (!response.ok) {
                console.error('Zoho API Error (Link):', linkData);
                return new Response(
                    JSON.stringify({ error: linkData.message || 'Failed to create payment link' }),
                    { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify(linkData),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'create-session') {
            const accessToken = await getZohoAccessToken();

            // Create Payment Session
            // Note: The endpoint might differ based on region (zoho.com, zoho.in etc)
            const sessionUrl = `https://payments.zoho.in/api/v1/paymentsessions`;

            const payload = {
                amount: amount, // amount in major units (e.g., 99.00)
                currency_code: currency,
                organization_id: orgId,
                // Add more fields as required by Zoho API
            };

            const response = await fetch(sessionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const sessionData = await response.json();

            if (!response.ok) {
                console.error('Zoho API Error:', sessionData);
                return new Response(
                    JSON.stringify({ error: sessionData.message || 'Failed to create payment session' }),
                    { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify(sessionData),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ error: 'Invalid action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('Edge Function Error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
