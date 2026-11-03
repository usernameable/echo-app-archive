const CACHE = 'echo-local-v21';
const ASSETS = ['./', './index.html', './styles.css', './02-设计规范/design-tokens.css', './fonts/fonts.css',
  './fonts/fredoka-latin.woff2', './fonts/nunito-latin.woff2',
  './bootstrap.js', './app.js', './content.js', './recorder.js?v=4.2.2', './recognition.js',
  './assessment.js', './tts.js', './storage.js', './microphone.js',
  './audio-worklet.js', './dialogue.js', './flow-screens.js', './progress.js', './icons.js', './buddy.js', './parent.js', './selfcheck.js',
  './assets/mascot/echo-mascot-parrot-macaw-A.png',
  './assets/illo/echo-illo-unit-asking-the-way.png', './assets/illo/echo-illo-unit-clinic.png',
  './assets/illo/echo-illo-unit-dining.png', './assets/illo/echo-illo-unit-weekend.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request, { ignoreSearch:true })));
});
