// src/services/supabaseService.ts
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Saknade Supabase-miljövariabler');
}

// Skapa en Supabase-klient med service role key för backend-operationer
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Hjälpfunktioner för användningsdata
export async function getUserUsage(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_usage')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Fel vid hämtning av användardata:', error);
    return null;
  }
}

export async function createUserUsageRecord(userId: string) {
  try {
    const { data, error } = await supabase
      .from('user_usage')
      .insert([{ user_id: userId }])
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Fel vid skapande av användardata:', error);
    return null;
  }
}

export async function incrementAnalysisCount(userId: string) {
  try {
    // Först kontrollera om användaren existerar i user_usage-tabellen
    let usage = await getUserUsage(userId);
    
    // Om inte, skapa en ny post
    if (!usage) {
      usage = await createUserUsageRecord(userId);
      if (!usage) throw new Error('Kunde inte skapa användardata');
    }
    
    // Kolla om vi behöver återställa räknaren (ny månad)
    const resetDay = usage.reset_day || 1;
    const lastReset = new Date(usage.last_reset);
    const now = new Date();
    const shouldReset = (
      now.getMonth() !== lastReset.getMonth() || 
      now.getFullYear() !== lastReset.getFullYear()
    ) && now.getDate() >= resetDay;
    
    if (shouldReset) {
      // Återställ räknaren för ny månad
      const { error } = await supabase
        .from('user_usage')
        .update({ 
          analyses_used: 1,  // Börja med 1 för den aktuella analysen
          last_reset: new Date().toISOString() 
        })
        .eq('user_id', userId);
      
      if (error) throw error;
      
      return { analysesUsed: 1, analysesLimit: usage.analyses_limit };
    } else {
      // Öka räknaren
      const { data, error } = await supabase
        .from('user_usage')
        .update({ analyses_used: usage.analyses_used + 1 })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (error) throw error;
      
      return { 
        analysesUsed: data.analyses_used, 
        analysesLimit: data.analyses_limit 
      };
    }
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
    // Hämta användarens aktuella användning
    let usage = await getUserUsage(userId);
    
    // Om ingen post finns, skapa en
    if (!usage) {
      usage = await createUserUsageRecord(userId);
      if (!usage) throw new Error('Kunde inte skapa användardata');
    }
    
    // Kontrollera om användaren är premium
    const isPremium = usage.premium_until ? new Date(usage.premium_until) > new Date() : false;
    
    // Kontrollera om vi behöver återställa räknaren (ny månad)
    const resetDay = usage.reset_day || 1;
    const lastReset = new Date(usage.last_reset);
    const now = new Date();
    const shouldReset = (
      now.getMonth() !== lastReset.getMonth() || 
      now.getFullYear() !== lastReset.getFullYear()
    ) && now.getDate() >= resetDay;
    
    if (shouldReset) {
      // Återställ räknaren för ny månad
      const { error } = await supabase
        .from('user_usage')
        .update({ 
          analyses_used: 0,
          last_reset: new Date().toISOString() 
        })
        .eq('user_id', userId);
      
      if (error) throw error;
      
      // Efter återställning har användaren alla analyser tillgängliga
      return {
        hasRemainingAnalyses: true,
        analysesUsed: 0,
        analysesLimit: usage.analyses_limit,
        isPremium
      };
    }
    
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
      analysesUsed: usage.analyses_used,
      analysesLimit: usage.analyses_limit,
      isPremium
    };
  } catch (error) {
    console.error('Fel vid kontroll av användargräns:', error);
    // Standard är att tillåta analysen om det uppstår ett fel vid kontroll
    return {
      hasRemainingAnalyses: true,
      analysesUsed: 0,
      analysesLimit: 15,
      isPremium: false
    };
  }
}