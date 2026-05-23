import { createClient } from '@supabase/supabase-js'

// Ersetze die Platzhalter in den Anführungszeichen mit deinen Daten aus Frankfurt
const supabaseUrl = 'https://vnwuelnvzhptjcsleuag.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZud3VlbG52emhwdGpjc2xldWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMTExNzIsImV4cCI6MjA5NDU4NzE3Mn0.UU-WI1nCr6EHDFb1s3-Hs44kHIIoMrert3V0z22Bqu0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)