import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, type Automate } from '../lib/supabaseClient';
import Spinner from './Spinner';

export default function AutomateScanner() {
  const { id } = useParams<{ id: string }>();
  const [automate, setAutomate] = useState<Automate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setError('Identifiant d\u2019automate manquant dans l\u2019URL.');
      setLoading(false);
      return;
    }
    supabase
      .from('automates')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) {
          setError('Erreur lors du chargement de l\u2019automate.');
        } else if (!data) {
          setError('Automate introuvable ou hors de votre laboratoire (accès refusé par RLS).');
        } else {
          setAutomate(data as Automate);
        }
        setLoading(false);
      });
  }, [id]);

  if (loading) return <Spinner label="Lecture du QR code..." />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">BioPlus Support</h1>
          <p className="text-xs text-slate-500">Fiche automate</p>
        </div>
        <Link to="/dashboard" className="text-sm font-semibold text-teal-700">
          Tableau de bord
        </Link>
      </header>

      {error ? (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <p className="mt-1 text-xs text-red-500">
            Vérifiez que vous êtes connecté avec un compte rattaché au laboratoire propriétaire
            de cet automate.
          </p>
        </div>
      ) : (
        automate && (
          <div className="space-y-4">
            <div className="card">
              <span className="badge mb-2 bg-teal-100 text-teal-800">
                {automate.statut ?? 'inconnu'}
              </span>
              <h2 className="text-xl font-bold text-slate-900">{automate.nom}</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Modèle</dt>
                  <dd className="font-medium text-slate-900">{automate.modele ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">N° de série</dt>
                  <dd className="font-mono font-medium text-slate-900">
                    {automate.numero_serie ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <Link
              to={`/ticket/new?automate_id=${automate.id}`}
              className="btn-primary w-full py-3 text-base"
            >
              Créer une réclamation pour cet automate
            </Link>

            <Link to="/dashboard" className="btn-outline w-full">
              Retour au tableau de bord
            </Link>
          </div>
        )
      )}
    </div>
  );
}