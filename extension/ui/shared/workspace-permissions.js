export const WORKSPACE_PERMISSION_RESOURCES = [
  { id: 'accounts', label: 'Contas Mercado Livre', icon: 'storefront', actions: ['read', 'write', 'delete'] },
  { id: 'listings', label: 'Anúncios', icon: 'storefront', actions: ['read', 'write'] },
  { id: 'promotions', label: 'Promoções', icon: 'tag', actions: ['read', 'write', 'delete'] },
  { id: 'products', label: 'Produtos', icon: 'package', actions: ['read', 'write', 'delete'] },
  { id: 'history', label: 'Histórico', icon: 'clock-counter-clockwise', actions: ['read'] },
  { id: 'settings', label: 'Configurações', icon: 'gear-six', actions: ['read', 'write'] }
];

export const WORKSPACE_PERMISSION_ACTIONS = [
  { id: 'read', label: 'Ler' },
  { id: 'write', label: 'Editar' },
  { id: 'delete', label: 'Excluir' }
];
