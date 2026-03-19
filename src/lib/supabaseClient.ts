import { supabase } from '@/integrations/supabase/client';

// Re-export the auto-generated client so all 56+ files continue to work
export { supabase };

export const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
