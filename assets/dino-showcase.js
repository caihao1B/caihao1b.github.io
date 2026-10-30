/* Display-only selection of recorded videos; no navigation/coverage simulation. */
(() => {
  'use strict';
  const video = document.getElementById('dinoVideo');
  if (!video) return;
  const clips = {
    overview: ['完整小任务', '覆盖、等待、换带回访与补扫的同一任务记录。'],
    obstacles: ['横穿与暂时阻塞', '保留实际停车与恢复过程；片段时间范围标在视频中。'],
    repair: ['换带回访与残余补扫', '实际运行中的 D1 / REVISIT / D2，未将跳过区域记为完成。']
  };
  document.querySelectorAll('[data-dino-clip]').forEach(button => {
    button.addEventListener('click', () => {
      const key = button.dataset.dinoClip;
      if (!clips[key]) return;
      video.pause();
      video.src = `assets/videos/dino-p13-${key}.mp4`;
      video.load();
      document.querySelectorAll('[data-dino-clip]').forEach(b => {
        const active = b === button;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      document.getElementById('dinoVideoCaption').textContent = `${clips[key][0]} · 加速展示，实际时间标在画面中 · 无音轨`;
      document.getElementById('dinoClipNote').textContent = `${clips[key][1]} 已切换并暂停，按播放键观看。`;
    });
  });
})();
