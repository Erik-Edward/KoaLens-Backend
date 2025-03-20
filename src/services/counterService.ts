// src/services/counterService.ts
import { supabase } from './supabaseService';

// Interface för counter information
export interface CounterInfo {
  counter_id: string;
  user_id: string;
  counter_name: string;
  value: number;
  limit: number;
  remaining: number;
  is_limited: boolean;
  has_reached_limit: boolean;
  reset_frequency: 'daily' | 'weekly' | 'monthly' | 'never';
  last_reset: string;
  next_reset: string | null;
}

/**
 * Hämtar en räknare för en användare
 * @param userId Användarens ID
 * @param counterName Räknarens namn (t.ex. 'analysis_count')
 * @returns Information om räknaren
 */
export async function getCounter(userId: string, counterName: string): Promise<CounterInfo> {
  try {
    console.log(`Hämtar räknare "${counterName}" för användare:`, userId);
    
    const { data, error } = await supabase
      .rpc('get_counter', { 
        p_user_id: userId,
        p_counter_name: counterName
      });
    
    if (error) {
      console.error('Fel vid hämtning av räknare:', error);
      throw error;
    }
    
    console.log('Räknarinformation hämtad:', data);
    return data as CounterInfo;
  } catch (error) {
    console.error('Error in getCounter:', error);
    
    // Returnera standardvärden vid fel
    return {
      counter_id: 'error',
      user_id: userId,
      counter_name: counterName,
      value: 0,
      limit: 5,
      remaining: 5,
      is_limited: true,
      has_reached_limit: false,
      reset_frequency: 'monthly',
      last_reset: new Date().toISOString(),
      next_reset: null
    };
  }
}

/**
 * Ökar en räknare för en användare
 * @param userId Användarens ID
 * @param counterName Räknarens namn (t.ex. 'analysis_count')
 * @param increment Hur mycket räknaren ska ökas (standard: 1)
 * @returns Uppdaterad information om räknaren
 */
export async function incrementCounter(
  userId: string,
  counterName: string,
  increment: number = 1
): Promise<CounterInfo> {
  try {
    console.log(`Ökar räknare "${counterName}" för användare:`, userId);
    
    const { data, error } = await supabase
      .rpc('increment_counter', { 
        p_user_id: userId,
        p_counter_name: counterName,
        p_increment: increment
      });
    
    if (error) {
      console.error('Fel vid ökning av räknare:', error);
      throw error;
    }
    
    console.log('Räknare ökad:', data);
    return data as CounterInfo;
  } catch (error) {
    console.error('Error in incrementCounter:', error);
    
    // Returnera standardvärden vid fel
    return {
      counter_id: 'error',
      user_id: userId,
      counter_name: counterName,
      value: increment,
      limit: 5,
      remaining: 5 - increment,
      is_limited: true,
      has_reached_limit: false,
      reset_frequency: 'monthly',
      last_reset: new Date().toISOString(),
      next_reset: null
    };
  }
}

/**
 * Kontrollerar om en användare har nått sin gräns för en räknare
 * @param userId Användarens ID
 * @param counterName Räknarens namn
 * @returns Info om användaren har nått sin gräns
 */
export async function checkCounterLimit(
  userId: string,
  counterName: string
): Promise<{
  hasReachedLimit: boolean;
  value: number;
  limit: number;
  remaining: number;
}> {
  try {
    const counter = await getCounter(userId, counterName);
    
    return {
      hasReachedLimit: counter.has_reached_limit,
      value: counter.value,
      limit: counter.limit,
      remaining: counter.remaining
    };
  } catch (error) {
    console.error('Error in checkCounterLimit:', error);
    
    // Returnera standardvärden vid fel (tillåt alltid vid fel)
    return {
      hasReachedLimit: false,
      value: 0,
      limit: 5,
      remaining: 5
    };
  }
}