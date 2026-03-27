import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://bdhfzjuwtkiexyeusnqq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaGZ6anV3dGtpZXh5ZXVzbnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjcwOTEsImV4cCI6MjA4OTUwMzA5MX0.xnbTV67kuEgvz9nNKAPHEcCAzAiYpf1xIsdEvM7OB44";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
