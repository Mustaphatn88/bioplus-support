import { supabase } from './supabaseClient';

export interface EdgeError {
  message: string;
}

interface EdgeHttpError extends Error {
  context?: unknown;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function extractBody(context: unknown): Promise<{ status?: number; body: unknown }> {
  if (context instanceof Response) {
    let body: unknown = null;
    try {
      body = await context.clone().json();
    } catch {
      try {
        body = await context.clone().text();
      } catch {
        body = null;
      }
    }
    return { status: context.status, body };
  }
  if (typeof context === 'string') {
    return { body: tryParseJson(context) ?? context };
  }
  return { body: context };
}

function serverMessage(body: unknown): string | null {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === 'string' && err) return err;
  }
  return null;
}

export async function edge<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<{ data: T | null; error: EdgeError | null }> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const { status, body: raw } = await extractBody((error as EdgeHttpError).context);
    const serverMsg = serverMessage(raw);
    const isSessionInvalid =
      serverMsg === 'Session invalide.' ||
      error.message.includes('Session invalide') ||
      status === 401 ||
      error.message.includes('401');
    if (isSessionInvalid) {
      await supabase.auth.signOut();
      window.location.assign('/login?expired=1');
    }
    let detail = '';
    if (
      !serverMsg &&
      raw &&
      typeof raw === 'object' &&
      Object.keys(raw as Record<string, unknown>).length > 0
    ) {
      try {
        detail = ` — ${JSON.stringify(raw).slice(0, 140)}`;
      } catch {
        detail = '';
      }
    }
    return { data: null, error: { message: (serverMsg ?? error.message) + detail } };
  }
  return { data, error: null };
}
