# Phase 5 — Revue sécurité du stockage des documents KYC

- **Date** : 2026-06-11
- **Branche** : `phase5-kyc-storage-security` (basée sur `main`)
- **Périmètre** : flux d'upload, de stockage (GCS) et d'accès aux documents KYC
  (permis, assurance, carte grise, pièce d'identité) des chauffeurs/professionnels.

## Flux audité

1. `POST /v1/drivers/me/documents/upload-url` → URL signée GCS (PUT, 15 min, v4).
2. Le client PUT le fichier directement sur GCS.
3. `POST /v1/drivers/me/documents` → enregistre l'**URL** du document (statut `pending`).
4. `GET /v1/admin/documents` / `onboarding` → l'admin **affiche** l'URL pour validation.

## Findings

### 🔴 F1 — Documents KYC servis via des URLs **publiques** (non corrigé — voir reco)
`get_document_upload_url` renvoie `final_url = https://storage.googleapis.com/<bucket>/<key>`
et cette URL publique est stockée puis affichée dans la console admin. Pour qu'un
navigateur l'affiche (sans auth GCS), l'objet/bucket doit être **lisible publiquement**
→ toute personne disposant de l'URL (logs, header Referer, historique, partage) peut
télécharger une pièce d'identité. L'unique protection est l'UUID dans la clé
(sécurité par obscurité). **Exposition de PII.**

**Recommandation (nécessite GCS live + frontend → non implémenté ici)** :
- Bucket **privé** (uniform bucket-level access, aucun accès public).
- Stocker en base la **clé d'objet**, pas une URL publique.
- Nouvel endpoint backend autorisé (`admin` **ou** le propriétaire) qui génère à la
  demande une **URL signée en lecture** courte (~5 min) ; l'admin affiche cette URL.
- Vérifier l'autorisation (rôle/possession) à chaque génération (A01 — deny par défaut).

### 🟠 F2 — `url` de document non validé → XSS stocké (CORRIGÉ)
`DocumentSubmitRequest.url` acceptait n'importe quelle chaîne (`min_length=1`),
affichée ensuite dans l'admin → `javascript:`, `data:text/html`, `data:image/svg+xml`
(SVG porteur de script) permettaient un **XSS stocké** dans le contexte admin.
**Corrigé** : `field_validator` n'autorise que `http(s)://` et les `data:` image
(png/jpeg/webp) / PDF ; rejette les schémas à script. Tests : `test_kyc_doc_security.py`.

### 🟡 F3 — `upload-url` : `content_type`/`filename` non validés (CORRIGÉ)
`content_type` arbitraire (ex. `text/html`) signait une URL permettant de **servir du
HTML/JS depuis le bucket** ; `filename` était interpolé brut dans la clé d'objet
(risque de traversal/altération de clé). **Corrigé** : allowlist de `content_type`
(PDF/JPEG/PNG/WebP) et assainissement du `filename` (basename + caractères sûrs,
≤128). Tests inclus.

### 🟡 F4 — Secret JWT dev < 32 octets (info / prod)
pytest émet `InsecureKeyLengthWarning` (clé HMAC 24 octets). La Phase 0 impose déjà un
`JWT_SECRET` non-défaut en prod ; **ajouter une contrainte de longueur ≥ 32 octets**
au garde-fou prod. (Suivi Phase 1/0.)

### ℹ️ F5 — Pas de limite de taille à l'upload signé (info)
L'URL signée PUT n'impose pas de taille max. Recommandé : conditions de taille sur
l'URL signée et/ou règle de cycle de vie du bucket.

## Corrigé dans cette PR (testé)

- F2 : validation anti-XSS du `url` de document.
- F3 : allowlist `content_type` + assainissement `filename` sur `upload-url`.
- Suite complète : **457 passed** (Docker python:3.12). +8 tests (`test_kyc_doc_security.py`).

## À traiter (follow-up, hors PR car nécessite GCS live + frontend)

- **F1** (prioritaire) : bucket privé + endpoint d'URL signée en lecture autorisée.
- F4 : longueur minimale du `JWT_SECRET` en prod.
- F5 : limite de taille des uploads.
- Vérifier la config réelle du bucket GCS (accès public désactivé, UBLA activé).
