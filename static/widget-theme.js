(() => {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'cbw-theme') return;
    const theme = event.data.theme;
    if (theme !== 'light' && theme !== 'dark') return;
    document.documentElement.dataset.theme = theme;
    const app = document.querySelector('.app');
    if (app) app.dataset.theme = theme;
  });
})();
