import React from 'react';
import { Button, Chip, Menu, Ph, Tabs, Tooltip, useTheme } from '@onblide/ui';

export const CONTENT_THEME_STORAGE_KEY = 'onframeThemePreference';

export const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema', description: 'Acompanha a aparência definida no dispositivo.', icon: 'desktop' },
  { value: 'light', label: 'Claro', description: 'Mantém a interface sempre clara.', icon: 'sun' },
  { value: 'dark', label: 'Escuro', description: 'Mantém a interface sempre escura.', icon: 'moon' }
];

function persistContentThemePreference(preference) {
  if (!globalThis.chrome || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.set({ [CONTENT_THEME_STORAGE_KEY]: preference });
}

function readSavedThemePreference(fallback) {
  try {
    const saved = globalThis.localStorage && localStorage.getItem('ob-theme');
    return THEME_OPTIONS.some((option) => option.value === saved) ? saved : fallback;
  } catch (_error) {
    return fallback;
  }
}

function useSharedTheme() {
  const theme = useTheme();
  React.useEffect(() => {
    persistContentThemePreference(readSavedThemePreference(theme.preference));
  }, []);
  return {
    preference: theme.preference,
    resolved: theme.resolved,
    setTheme: (preference) => {
      theme.setTheme(preference);
      persistContentThemePreference(preference);
    }
  };
}

export function nextThemePreference(preference) {
  const currentIndex = THEME_OPTIONS.findIndex((option) => option.value === preference);
  return THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length].value;
}

export function themeMenuItems(preference, setTheme) {
  return THEME_OPTIONS.map((option) => ({
    type: 'radio',
    group: 'theme',
    label: option.label,
    description: option.description,
    checked: preference === option.value,
    onSelect: () => setTheme(option.value)
  }));
}

export function ThemeSelector() {
  const { preference, setTheme } = useSharedTheme();
  return (
    <div className="onframe-theme-chips" role="group" aria-label="Tema da interface">
      {THEME_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          icon={option.icon}
          size="md"
          selected={preference === option.value}
          onToggle={() => setTheme(option.value)}
        />
      ))}
    </div>
  );
}

export function ThemeTabs() {
  const { preference, setTheme } = useSharedTheme();
  return (
    <Tabs
      variant="pill"
      size="sm"
      active={preference}
      onChange={setTheme}
      tabs={THEME_OPTIONS.map((option) => ({ id: option.value, label: option.label, icon: option.icon }))}
    />
  );
}

export function ThemeCycleButton() {
  const { preference, setTheme } = useSharedTheme();
  const selected = THEME_OPTIONS.find((option) => option.value === preference) || THEME_OPTIONS[0];
  const nextPreference = nextThemePreference(selected.value);
  const next = THEME_OPTIONS.find((option) => option.value === nextPreference) || THEME_OPTIONS[0];
  const accessibleLabel = selected.label;
  return (
    <Tooltip label={accessibleLabel} placement="bottom">
      <Button
        kind="quiet"
        tone="neutral"
        size="sm"
        iconOnly
        aria-label={accessibleLabel}
        onClick={() => setTheme(next.value)}
        icon={<Ph n={selected.icon} size={18} />}
      />
    </Tooltip>
  );
}

export function ThemeMenuButton({ iconOnly = true, label = 'Aparência', placement = 'bottom', align = 'right' }) {
  const { preference, resolved, setTheme } = useSharedTheme();
  const selected = THEME_OPTIONS.find((option) => option.value === preference) || THEME_OPTIONS[0];
  const accessibleLabel = `${label}: ${selected.label}${preference === 'system' ? ` (${resolved === 'dark' ? 'escuro' : 'claro'})` : ''}`;
  const button = (
    <Button
      kind="quiet"
      tone="neutral"
      size="sm"
      iconOnly={iconOnly}
      aria-label={iconOnly ? accessibleLabel : undefined}
      icon={<Ph n={selected.icon} size={18} />}
    >
      {iconOnly ? null : label}
    </Button>
  );

  return (
    <Menu
      trigger={iconOnly ? <Tooltip label={accessibleLabel} placement="bottom">{button}</Tooltip> : button}
      items={themeMenuItems(preference, setTheme)}
      placement={placement}
      align={align}
      ariaLabel="Escolher tema"
    />
  );
}
