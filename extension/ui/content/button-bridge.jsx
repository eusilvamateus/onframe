import { createRoot } from 'react-dom/client';
import { Button, Ph, Tooltip } from '@onblide/ui';

const roots = new WeakMap();
const mountedOptions = new WeakMap();

// Fronteira temporaria: modulos legados fornecem a acao, e o design system renderiza o controle.
function MountedButton({ options }) {
  const button = <Button
    kind={options.kind || 'quiet'}
    tone={options.tone || 'neutral'}
    size={options.size || 'sm'}
    iconOnly={options.iconOnly !== false}
    pressed={options.pressed}
    disabled={options.disabled}
    aria-label={options.label}
    aria-controls={options.controls}
    aria-expanded={options.expanded}
    icon={<Ph n={options.icon} size={options.iconSize || 16} />}
  >
    {options.label}
  </Button>;

  return options.tooltip
    ? <Tooltip label={options.tooltip} placement={options.placement || 'top'}>{button}</Tooltip>
    : button;
}

function mount(host, options) {
  if (!host) return;
  unmount(host);
  const root = createRoot(host);
  roots.set(host, root);
  mountedOptions.set(host, options);
  root.render(<MountedButton options={options} />);
}

function update(host, nextOptions) {
  const root = host && roots.get(host);
  const currentOptions = host && mountedOptions.get(host);
  if (!root || !currentOptions) return;
  const options = { ...currentOptions, ...nextOptions };
  mountedOptions.set(host, options);
  root.render(<MountedButton options={options} />);
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  root.unmount();
  roots.delete(host);
  mountedOptions.delete(host);
}

function unmountWithin(container) {
  if (!container) return;
  container.querySelectorAll('[data-onframe-button-root]').forEach(unmount);
}

globalThis.OnFrameButton = Object.freeze({ mount, update, unmount, unmountWithin });
