function sanitizeError(err) {
  if (!err) return 'Erro inesperado.';
  return String(err.message || err).replace(/APP_USR-[A-Za-z0-9-]+/g, '[REDACTED]').replace(/TG-[A-Za-z0-9-]+/g, '[REDACTED]');
}

function userFriendlyError(err, sanitized = sanitizeError(err), statusCode = err && err.statusCode) {
  const text = String(sanitized || '').toLowerCase();
  const status = Number(statusCode || 0);

  if (text.includes('mercado livre nao autenticado') || status === 401 || text.includes('invalid_token') || text.includes('invalid_grant') || text.includes('unauthorized')) {
    return 'Conta desconectada. Clique em Conectar.';
  }
  if (text.includes('catálogo sem anúncio confirmado') || text.includes('catalogo sem anuncio confirmado')) {
    return 'Catálogo sem anúncio seu identificado.';
  }
  if (text.includes('catalog_listing_pictures_read_only') || text.includes('catalogo') || text.includes('catálogo')) {
    return 'Catálogo: fotos bloqueadas pelo Mercado Livre.';
  }
  if (text.includes('item_closed_with_bids') ||
    text.includes('item_closed') ||
    (text.includes('cannot update item') && text.includes('status:closed'))) {
    return 'Anúncio encerrado. Reative antes de editar.';
  }
  if (text.includes('pricing_invalid_amount')) {
    return 'Informe um preço válido.';
  }
  if (text.includes('pricing_automation_active') ||
    text.includes('item.price.not_modifiable') ||
    text.includes('dynamic pricing')) {
    return 'Preço automático ativo. Desative a automação para editar.';
  }
  if (text.includes('price_blocked_by_promotion')) {
    return 'Remova a oferta antes de alterar o preço.';
  }
  if (text.includes('promotion_type_not_supported')) {
    return 'Tipo de promoção ainda não suportado.';
  }
  if (text.includes('promotion_readonly')) {
    return 'Essa promoção é automática e não pode ser editada aqui.';
  }
  if (text.includes('promotion_missing_deal_price')) {
    return 'Informe o preço promocional.';
  }
  if (text.includes('promotion_missing_stock')) {
    return 'Informe o estoque reservado.';
  }
  if (text.includes('promotion_missing_promotion_id')) {
    return 'Promoção não identificada.';
  }
  if (text.includes('promotion_missing_offer_id')) {
    return 'Oferta não identificada.';
  }
  if (text.includes('promotion_missing_start_date') || text.includes('promotion_missing_finish_date')) {
    return 'Informe início e fim da promoção.';
  }
  if (text.includes('start and finish dates must be in local format')) {
    return 'Datas inválidas. Use início e fim sem fuso horário.';
  }
  if (text.includes('promotion_missing_name')) {
    return 'Informe o nome da campanha.';
  }
  if (text.includes('promotion_missing_sub_type')) {
    return 'Escolha o tipo da campanha.';
  }
  if (text.includes('promotion_offercreate_not_supported') ||
    text.includes('promotion_offerupdate_not_supported') ||
    text.includes('promotion_offerdelete_not_supported') ||
    text.includes('promotion_campaigncreate_not_supported') ||
    text.includes('promotion_campaignupdate_not_supported') ||
    text.includes('promotion_campaigndelete_not_supported')) {
    return 'Essa ação não existe para esse tipo de promoção.';
  }
  if (text.includes('dod_started_cannot_delete') || text.includes('lightning_started_cannot_delete')) {
    return 'Oferta ativa desse tipo não pode ser removida.';
  }
  if (text.includes('promotion_price_out_of_range') || text.includes('error_credibility') || text.includes('credibility') || text.includes('discounted_price')) {
    return discountRuleError(err) || 'Preço recusado. Atualize as promoções e use o preço sugerido.';
  }
  if (text.includes('version provided is not the current') || text.includes('item.version')) {
    return 'O preço mudou. Atualize e tente novamente.';
  }
  if (text.includes('onblide_mercadolivre_client_id ausente') || text.includes('onblide_mercadolivre_client_secret ausente')) {
    return 'Conexão indisponível no Onblide Connect.';
  }
  if (text.includes('update_release_lookup_failed')) {
    return 'Não consegui consultar as releases.';
  }
  if (text.includes('nao foi possivel identificar') || text.includes('item_id da pagina') || text.includes('anúncio não detectado')) {
    return 'Anúncio não detectado. Recarregue a página.';
  }
  if (text.includes('não pertence a nenhuma conta conectada') || text.includes('nao pertence a nenhuma conta conectada')) {
    return 'Este anúncio não pertence às contas conectadas.';
  }
  if (text.includes('nenhuma conta habilitada')) {
    return 'Nenhuma conta habilitada para detectar anúncios.';
  }
  if (text.includes('conta está desativada') || text.includes('conta esta desativada')) {
    return 'Conta desativada no OnFrame. Ative para editar este anúncio.';
  }
  if (text.includes('conta conectada não encontrada') || text.includes('conta conectada nao encontrada')) {
    return 'Conta não conectada para este anúncio.';
  }
  if (text.includes('nao pertence ao seller') || status === 403 || text.includes('forbidden') || text.includes('caller is not authorized')) {
    return 'Conta errada para este anúncio.';
  }
  if (text.includes('foto não encontrada') || text.includes('foto nao encontrada')) {
    return 'Foto não encontrada.';
  }
  if (text.includes('item nao encontrado') || text.includes('nenhum item detectado') || status === 404) {
    return 'Anúncio não encontrado nesta conta.';
  }
  if (text.includes('envie ao menos uma foto') || text.includes('pictures is required')) {
    return 'Mantenha pelo menos 1 foto.';
  }
  if (text.includes('payload excede') || status === 413 || text.includes('request entity too large')) {
    return 'Imagem muito grande. Use um arquivo menor.';
  }
  if (text.includes('imagem vazia') || text.includes('foto precisa conter') || text.includes('referencia de foto invalida')) {
    return 'Não consegui ler a imagem.';
  }
  if (text.includes('picture') && (text.includes('invalid') || text.includes('not allowed') || text.includes('validation'))) {
    return 'Foto recusada pelo Mercado Livre.';
  }
  if (text.includes('maximum') && text.includes('picture')) {
    return 'Limite de fotos atingido.';
  }
  if (text.includes('optimistic') || text.includes('resource modified')) {
    return 'Anúncio mudou. Atualize a página.';
  }
  if (text.includes('failed to fetch') || text.includes('econnrefused') || text.includes('connect econnrefused')) {
    return 'Serviço local desligado. Abra o OnFrame.';
  }
  if (status >= 500) {
    return 'Falha temporária. Tente de novo.';
  }
  if (text.includes('endpoint nao encontrado') || text.includes('endpoint não encontrado')) {
    return 'Versões diferentes. Reinicie o serviço.';
  }
  return sanitized || 'Não consegui concluir. Tente de novo.';
}

