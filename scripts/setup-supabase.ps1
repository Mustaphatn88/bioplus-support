# ============================================================================
# setup-supabase.ps1 — Branchement automatique de la production Supabase
#
# Usage (une seule fois, après création du projet Supabase) :
#   ./scripts/setup-supabase.ps1 -ProjectRef "abcdefghijkl" `
#     -AccessToken "sbp_..." -AnonKey "eyJ..."
#
#   - ProjectRef  : Supabase Dashboard > Project Settings > General
#                   (identifiant de 20 caractères dans l'URL du projet)
#   - AccessToken : Supabase Dashboard > Account > Access Tokens
#                   (générer un token "Personal access token" — secret, ne
#                   jamais le partager ni le committer)
#   - AnonKey     : Project Settings > API > anon public key
#                   (publique par conception, embarquée dans le bundle)
#
# Effets :
#   1. Applique supabase-schema.sql (tables, RLS, Storage) via l'API de gestion
#   2. Configure les secrets GitHub VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
#   3. Écrit le fichier .env local
#   4. Lance le déploiement GitHub Pages
# ============================================================================

param(
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$AccessToken,
  [Parameter(Mandatory = $true)][string]$AnonKey,
  [string]$ProjectUrl = ""
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $ProjectUrl) { $ProjectUrl = "https://$ProjectRef.supabase.co" }

Write-Host "1/4 Application du schéma SQL sur $ProjectUrl ..."
$sql = Get-Content -Raw -LiteralPath (Join-Path $root 'supabase-schema.sql')
$body = @{ query = $sql } | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
    -Method Post `
    -Headers @{ Authorization = "Bearer $AccessToken" } `
    -ContentType 'application/json' `
    -Body $body | Out-Null
  Write-Host "   Schéma appliqué (tables, RLS, bucket photos)."
}
catch {
  Write-Error "Échec de l'application du schéma : $($_.ErrorDetails.Message)"
  exit 1
}

$repo = gh repo view --json nameWithOwner --jq '.nameWithOwner'
if (-not $repo) { Write-Error "gh non authentifié — exécutez 'gh auth login'."; exit 1 }

Write-Host "2/4 Configuration des secrets GitHub sur $repo ..."
gh secret set VITE_SUPABASE_URL --repo $repo --body $ProjectUrl
gh secret set VITE_SUPABASE_ANON_KEY --repo $repo --body $AnonKey
Write-Host "   Secrets configurés."

Write-Host "3/4 Écriture du fichier .env local ..."
@("VITE_SUPABASE_URL=$ProjectUrl", "VITE_SUPABASE_ANON_KEY=$AnonKey") |
  Set-Content -LiteralPath (Join-Path $root '.env') -Encoding utf8
Write-Host "   .env écrit (ignoré par git)."

Write-Host "4/4 Lancement du déploiement de production ..."
gh workflow run "Deploy PWA BioPlus" --repo $repo
Write-Host "Terminé. Suivi du déploiement : https://github.com/$repo/actions"

Write-Host ""
Write-Host "Étapes manuelles restantes :"
Write-Host "  1. Inviter les techniciens : Authentication > Users > Add user"
Write-Host "  2. Rattacher chaque profil à un laboratoire :"
Write-Host "     update public.profiles set laboratoire_id = (select id from public.laboratoires where nom = 'Laboratoire BioPlus Tunis'), role = 'technicien' where user_id = '<UUID>';"