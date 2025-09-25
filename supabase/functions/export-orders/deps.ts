// /supabase/functions/export-orders/deps.ts
export { serve } from "https://deno.land/std@0.168.0/http/server.ts"
export { createClient } from "@supabase/supabase-js"
export { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"