function discountRuleError(err) {
  const body = err && err.body ? err.body : null;
  const min = findNumberByKeys(body, ['min_discounted_price', 'min_price', 'minimum_price', 'minimum']);
  const max = findNumberByKeys(body, ['max_discounted_price', 'max_price', 'maximum_price', 'maximum']);
  const suggested = findNumberByKeys(body, ['suggested_discounted_price', 'suggested_price']);

  if (min && max && suggested) {
    return `Preço recusado. Permitido: ${formatMoney(min)} a ${formatMoney(max)}. Sugerido: ${formatMoney(suggested)}.`;
  }
  if (min && max) {
    return `Preço recusado. Permitido: ${formatMoney(min)} a ${formatMoney(max)}.`;
  }
  if (suggested) {
    return `Preço recusado. Tente o sugerido: ${formatMoney(suggested)}.`;
  }
  return '';
}

function findNumberByKeys(value, keys) {
  if (!value || typeof value !== 'object') return null;
  const wanted = new Set(keys);
  const queue = [value];
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    for (const [key, item] of Object.entries(current)) {
      if (wanted.has(key) && Number.isFinite(Number(item)) && Number(item) > 0) return Number(item);
      if (item && typeof item === 'object') queue.push(item);
    }
  }
  return null;
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'R$ --';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(amount).replace(/\u00a0/g, ' ');
}

module.exports = {
  sanitizeError,
  userFriendlyError
};
