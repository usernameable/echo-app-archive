import('./app.js?v=5.6').catch(() => {
  document.querySelector('#stage-label').textContent = '内容未加载';
  for (const id of ['unit-chip','streak-chip','settings-open','parent-open','back','stage-back']) document.getElementById(id).hidden = true;
  document.querySelector('#main').innerHTML = '<section class="screen"><div class="panel"><h1>内容没加载出来</h1><p>点“重新打开”再试一次。仍看不到时，把这一页给家长看。</p><button id="retry-load" class="primary">重新打开</button></div></section>';
  document.querySelector('#retry-load').addEventListener('click', () => location.reload());
  const toast = document.querySelector('#toast'); toast.textContent = '内容没加载出来，检查一下？'; toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 2800);
});
