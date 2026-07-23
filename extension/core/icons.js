(function (root, factory) {
  const icons = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = icons;
  } else {
    root.OnblideIcons = icons;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const ICONS = Object.freeze({
    refresh: 'arrows-clockwise',
    gear: 'gear',
    link: 'link',
    eye: 'eye',
    eyeSlash: 'eye-slash',
    upload: 'upload-simple',
    trash: 'trash',
    x: 'x',
    warning: 'warning',
    checkCircle: 'check-circle',
    info: 'info',
    image: 'image',
    pencil: 'pencil-simple',
    price: 'currency-dollar',
    tag: 'tag',
    user: 'user',
    plug: 'plug',
    plus: 'plus',
    arrowSquareOut: 'arrow-square-out',
    copy: 'copy',
    caretDown: 'caret-down',
    caretUp: 'caret-up',
    caretLeft: 'caret-left',
    caretRight: 'caret-right',
    calendar: 'calendar'
  });
  let fontFaceReady = false;

  function resolve(name) {
    return ICONS[name] || ICONS.info;
  }

  function render(name, size = 18) {
    ensureFontFace();
    const pixelSize = normalizeSize(size);
    const phosphorName = resolve(name);
    return `<span class="ob-icon ob-icon-${pixelSize}" data-icon="${phosphorName}"><i class="ph ph-${phosphorName}" aria-hidden="true"></i></span>`;
  }

  function ensureFontFace() {
    if (fontFaceReady) return;
    fontFaceReady = true;

    const documentRef = root && root.document;
    const fontUrl = getExtensionUrl('vendor/phosphor/Phosphor.woff2');
    if (!documentRef || !fontUrl) return;
    if (documentRef.getElementById && documentRef.getElementById('onframe-phosphor-font')) return;

    const style = documentRef.createElement('style');
    style.id = 'onframe-phosphor-font';
    style.textContent = `
@font-face {
  font-family: "Phosphor";
  src: url("${fontUrl}") format("woff2");
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
    const target = documentRef.head || documentRef.documentElement;
    if (target && target.appendChild) target.appendChild(style);
  }

  function getExtensionUrl(path) {
    try {
      return root && root.chrome && root.chrome.runtime && typeof root.chrome.runtime.getURL === 'function'
        ? root.chrome.runtime.getURL(path)
        : '';
    } catch (e) {
      return '';
    }
  }

  function normalizeSize(value) {
    const size = Number(value);
    return Number.isFinite(size) && size > 0 ? Math.round(size) : 18;
  }

  return {
    names: ICONS,
    ensureFontFace,
    render,
    resolve,
    svg: render
  };
});
