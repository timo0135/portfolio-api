/* ==========================================================================
   PORTFOLIO API
   --------------------------------------------------------------------------
   Sert les données de portfolio (data/profil.json) et les images (img/) à
   tous les portfolios. Lecture seule, sans dépendance.

   Le JSON est relu dès que le fichier change : modifier data/profil.json
   met à jour tous les portfolios, sans redémarrer ni redéployer.
   ========================================================================== */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = fileURLToPath(new URL('.', import.meta.url))
const FICHIER = join(RACINE, 'data', 'profil.json')
const DOSSIER_IMG = resolve(RACINE, 'img')

const PORT = Number(process.env.PORT) || 3000
// URL publique de l'API, pour rendre absolus les chemins d'images.
// Vide → déduite de la requête (Host / X-Forwarded-*).
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')
// Origines autorisées, séparées par des virgules. '*' = tout le monde
// (les données sont publiques : c'est un portfolio).
const ORIGINES = (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim())
const CACHE_SECONDES = Number(process.env.CACHE_SECONDS ?? 60)

const TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

/* --- chargement des données, rechargées quand le fichier change -------- */
let cache = { mtime: 0, donnees: null, etag: '' }

async function donnees() {
  const { mtimeMs } = await stat(FICHIER)
  if (mtimeMs !== cache.mtime) {
    const brut = await readFile(FICHIER, 'utf8')
    try {
      cache = {
        mtime: mtimeMs,
        donnees: JSON.parse(brut),
        etag: '"' + createHash('sha1').update(brut).digest('base64url') + '"'
      }
      console.log(`[data] profil.json chargé (${new Date(mtimeMs).toISOString()})`)
    } catch (err) {
      // JSON cassé pendant une édition : on garde la dernière version valide
      console.error(`[data] profil.json invalide, version précédente conservée : ${err.message}`)
      if (!cache.donnees) throw err
      cache.mtime = mtimeMs
    }
  }
  return cache
}

/* --- chemins d'images relatifs → URL absolues de l'API ------------------ */
function baseUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] || 'http'
  const hote = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${hote}`
}

function absolutiser(valeur, base) {
  if (Array.isArray(valeur)) return valeur.map((v) => absolutiser(v, base))
  if (valeur && typeof valeur === 'object') {
    const copie = {}
    for (const [k, v] of Object.entries(valeur)) {
      copie[k] =
        (k === 'src' || k === 'cv') && typeof v === 'string' && v.startsWith('img/')
          ? `${base}/${v}`
          : absolutiser(v, base)
    }
    return copie
  }
  return valeur
}

/* --- routes ------------------------------------------------------------- */
const ROUTES = {
  '/api/v1/profil': (d) => d,
  '/api/v1/identite': (d) => d.identite,
  '/api/v1/reseaux': (d) => d.reseaux,
  '/api/v1/projets': (d) => d.projets,
  '/api/v1/experiences': (d) => d.experiences,
  '/api/v1/competences': (d) => d.competences,
  '/api/v1/contact': (d) => d.contact
}

function cors(req, res) {
  const origine = req.headers.origin
  if (ORIGINES.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*')
  else if (origine && ORIGINES.includes(origine)) {
    res.setHeader('Access-Control-Allow-Origin', origine)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'If-None-Match')
}

function json(res, statut, corps, entetes = {}) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', ...entetes })
  res.end(JSON.stringify(corps))
}

async function servirDonnees(req, res, extraire) {
  const { donnees: d, etag } = await donnees()
  const valeur = extraire(d)
  if (valeur === undefined) return json(res, 404, { erreur: 'Introuvable' })

  // l'URL publique fait partie de la réponse : elle entre dans l'ETag
  const base = baseUrl(req)
  const etagReponse = etag.slice(0, -1) + '-' + createHash('sha1').update(base).digest('base64url').slice(0, 8) + '"'
  const entetes = { ETag: etagReponse, 'Cache-Control': `public, max-age=${CACHE_SECONDES}` }
  if (req.headers['if-none-match'] === etagReponse) {
    res.writeHead(304, entetes)
    return res.end()
  }
  json(res, 200, absolutiser(valeur, base), entetes)
}

async function servirImage(req, res, chemin) {
  const fichier = resolve(DOSSIER_IMG, '.' + decodeURIComponent(chemin.slice('/img'.length)))
  // pas de sortie du dossier img/ (../../etc/passwd)
  if (!fichier.startsWith(DOSSIER_IMG + sep)) return json(res, 404, { erreur: 'Introuvable' })
  const type = TYPES[extname(fichier).toLowerCase()]
  if (!type) return json(res, 404, { erreur: 'Introuvable' })
  try {
    const infos = await stat(fichier)
    if (!infos.isFile()) throw new Error('pas un fichier')
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': infos.size,
      'Cache-Control': 'public, max-age=604800',
      'Last-Modified': infos.mtime.toUTCString()
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(fichier).pipe(res)
  } catch {
    json(res, 404, { erreur: 'Introuvable' })
  }
}

const serveur = createServer(async (req, res) => {
  cors(req, res)
  res.setHeader('X-Content-Type-Options', 'nosniff')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { erreur: 'Lecture seule' }, { Allow: 'GET, HEAD, OPTIONS' })
  }

  const chemin = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/'

  try {
    if (chemin === '/health') return json(res, 200, { ok: true })
    if (chemin.startsWith('/img/')) return await servirImage(req, res, chemin)
    if (ROUTES[chemin]) return await servirDonnees(req, res, ROUTES[chemin])

    const projet = chemin.match(/^\/api\/v1\/projets\/([\w-]+)$/)
    if (projet) {
      return await servirDonnees(req, res, (d) => d.projets.find((p) => p.id === projet[1]))
    }

    if (chemin === '/' || chemin === '/api/v1') {
      return json(res, 200, {
        routes: [...Object.keys(ROUTES), '/api/v1/projets/:id', '/img/:fichier', '/health']
      })
    }
    json(res, 404, { erreur: 'Introuvable' })
  } catch (err) {
    console.error(err)
    json(res, 500, { erreur: 'Erreur serveur' })
  }
})

serveur.listen(PORT, () => console.log(`[api] http://localhost:${PORT}/api/v1/profil`))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => serveur.close(() => process.exit(0)))
}
