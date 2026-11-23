/* Restore appearance before the first paint, independently of language. */
(() => {
  const key = 'pemfc-appearance';
  const themes = ['clear', 'blue', 'classic', 'editorial'];
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem(key);
    if (themes.includes(saved)) root.dataset.theme = saved;
  } catch {
    // An offline browser can disable storage. The selector still works.
  }

  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('themeSelect');
    select.value = root.dataset.theme;
    select.addEventListener('change', () => {
      if (!themes.includes(select.value)) return;
      root.dataset.theme = select.value;
      try { localStorage.setItem(key, select.value); } catch {}
    });
  });
})();
