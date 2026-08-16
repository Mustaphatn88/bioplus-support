import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { edge } from '../lib/edge';
import { supabase, type Automate, type Laboratoire, type TicketWithAutomate } from '../lib/supabaseClient';
import {
  byAutomate,
  exportCsv,
  downloadCsv,
  fmtDuration,
  laboStats,
  type ClientUser,
  type LaboInfo,
  type LaboStats
} from '../lib/analytics';
import Spinner from '../components/Spinner';

const STATUT_STYLES: Record<string, string> = {
  ouvert: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800'
};

const STATUT_LABELS: Record<string, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu'
};

const PRIORITE_STYLES: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-700',
  important: 'bg-amber-100 text-amber-800',
  critique: 'bg-red-100 text-red-700'
};

const AUTO_STATUT_LABELS: Record<string, string> = {
  actif: 'Actif',
  maintenance: 'Maintenance',
  hors_service: 'Hors service'
};

const AUTO_STATUT_STYLES: Record<string, string> = {
  actif: 'bg-green-100 text-green-800',
  maintenance: 'bg-amber-100 text-amber-800',
  hors_service: 'bg-red-100 text-red-700'
};

const AUTO_STATUT_DOT: Record<string, string> = {
  actif: 'bg-green-500',
  maintenance: 'bg-amber-500',
  hors_service: 'bg-red-500'
};

const PALETTES = [
  'from-teal-600 to-emerald-700',
  'from-sky-600 to-blue-700',
  'from-violet-600 to-purple-700',
  'from-rose-500 to-pink-700',
  'from-amber-500 to-orange-600',
  'from-indigo-600 to-blue-700',
  'from-cyan-600 to-teal-700',
  'from-fuchsia-600 to-purple-700'
];

