import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, type Priorite, type Statut, type TicketWithAutomate } from '../lib/supabaseClient';
import Spinner from '../components/Spinner';

const STATUT_LABELS: Record<Statut, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu'
};

const STATUT_STYLES: Record<Statut, string> = {
  ouvert: 'bg-blue-100 text-blue-800',
  en_cours: 'bg-amber-100 text-amber-800',
  resolu: 'bg-green-100 text-green-800'
};

const PRIORITE_STYLES: Record<Priorite, string> = {
  normal: 'bg-slate-100 text-slate-700',
  important: 'bg-amber-100 text-amber-800',
  critique: 'bg-red-100 text-red-700'
};

interface Technicien {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  banned: boolean;
}

export default function Reclamations() {
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [techniciens, setTechniciens] = useState<Technicien[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    const [tickRes, usersRes] = await Promise.all([
      supabase
        .from('tickets')
        .select(
          '*, automates(id, nom, modele), laboratoire:laboratoires(id, nom), technicien:profiles!tickets_technicien_id_fkey(full_name)'
        )
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.functions.invoke<{ users: Technicien[] }>('list-users')
    ]);
    if (tickRes.error) setError(tickRes.error.message);
    else setTickets(tickRes.data as TicketWithAutomate[]);
    if (usersRes.error) setError(usersRes.error.message);
    else
      setTechniciens(
        (usersRes.data?.users ?? []).filter((u) => u.role === 'technicien' && !u.banned)
      );
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, []);

  async function assign(t: TicketWithAutomate, technicienId: string) {
    setBusyId(t.id);
    setError(null);
    const { error: err } = await supabase
      .from('tickets')
      .update({ technicien_id: technicienId || null })
      .eq('id', t.id);
    setBusyId(null);
    if (err) setError(err.message);
    else refresh();
  }

  if (loading && tickets.length === 0) return <Spinner label="Chargement des réclamations..." />;

  const aDispatcher = tickets.filter((t) => !t.technicien_id && t.statut !== 'resolu');
  const suivies = tickets.filter((t) => t.technicien_id || t.statut === 'resolu');

  function renderTicket(t: TicketWithAutomate, showLabo: boolean) {
    return (
      <li key={t.id} className="card">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {t.automates?.nom ?? 'Automate supprimé'}
              {showLabo && t.laboratoire?.nom ? ` · ${t.laboratoire.nom}` : ''}
            </p>
            <p className="truncate text-xs text-slate-500">
              {t.message_erreur ?? t.description ?? 'Sans message'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>{t.priorite}</span>
            <span className={`badge ${STATUT_STYLES[t.statut]}`}>{STATUT_LABELS[t.statut]}</span>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <select
            value={t.technicien_id ?? ''}
            disabled={busyId === t.id}
            onChange={(e) => assign(t, e.target.value)}
            className="input w-full text-sm"
          >
            <option value="">— À dispatcher —</option>
            {techniciens.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name ?? tech.email}
              </option>
            ))}
          </select>
          {t.technicien && (
            <p className="text-xs text-slate-500">
              Assigné à : <strong>{t.technicien.full_name ?? 'Technicien BioPlus'}</strong>
            </p>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Réclamations</h1>
          <p className="text-xs text-slate-500">
            {tickets.length} réclamation(s) · {aDispatcher.length} à dispatcher
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading} className="btn-outline px-3 py-1.5 text-xs">
            Actualiser
          </button>
          <Link to="/dashboard" className="btn-outline px-3 py-1.5 text-xs">
            Tableau de bord
          </Link>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {aDispatcher.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-red-700">
            À dispatcher ({aDispatcher.length})
          </h2>
          <ul className="space-y-2">{aDispatcher.map((t) => renderTicket(t, true))}</ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-900">
          Assignées / terminées ({suivies.length})
        </h2>
        {suivies.length === 0 ? (
          <div className="card bg-slate-100 text-center">
            <p className="text-sm text-slate-500">Aucune réclamation suivie pour le moment.</p>
          </div>
        ) : (
          <ul className="space-y-2">{suivies.map((t) => renderTicket(t, true))}</ul>
        )}
      </section>
    </div>
  );
}