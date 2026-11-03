import { ASSESSMENT_THRESHOLDS } from './assessment.js';

export async function startLocalRecognition(recordingId) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition?.available) { if (new URLSearchParams(location.search).get('debug') === '1') console.info('本地识别能力', '接口不可用'); return null; }
  try {
    const availability = await Recognition.available({ langs: ['en-US'], processLocally: true });
    if (new URLSearchParams(location.search).get('debug') === '1') console.info('本地识别能力', availability);
    if (availability !== 'available') return null;
  } catch { return null; }
  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.processLocally = true;
  recognition.continuous = false;
  recognition.interimResults = false;
  let settled = false, started = false;
  let finish;
  const outcome = new Promise(resolve => { finish = resolve; });
  const settle = value => { if (settled) return; settled = true; clearTimeout(startTimer); clearTimeout(resultTimer); finish(value); };
  let resultTimer;
  const startTimer = setTimeout(() => { recognition.abort(); settle(null); }, ASSESSMENT_THRESHOLDS.asrStartTimeoutSec * 1000);
  recognition.onstart = () => { started = true; clearTimeout(startTimer); };
  recognition.onresult = event => {
    const item = event.results[0]?.[0];
    settle(item ? { recordingId, transcript: item.transcript, asrConfidence: item.confidence ?? null } : null);
  };
  recognition.onerror = () => settle(null);
  recognition.onend = () => { if (!started || !resultTimer) settle(null); };
  try { recognition.start(); } catch { settle(null); }
  return {
    async stop() {
      if (!settled) {
        try { recognition.stop(); } catch { settle(null); }
        resultTimer = setTimeout(() => { recognition.abort(); settle(null); }, ASSESSMENT_THRESHOLDS.asrResultTimeoutSec * 1000);
      }
      return outcome;
    },
    abort() { recognition.abort(); settle(null); }
  };
}

export function alignWords(target, transcript) {
  const words = text => text.toLowerCase().match(/[a-z']+/g) ?? [];
  const expected = words(target), actual = words(transcript);
  const dp = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0));
  for (let i=0;i<=expected.length;i++) dp[i][0]=i;
  for (let j=0;j<=actual.length;j++) dp[0][j]=j;
  for (let i=1;i<=expected.length;i++) for (let j=1;j<=actual.length;j++)
    dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(expected[i-1]===actual[j-1]?0:1));
  const hits = Array(expected.length).fill(false);
  let i=expected.length,j=actual.length;
  while(i&&j) {
    if(dp[i][j]===dp[i-1][j-1]+(expected[i-1]===actual[j-1]?0:1)) { hits[i-1]=expected[i-1]===actual[j-1];i--;j--; }
    else if(dp[i][j]===dp[i-1][j]+1) i--; else j--;
  }
  let run=0,ccw=0;
  for(const hit of hits) {run=hit?run+1:0;ccw=Math.max(ccw,run);}
  return { wordHits:hits, wordHitRate:expected.length?hits.filter(Boolean).length/expected.length:0, ccw };
}
