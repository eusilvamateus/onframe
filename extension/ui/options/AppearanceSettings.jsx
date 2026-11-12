import { useEffect, useState } from 'react';
import { Button, Card, Radio } from '@onblide/ui';
import { THEME_OPTIONS, useSharedTheme } from '../shared/ThemeControl';

const APPEARANCE_OPTIONS = ['light', 'dark', 'system'].map((value) =>
  THEME_OPTIONS.find((option) => option.value === value)
);

function useSystemTheme() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event) => setDark(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return dark ? 'escuro' : 'claro';
}

function ThemePreviewLayer({ theme, split = false }) {
  return (
    <div
      className={`onframe-theme-preview-layer${split ? ' onframe-theme-preview-layer--split' : ''}`}
      data-theme={theme}
    >
      <div className="onframe-theme-preview-sidebar">
        <span className="onframe-theme-preview-mark" />
        <span className="onframe-theme-preview-line onframe-theme-preview-line--wide" />
        <span className="onframe-theme-preview-line onframe-theme-preview-line--muted" />
        <span className="onframe-theme-preview-line" />
      </div>
      <div className="onframe-theme-preview-content">
        <span className="onframe-theme-preview-heading" />
        <span className="onframe-theme-preview-line onframe-theme-preview-line--wide" />
        <div className="onframe-theme-preview-panel">
          <span className="onframe-theme-preview-line onframe-theme-preview-line--wide" />
          <span className="onframe-theme-preview-line onframe-theme-preview-line--muted" />
          <span className="onframe-theme-preview-action" />
        </div>
      </div>
    </div>
  );
}

function ThemePreview({ option }) {
  return (
    <span className="onframe-theme-preview" aria-hidden="true">
      {option === 'system' ? (
        <>
          <ThemePreviewLayer theme="light" />
          <ThemePreviewLayer theme="dark" split />
        </>
      ) : (
        <ThemePreviewLayer theme={option} />
      )}
    </span>
  );
}

export function AppearanceSettings() {
  const { preference, resolved, setTheme } = useSharedTheme();
  const systemTheme = useSystemTheme();
  const explanation =
    preference === 'system'
      ? 'O Onframe acompanha a aparência do dispositivo e muda junto quando ela alternar.'
      : `O Onframe permanece no modo ${resolved === 'dark' ? 'escuro' : 'claro'}, independentemente da aparência do dispositivo.`;

  return (
    <section className="onframe-appearance-settings" aria-label="Aparência">
      <p className="onframe-appearance-intro">Escolha como o Onframe aparece para você. A mudança vale na hora.</p>
      <div className="onframe-appearance-section">
        <h2 className="onframe-section-title">Tema</h2>
        <div className="onframe-appearance-options" role="radiogroup" aria-label="Tema">
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = preference === option.value;
            return (
              <Card
                key={option.value}
                padding="var(--ob-space-12)"
                style={{
                  minWidth: 0,
                  borderColor: selected ? 'var(--ob-blue)' : 'var(--ob-border)',
                  boxShadow: selected ? 'inset 0 0 0 1px var(--ob-blue)' : 'none'
                }}
              >
                <div className="onframe-appearance-option">
                  <div className="onframe-appearance-preview-control">
                    <Button
                      kind="quiet"
                      fill={false}
                      aria-label={`Selecionar tema ${option.label}`}
                      onClick={() => setTheme(option.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        minHeight: 0,
                        padding: 0,
                        borderRadius: 'var(--ob-r-md)'
                      }}
                    >
                      <ThemePreview option={option.value} />
                    </Button>
                  </div>
                  <Radio
                    name="onframe-appearance-theme"
                    value={option.value}
                    checked={selected}
                    onChange={setTheme}
                    label={option.label}
                    description={option.value === 'system' ? `Agora: ${systemTheme}` : undefined}
                  />
                </div>
              </Card>
            );
          })}
        </div>
        <p className="onframe-appearance-explanation">{explanation}</p>
        <p className="onframe-appearance-scope">Esta escolha vale neste navegador.</p>
      </div>
    </section>
  );
}
