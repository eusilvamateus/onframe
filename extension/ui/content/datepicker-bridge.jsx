import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Datepicker } from '@onblide/ui';

const roots = new WeakMap();

// Fronteira temporaria: modulos legados montam o componente sem duplicar sua logica.
function MountedDatepicker({ options }) {
  if (options.mode === 'range') return <MountedRangeDatepicker options={options} />;
  return <MountedSingleDatepicker options={options} />;
}

function MountedSingleDatepicker({ options }) {
  const [value, setValue] = useState(options.value ?? null);
  return <Datepicker
    label={options.label}
    value={value}
    min={options.min}
    max={options.max}
    stepper={options.stepper}
    calendarDisplay="popover"
    onChange={(next) => {
      setValue(next);
      options.onChange?.(next);
    }}
  />;
}

function MountedRangeDatepicker({ options }) {
  const [value, setValue] = useState(options.value ?? { start: null, end: null });
  return <Datepicker
    label={options.label}
    mode="range"
    value={value}
    min={options.min}
    max={options.max}
    error={options.error}
    calendarDisplay="popover"
    onChange={(next) => {
      setValue(next);
      options.onChange?.(next);
    }}
  />;
}

function mount(host, options) {
  if (!host) return;
  unmount(host);
  const root = createRoot(host);
  roots.set(host, root);
  root.render(<MountedDatepicker options={options} />);
}

function unmount(host) {
  const root = host && roots.get(host);
  if (!root) return;
  root.unmount();
  roots.delete(host);
}

function unmountWithin(container) {
  if (!container) return;
  container.querySelectorAll('[data-onframe-datepicker-root]').forEach(unmount);
}

globalThis.OnFrameDatepicker = Object.freeze({ mount, unmount, unmountWithin });
