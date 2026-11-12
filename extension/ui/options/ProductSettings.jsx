import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, ButtonGroup, Divider, Select, Spinner } from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';

const DECIMAL_PLACE_OPTIONS = Array.from({ length: 9 }, (_, value) => ({
  id: String(value),
  label: String(value),
  value
}));

export function ProductSettings({ workspaceId, canWrite = true }) {
  const [value, setValue] = useState(2);
  const [savedValue, setSavedValue] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await sendRemoteMessage('product-settings');
      setValue(result.costDecimalPlaces);
      setSavedValue(result.costDecimalPlaces);
      setSaved(false);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível carregar as configurações de produtos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, workspaceId]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const result = await sendRemoteMessage('product-settings-update', {
        payload: { costDecimalPlaces: value }
      });
      setValue(result.costDecimalPlaces);
      setSavedValue(result.costDecimalPlaces);
      setSaved(true);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível salvar as configurações de produtos.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="onframe-product-settings-loading" role="status">
        <Spinner size="sm" label="Carregando configurações de produtos" />
      </div>
    );

  return (
    <div className="onframe-product-settings onframe-settings-form onframe-stack">
      {error && (
        <Alert appearance="soft" tone="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Select
        label="Casas decimais do custo"
        options={DECIMAL_PLACE_OPTIONS}
        value={String(value)}
        width={240}
        disabled={saving || !canWrite}
        onChange={(label) => {
          const option = DECIMAL_PLACE_OPTIONS.find((candidate) => candidate.label === label);
          if (!option) return;
          setSaved(false);
          setError('');
          setValue(option.value);
        }}
      />
      {canWrite && (
        <footer className="onframe-settings-action-bar" aria-label="Ações das preferências de produtos">
          <div className="onframe-settings-action-bar-content">
            <Divider decorative />
            <div className="onframe-settings-action-bar-controls">
              {value !== savedValue && (
                <p className="onframe-settings-action-status" role="status">
                  Alterações não salvas
                </p>
              )}
              <div className="onframe-settings-action-buttons">
                <ButtonGroup attached={false} justify="end" ariaLabel="Ações das preferências de produtos">
                  {value !== savedValue && (
                    <Button
                      kind="ghost"
                      disabled={saving}
                      onClick={() => {
                        setValue(savedValue);
                        setSaved(false);
                        setError('');
                      }}
                    >
                      Descartar
                    </Button>
                  )}
                  <Button disabled={saving || value === savedValue} onClick={() => void save()}>
                    {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar alterações'}
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
