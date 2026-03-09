
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listImages() {
  console.log('Listing images from gallery-images bucket...');
  const { data, error } = await supabase.storage.from('gallery-images').list('', {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    console.error('Error listing images:', error);
    return;
  }

  console.log('Found', data.length, 'entries:');
  data.forEach(file => {
    console.log(`- ${file.name} (type: ${file.id ? 'file' : 'folder'}, size: ${file.metadata?.size})`);
  });
}

listImages();
