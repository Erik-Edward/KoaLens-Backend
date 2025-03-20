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

// Denna funktion behövs inte längre då getUserUsage hanterar både hämtning och skapande
// Men vi håller den för bakåtkompatibilitet, men gör den mer robust
export async function createUserUsageRecord(userId: string) {
  try {
    console.log('Skapar användardata för:', userId);
    
    // Kontrollera först om användaren redan finns för att undvika duplikat
    const { data: existingUser } = await supabase
      .from('user_analytics') // Ändrad från user_usage
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (existingUser) {
      console.log('Användare finns redan:', userId);
      return existingUser;
    }
    
    // Skapa bara om användaren inte finns
    const { data, error } = await supabase
      .from('user_analytics') // Ändrad från user_usage
      .insert([{ 
        user_id: userId,
        analyses_used: 0,
        analyses_limit: 2,
        last_updated: new Date().toISOString(),
        is_premium: false
      }])
      .select()
      .single();
    
    if (error) {
      // Om det är ett duplicate key-fel, försök hämta användaren istället
      if (error.code === '23505') {
        console.log('Duplicate key, hämtar befintlig användare istället');
        return getUserUsage(userId);
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Fel vid skapande av användardata:', error);
    // Returnera ett standardobjekt istället för null så att appen inte kraschar
    return {
      user_id: userId,
      analyses_used: 0,
      analyses_limit: 2,
      last_updated: new Date().toISOString(),
      is_premium: false
    };
  }
}

export async function incrementAnalysisCount(userId: string) {
  try {
    // Hämta befintlig användardata med de förbättrade funktionerna
    let usage = await getUserUsage(userId);
    
    // Säkerställ korrekta värden
    const currentCount = typeof usage.analyses_used === 'number' ? usage.analyses_used : 0;
    const analysesLimit = typeof usage.analyses_limit === 'number' ? usage.analyses_limit : 2;
    
    // Öka räknaren
    const { data, error } = await supabase
      .from('user_analytics') // Ändrad från user_usage
      .update({ 
        analyses_used: currentCount + 1,
        last_updated: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Säkerställ att de returnerade värdena är korrekta
    const updatedCount = typeof data.analyses_used === 'number' ? data.analyses_used : currentCount + 1;
    const updatedLimit = typeof data.analyses_limit === 'number' ? data.analyses_limit : analysesLimit;
    
    console.log('Användningsgräns uppdaterad:', {
      userId,
      used: updatedCount,
      limit: updatedLimit
    });
    
    return { 
      analysesUsed: updatedCount, 
      analysesLimit: updatedLimit 
    };
  } catch (error) {
    console.error('Fel vid ökning av analysantal:', error);
    throw error;
  }
}

export async function checkUserLimit(userId: string): Promise<{
  hasRemainingAnalyses: boolean;
  analysesUsed: number;
  analysesLimit: number;
  isPremium: boolean;
}> {
  try {
    // Hämta användarens aktuella användning med den förbättrade funktionen
    // som kommer göra upsert om användaren inte finns
    let usage = await getUserUsage(userId);
    
    // Om ingen data returneras trots våra försök, skapa standarddata
    if (!usage) {
      console.log('Kunde inte hämta eller skapa användardata, använder standarddata');
      usage = {
        user_id: userId,
        analyses_used: 0,
        analyses_limit: 2,
        last_updated: new Date().toISOString(),
        is_premium: false
      };
    }
    
    // Kontrollera om användaren är premium
    const isPremium = usage.is_premium || false;
    
    // Premium-användare har ingen gräns
    if (isPremium) {
      return {
        hasRemainingAnalyses: true,
        analysesUsed: usage.analyses_used,
        analysesLimit: Infinity,
        isPremium: true
      };
    }
    
    // Kontrollera om användaren har kvarvarande analyser
    const hasRemainingAnalyses = usage.analyses_used < usage.analyses_limit;
    
    return {
      hasRemainingAnalyses,
      analysesUsed: usage.analyses_used || 0,
      analysesLimit: usage.analyses_limit || 2,
      isPremium
    };
  } catch (error) {
    console.error('Fel vid kontroll av användargräns:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Returnera ett standardvärde i failsafe-läge
    return {
      hasRemainingAnalyses: true,
      analysesUsed: 0,
      analysesLimit: 2,
      isPremium: false
    };
  }
}