// Run on app load to apply persisted theme before first render
const stored = localStorage.getItem('filterbrr-theme');
if (stored) {
  try {
    const { state } = JSON.parse(stored);
    if (state?.theme === 'light') {
      document.documentElement.classList.add('light');
    }
  } catch {}
}
