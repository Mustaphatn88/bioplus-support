import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, type UiMode } from '../lib/supabaseClient';

/**
 * Bascule entre les modes d'interface « classic » (existant, par défaut)
 * et « galacticos » (nouveau Command Center).
 *
 * Ordre de priorité (du plus fort au plus faible) :
 *   1. VITE_FORCE_UI_MODE (variable de build, kill switch ultime)
 *   2. app_settings.force_ui_mode (kill switch runtime, sans redéploiement)
 *   3. profiles.preferences.ui_mode (choix individuel de l'utilisateur)
 *   4. classic (défaut)
 */
const forced = import.meta.env.VITE_FORCE_UI_MODE as UiMode | undefined;

function modeFrom(value: unknown): UiMode | null {
  if (typeof value !== 'string') return null;
  return value === 'galacticos' || value === 'classic' ? value : null;
}

export function useGalacticos(): boolean {
  const { profile } = useAuth();
  const [runtimeOverride, setRuntimeOverride] = useState<UiMode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'force_ui_mode')
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        const mode = modeFrom((data?.value as { mode?: UiMode } | null)?.mode);
        setRuntimeOverride(mode);
        setReady(true);
      }, () => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return false;
  if (forced) return forced === 'galacticos';
  if (runtimeOverride) return runtimeOverride === 'galacticos';
  return profile?.preferences?.ui_mode === 'galacticos';
}

/** Active/désactive le mode galacticos pour l'utilisateur connecté. */
export async function setUiMode(mode: UiMode): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ preferences: { ui_mode: mode } })
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
  if (error) throw new Error(error.message);
}
