// supabase/functions/export-orders/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  console.log('Function started');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { jobId, userEmail } = await req.json()
    console.log('Processing export job:', jobId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Update status to processing
    await supabase
      .from('export_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    // Fetch all orders with pagination
    let allOrders = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log('Starting to fetch orders');
    while (hasMore) {
      console.log(`Fetching page ${page + 1}`);
      const { data, error, count } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('owner_email', userEmail)
        .order('order_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error fetching orders:', error);
        throw error;
      }

      if (!data || data.length === 0) break;

      allOrders = [...allOrders, ...data];
      hasMore = data.length === pageSize;
      page++;

      // Update progress in job
      await supabase
        .from('export_jobs')
        .update({
          progress: {
            current: allOrders.length,
            total: count
          }
        })
        .eq('id', jobId);
    }

    console.log(`Total orders fetched: ${allOrders.length}`);

    // Generate CSV
    const csvContent = generateCsv(allOrders);

    // Store file in Storage
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
    const fileName = `${userEmail}/${timestamp}_orders.csv`;

    console.log('Uploading file:', fileName);
    const { error: uploadError } = await supabase
      .storage
      .from('exports')
      .upload(fileName, csvContent, {
        contentType: 'text/csv',
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Create signed URL that expires in 1 hour
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('exports')
      .createSignedUrl(fileName, 3600);

    if (signedUrlError) {
      console.error('Signed URL error:', signedUrlError);
      throw signedUrlError;
    }

    // Update job as completed
    console.log('Updating job as completed');
    const { error: updateError } = await supabase
      .from('export_jobs')
      .update({
        status: 'completed',
        file_url: signedUrlData.signedUrl,
        file_name: fileName,
        total_orders: allOrders.length,
        date_range: {
          start: allOrders[allOrders.length - 1]?.order_date,
          end: allOrders[0]?.order_date
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('Error completing job:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: signedUrlData.signedUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Export error:', error);

    try {
      const { jobId } = await req.json();
      if (jobId) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        await supabase
          .from('export_jobs')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', jobId);
      }
    } catch (updateError) {
      console.error('Failed to update job status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});

function generateCsv(orders: any[]) {
  const headers = [
    'Order ID',
    'Buyer Email',
    'Product Name',
    'Shop Name',
    'Product Options',
    'Order Date'
  ].join(',');

  const rows = orders.map(order => [
    order.order_id,
    order.buyer_email,
    `"${(order.product_name || '').replace(/"/g, '""')}"`,
    `"${(order.shop_name || '').replace(/"/g, '""')}"`,
    `"${JSON.stringify(order.product_options || {}).replace(/"/g, '""')}"`,
    new Date(order.order_date).toISOString()
  ].join(','));

  return [headers, ...rows].join('\n');
}