function initials(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export default function Clients() {
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([]);
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openLabo, setOpenLabo] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  async function refresh() {
    setLoading(true);
    setError(null);
    const [laboRes, autoRes, tickRes, usersRes] = await Promise.all([
      supabase.from('laboratoires').select('*').eq('est_client', true).order('nom'),
      supabase.from('automates').select('*').order('nom'),
      supabase
        .from('tickets')
        .select('*, automates(id, nom, modele), technicien:profiles!tickets_technicien_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(1000),
      edge<{ users: ClientUser[] }>('list-users')
    ]);
    if (laboRes.error) setError(laboRes.error.message);
    else setLaboratoires(laboRes.data as Laboratoire[]);
    if (autoRes.error) setError(autoRes.error.message);
    else setAutomates(autoRes.data as Automate[]);
    if (tickRes.error) setError(tickRes.error.message);
    else setTickets(tickRes.data as TicketWithAutomate[]);
    if (usersRes.error) setError(usersRes.error.message);
    else setUsers((usersRes.data?.users ?? []).map((u) => ({ ...u, banned: !!u.banned })));
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);

  const stats = useMemo(
    () => laboStats(tickets, laboratoires as LaboInfo[], automates, users),
    [tickets, laboratoires, automates, users]
  );

  const filtres = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stats;
    return stats.filter((s) => {
      const hay = [s.labo.nom, s.labo.ville, s.labo.adresse]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [stats, search]);

  const totalMachines = automates.length;
  const totalTickets = tickets.length;
  const enAttente = tickets.filter((t) => t.statut !== 'resolu').length;
  const critiques = tickets.filter((t) => t.priorite === 'critique' && t.statut !== 'resolu').length;

  function exportAll() {
    downloadCsv(
      exportCsv(tickets, laboratoires as LaboInfo[], automates, users),
      `reclamations-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  function miniStat(nombre: number, label: string, color: string) {
    return (
      <div className="rounded-xl bg-white/10 px-1 py-2 text-center">
        <p className={`text-lg font-bold leading-tight ${color}`}>{nombre}</p>
        <p className="text-[10px] text-white/70">{label}</p>
      </div>
    );
  }

  function clientCard(s: LaboStats, paletteIdx: number) {
    const palette = PALETTES[paletteIdx % PALETTES.length];
    const pct = s.total ? Math.round((s.resolues / s.total) * 100) : 0;
    const enAtt = s.ouvertes + s.enCours;
    const open = openLabo === s.labo.id;

    return (
      <li key={s.labo.id} className="card overflow-hidden p-0">
        <button onClick={() => setOpenLabo(open ? null : s.labo.id)} className="w-full text-left">
          <div className={`bg-gradient-to-r ${palette} p-3 text-white`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold backdrop-blur">
                {initials(s.labo.nom)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{s.labo.nom}</p>
                <p className="truncate text-[11px] text-white/80">
                  {[s.labo.ville, s.labo.adresse, s.labo.telephone]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  {s.total} réclamation{s.total > 1 ? 's' : ''}
                </span>
                <span
                  className={`text-[10px] font-bold transition-transform ${open ? 'rotate-180' : ''}`}
                >
                  {open ? '▲' : '▼'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-base font-bold text-slate-900">{s.automates}</p>
                <p className="text-[10px] text-slate-500">Machines</p>
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">{s.comptes.length}</p>
                <p className="text-[10px] text-slate-500">Comptes</p>
              </div>
              <div>
                <p className={`text-base font-bold ${enAtt ? 'text-amber-600' : 'text-slate-900'}`}>
                  {enAtt}
                </p>
                <p className="text-[10px] text-slate-500">En attente</p>
              </div>
              <div>
                <p className={`text-base font-bold ${s.critiques ? 'text-red-600' : 'text-slate-900'}`}>
                  {s.critiques}
                </p>
                <p className="text-[10px] text-slate-500">Critiques</p>
              </div>
            </div>

            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>Taux de résolution</span>
                <span>
                  {s.total ? `${pct}%` : '—'} · {s.resolues}/{s.total} résolue(s)
                  {s.avgMin !== null ? ` · moy. ${fmtDuration(s.avgMin)}` : ''}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${palette}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <p className="mt-1.5 text-[10px] text-slate-400">
              Dernière activité :{' '}
              {s.dernierTicket
                ? new Date(s.dernierTicket).toLocaleDateString('fr-FR')
                : 'aucune'}
            </p>
          </div>
        </button>

        {open && (
          <div className="space-y-3 border-t border-slate-100 p-3">
            {s.comptes.length > 0 && (
              <div>
                <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Comptes du client
                </h4>
                <ul className="space-y-1">
                  {s.comptes.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate text-slate-700">{u.full_name ?? u.email}</span>
                      <span className="badge shrink-0 bg-slate-200/70 text-slate-600">
                        {u.role === 'responsable' ? 'Responsable' : u.role}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Machines ({s.automates})
              </h4>
              {s.automates === 0 ? (
                <p className="rounded-xl bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                  Aucune machine enregistrée.
                </p>
              ) : (
                <ul className="space-y-1">
                  {automates
                    .filter((a) => a.laboratoire_id === s.labo.id)
                    .map((a) => {
                      const nb = tickets.filter((t) => t.automate_id === a.id).length;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${AUTO_STATUT_DOT[a.statut ?? 'actif'] ?? 'bg-slate-300'}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{a.nom}</p>
                            <p className="truncate text-slate-500">
                              {a.modele ?? '—'}
                              {a.numero_serie ? ` · ${a.numero_serie}` : ''}
                            </p>
                          </div>
                          <span
                            className={`badge shrink-0 ${AUTO_STATUT_STYLES[a.statut ?? 'actif'] ?? ''}`}
                          >
                            {AUTO_STATUT_LABELS[a.statut ?? 'actif']}
                          </span>
                          <span
                            className={`badge shrink-0 ${nb > 0 ? 'bg-teal-100 text-teal-800' : 'bg-slate-200/60 text-slate-500'}`}
                          >
                            {nb} récl.
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Historique par machine ({s.total})
              </h4>
              {s.total === 0 ? (
                <p className="rounded-xl bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                  Aucune réclamation pour ce client.
                </p>
              ) : (
                <ul className="space-y-2">
                  {automates
                    .filter((a) => a.laboratoire_id === s.labo.id)
                    .map((a) => {
                      const aTickets = tickets
                        .filter((t) => t.automate_id === a.id)
                        .sort(
                          (x, y) =>
                            new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
                        );
                      if (aTickets.length === 0) return null;
                      return (
                        <li key={a.id} className="overflow-hidden rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5">
                            <p className="text-xs font-bold text-slate-800">{a.nom}</p>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {aTickets.length} réclamation{aTickets.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          <ul className="divide-y divide-slate-50">
                            {aTickets.map((t) => (
                              <li key={t.id} className="px-2.5 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex gap-1">
                                    <span className={`badge ${STATUT_STYLES[t.statut]}`}>
                                      {STATUT_LABELS[t.statut]}
                                    </span>
                                    <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>
                                      {t.priorite}
                                    </span>
                                  </div>
                                  <span className="font-mono text-[10px] text-slate-400">
                                    #{t.id.slice(0, 6)}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-500">
                                  {t.message_erreur ?? t.description ?? 'Sans message'}
                                </p>
                                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                                  <span>
                                    {new Date(t.created_at).toLocaleDateString('fr-FR')}
                                    {t.technicien?.full_name ? ` · ${t.technicien.full_name}` : ''}
                                  </span>
                                  <Link
                                    to={`/ticket/${t.id}`}
                                    className="font-semibold text-teal-700 hover:underline"
                                  >
                                    Voir
                                  </Link>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  if (loading && tickets.length === 0)
    return <Spinner label="Chargement du portefeuille clients..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4">
      <header className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 to-emerald-700 p-4 text-white shadow-lg shadow-teal-900/20">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title text-lg font-bold">Portefeuille clients</h1>
            <p className="mt-0.5 truncate text-xs text-teal-100">
              {stats.length} client(s) · {totalMachines} machine(s) · {totalTickets} réclamation(s)
            </p>
          </div>
          <button
            onClick={exportAll}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            Export CSV
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {miniStat(stats.length, 'Clients', 'text-white')}
          {miniStat(totalMachines, 'Machines', 'text-white')}
          {miniStat(enAttente, 'En attente', 'text-amber-200')}
          {miniStat(critiques, 'Critiques', 'text-red-300')}
        </div>
      </header>

      <input
        type="search"
        placeholder="Rechercher un client (nom, ville, adresse)..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input mb-3"
      />

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {stats.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun laboratoire pour le moment.</p>
        </div>
      ) : filtres.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun client ne correspond à « {search} ».</p>
        </div>
      ) : (
        <ul className="space-y-3">{filtres.map((s, i) => clientCard(s, i))}</ul>
      )}

      {tickets.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Machines les plus sollicitées
          </p>
          <div className="space-y-1.5">
            {byAutomate(tickets, automates)
              .slice(0, 4)
              .map((a, i) => {
                const max = Math.max(
                  1,
                  ...byAutomate(tickets, automates)
                    .slice(0, 4)
                    .map((x) => x.count)
                );
                return (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-slate-400">{i + 1}</span>
                    <span className="w-32 truncate font-semibold text-slate-700">{a.nom}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600"
                        style={{ width: `${Math.round((a.count / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-bold text-slate-700">{a.count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <Link to="/dashboard" className="btn-outline mt-4 w-full">
        Tableau de bord
      </Link>
    </div>
  );
}
