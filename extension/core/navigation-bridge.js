(function () {
  const EVENT_NAME = 'onframe:navigation';
  const MARKER = '__onframeNavigationBridge';

  if (window[MARKER]) return;
  window[MARKER] = true;

  const notify = () => window.dispatchEvent(new CustomEvent(EVENT_NAME));
  const wrap = (name) => {
    const original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function onframeHistoryChange() {
      const result = original.apply(this, arguments);
      notify();
      return result;
    };
  };

  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', notify, true);
  window.addEventListener('hashchange', notify, true);
})();
