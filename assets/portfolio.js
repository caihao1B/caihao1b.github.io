/* Small presentation-only behaviors: tabs and anchors. No simulation logic here. */
(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('[data-logic-tab]')];
  if (!tabs.length) return;
  function activate(key, focus = false) {
    tabs.forEach(tab => {
      const selected = tab.dataset.logicTab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
      if (selected && focus) tab.focus();
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab.dataset.logicTab));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = tabs[(i + 1) % tabs.length];
      if (event.key === 'ArrowLeft') target = tabs[(i - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs.at(-1);
      if (target) { event.preventDefault(); activate(target.dataset.logicTab, true); }
    });
  });
  document.querySelectorAll('a[href="#state-machine"]').forEach(link => {
    link.addEventListener('click', () => activate('fsm'));
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#state-machine') activate('fsm');
  });
  if (location.hash === '#state-machine') activate('fsm');
})();
