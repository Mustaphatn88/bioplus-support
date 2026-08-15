import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  supabase,
  type Laboratoire,
  type Priorite,
  type Statut,
  type TicketWithAutomate
} from '../lib/supabaseClient';
import Spinner from '../components/Spinner';

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

export default function Dashboard() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [laboratoire, setLaboratoire] = useState<Laboratoire | null>(null);
  const [tickets, setTickets] = useState<TicketWithAutomate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.laboratoire_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from('laboratoires')
        .select('*')
        .eq('id', profile.laboratoire_id)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('*, automates(id, nom, modele)')
        .order('created_at', { ascending: false })
        .limit(100)
    ]).then(([labo, tick]) => {
      setLaboratoire(labo.data as Laboratoire | null);
      if (tick.error) setError(tick.error.message);
      else setTickets(tick.data as TicketWithAutomate[]);
      setLoading(false);
    });
  }, [profile?.laboratoire_id]);

  const stats = useMemo(() => {
    const byStatut: Record<Statut, number> = { ouvert: 0, en_cours: 0, resolu: 0 };
    const byPriorite: Record<Priorite, number> = { normal: 0, important: 0, critique: 0 };
    for (const t of tickets) {
      byStatut[t.statut] += 1;
      byPriorite[t.priorite] += 1;
    }
    return { byStatut, byPriorite, total: tickets.length };
  }, [tickets]);

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  function renderHeader() {
    return (
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">BioPlus Support</h1>
          <p className="text-xs text-slate-500">
            {laboratoire?.nom ?? 'Profil non rattaché'} · {profile?.role}
          </p>
        </div>
        <button onClick={handleLogout} className="btn-outline px-3 py-1.5 text-xs">
          Déconnexion
        </button>
      </header>
    );
  }

  if (loading) return <Spinner label="Chargement du tableau de bord..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4">
      {renderHeader()}

      {profile?.role === 'admin' && (
        <div className="space-y-4">
          <div className="card border-dashed">
            <h2 className="text-base font-bold text-slate-900">Super-administration BioPlus</h2>
            <p className="mt-1 text-sm text-slate-500">
              Gestion multi-laboratoires, comptes utilisateurs et parc d'automates.
            </p>
          </div>
          <div className="space-y-2">
            <Link to="/users" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">Comptes utilisateurs</p>
              <p className="text-xs text-slate-500">
                Créer les comptes des laboratoires clients (biologistes, techniciens), gérer les
                rôles et les accès.
              </p>
            </Link>
            <Link to="/automates" className="card block transition hover:border-teal-600">
              <p className="text-sm font-semibold text-slate-900">Parc d'automates</p>
              <p className="text-xs text-slate-500">
                Ajouter, modifier ou retirer les machines de chaque laboratoire.
              </p>
            </Link>
          </div>
        </div>
      )}

      {profile?.role !== 'admin' && !profile?.laboratoire_id && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">
            Votre profil n'est pas encore rattaché à un laboratoire.
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Contactez l'administration BioPlus pour activer votre compte.
          </p>
        </div>
      )}

      {profile?.role !== 'admin' && profile?.laboratoire_id && (
        <>
          {profile.role === 'responsable' && (
            <>
              <section className="mb-4 grid grid-cols-3 gap-2">
                <div className="card text-center">
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                  <p className="text-xs text-slate-500">Tickets</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {stats.byStatut.ouvert + stats.byStatut.en_cours}
                  </p>
                  <p className="text-xs text-slate-500">En attente</p>
                </div>
                <div className="card text-center">
                  <p className="text-2xl font-bold text-red-600">{stats.byPriorite.critique}</p>
                  <p className="text-xs text-slate-500">Critiques</p>
                </div>
              </section>
              <Link to="/automates" className="card mb-4 block transition hover:border-teal-600">
                <p className="text-sm font-semibold text-slate-900">Parc d'automates</p>
                <p className="text-xs text-slate-500">
                  Ajouter des machines, imprimer leurs QR codes, gérer leur statut.
                </p>
              </Link>
            </>
          )}

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Tickets de mon laboratoire</h2>
            <Link to="/ticket/new" className="btn-primary px-3 py-1.5 text-xs">
              + Nouveau
            </Link>
          </div>

          {tickets.length === 0 ? (
            <div className="card bg-slate-100 text-center">
              <p className="text-sm text-slate-500">Aucun ticket pour le moment.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link to={`/ticket/${t.id}`} className="card block transition hover:border-teal-600">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {t.automates?.nom ?? 'Automate supprimé'}
                      </p>
                      <span className={`badge ${PRIORITE_STYLES[t.priorite]}`}>{t.priorite}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {t.message_erreur ?? t.description ?? 'Sans message'}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`badge ${STATUT_STYLES[t.statut]}`}>{t.statut}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(t.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {profile && user && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Connecté en tant que {user.email}
        </p>
      )}
    </div>
  );
}