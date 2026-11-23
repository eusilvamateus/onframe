import { useTheme } from '@onblide/ui';

export function OnframeBrand({ assetBase, height }) {
  const { resolved } = useTheme();
  const variant = resolved === 'dark' ? 'onframe-logo-cor-fundo-escuro.png' : 'onframe-logo-cor.png';

  return <img src={`${assetBase}/${variant}`} alt="" height={height} />;
}
