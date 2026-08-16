// ─────────────────────────────────────────────────────────────────────────────
// BioPlus GalacticOS — utilitaires partagés du mode galacticos
// ─────────────────────────────────────────────────────────────────────────────

export const C = {
  bg: '#05080F',
  surface: '#0B1220',
  cyan: '#00E5FF',
  emerald: '#00FFA3',
  violet: '#7C3AED',
  warning: '#FFB703',
  critical: '#FF0054'
};

export type HealthLevel = 'online' | 'warning' | 'critical' | 'nodata';

export const LEVEL_META: Record<HealthLevel, { label: string; color: string; dot: string }> = {
  online: { label: 'ONLINE', color: C.emerald, dot: '●' },
  warning: { label: 'WARNING', color: C.warning, dot: '●' },
  critical: { label: 'CRITICAL', color: C.critical, dot: '●' },
  nodata: { label: 'NO DATA', color: '#475569', dot: '○' }
};

/** Temps relatif en français (ex. « il y a 2 h »). */
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

/**
 * Score de santé d'un automate (0-100), ou null si aucun historique.
 * - 25 points retirés par ticket ouvert
 * - 10 pts si aucune intervention depuis 60 j, 20 pts depuis 90 j
 */
export function healthFor(
  openCount: number,
  lastInterventionAt: string | null
): number | null {
  if (openCount === 0 && !lastInterventionAt) return null;
  let score = 100;
  score -= 25 * openCount;
  if (lastInterventionAt) {
    const days = (Date.now() - new Date(lastInterventionAt).getTime()) / 86_400_000;
    if (days > 90) score -= 20;
    else if (days > 60) score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

export function levelOf(score: number | null): HealthLevel {
  if (score === null) return 'nodata';
  if (score >= 80) return 'online';
  if (score >= 50) return 'warning';
  return 'critical';
}