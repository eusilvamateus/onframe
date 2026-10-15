import { Button, Ph } from '@onblide/ui';

export function PopupSessionHeader({ title, subtitle, onBack }) {
  return (
    <header className="onframe-popup-session-header">
      <Button kind="quiet" tone="primary" size="sm" onClick={onBack} icon={<Ph n="caret-circle-left" size={16} />}>Voltar</Button>
      <div className="onframe-popup-session-heading">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
