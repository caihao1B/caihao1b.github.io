/* Presentation only: accessible tabs, fragment links and hidden-media pause. */
(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('[data-ros-tab]')];
  if (!tabs.length) return;
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  function activate(key, focus = false, updateHash = false) {
    if (!tabs.some(tab => tab.dataset.rosTab === key)) return;
    if (key !== 'arm' && window.ArmLab?.getState?.().playing) document.getElementById('armPlay').click();
    if (key !== 'recording') document.getElementById('robotVideo')?.pause();
    tabs.forEach((tab, i) => {
      const selected = tab.dataset.rosTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
      if (selected && focus) tab.focus();
    });
    if (updateHash) history.replaceState(null, '', '#' + key);
    if (key === 'arm') requestAnimationFrame(() => window.ArmLab?.draw?.());
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab.dataset.rosTab, false, true));
    tab.addEventListener('keydown', event => {
      const index = {ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1}[event.key];
      if (index === undefined) return;
      event.preventDefault();
      activate(tabs[index].dataset.rosTab, true, true);
    });
  });
  function fromHash() {
    const key = location.hash.slice(1);
    if (!key) { activate('research'); return; }
    const panel = document.getElementById(key)?.closest('[role="tabpanel"]');
    if (panel) activate(panel.id);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
})();
