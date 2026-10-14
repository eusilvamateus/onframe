import { Button, Menu, Ph } from '@onblide/ui';
import { manifestVersion, openExternal, openUpdater } from '../shared/runtime';

function versionParts(value) {
  const match = String(value || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/u);
  return match ? match.slice(1).map(Number) : null;
}

export function isNewerVersion(candidate, current) {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  if (!next || !installed) return false;

  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

export function PopupFooter({
  release,
  busy = false,
  onDisconnect,
  currentVersion = manifestVersion(),
  onOpenChangelog = openExternal,
  onUpdate = openUpdater
}) {
  const updateAvailable = isNewerVersion(release?.latestVersion, currentVersion);
  const updateItems = release === undefined
    ? [{ label: 'Verificando atualizações...', icon: 'spinner-gap', disabled: true }]
    : updateAvailable
      ? [
          { label: `Ver changelog da v${release.latestVersion}`, icon: 'file-text', onSelect: () => onOpenChangelog(release.changelogUrl) },
          { label: `Atualizar para v${release.latestVersion}`, icon: 'download-simple', onSelect: onUpdate }
        ]
      : release
        ? [{ label: 'Extensão atualizada', icon: 'check-circle', disabled: true }]
        : [{ label: 'Não foi possível verificar atualizações', icon: 'warning-circle', disabled: true }];

  const versionLabel = `Versão ${currentVersion}${updateAvailable ? `, atualização ${release.latestVersion} disponível` : ''}`;

  return <footer className="onframe-popup-footer">
    <Menu
      ariaLabel="Versão e atualização"
      align="left"
      placement="top"
      size="sm"
      items={updateItems}
      trigger={<Button kind="cream" size="sm" count={updateAvailable ? 1 : undefined} aria-label={versionLabel} icon={<Ph n="tag" size={15} />}>v{currentVersion}</Button>}
    />
    <Button kind="quiet" tone="danger" size="sm" disabled={busy} onClick={onDisconnect} icon={<Ph n="sign-out" size={16} />}>Desconectar</Button>
  </footer>;
}
