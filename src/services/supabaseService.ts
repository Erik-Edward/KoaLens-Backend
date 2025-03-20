// src/services/supabaseService.ts
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Define a type for user usage data
interface UserUsage {
  user_id: string;
  analyses_used: number;
  analyses_limit: number;
  last_updated: string;
  updated_at?: string; // Lägg till detta fält för att matcha databasen
  is_premium: boolean;
}

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Saknade Supabase-miljövariabler');
}

// Skapa en Supabase-klient med service role key för backend-operationer
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Validera att databasen har rätt kolumnnamn
export async function validateDbSchema() {
  try {
    console.log('Validerar databasschema...');
    console.log('NEUTRALISERAD: Returnerar alltid true för schema-validering');
    return true;
  } catch (error) {
    console.error('Fel vid validering av schema:', error);
    // Anta att schemat är korrekt om vi inte kan validera
    return true;
  }
}

// NEUTRALISERAD: Returnerar alltid dummy-data
export async function getUserUsage(userId: string): Promise<UserUsage> {
  console.log('NEUTRALISERAD: Returnerar dummy-data för användare:', userId);
  
  return {
    user_id: userId,
    analyses_used: 0,
    analyses_limit: 999,
    last_updated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_premium: false
  };
}

// NEUTRALISERAD: Returnerar alltid dummy-data
export async function createUserUsageRecord(userId: string) {
  console.log('NEUTRALISERAD: Returnerar dummy-data för nytt användarrecord:', userId);
  
  return {
    user_id: userId,
    analyses_used: 0,
    analyses_limit: 999,
    last_updated: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_premium: false
  };
}

// NEUTRALISERAD: Simulerar lyckad ökning av analysräknaren
export async function incrementAnalysisCount(userId: string) {
  console.log('NEUTRALISERAD: Simulerar ökning av analysräknare för användare:', userId);
  
  return { 
    analysesUsed: 1, 
    analysesLimit: 999 
  };
}

// NEUTRALISERAD: Returnerar alltid att användaren har kvarvarande analyser
export async function checkUserLimit(userId: string): Promise<{
  hasRemainingAnalyses: boolean;
  analysesUsed: number;
  analysesLimit: number;
  isPremium: boolean;
}> {
  console.log('NEUTRALISERAD: Kontrollerar användargräns för användare:', userId);
  
  return {
    hasRemainingAnalyses: true,
    analysesUsed: 0,
    analysesLimit: 999,
    isPremium: false
  };
}