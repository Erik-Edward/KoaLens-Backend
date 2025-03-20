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

// Hjälpfunktioner för användningsdata
export async function getUserUsage(userId: string): Promise<UserUsage> {
  try {
    console.log('Hämtar användardata för:', userId);
    
    // Försök skapa användaren först med upsert
    const { data, error } = await supabase
      .from('user_analytics') // Ändrad från user_usage
      .upsert(
        { 
          user_id: userId,
          analyses_used: 0, // Ändrad från analyses_used
          analyses_limit: 2, // Ändrad från analyses_limit
          last_updated: new Date().toISOString(), // Ändrad från last_reset
          is_premium: false // Tillagt is_premium
        },
        { 
          onConflict: 'user_id',
          // Sätt till false för att uppdatera rader om de existerar
          ignoreDuplicates: false 
        }
      )
      .select('*');
    
    // Hantera resultatet från upsert
    if (error) {
      console.error('Fel vid upsert av användardata:', error);
      
      // Fallback: Försök hämta användaren direkt
      const { data: selectData, error: selectError } = await supabase
        .from('user_analytics') // Ändrad från user_usage
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (selectError) {
        console.error('Fallback-hämtning misslyckades också:', selectError);
        throw selectError;
      }
      
      // Om data hittades, returnera med säkerställda värden
      if (selectData) {
        return {
          ...selectData,
          analyses_limit: typeof selectData.analyses_limit === 'number' ? selectData.analyses_limit : 2,
          analyses_used: typeof selectData.analyses_used === 'number' ? selectData.analyses_used : 0
        } as UserUsage;
      }
    }
    
    // Hantera data från upsert
    if (Array.isArray(data) && data.length > 0) {
      // Om data är en array, ta första posten och säkerställ värden
      const firstItem = data[0] as any;
      const result: UserUsage = {
        user_id: firstItem.user_id || userId,
        analyses_limit: typeof firstItem.analyses_limit === 'number' ? firstItem.analyses_limit : 2,
        analyses_used: typeof firstItem.analyses_used === 'number' ? firstItem.analyses_used : 0,
        last_updated: firstItem.last_updated || new Date().toISOString(),
        is_premium: firstItem.is_premium || false
      };
      return result;
    } else if (data) {
      // Om data är ett enstaka objekt
      const item = data as any;
      const result: UserUsage = {
        user_id: item.user_id || userId,
        analyses_limit: typeof item.analyses_limit === 'number' ? item.analyses_limit : 2,
        analyses_used: typeof item.analyses_used === 'number' ? item.analyses_used : 0,
        last_updated: item.last_updated || new Date().toISOString(),
        is_premium: item.is_premium || false
      };
      return result;
    }
    
    // Om ingen data returnerades alls, använd standardvärden
    console.log('Ingen användardata hittades, använder standardvärden');
    return {
      user_id: userId,
      analyses_used: 0,
      analyses_limit: 2,
      last_updated: new Date().toISOString(),
      is_premium: false
    };
  } catch (error) {
    console.error('Fel vid hantering av användardata:', error);
    
    // Standardvärden även vid fel
    return {
      user_id: userId,
      analyses_used: 0,
      analyses_limit: 2,
      last_updated: new Date().toISOString(),
      is_premium: false
    };
  }
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