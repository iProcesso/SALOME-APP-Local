// ═══════════════════════════════════════════════════════════
// SALOME — Service Worker · Fase 1 (PWA)
// Estratégia:
//   • Arquivos do app (HTML, dashboard, TV, ícones, fontes):
//     stale-while-revalidate  →  abre instantâneo do cache e
//     atualiza em background para a próxima vez.
//   • Chamadas ao Apps Script (script.google.com):
//     NUNCA cacheia — sempre vai direto à rede, pois são
//     dados dinâmicos (apontamentos, login, dashboard, TV).
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = "salome-v20-cache-v1";

// Arquivos "casca" do app — ficam em cache para abertura offline
const SHELL_FILES = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./salome_tv_view.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// Domínios que NUNCA devem ser cacheados (dados dinâmicos)
const NO_CACHE_HOSTS = [
  "script.google.com",
  "script.googleusercontent.com",
];

// ── Instalação: baixa a casca ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falha se QUALQUER arquivo falhar — usamos add individual
      // para não quebrar tudo se um ícone estiver faltando no primeiro deploy
      return Promise.all(
        SHELL_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("SW: falha ao cachear", url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Ativação: limpa caches antigos ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratégia por tipo de request ──
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Não interfere em métodos que não são GET (POST ao backend, etc.)
  if (req.method !== "GET") return;

  // 2) Domínios de dados dinâmicos: passa direto à rede, sem cache
  if (NO_CACHE_HOSTS.some((h) => url.hostname.includes(h))) {
    return; // deixa o navegador fazer o fetch normal
  }

  // 3) App shell + assets: stale-while-revalidate
  //    → responde do cache imediatamente (se houver)
  //    → em paralelo, busca versão fresca da rede e atualiza o cache
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then((netRes) => {
          // Só cacheia respostas OK e do mesmo tipo
          if (netRes && netRes.status === 200 && netRes.type === "basic") {
            cache.put(req, netRes.clone()).catch(() => {});
          }
          return netRes;
        })
        .catch(() => cached); // sem rede? devolve o que tiver em cache

      // Retorna cache imediatamente se existir; senão espera a rede
      return cached || fetchPromise;
    })
  );
});

// ── Mensagem opcional: força atualização (usado no botão "Atualizar" futuro) ──
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
