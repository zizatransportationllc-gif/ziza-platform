# Phase 1 — Durcissement sécurité (P0)

- **Date** : 2026-06-11
- **Branche** : `phase1-security-hardening` (basée sur `main`, indépendante de la PR Phase 0)

## Contexte

Avant la prod, fermer les trous P0 de la chaîne CI/CD et des dépendances :
le déploiement n'était gaté sur aucun test, l'audit sécurité ne bloquait
jamais, et des CVE connues traînaient dans les dépendances (dont l'auth).

## Fait

### 1. Déploiement gaté sur les tests
`deploy-dev.yml` : nouveau job `test-gate` (pytest, python 3.12) dont dépend
`build-push`. Chaîne : `test-gate → build-push → migrate → deploy`. **Une suite
rouge bloque désormais tout le déploiement** (avant : déploiement sur `push main`
sans aucune dépendance aux tests).

### 2. Audit sécurité partiellement bloquant
`ci.yml`, job `security-audit` :
- **bandit → bloquant** en seuil HIGH (`-lll`). Vérifié : 0 finding high actuel
  (1 medium B310 `urlopen` Stripe connu, hors périmètre du gate). Bloque tout
  nouveau code à haute sévérité.
- **pip-audit** : le flag `--fail-on CRITICAL` était **invalide** (n'existe pas
  dans pip-audit) → l'étape errait silencieusement depuis toujours. Corrigé : il
  reporte désormais réellement les vulns. Laissé non-bloquant le temps de traiter
  le résiduel (ci-dessous).
- npm audit (web) : inchangé (report-only) — frontend hors périmètre Phase 1.

### 3. Upgrade dépendance auth-critique
`requirements.txt` : **`PyJWT 2.9.0 → 2.13.0`** — corrige 8 CVE (dont des failles
liées à la vérification de tokens, cœur de l'auth ZIZA). Suite complète verte
après upgrade (**449 passed**, python 3.12).

## Résiduel à traiter (tracké)

pip-audit signale encore des CVE nécessitant des **bumps majeurs / coordonnés** —
volontairement différés (risque de régression à isoler) :
- **Pillow 10.4.0 → 12.x** (6 CVE) — utilisé pour image→PDF (Sprint 61) ; bump
  majeur, tester la conversion de documents.
- **starlette 0.46.2 → 0.47+/1.0** (3 CVE) — dépendance transitive de FastAPI ;
  nécessite de remonter `fastapi` en cohérence (`>=0.115,<0.116` aujourd'hui).
- **pytest 8.3.3 → 9.x** (1 CVE) — dev-only (non livré en prod) ; bump majeur du
  runner de tests.

Une fois ces trois traités, rendre **pip-audit bloquant** dans `ci.yml`.

## Vérification

- Suite backend : **449 passed** dans Docker (python:3.12, deps épinglées) après upgrade PyJWT.
- bandit `-lll` : exit 0 (gate sûr) ; `-ll` : exit 1 (d'où le seuil HIGH).
- YAML des deux workflows validé (parse OK ; chaîne `needs` correcte).
- Note : la logique GitHub Actions elle-même n'est exécutable qu'au merge sur `main`
  (le workflow ne se déclenche que sur `push: branches: [main]`).
