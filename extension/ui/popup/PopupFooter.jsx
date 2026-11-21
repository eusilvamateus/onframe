import React from 'react';
import { Badge, Button, Ph } from '@onblide/ui';
import { manifestVersion } from '../shared/runtime';

export function PopupFooter({ busy = false, onDisconnect, currentVersion = manifestVersion() }) {
  return (
    <footer className="onframe-popup-footer">
      <Badge tone="neutral" appearance="ghost" dot={false} size="sm">
        v{currentVersion}
      </Badge>
      <Button
        kind="quiet"
        tone="danger"
        size="sm"
        disabled={busy}
        onClick={onDisconnect}
        icon={React.createElement(Ph, { n: 'sign-out', size: 16 })}
      >
        Desconectar
      </Button>
    </footer>
  );
}
