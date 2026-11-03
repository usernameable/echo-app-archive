const durations = new Map();
let voice = null;
let active = null;
export function englishVoices() { return speechSynthesis.getVoices().filter(item => item.lang.toLowerCase().startsWith('en')); }
export function selectedVoice() { return voice?.name ?? null; }
export function initVoices(onChange) {
  const update = () => { voice = englishVoices().find(item => item.lang.toLowerCase() === 'en-us') ?? englishVoices()[0] ?? null; onChange?.(voice, englishVoices().length); };
  speechSynthesis.addEventListener('voiceschanged', update);
  update();
}
export function targetDuration(text) { return durations.get(text) ?? text.match(/[A-Za-z']+/g).length * .45; }
export function speak(text, { rate = 1, cacheDuration = false, onError } = {}) {
  voice ??= englishVoices().find(item => item.lang.toLowerCase() === 'en-us') ?? englishVoices()[0] ?? null;
  if (!voice) return Promise.resolve(false);
  stopSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = rate;
  const start = performance.now();
  return new Promise(resolve => {
    const finish = played => { if (active !== finish) return; active = null; if (played && cacheDuration) durations.set(text, (performance.now() - start) / 1000); resolve(played); };
    active = finish;
    utterance.onend = () => finish(true);
    utterance.onerror = event => { onError?.(event.error); finish(false); };
    speechSynthesis.speak(utterance);
    speechSynthesis.resume();
  });
}
export function stopSpeech() { speechSynthesis.cancel(); active?.(false); active = null; }
