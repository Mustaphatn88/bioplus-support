import type { Priorite, Statut, TicketWithAutomate } from './supabaseClient';

export interface ClientUser {
  id: string;
  email: string;
  role: string;
  statut: string;
  full_name: string | null;
  laboratoire_id: string | null;
  banned: boolean;
}

export interface LaboInfo {
  id: string;
  nom: string;
  ville: string | null;
  adresse: string | null;
  telephone: string | null;
  created_at: string;
}

export interface AutomateInfo {
  id: string;
  laboratoire_id: string;
  nom: string;
  modele: string | null;
  numero_serie: string | null;
}

export function minutesBetween(start: string, end: string): number | null {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function fmtDuration(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.round((min / 60) * 10) / 10;
  if (h < 24) return `${h} h`;
  return `${Math.round((h / 24) * 10) / 10} j`;
}

export function resolutionMinutes(t: TicketWithAutomate): number | null {
  if (t.statut !== 'resolu') return null;
  return minutesBetween(t.created_at, t.updated_at ?? t.created_at);
}

export function avgResolution(tickets: TicketWithAutomate[]): number | null {
  const durations = tickets.map(resolutionMinutes).filter((m): m is number => m !== null);
  if (durations.length === 0) return null;
  return Math.round(durations.reduce((s, m) => s + m, 0) / durations.length);
}

export function daysAgo(tickets: TicketWithAutomate[], days: number): number {
  const cutoff = Date.now() - days * 86400000;
  return tickets.filter((t) => new Date(t.created_at).getTime() >= cutoff).length;
}

export interface TechStats {
  id: string;
  email: string;
  full_name: string | null;
  assigned: number;
  enCours: number;
  ouvertes: number;
  resolues: number;
  avgMin: number | null;
  rate: number | null;
  dernierTicket: string | null;
}

export function techStats(tickets: TicketWithAutomate[], users: ClientUser[]): TechStats[] {
  return users
    .filter((u) => u.role === 'technicien')
    .map((u) => {
      const mine = tickets.filter((t) => t.technicien_id === u.id);
      const resolues = mine.filter((t) => t.statut === 'resolu');
      const durations = resolues
        .map(resolutionMinutes)
        .filter((m): m is number => m !== null);
      const sorted = [...mine].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        assigned: mine.length,
        enCours: mine.filter((t) => t.statut === 'en_cours').length,
        ouvertes: mine.filter((t) => t.statut === 'ouvert').length,
        resolues: resolues.length,
        avgMin: durations.length
          ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
          : null,
        rate: mine.length ? Math.round((resolues.length / mine.length) * 100) : null,
        dernierTicket: sorted[0]?.created_at ?? null
      };
    })
    .sort((a, b) => b.assigned - a.assigned);
}

export interface LaboStats {
  labo: LaboInfo;
  comptes: ClientUser[];
  automates: number;
  total: number;
  ouvertes: number;
  enCours: number;
  resolues: number;
  critiques: number;
  avgMin: number | null;
  dernierTicket: string | null;
}

export function laboStats(
  tickets: TicketWithAutomate[],
  laboratoires: LaboInfo[],
  automates: AutomateInfo[],
  users: ClientUser[]
): LaboStats[] {
  return laboratoires
    .map((labo) => {
      const mine = tickets.filter((t) => t.laboratoire_id === labo.id);
      const sorted = [...mine].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return {
        labo,
        comptes: users.filter((u) => u.laboratoire_id === labo.id),
        automates: automates.filter((a) => a.laboratoire_id === labo.id).length,
        total: mine.length,
        ouvertes: mine.filter((t) => t.statut === 'ouvert').length,
        enCours: mine.filter((t) => t.statut === 'en_cours').length,
        resolues: mine.filter((t) => t.statut === 'resolu').length,
        critiques: mine.filter((t) => t.priorite === 'critique').length,
        avgMin: avgResolution(mine),
        dernierTicket: sorted[0]?.created_at ?? null
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function byAutomate(
  tickets: TicketWithAutomate[],
  automates: AutomateInfo[]
): Array<{ id: string; nom: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tickets) counts.set(t.automate_id, (counts.get(t.automate_id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([id, count]) => {
      const a = automates.find((x) => x.id === id);
      return { id, nom: a?.nom ?? 'Automate supprimé', count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

export function activityByDay(tickets: TicketWithAutomate[], days = 30): number[] {
  const out = new Array<number>(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const t of tickets) {
    const d = new Date(t.created_at);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diff >= 0 && diff < days) out[days - 1 - diff] += 1;
  }
  return out;
}

export function exportCsv(
  tickets: TicketWithAutomate[],
  laboratoires: LaboInfo[],
  automates: AutomateInfo[],
  users: ClientUser[]
): string {
  const laboName = new Map(laboratoires.map((l) => [l.id, l.nom]));
  const autoName = new Map(automates.map((a) => [a.id, `${a.nom} (${a.modele ?? ''})`]));
  const userName = new Map(users.map((u) => [u.id, u.full_name ?? u.email]));
  const rows = [...tickets].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const header = [
    'Date création',
    'Laboratoire',
    'Automate',
    'Priorité',
    'Statut',
    'Technicien',
    'Message erreur',
    'Code erreur',
    'Description',
    'Temps de résolution (min)'
  ];
  const lines = rows.map((t) =>
    [
      new Date(t.created_at).toISOString(),
      laboName.get(t.laboratoire_id) ?? '',
      autoName.get(t.automate_id) ?? '',
      t.priorite,
      t.statut,
      t.technicien_id ? (userName.get(t.technicien_id) ?? '') : '',
      t.message_erreur ?? '',
      t.code_erreur ?? '',
      (t.description ?? '').replace(/[\r\n;]+/g, ' '),
      resolutionMinutes(t) ?? ''
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(';')
  );
  return [header.map((h) => `"${h}"`).join(';'), ...lines].join('\n');
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function statutCount(tickets: TicketWithAutomate[], statut: Statut): number {
  return tickets.filter((t) => t.statut === statut).length;
}

export function prioriteCount(tickets: TicketWithAutomate[], priorite: Priorite): number {
  return tickets.filter((t) => t.priorite === priorite).length;
}
