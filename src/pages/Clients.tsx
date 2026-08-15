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
  type LaboInfo
} from '../lib/analytics';
import Spinner from '../components/Spinner';

const STATUT_STYLES: Record<string, string> = {
  ouvert: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800'
};

const PRIORITE_STYLES: Record<string, string> = {
  normal: 'bg-slate-100 text-slate-700',
  important: 'bg-amber-100 text-amber-800',
  critique: 'bg-red-100 text-red-700'
};

export default function Clients() {
  const [laboratoires, setLaboratoires] = useState<Laboratoire[]>([]);
  const [automates, setAutomates] = useState<Automate[]>([]);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openLabo, setOpenLabo] = useState<string | null>(null);

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

  const totalClients = stats.filter((s) => s.total > 0).length;

  function exportAll() {
    downloadCsv(
      exportCsv(tickets, laboratoires as LaboInfo[], automates, users),
      `reclamations-${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  if (loading && tickets.length === 0)
    return <Spinner label="Chargement du portefeuille clients..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 page-title">Portefeuille clients</h1>
          <p className="text-xs text-slate-500">
            {laboratoires.length} laboratoire(s) · {totalClients} actif(s) · {users.filter((u) => u.role !== 'admin').length} compte(s)
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportAll} className="btn-outline px-3 py-1.5 text-xs">
            Export CSV
          </button>
          <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
            Tableau de bord
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {stats.length === 0 ? (
        <div className="card bg-slate-100 text-center">
          <p className="text-sm text-slate-500">Aucun laboratoire pour le moment.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {stats.map((s) => (
            <li key={s.labo.id} className="card">
              <button
                onClick={() => setOpenLabo(openLabo === s.labo.id ? null : s.labo.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{s.labo.nom}</p>
                    <p className="truncate text-xs text-slate-500">
                      {s.labo.ville ?? '—'}
                      {s.labo.telephone ? ` · ${s.labo.telephone}` : ''}
                    </p>
                  </div>
                  <span className="badge shrink-0 bg-slate-100 text-slate-700">
                    {s.total} réclamation(s)
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold text-slate-900">{s.comptes.length}</p>
                    <p className="text-[10px] text-slate-500">Comptes</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">{s.automates}</p>
                    <p className="text-[10px] text-slate-500">Automates</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-amber-600">{s.ouvertes + s.enCours}</p>
                    <p className="text-[10px] text-slate-500">En attente</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-red-600">{s.critiques}</p>
                    <p className="text-[10px] text-slate-500">Critiques</p>
                  </div>
                </div>
              </button>

              {openLabo === s.labo.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                      <p className="font-semibold text-slate-900">{s.resolues} résolues</p>
                      <p className="text-slate-500">Temps moyen : {fmtDuration(s.avgMin)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                      <p className="font-semibold text-slate-900">
                        {s.dernierTicket ? new Date(s.dernierTicket).toLocaleDateString('fr-FR') : '—'}
                      </p>
                      <p className="text-slate-500">Dernière activité</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 px-2 py-1.5">
                      <p className="font-semibold text-slate-900">
                        {s.total ? Math.round((s.resolues / s.total) * 100) : 0}%
                      </p>
                      <p className="text-slate-500">Taux de résolution</p>
                    </div>
                  </div>

                  {s.comptes.length > 0 && (
                    <div>
                      <h4 className="mb-1 text-xs font-bold text-slate-900">Comptes du client</h4>
                      <ul className="space-y-1">
                        {s.comptes.map((u) => (
                          <li key={u.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs">
                            <span className="truncate text-slate-700">
                              {u.full_name ?? u.email}
                            </span>
                            <span className="badge shrink-0 bg-slate-100 text-slate-600">{u.role}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="mb-1 text-xs font-bold text-slate-900">
                      Historique des réclamations ({s.total})
                    </h4>
                    {s.total === 0 ? (
                      <p className="rounded-lg bg-slate-50 px-2 py-2 text-xs text-slate-500">
                        Aucune réclamation pour ce client.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {tickets
                          .filter((t) => t.laboratoire_id === s.labo.id)
                          .slice(0, 20)
                          .map((t) => (
                            <li key={t.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-semibold text-slate-800">
                                  {t.automates?.nom ?? 'Automate supprimé'}
                                </span>
                                <span className={`badge shrink-0 ${PRIORITE_STYLES[t.priorite]}`}>
                                  {t.priorite}
                                </span>
                              </div>
                              <p className="truncate text-slate-500">
                                {t.message_erreur ?? t.description ?? 'Sans message'}
                              </p>
                              <div className="mt-1 flex items-center justify-between">
                                <span className={`badge ${STATUT_STYLES[t.statut]}`}>{t.statut}</span>
                                <span className="text-slate-400">
                                  {new Date(t.created_at).toLocaleDateString('fr-FR')}
                                  {t.technicien?.full_name ? ` · ${t.technicien.full_name}` : ''}
                                </span>
                              </div>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">
        Machines les plus sollicitées :{' '}
        {byAutomate(tickets, automates)
          .slice(0, 3)
          .map((a) => `${a.nom} (${a.count})`)
          .join(', ') || '—'}
      </p>
    </div>
  );
}