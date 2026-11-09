(function installOnFrameFonts(root) {
  'use strict';

  const document = root.document;
  const runtime = root.chrome && root.chrome.runtime;
  if (!document || !runtime || typeof runtime.getURL !== 'function') return;
  if (document.getElementById('onframe-font-faces')) return;

  const faces = [
    ['Poppins', 'fonts/Poppins-Regular.woff2', 'woff2', 400, 'normal', 'swap'],
    ['Poppins', 'fonts/Poppins-Medium.woff2', 'woff2', 500, 'normal', 'swap'],
    ['Poppins', 'fonts/Poppins-SemiBold.woff2', 'woff2', 600, 'normal', 'swap'],
    ['Poppins', 'fonts/Poppins-Bold.woff2', 'woff2', 700, 'normal', 'swap'],
    ['Poppins', 'fonts/Poppins-ExtraBold.woff2', 'woff2', 800, 'normal', 'swap'],
    ['OnFrame Poppins', 'fonts/Poppins-Regular.woff2', 'woff2', 400, 'normal', 'swap'],
    ['OnFrame Poppins', 'fonts/Poppins-Medium.woff2', 'woff2', 500, 'normal', 'swap'],
    ['OnFrame Poppins', 'fonts/Poppins-SemiBold.woff2', 'woff2', 600, 'normal', 'swap'],
    ['OnFrame Poppins', 'fonts/Poppins-Bold.woff2', 'woff2', 700, 'normal', 'swap'],
    ['OnFrame Poppins', 'fonts/Poppins-ExtraBold.woff2', 'woff2', 800, 'normal', 'swap'],
    ['JetBrains Mono', 'fonts/JetBrainsMono-Medium.woff2', 'woff2', 500, 'normal', 'swap'],
    ['Playfair Display', 'fonts/PlayfairDisplay-MediumItalic.woff2', 'woff2', 500, 'italic', 'swap'],
    ['Phosphor', 'vendor/phosphor/Phosphor.woff2', 'woff2', 'normal', 'normal', 'block'],
    ['Phosphor-Bold', 'vendor/phosphor/Phosphor-Bold.woff2', 'woff2', 'normal', 'normal', 'block'],
    ['Phosphor-Fill', 'vendor/phosphor/Phosphor-Fill.woff2', 'woff2', 'normal', 'normal', 'block']
  ];
  const style = document.createElement('style');
  style.id = 'onframe-font-faces';
  style.textContent = faces
    .map(
      ([family, resource, format, weight, fontStyle, display]) => `
@font-face {
  font-family: '${family}';
  src: url('${runtime.getURL(resource)}') format('${format}');
  font-weight: ${weight};
  font-style: ${fontStyle};
  font-display: ${display};
}`
    )
    .join('\n');
  (document.head || document.documentElement).appendChild(style);
})(globalThis);
