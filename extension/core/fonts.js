(function installOnFrameFonts(root) {
  'use strict';

  const document = root.document;
  const runtime = root.chrome && root.chrome.runtime;
  if (!document || !runtime || typeof runtime.getURL !== 'function') return;
  if (document.getElementById('onframe-font-faces')) return;

  const faces = [
    ['Poppins', 'Poppins-Regular.ttf', 400, 'normal'],
    ['Poppins', 'Poppins-Medium.ttf', 500, 'normal'],
    ['Poppins', 'Poppins-SemiBold.ttf', 600, 'normal'],
    ['Poppins', 'Poppins-Bold.ttf', 700, 'normal'],
    ['Poppins', 'Poppins-ExtraBold.ttf', 800, 'normal'],
    ['JetBrains Mono', 'JetBrainsMono-Medium.ttf', 500, 'normal'],
    ['Playfair Display', 'PlayfairDisplay-MediumItalic.ttf', 500, 'italic']
  ];
  const style = document.createElement('style');
  style.id = 'onframe-font-faces';
  style.textContent = faces.map(([family, file, weight, fontStyle]) => `
@font-face {
  font-family: '${family}';
  src: url('${runtime.getURL(`fonts/${file}`)}') format('truetype');
  font-weight: ${weight};
  font-style: ${fontStyle};
}`).join('\n');
  (document.head || document.documentElement).appendChild(style);
})(globalThis);
