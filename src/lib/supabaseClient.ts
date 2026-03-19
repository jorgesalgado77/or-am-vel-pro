import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = 'https://bdhfzjuwtkiexyeusnqq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaGZqand0a2lleHlldXNucXEiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1MDI4MzU0MCwiZXhwIjoyMDY1ODU5NTQwfQ.NN5RG84ULp7ZiNOmZVFC1F0beOFo2fLOqVNjBxAhVp0';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

export const EXTERNAL_SUPABASE_URL = SUPABASE_URL;
