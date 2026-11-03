export function setupMicrophone() {
  const button = document.querySelector('#mic-button');
  const status = document.querySelector('#mic-status');
  const info = document.querySelector('#mic-info');
  const helpButton = document.querySelector('#help-button');
  const help = document.querySelector('#help');
  const wave = document.querySelector('#wave');
  const bars = Array.from({ length: 28 }, () => wave.appendChild(document.createElement('span')));
  let stream, audio, source, analyser, frame, timer;
  let deviceInfo;
  let pending = 0;
  const stop = () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach(track => track.stop());
    source?.disconnect();
    analyser?.disconnect();
    audio?.close();
    stream = audio = source = analyser = null;
    bars.forEach(bar => { bar.style.transform = 'scaleY(.12)'; });
  };
  const fail = (message, request) => {
    if (request !== pending) return;
    stop();
    status.textContent = message;
    info.textContent = '';
    helpButton.hidden = false;
    button.textContent = '再检查一次';
    button.disabled = false;
  };
  const draw = () => {
    if (!analyser || document.hidden || document.querySelector('#speak').hidden) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      const value = data[Math.floor(i * data.length / bars.length)] / 255;
      bar.style.transform = `scaleY(${Math.max(.12, value * 1.8)})`;
    });
    frame = requestAnimationFrame(draw);
  };
  button.addEventListener('click', async () => {
    const request = ++pending;
    stop();
    helpButton.hidden = true;
    help.close();
    button.disabled = true;
    status.textContent = '正在检查麦克风……';
    info.textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      fail('这里暂时无法使用麦克风。', request);
      return;
    }
    // 关闭或忽略授权弹窗时浏览器可能始终不返回，超时只表示未收到回应。
    timer = setTimeout(() => fail('还没听到你的声音，我们来看看是怎么回事。', request), 12000);
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (request !== pending || !button.disabled) { acquired.getTracks().forEach(track => track.stop()); return; }
      clearTimeout(timer);
      stream = acquired;
      audio = new AudioContext();
      await audio.resume();
      source = audio.createMediaStreamSource(stream);
      analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const settings = stream.getAudioTracks()[0].getSettings();
      deviceInfo = { sampleRate: settings.sampleRate ?? audio.sampleRate, channelCount: settings.channelCount ?? null };
      status.textContent = '麦克风已连接。请说一句话。';
      info.textContent = '';
      button.textContent = '重新检查';
      button.disabled = false;
      draw();
      const started = performance.now();
      const checkVoice = () => {
        if (!analyser || request !== pending) return;
        const samples = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        if (rms > .02) { status.textContent = '能录到你的声音'; return; }
        if (performance.now() - started > 5000) {
          status.textContent = '声音很小，请靠近麦克风再试一次。';
          helpButton.hidden = false;
          return;
        }
        setTimeout(checkVoice, 200);
      };
      checkVoice();
    } catch (error) {
      const message = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
        ? '麦克风未获允许，需要家长协助打开。'
        : '没找到可用的麦克风，或它正在被别的程序使用。';
      fail(message, request);
    }
  });
  helpButton.addEventListener('click', () => { help.showModal(); });
  document.querySelector('#close-help').addEventListener('click', () => help.close());
  help.addEventListener('click', event => { if (event.target === help) help.close(); });
  document.querySelector('#copy-help').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('帮我打开电脑的麦克风权限');
      document.querySelector('#copy-status').textContent = '求助句已复制，可以发给家长。';
    } catch {
      document.querySelector('#copy-status').textContent = '复制失败，请告诉家长：帮我打开电脑的麦克风权限。';
    }
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frame);
    if (!document.hidden && analyser) draw();
  });
  window.addEventListener('echo:leave-speak', () => { pending++; stop(); });
  window.addEventListener('pagehide', () => { pending++; stop(); });
}
