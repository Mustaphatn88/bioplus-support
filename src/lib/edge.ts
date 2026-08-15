import { supabase } from './supabaseClient';

export interface EdgeError {
  message: string;
}

interface EdgeHttpError extends Error {
  context?: unknown;
}

function parseContext(ctx: unknown): { statusCode?: number; error?: string } | null {
  if (!ctx) return null;
  if (typeof ctx === 'string') {
    try {
      return JSON.parse(ctx) as { statusCode?: number; error?: string };
    } catch {
      return null;
    }
  }
  if (typeof ctx === 'object') return ctx as { statusCode?: number; error?: string };
  return null;
}

export async function edge<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<{ data: T | null; error: EdgeError | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const ctx = parseContext((error as EdgeHttpError).context);
    const serverMsg = ctx?.error ?? null;
    if (
      ctx?.error === 'Session invalide.' ||
      error.message.includes('Session invalide') ||
      error.message.includes('401')
    ) {
      await supabase.auth.signOut();
      window.location.assign('/login?expired=1');
    }
    return { data: null, error: { message: serverMsg ?? error.message } };
  }
  return { data, error: null };
}
