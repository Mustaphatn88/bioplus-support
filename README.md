# BioPlus Support — PWA de support des automates Horiba ABX

Application web progressive (PWA) React + TypeScript + Vite + Tailwind pour la gestion des tickets de support des automates Horiba ABX, multi-laboratoires, avec Supabase (Auth, PostgreSQL + RLS, Storage) et déploiement continu sur GitHub Pages.

---

## Concept

**BioPlus Support** connecte trois mondes :

1. **Les laboratoires clients** (responsables/biologistes) — signalent une panne en **scannant le QR code collé sur l'automate** : la réclamation est pré-remplie (machine, laboratoire) et part immédiatement.
2. **Les techniciens BioPlus** — suivent les tickets assignés (ouvert → en cours → résolu) et notent leurs interventions.
3. **La direction BioPlus** — gère le portefeuille clients (fiches CRM), les alertes critiques par email (destinataires validés), les statistiques et les comptes.

Le QR code élimine toute saisie : un scan = une réclamation précise, sans erreur d'identification de l'équipement.

## Design & mise en page

- **Palette** : dégradés teal → émeraude, cartes blanches arrondies, ombres douces ; fond sombre pour l'authentification.
- **Typographie** : Inter ; composants réutilisables (`.btn-primary`, `.input`, `.card`, `.badge`, `.page-title`).
- **Badges** : statut = bleu (ouvert) / ambre (en cours) / vert (résolu) ; priorité = gris (normal) / ambre (important) / rouge (critique).
- **Graphiques** : Recharts (barres 12 mois, donut, classement des machines).
- **Responsive** : mobile-first — `max-w-md` sur téléphone, `max-w-6xl` + grilles 2/3/4 colonnes sur PC.
- **Temps réel** : Supabase Realtime — le Dashboard et la liste des réclamations se mettent à jour instantanément.
- **PWA** : installable, fonctionne hors-ligne (Workbox), 404.html pour les liens profonds GitHub Pages.

## Mode GALACTICOS (optionnel, par utilisateur)

Une **double interface** activable par flag, sans aucun impact sur le mode classique :

- `profiles.preferences.ui_mode` = `"classic"` (défaut) ou `"galacticos"` (Command Center, fiche automate v2, Incident Event, Galaxy View).
- Kill switch runtime : table `app_settings` (`key='force_ui_mode'`, `value={"mode":"classic"|"galacticos"}`) — bascule globale **sans redéploiement**.
- Kill switch de build : `VITE_FORCE_UI_MODE` (voir `.env.example`).
- Priorité : build > runtime > préférence individuelle > classic.

```sql
-- Activer pour un utilisateur
update profiles set preferences = '{"ui_mode":"galacticos"}'::jsonb
where user_id = (select id from auth.users where email = 'direction@bioplus.tn');

-- Tout le monde en mode classique (urgence)
update app_settings set value = '{"mode":"classic"}'::jsonb where key = 'force_ui_mode';
```

---

## Stack

| Couche        | Technologie                                        |
| ------------- | -------------------------------------------------- |
| Frontend      | React 18, TypeScript strict, Vite 5                |
| Styles        | Tailwind CSS 3 (mobile-first)                      |
| PWA           | vite-plugin-pwa (Workbox, stratégie NetworkFirst)  |
| Backend       | Supabase (Auth, PostgreSQL, Storage, RLS)          |
| Routing       | React Router 6                                     |
| CI/CD         | GitHub Actions → GitHub Pages                      |

## Architecture des données

```
auth.users ──── profiles ──── laboratoires
                  │                │
                  │                ├── automates ──── tickets
                  └───────────────>┘      │              │
                                          └── photo ─────> Storage bucket "photos"
```

- `profiles.user_id = auth.uid()` mais **jamais** `auth.uid()` comme identifiant de laboratoire : les tickets sont liés à `laboratoires.id`.
- L'appartenance à un laboratoire est vérifiée en base via `public.is_member_of(lab_id)` (RLS).
- Les photos sont stockées dans le bucket Storage `photos`, sous `{laboratoire_id}/{uuid}.jpg`. **Aucun base64 en base** : `tickets.photo_path` ne contient que le chemin.

## Rôles

| Rôle         | Droits dans l'UI                                              |
| ------------ | ------------------------------------------------------------- |
| super admin  | Tout (admins, comptes, alarmes) — m.dababi                    |
| admin        | Portefeuille clients, réclamations, statistiques, comptes, alarmes |
| technicien   | Dashboard « mes tickets », interventions                      |
| responsable  | Tickets de son laboratoire (QR), parc d'automates, statistiques |

## Structure du projet

```
bioplus-support/
├── .github/workflows/deploy.yml     # CI/CD → GitHub Pages
├── supabase-schema.sql              # Schéma complet : tables, RLS, Storage
├── public/
│   ├── favicon.svg
│   └── icons/                       # icônes PWA 192/512
└── src/
    ├── lib/supabaseClient.ts        # client + types
    ├── contexts/AuthContext.tsx     # session, profil, logout + purge des caches
    ├── components/
    │   ├── ProtectedRoute.tsx       # garde des routes authentifiées
    │   ├── AutomateScanner.tsx      # fiche automate depuis QR (route /automate/:id)
    │   └── Spinner.tsx
    └── pages/
        ├── Login.tsx
        ├── Dashboard.tsx
        ├── TicketCreation.tsx       # upload photo → Storage
        └── TicketDetail.tsx         # statut, photo (URL signée)
```

## Prérequis

