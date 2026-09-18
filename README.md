# Portfolio API

Les données de mes portfolios (identité, projets, compétences, contact), servies
en JSON à **tous** les portfolios. Modifier `data/profil.json` met à jour
chacun d'eux, sans rebuild ni redéploiement.

Node ≥ 20, sans dépendance npm. Lecture seule.

---

## Démarrer

```bash
docker compose up -d --build     # -> http://localhost:3000/api/v1/profil
# ou, sans Docker :
npm run dev                      # redémarre à chaque modif de server.js
```

## Routes

| Route                     | Contenu                                         |
| ------------------------- | ----------------------------------------------- |
| `GET /api/v1/profil`      | tout, en une requête (ce que les portfolios utilisent) |
| `GET /api/v1/identite`    | nom, titre, bio, photo, faits, points forts     |
| `GET /api/v1/reseaux`     | email, GitHub, LinkedIn, CV                     |
| `GET /api/v1/projets`     | la liste des projets                            |
| `GET /api/v1/projets/:id` | un projet                                       |
| `GET /api/v1/experiences` | alternance, stages, bénévolat (du plus récent au plus ancien) |
| `GET /api/v1/competences` | groupes par niveau + notes                      |
| `GET /api/v1/contact`     | message, sujet du mail, zone                    |
| `GET /img/:fichier`       | les images                                      |
| `GET /health`             | sonde de santé                                  |

Réponses avec `ETag` (→ `304` si rien n'a changé) et `Cache-Control: max-age=60` :
une modification est visible partout en une minute au plus.

---

## Modifier les données

Tout est dans **`data/profil.json`**. Le fichier est relu dès qu'il change,
conteneur compris (il est monté en volume). Un JSON cassé pendant une édition
n'est pas grave : l'API garde la dernière version valide et l'écrit dans ses logs
(`docker compose logs -f`).

Les données sont **neutres** : pas de vocabulaire propre à un thème. C'est
chaque portfolio qui les traduit dans le sien (le circuit F1 transforme les
niveaux de compétence en gommes, les projets en virages…). Pour qu'un champ serve
à tous les portfolios, il doit rester neutre ici.

- **Projet** : `id` (stable, sert d'identifiant aux portfolios), `nomCourt`,
  `titre`, `contexte`, `description`, `images`, `fiche` (`[{label, valeur}]`),
  `points`, `liens` (`[{label, url}]`), `tags` (`'NestJS'` ou
  `{ "label": "…", "enAvant": true }`).
- **Expérience** : `id`, `type` (`alternance`, `stage`, `emploi`, `benevolat`),
  `poste`, `organisation`, `lieu`, `periode` (texte affiché), `debut` / `fin`
  (`AAAA-MM-JJ`, facultatifs), `duree`, `description`, `points`, `tags`. L'ordre
  du tableau est l'ordre d'affichage.
- **Faits** de l'identité : chacun a une `cle` (`localisation`, `entreprise`…)
  qu'un portfolio peut utiliser pour les renommer à sa sauce.
- **Compétences** : `niveau` ∈ `quotidien`, `solide`, `specialite`,
  `apprentissage`.
- `<code>…</code>` est autorisé dans `description`, `bio` et `points`.

Ne pas changer l'`id` d'un projet à la légère : un portfolio peut s'en servir
pour le placer, le masquer ou le compléter.

## Images

Déposer le fichier dans `img/` et le référencer **sans slash devant** :
`{ "src": "img/crm-commandes.webp", "legende": "Liste des commandes" }`.
L'API renvoie l'URL complète (`http://…/img/crm-commandes.webp`). Idem pour le
CV : `"cv": "img/cv.pdf"`.

Formats conseillés : `.webp` / `.jpg`, ~1200 px de large, moins de 300 Ko.
Tant que `src` est vide ou que le fichier manque, les portfolios affichent un
cadre « visuel à venir ».

---

## Configuration

Variables d'environnement (`docker-compose.yml`) :

| Variable        | Défaut | Rôle |
| --------------- | ------ | ---- |
| `PORT`          | `3000` | port d'écoute |
| `PUBLIC_URL`    | déduite de la requête | URL publique de l'API, pour les liens d'images. À renseigner derrière un reverse proxy (`https://api.mondomaine.fr`) |
| `CORS_ORIGINS`  | `*`    | origines autorisées, séparées par des virgules. Les données sont publiques, `*` convient ; restreindre à ses portfolios si on préfère |
| `CACHE_SECONDS` | `60`   | durée de cache côté navigateur |

## Déployer

N'importe où Node ou Docker tourne : un VPS (`docker compose up -d`), Render,
Railway, Fly.io… Mettre l'API en HTTPS (un portfolio en HTTPS ne peut pas
appeler une API en HTTP), puis donner son URL à chaque portfolio
(`VITE_API_URL` pour le circuit F1).
