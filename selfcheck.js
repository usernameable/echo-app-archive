import { englishVoices, speak, stopSpeech } from './tts.js';

export function createSelfcheck(main) {
  let stream = null, context = null, runId = 0;
  const stop = (cancelSpeech = true) => { runId++; stream?.getTracks().forEach(track => track.stop()); stream = null; context?.close(); context = null; if (cancelSpeech) stopSpeech(); };
  const screen = () => `<section class="screen selfcheck-screen"><span class="micro-label">演示前检查</span><h1>确认声音可以用</h1><p>点一次开始：先听英文示范音，再说一句话，页面会检查麦克风是否收到声音。</p><button id="selfcheck-run" class="primary">开始自检</button><div class="selfcheck-results"><section class="parent-panel"><h2>英文示范音</h2><p id="selfcheck-voice">尚未检查</p></section><section class="parent-panel"><h2>麦克风</h2><p id="selfcheck-mic">尚未检查</p></section></div><p class="quiet">检查只在本机进行，不保存这段声音。</p></section>`;
  main.addEventListener('click', async event => {
    if (event.target.id !== 'selfcheck-run') return;
    stop(false);
    const request = runId, button = event.target, voice = main.querySelector('#selfcheck-voice'), mic = main.querySelector('#selfcheck-mic');
    button.disabled = true;
    const hasEnglishVoice = englishVoices().length > 0;
    voice.textContent = hasEnglishVoice ? '正在尝试播放英文示范音。' : '系统没有找到英文朗读语音。';
    mic.textContent = '等待检查麦克风。';
    let micTimer, expired = false;
    try {
      let timer, speechIssue = null, timedOut = false;
      const played = await Promise.race([speak('Hello, how are you?', { onError: issue => { speechIssue = issue; } }), new Promise(resolve => { timer = setTimeout(() => { timedOut = true; stopSpeech(); resolve(false); }, 8000); })]);
      clearTimeout(timer);
      if (request !== runId) return;
      const speechMessages = {
        'not-allowed':'浏览器没有开始英文朗读，请再点一次开始自检。',
        'voice-unavailable':'选用的英文朗读语音不可用，请检查电脑语音设置。',
        'language-unavailable':'这台电脑没有可用的英文朗读语音。',
        'synthesis-unavailable':'这台电脑暂时无法合成英文朗读。',
        'audio-busy':'声音输出暂时被占用，请关闭其他播放后重试。',
        'audio-hardware':'电脑没有可用的声音输出设备，请检查耳机连接。',
        'network':'这次朗读所用语音需要网络，当前无法使用。',
        canceled:'英文朗读被中断，请再点一次开始自检。',
        interrupted:'英文朗读被中断，请再点一次开始自检。'
      };
      voice.textContent = played ? '英文朗读已结束。如果没听到，请检查耳机音量和浏览器标签页声音。' : !hasEnglishVoice ? '系统没有找到英文朗读语音。请在电脑的语音设置里添加英文语音。' : timedOut ? '英文朗读等待超时，请再点一次开始自检。' : speechMessages[speechIssue] ?? '英文朗读未完成，请再点一次开始自检。';
      if (!navigator.mediaDevices?.getUserMedia) { mic.textContent = '这台设备无法使用麦克风。'; return; }
      mic.textContent = '正在请求麦克风。';
      const pending = navigator.mediaDevices.getUserMedia({ audio:true }).then(acquired => {
        if (expired || request !== runId) { acquired.getTracks().forEach(track => track.stop()); return null; }
        return acquired;
      });
      const acquired = await Promise.race([pending, new Promise((_, reject) => { micTimer = setTimeout(() => reject(new Error('timeout')), 12000); })]);
      if (!acquired) return;
      stream = acquired;
      mic.textContent = '现在说一句话，检查声音电平。';
      context = new AudioContext(); await context.resume();
      const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser(); analyser.fftSize = 256; source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let peak = 0;
      for (let i = 0; i < 20 && request === runId; i++) {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value-128)/128)**2, 0) / samples.length);
        peak = Math.max(peak, rms);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (request === runId) mic.textContent = peak > .02 ? '麦克风收到了声音。' : '这次没有检测到声音，请检查麦克风后重试。';
    } catch (error) {
      if (request === runId) mic.textContent = error.message === 'timeout' ? '麦克风授权还没有回应，请检查浏览器提示。' : error.name === 'NotAllowedError' ? '麦克风还没获允许，请在浏览器里打开。' : '麦克风暂时不可用，请检查设备连接。';
    } finally {
      expired = true; clearTimeout(micTimer);
      if (request === runId) { stream?.getTracks().forEach(track => track.stop()); stream = null; context?.close(); context = null; button.disabled = false; }
    }
  });
  addEventListener('pagehide', stop);
  return { screen, stop };
}
