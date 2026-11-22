import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Button, Ph } from '@onblide/ui';
import '../extension/ui/content/photos-view.jsx';
import '../extension/ui/content/commerce-price-view.jsx';
import '../extension/ui/content/commerce-promotion-manager-view.jsx';

const INITIAL_PICTURES = [
  { localId: 'lamp-front', url: '/demo/assets/luminaria-frente.png' },
  { localId: 'lamp-side', url: '/demo/assets/luminaria-lateral.png' }
];

const PRICE_MODEL = {
  title: 'Preço',
  mode: 'summary',
  badge: { label: 'Com promoção', tone: 'success' },
  fields: [
    { label: 'Preço promocional', value: 'R$ 149,90', originalPrice: 'R$ 199,90' },
    { label: 'Você recebe', value: 'R$ 108,20', tone: 'success' },
    { label: 'Tarifa de venda', value: '−R$ 17,99' },
    { label: 'Frete', value: '−R$ 23,71' }
  ],
  scenarios: [],
  canEdit: false,
  sellingIn: { label: 'Oferta de novembro' },
  hasBlocker: false
};

const BASE_PROMOTIONS = [
  {
    key: 'offer-demo',
    group: 'applied',
    type: 'campaign',
    name: 'Oferta de novembro',
    typeLabel: 'Campanha do vendedor',
    period: '20 a 30 de nov',
    status: { id: 'active', label: 'Ativa' },
    condition: { primary: 'R$ 149,90', secondary: '25% OFF' },
    result: { primary: 'R$ 108,20', secondary: '', loading: false },
    marginSummary: { percentage: '22,82%', amount: 'R$ 34,20', tone: 'success' },
    calculation: [
      { label: 'Preço promocional', value: 'R$ 149,90', description: '25% OFF sobre o preço original R$ 199,90' },
      { label: 'Tarifa de venda', value: '-R$ 17,99', description: 'Clássico', listingType: 'Clássico' },
      { label: 'Frete', value: '-R$ 23,71', description: 'Pago pelo vendedor' },
      { label: 'Você recebe', value: 'R$ 108,20' },
      { label: 'Custo do produto', value: '-R$ 39,52' },
      { label: 'Impostos', value: '-R$ 34,48', description: '23% sobre o preço promocional' },
      { label: 'Margem de contribuição', value: 'R$ 34,20', description: '22,82%' }
    ]
  },
  {
    key: 'coupon-demo',
    group: 'available',
    type: 'coupon',
    name: 'Cupom da semana',
    typeLabel: 'Cupom do vendedor',
    period: '22 a 29 de nov',
    status: { id: 'available', label: 'Elegível' },
    condition: { primary: '10% OFF', secondary: '' },
    result: { primary: 'R$ 200,00', secondary: 'R$ 30,00', loading: false },
    marginSummary: { percentage: '', amount: '', tone: 'neutral' },
    calculation: []
  }
];

function pictureModel(pictures) {
  return pictures.map((picture, index) => ({
    ...picture,
    index,
    quality: { tone: 'ok', badgeTone: 'success', label: '100%' }
  }));
}

function diagnostics(pictures, loading) {
  if (loading) return { mode: 'loading', message: 'Analisando...' };
  if (!pictures.length) return { mode: 'empty', message: 'Nenhuma foto no rascunho.' };
  return {
    mode: 'items',
    items: pictures.map((picture, index) => ({
      localId: picture.localId,
      index,
      url: picture.url,
      tone: 'ok',
      dimensions: '1254 x 1254px',
      score: '100%',
      badgeTone: 'success',
      stateLabel: 'Ideal'
    }))
  };
}

