(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameSurfaceHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createSurfaceHost(options = {}) {
    const documentRef = options.document || document;
    const rootId = options.rootId || 'onblide-ml-root';
    const portals = new Map();
    let root = null;

    function ensureRoot() {
      if (!root) root = documentRef.getElementById(rootId);
      if (!root) {
        root = documentRef.createElement('div');
        root.id = rootId;
      }
      if (!root.isConnected) (documentRef.documentElement || documentRef.body).appendChild(root);
      return root;
    }

    function getPortal(name) {
      const key = String(name || 'default');
      let portal = portals.get(key);
      if (!portal) {
        portal = documentRef.createElement('div');
        portal.dataset.onframePortal = key;
        portals.set(key, portal);
      }
      const host = ensureRoot();
      if (portal.parentElement !== host) host.appendChild(portal);
      return portal;
    }

    function mount(node, name) {
      if (!node) return null;
      const portal = getPortal(name);
      if (node.parentElement !== portal) portal.appendChild(node);
      return node;
    }

    function removePortal(name) {
      const key = String(name || 'default');
      const portal = portals.get(key);
      if (portal) portal.remove();
      portals.delete(key);
    }

    function stop() {
      portals.clear();
      if (root) root.remove();
      root = null;
    }

    return { ensureRoot, getPortal, mount, removePortal, stop };
  }

  return { createSurfaceHost };
});
