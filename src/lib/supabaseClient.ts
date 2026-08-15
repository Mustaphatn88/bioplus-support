import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY manquantes (voir .env.example).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Role = 'admin' | 'responsable' | 'technicien';

export interface Laboratoire {
  id: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  created_at: string;
}

export interface Profile {
  user_id: string;
  laboratoire_id: string | null;
  role: Role;
  statut: 'en_attente' | 'valide';
  full_name: string | null;
  laboratoire_nom: string | null;
  laboratoire_ville: string | null;
  laboratoire_adresse: string | null;
  laboratoire_telephone: string | null;
  created_at: string;
}

export interface Automate {
  id: string;
  laboratoire_id: string;
  nom: string;
  modele: string | null;
  numero_serie: string | null;
  statut: string | null;
  created_at: string;
}

export type Priorite = 'normal' | 'important' | 'critique';
export type Statut = 'ouvert' | 'en_cours' | 'resolu';

export interface Ticket {
  id: string;
  laboratoire_id: string;
  automate_id: string;
  numero_serie: string | null;
  message_erreur: string | null;
  code_erreur: string | null;
  description: string | null;
  photo_path: string | null;
  priorite: Priorite;
  statut: Statut;
  technicien_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface TicketWithAutomate extends Ticket {
  automates: Pick<Automate, 'id' | 'nom' | 'modele'> | null;
  technicien?: { full_name: string | null } | null;
  laboratoire?: Pick<Laboratoire, 'id' | 'nom'> | null;
}

export interface Intervention {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}