function MarketplaceControls() {
  const [pictures, setPictures] = useState(INITIAL_PICTURES);
  const [savedPictures, setSavedPictures] = useState(INITIAL_PICTURES);
  const [dockExpanded, setDockExpanded] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [promotionsOpen, setPromotionsOpen] = useState(false);
  const [promotionTab, setPromotionTab] = useState('all');
  const [promotionSearch, setPromotionSearch] = useState('');
  const [openPromotionKey, setOpenPromotionKey] = useState(null);
  const [appliedCoupon, setAppliedCoupon] = useState(false);
  const dirty =
    pictures.map((picture) => picture.localId).join('|') !== savedPictures.map((picture) => picture.localId).join('|');

  useEffect(() => {
    const buttons = [...document.querySelectorAll('[data-gallery-image]')];
    const onClick = (event) => {
      const button = event.currentTarget;
      document.getElementById('demo-main-image').src = button.dataset.galleryImage;
      buttons.forEach((item) => item.classList.toggle('is-active', item === button));
    };
    buttons.forEach((button) => button.addEventListener('click', onClick));
    return () => buttons.forEach((button) => button.removeEventListener('click', onClick));
  }, []);

  useEffect(() => {
    const tray = document.getElementById('demo-photo-tray');
    const photoDialog = document.getElementById('demo-photo-dialog');
    const updatePictures = (next) => setPictures(next.map((picture) => ({ ...picture })));
    const photoActions = {
      onToggle: () => setDockExpanded((current) => !current),
      onOpenEditor: () => setEditorOpen(true),
      onClose: () => setEditorOpen(false),
      onCommit: () => setSavedPictures(pictures),
      onDiscard: () => updatePictures(savedPictures),
      onRemove: (id) => setPictures((current) => current.filter((picture) => picture.localId !== id)),
      onMovePicture: (id, offset) =>
        setPictures((current) => {
          const next = [...current];
          const index = next.findIndex((picture) => picture.localId === id);
          const target = index + offset;
          if (index >= 0 && target >= 0 && target < next.length)
            [next[index], next[target]] = [next[target], next[index]];
          return next;
        }),
      onUploadFiles: async (files) =>
        setPictures((current) => [
          ...current,
          ...files.map((file) => ({ localId: `demo-upload-${crypto.randomUUID()}`, url: URL.createObjectURL(file) }))
        ]),
      onReloadQuality: () => {
        setQualityLoading(true);
        window.setTimeout(() => setQualityLoading(false), 400);
      }
    };
    window.OnFramePhotosView.renderTray(
      tray,
      {
        visible: true,
        expanded: dockExpanded,
        hasContext: true,
        blocked: false,
        counter: `${pictures.length}/12 fotos`,
        pictures: pictureModel(pictures),
        dirty,
        busy: false,
        saveDisabled: !dirty
      },
      photoActions
    );
    if (editorOpen) {
      window.OnFramePhotosView.renderDialog(
        photoDialog,
        {
          mode: 'editor',
          alert: null,
          optimizeDisabled: true,
          saveDisabled: !dirty,
          discardDisabled: !dirty,
          qualityLoading,
          pictures: pictureModel(pictures),
          diagnostics: diagnostics(pictures, qualityLoading)
        },
        photoActions
      );
    } else {
      window.OnFramePhotosView.unmount(photoDialog);
    }
  }, [pictures, savedPictures, dockExpanded, editorOpen, dirty, qualityLoading]);

  useEffect(() => {
    const host = document.getElementById('demo-price-popover');
    if (priceOpen) {
      window.OnFrameCommercePriceView.render(host, PRICE_MODEL, {
        onClose: () => setPriceOpen(false),
        onOpenPromotion: () => {
          setPriceOpen(false);
          setPromotionsOpen(true);
        }
      });
    } else window.OnFrameCommercePriceView.unmount(host);
  }, [priceOpen]);

  useEffect(() => {
    const host = document.getElementById('demo-promotion-dialog');
    if (!promotionsOpen) {
      window.OnFrameCommercePromotionManagerView.unmount(host);
      return;
    }
    const rows = BASE_PROMOTIONS.map((row) => ({
      ...row,
      group: row.key === 'coupon-demo' && appliedCoupon ? 'applied' : row.group,
      status: row.key === 'coupon-demo' && appliedCoupon ? { id: 'active', label: 'Ativo' } : row.status,
      formOpen: openPromotionKey === row.key,
      formAction: 'details',
      readOnly: true,
      canUpdate: false,
      canConfigure: false,
      canDelete: false,
      busy: false,
      productFinancials: null,
      showPriceField: false,
      showStockField: false,
      applyMode: row.key === 'coupon-demo' ? 'details' : 'direct'
    })).filter(
      (row) =>
        (promotionTab === 'all' || row.type === promotionTab) &&
        row.name.toLocaleLowerCase('pt-BR').includes(promotionSearch.toLocaleLowerCase('pt-BR'))
    );
    window.OnFrameCommercePromotionManagerView.render(
      host,
      {
        tab: promotionTab,
        search: promotionSearch,
        statusFilters: [],
        typeFilters: [],
        financialFilters: [],
        rows,
        loading: false,
        busy: false,
        canCreateDiscount: false,
        openKey: openPromotionKey,
        removalKey: null,
        bulkResult: null,
        feedback: null,
        error: null
      },
      {
        onClose: () => {
          setPromotionsOpen(false);
          setOpenPromotionKey(null);
        },
        onCancelEdit: () => setOpenPromotionKey(null),
        onOpen: (key) => setOpenPromotionKey(key),
        onQuickApply: (key) => {
          if (key === 'coupon-demo') setAppliedCoupon(true);
        },
        onTabChange: setPromotionTab,
        onSearchChange: setPromotionSearch,
        onClearFilters: () => {
          setPromotionSearch('');
          setPromotionTab('all');
        },
        onToggleStatus: () => {},
        onToggleType: () => {},
        onToggleFinancial: () => {},
        onClearAdvancedFilters: () => {},
        onReload: () => {}
      }
    );
  }, [promotionsOpen, promotionTab, promotionSearch, openPromotionKey, appliedCoupon]);

  return (
    <div className="demo-onframe-actions">
      <Button
        kind="secondary"
        size="sm"
        icon={<Ph n="currency-circle-dollar" size={16} />}
        onClick={() => setPriceOpen((current) => !current)}
      >
        Preço
      </Button>
      <Button kind="secondary" size="sm" icon={<Ph n="tag" size={16} />} onClick={() => setPromotionsOpen(true)}>
        Promoções
      </Button>
    </div>
  );
}

createRoot(document.getElementById('demo-onframe-controls')).render(<MarketplaceControls />);
