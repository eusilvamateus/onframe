import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyPage } from '../extension/ui/hosted/privacy-page.jsx';

test('política pública mantém conteúdo real e navegação para as seis seções', () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  const ids = [
    'dados-tratados',
    'finalidades-e-armazenamento',
    'compartilhamento-necessario',
    'conservacao-e-controle',
    'seus-direitos-e-contato',
    'uso-limitado'
  ];

  assert.match(html, /Política de privacidade do onframe/);
  assert.match(html, /Atualizada em 21 de novembro de 2026/);
  assert.match(html, /aria-label="Nesta página"/);
  for (const id of ids) {
    assert.match(html, new RegExp(`href="#${id}"`));
    assert.match(html, new RegExp(`<section id="${id}" aria-labelledby="${id}-title"`));
  }
  assert.match(html, /mailto:eu\.silvamateus80@gmail\.com/);
  assert.doesNotMatch(html, /Histórico de versões|Encarregado de dados/);
});
