import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.0";

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

    console.log('Token Refresh Check:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRefreshToken: !!refreshToken,
        tokenPrefix: refreshToken?.slice(0, 5)
    });

    if (!refreshToken || refreshToken === 'your_refresh_token') {
        throw new Error('ZOHO_REFRESH_TOKEN is not configured.');
    }

    const hasClientCredentials = clientId && !clientId.includes('your_') && !clientId.includes('<') &&
        clientSecret && !clientSecret.includes('your_') && !clientSecret.includes('<');

    if (hasClientCredentials) {
        try {
            console.log('Attempting Zoho OAuth refresh on .in domain...');
            const tokenUrl = `https://accounts.zoho.in/oauth/v2/token?refresh_token=${refreshToken}&client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token`;

            const response = await fetch(tokenUrl, { method: 'POST' });
            const data: any = await response.json();

            if (response.ok && data.access_token) {
                console.log('OAuth refresh SUCCESSFUL');
                return data.access_token;
            }

            console.warn(`OAuth refresh FAILED (Status ${response.status}). Body:`, JSON.stringify(data));
        } catch (err) {
            console.warn('OAuth refresh EXCEPTION:', err);
        }
    }

    // Direct Key Mode
    if (refreshToken.startsWith('1003.') || refreshToken.startsWith('1002.')) {
        console.log('Using static Zoho API Key directly');
        return refreshToken;
    }

    // If we're here and it starts with 1000., it means refresh failed or credentials missing
    throw new Error(`Valid Zoho token not found. Refresh failed or key type ${refreshToken.slice(0, 5)} not supported in static mode.`);
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

    // Log headers for debugging 401
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((v, k) => { allHeaders[k] = v; });
    console.log('Request Headers:', allHeaders);

    // Check if it's a webhook request from Zoho
    const signatureHeader = req.headers.get('X-Zoho-Webhook-Signature');
    if (signatureHeader) {
        console.log('Received potential Zoho Webhook. Signature:', signatureHeader);
        try {
            const rawBody = await req.text();
            console.log('Webhook Raw Body:', rawBody);

            const isValid = await verifySignature(rawBody, signatureHeader);

            if (!isValid) {
                console.error('Invalid Webhook Signature. Signing Key used:', !!Deno.env.get('ZOHO_PAYMENTS_WEBHOOK_SECRET'));
                // During initial setup/debugging, we might want to return 200 but log the error
                // return new Response('Unauthorized', { status: 401 }); 
            }

            let payload;
            try {
                payload = JSON.parse(rawBody);
            } catch (e) {
                console.log('Webhook body is not JSON (might be verification ping)');
                payload = { raw: rawBody };
            }

            console.log('Processed Webhook Payload:', payload);

            if (isValid) {
                try {
                    // Look for reference_id across possible Zoho payload formats
                    const refId = payload?.data?.reference_id || 
                                  payload?.payment?.reference_id || 
                                  payload?.reference_id || 
                                  payload?.paymentlink?.reference_id;
                                  
                    // Also check for successful payment status
                    const isSuccess = payload?.data?.status === 'success' || 
                                      payload?.status === 'success' ||
                                      payload?.payment?.status === 'success' ||
                                      payload?.event_type === 'payment_success';

                    if (refId && isSuccess) {
                        const registrationId = refId.split('_')[0]; // Extract the original registration UUID
                        console.log(`Valid webhook for successful payment. Extracted Registration ID: ${registrationId}`);
                        
                        const supabaseUrl = Deno.env.get('SUPABASE_URL');
                        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                        
                        if (supabaseUrl && supabaseKey) {
                            const supabase = createClient(supabaseUrl, supabaseKey, {
                                auth: { autoRefreshToken: false, persistSession: false }
                            });
                            
                            // We don't know if it's school or college from the ID, so update both. 
                            // Only the one with the matching UUID will actually be affected.
                            const updateData = { payment_status: 'paid', payment_details: payload };
                            
                            const { error: err1 } = await supabase.from('registrations').update(updateData).eq('id', registrationId);
                            const { error: err2 } = await supabase.from('clg_registrations').update(updateData).eq('id', registrationId);
                            
                            if (err1) console.error('Error updating registrations table:', err1);
                            if (err2) console.error('Error updating clg_registrations table:', err2);
                            
                            console.log('Database updated successfully via Webhook.');
                        } else {
                            console.error('Supabase credentials missing. Cannot update DB from webhook.');
                        }
                    }
                } catch (dbErr) {
                    console.error('Error updating database from webhook:', dbErr);
                }
            }

            return new Response(JSON.stringify({ received: true, status: isValid ? 'verified' : 'unverified' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        } catch (err) {
            console.error('Webhook processing error:', err);
            return new Response('Error', { status: 500 });
        }
    }

    try {
        const body = await req.json();
        const { action, amount, currency = 'INR', customer_id, order_id, email } = body;
        const orgId = Deno.env.get('ZOHO_USER_ID');

        console.log(`Action requested: ${action}`);

        if (action === 'health-check') {
            return new Response(
                JSON.stringify({
                    status: 'ok',
                    message: 'Edge function reached successfully',
                    env_check: {
                        has_refresh_token: !!Deno.env.get('ZOHO_REFRESH_TOKEN'),
                        has_webhook_secret: !!Deno.env.get('ZOHO_PAYMENTS_WEBHOOK_SECRET'),
                        has_user_id: !!orgId
                    }
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (action === 'create-link') {
            const accessToken = await getZohoAccessToken();
            const accountId = Deno.env.get('ZOHO_PAYMENTS_ACCOUNT_ID') || orgId;

            console.log('Request body:', JSON.stringify(body));

            // EXHAUSTIVE Search function
            async function tryZohoRequest(id: string, domain: string, headerName: string, prefix: string, service: 'payments' | 'books') {
                const baseUrl = service === 'payments'
                    ? `https://payments.zoho.${domain}/api/v1/paymentlinks?account_id=${id}`
                    : `https://books.zoho.${domain}/api/v3/paymentlinks?organization_id=${id}`;

                const authValue = prefix ? `${prefix} ${accessToken}` : accessToken;

                // Construct service-specific payload
                let p;
                if (service === 'books') {
                    p = {
                        amount: Number(parseFloat(amount || '0').toFixed(2)),
                        currency_code: currency,
                        description: `Payment for Order ${order_id || 'Unknown'}`,
                        email: email || 'customer@storyseed.in',
                    };
                } else {
                    p = {
                        amount: parseFloat(amount || '0'),
                        currency: currency,
                        email: email || 'customer@storyseed.in',
                        return_url: `${req.headers.get('origin') || 'https://story-seed-studio.netlify.app'}/pay-event/${order_id}?status=success`,
                        reference_id: `${order_id}_${Date.now()}`,
                        description: `Payment for Event ${order_id}`
                    };
                }

                try {
                    const res = await fetch(baseUrl, {
                        method: 'POST',
                        headers: {
                            [headerName]: authValue,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(p),
                    });

                    const text = await res.text();
                    let data;
                    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }

                    const logPrefix = `[${service.toUpperCase()}][${domain}][${id.slice(-4)}][${headerName}]`;
                    if (res.ok) {
                        console.log(`${logPrefix} SUCCESS!`);
                        return { res, data, service };
                    } else {
                        const msg = data?.message || data?.error || text || 'Error';
                        console.log(`${logPrefix} Failed: ${msg.slice(0, 100)}`);
                        return null;
                    }
                } catch (err) {
                    console.error(`Fetch error:`, err);
                    return null;
                }
            }

            const services: ('payments' | 'books')[] = ['books', 'payments'];
            const domains = ['com', 'in'];
            const accountIds = [orgId, accountId].filter((v, i, a) => v && a.indexOf(v) === i);
            const strategies = [
                { h: 'apikey', p: '' },
                { h: 'Authorization', p: 'Zoho-oauthtoken' },
                { h: 'Authorization', p: 'Zoho-encapikey' },
                { h: 'X-ZPAY-API-KEY', p: '' }
            ];

            let finalResult: any = null;

            // Try every possible combination
            for (const service of services) {
                for (const domain of domains) {
                    for (const id of accountIds) {
                        for (const s of strategies) {
                            if (service === 'books' && s.h.includes('ZPAY')) continue;
                            const result = await tryZohoRequest(id as string, domain, s.h, s.p, service);
                            if (result) {
                                finalResult = result;
                                break;
                            }
                        }
                        if (finalResult) break;
                    }
                    if (finalResult) break;
                }
                if (finalResult) break;
            }

            if (!finalResult) {
                return new Response(JSON.stringify({ error: 'All authentication strategies failed. Please check Edge Logs.' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 401
                });
            }

            const { data, service } = finalResult;
            // Handle ALL known Zoho response formats
            const paymentLink = data.payment_link ||
                data.paymentlink?.payment_link ||
                data.payment_links?.url || // THE WINNER for Zoho India
                data.link_url ||
                data.data?.payment_link ||
                data.url;

            if (!paymentLink) {
                console.error('Zoho SUCCESS but link mapping failed. Response:', JSON.stringify(data));
                return new Response(JSON.stringify({ error: 'Link mapping failed', details: data }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 500
                });
            }

            console.log(`✅ SUCCESS! Returning link: ${paymentLink}`);

            return new Response(
                JSON.stringify({
                    payment_link: paymentLink,
                    payment_url: paymentLink, // Match frontend expectation
                    link_id: data.link_id || data.paymentlink?.link_id,
                    order_id: order_id,
                    service_type: service
                }),
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
        console.error('CRITICAL Edge Function Error:', error);
        return new Response(
            JSON.stringify({
                error: error.message || 'Internal server error',
                stack: error.stack,
                details: 'Check Supabase Edge logs for full trace'
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
