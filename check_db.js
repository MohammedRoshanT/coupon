const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://wdurrrzscroydvrontig.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkdXJycnpzY3JveWR2cm9udGlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY2NzQxMSwiZXhwIjoyMDkyMjQzNDExfQ.nsvtw16zMMhZRSI9lQ0Jw6iJajYiH85x2KTHcOB9pCA';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function main() {
  const qr_token = 'SNK-9c4c90e5-0a15-4693-a872-dab00c2fd60b-1776880367385';
  
  console.log('Testing exactly the code from the verify API route:');
  const { data: snackOrder, error } = await supabaseAdmin
    .from('snack_orders')
    .select('*, profiles!snack_orders_user_id_fkey(full_name), snack_stock(snack_item_id)')
    .eq('qr_token', qr_token)
    .single()

  console.log('snackOrder:', snackOrder);
  console.log('error:', error);
}

main();