- Node.js ≥ 18
- Un projet [Supabase](https://supabase.com) (plan gratuit suffisant)
- Un compte GitHub

## Installation locale

```bash
git clone https://github.com/Mustaphatn88/bioplus-support.git
cd bioplus-support
npm install
cp .env.example .env   # puis renseigner les valeurs
npm run dev            # http://localhost:5173
```

## Configuration Supabase

### Option A — Automatique (recommandée)

Une fois le projet Supabase créé, exécutez depuis la racine du dépôt :

```powershell
./scripts/setup-supabase.ps1 -ProjectRef "abcdefghijkl" `
  -AccessToken "sbp_..." -AnonKey "eyJ..."
```

Le script : (1) applique `supabase-schema.sql` via l'API de gestion Supabase, (2) configure les secrets GitHub, (3) écrit `.env`, (4) lance le déploiement de production.

### Option B — Manuelle

1. Créez un projet Supabase.
2. **SQL Editor** → collez le contenu de `supabase-schema.sql` → Run. Cela crée :
   - les tables `laboratoires`, `profiles`, `automates`, `tickets` ;
   - la fonction `is_member_of(uuid)` et le trigger de création de profil à l'inscription ;
   - le RLS sur toutes les tables ;
   - le bucket Storage `photos` (privé) avec ses politiques par laboratoire ;
   - des données de démo.
3. **Authentication → Users** : invitez vos techniciens (email + mot de passe). Chaque inscription crée automatiquement un profil `technicien`.
4. Rattachez chaque utilisateur à son laboratoire (colonne `laboratoire_id`) :
   ```sql
   update public.profiles
   set laboratoire_id = (select id from public.laboratoires where nom = 'Laboratoire BioPlus Tunis'),
       role = 'technicien'        -- ou 'responsable'
   where user_id = 'UUID_DE_L_UTILISATEUR';
   ```
5. **Project Settings → API** : copiez `Project URL` et `anon public key` dans `.env` et dans les secrets GitHub (voir ci-dessous).

> Les clés Supabase d'un projet sont publiques (anon). Elles servent uniquement à démarrer le client ; toute la sécurité repose sur le RLS.

## Déploiement (GitHub Actions + Pages) — HÔTE DE RÉFÉRENCE

**URL officielle : https://bioplusequipements.github.io/bioplus-support/**

1. Créez le dépôt GitHub et poussez le code (branche `main`).
2. **Settings → Secrets and variables → Actions** : ajoutez
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages** : Source = **GitHub Actions** (déploiement via `actions/deploy-pages@v4`, pas de branche `gh-pages`).
4. Poussez sur `main` : le workflow `.github/workflows/deploy.yml` installe, build avec les variables injectées, puis publie `dist/`.
5. `404.html` (copie de `index.html`) assure la redirection SPA GitHub Pages.

### Netlify (désactivé — quota du plan gratuit épuisé)

Le workflow `.github/workflows/deploy-netlify.yml` existe mais est **volontairement en `workflow_dispatch`** : le quota du plan gratuit a été épuisé (`JSONHTTPError: Forbidden`). Il peut être réactivé plus tard (nouveau mois ou crédits payants) :
1. **User settings → Applications → New access token** : générez un token (`NETLIFY_AUTH_TOKEN`)
2. Ajoutez les secrets GitHub :
   - `NETLIFY_AUTH_TOKEN` (le token)
   - `NETLIFY_SITE_ID` (l'id du site)
3. Créez le site ("Add new site") puis lancez le workflow manuellement depuis l'onglet Actions.
4. Le fichier `public/_redirects` (`/* /index.html 200`) assure la redirection SPA.

QR codes (encodés automatiquement avec l'URL de l'hôte courant) :

```
https://bioplusequipements.github.io/bioplus-support/automate/{id}
```

## Sécurité

- **RLS PostgreSQL** : toutes les tables. Un utilisateur ne voit que les données de son laboratoire (vérification serveur via `is_member_of`, jamais contournable par le client).
- **Storage** : bucket privé ; politique d'insertion/lecture restreinte au dossier `{laboratoire_id}/` de l'utilisateur. Les photos sont affichées via URL signée (1 h).
- **Pas de base64** : les photos passent par Supabase Storage.
- **Isolation PWA** : le Service Worker utilise `NetworkFirst` avec des caches préfixés `bioplus-`. Au **logout**, `clearAllCaches()` (src/contexts/AuthContext.tsx) supprime tous les caches dynamiques + précache : aucun résidu de données d'un utilisateur A ne subsiste pour l'utilisateur B sur le même appareil.
- Le JWT est attaché automatiquement par supabase-js à chaque requête.

## Routes

| Route              | Accès        | Description                                     |
| ------------------ | ------------ | ----------------------------------------------- |
| `/login`           | public       | Connexion (redirige vers l'URL d'origine)       |
| `/dashboard`       | authentifié  | Tableau de bord + liste des tickets du laboratoire |
| `/automate/:id`    | authentifié  | Fiche automate (cible des QR codes)             |
| `/ticket/new`      | authentifié  | Création d'un ticket (+ photo)                  |
| `/ticket/:id`      | authentifié  | Détail, photo, mise à jour du statut            |

## Scripts

```bash
npm run dev      # serveur de dev
npm run build    # typecheck TS strict + build de production
npm run preview  # prévisualisation du build
```

## Roadmap

- [ ] Interface super-admin BioPlus (gestion laboratoires, comptes, équipements)
- [ ] Notifications push (tickets critiques)
- [ ] Historique / audit trail des tickets
- [ ] Mode hors-ligne complet (file d'attente des tickets en local)