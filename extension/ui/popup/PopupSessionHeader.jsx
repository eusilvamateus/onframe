import { Button, Ph, Tooltip } from '@onblide/ui';

export function PopupSessionHeader({ title, subtitle, onBack, onOpenOptions }) {
  return (
    <header className="onframe-popup-session-header">
      <Button kind="quiet" size="sm" iconOnly aria-label="Voltar" onClick={onBack} icon={<Ph n="arrow-circle-left" size={20} />} />
      <div className="onframe-popup-session-heading">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <Tooltip label="Abrir opções da extensão" placement="left">
        <Button kind="quiet" size="sm" iconOnly aria-label="Abrir opções da extensão" onClick={onOpenOptions} icon={<Ph n="gear" size={18} />} />
      </Tooltip>
    </header>
  );
}
