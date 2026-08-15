# BioPlus Support — PWA de support des automates Horiba ABX

Application web progressive (PWA) React + TypeScript + Vite + Tailwind pour la gestion des tickets de support des automates Horiba ABX, multi-laboratoires, avec Supabase (Auth, PostgreSQL + RLS, Storage) et déploiement continu sur GitHub Pages.

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

| Rôle        | Droits dans l'UI (V1)                                              |
| ----------- | ------------------------------------------------------------------ |
| technicien  | Voir son laboratoire, créer/consulter/mettre à jour ses tickets    |
| responsable | + statistiques de son laboratoire (tickets, en attente, critiques) |
| admin       | Layout super-admin (placeholder, livré en V2)                      |

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
5. **Project Settings → API** : copiez `Project URL` et `anon public key` dans `.env`.

> Les clés Supabase d'un projet sont publiques (anon). Elles servent uniquement à démarrer le client ; toute la sécurité repose sur le RLS.

## Déploiement (GitHub Actions + Pages)

1. Créez le dépôt GitHub et poussez le code (branche `main`).
2. **Settings → Secrets and variables → Actions** : ajoutez
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages** : Source = **GitHub Actions** (déploiement via `actions/deploy-pages@v4`, pas de branche `gh-pages`).
4. Poussez sur `main` : le workflow `.github/workflows/deploy.yml` installe, build avec les variables injectées, puis publie `dist/`.
5. Option : **Settings → Pages → Custom domain** → `app.bioplus.tn`.

Chaque QR code d'automate contient l'URL :

```
https://app.bioplus.tn/automate/{id}
```

Après scan + connexion, l'utilisateur est redirigé vers la fiche de l'automate ; le bouton « Nouveau ticket » pré-remplit l'automate. La RLS garantit qu'un automate hors du laboratoire est invisible (accès refusé).

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