import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Ph, Select, Spinner } from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';

const DECIMAL_PLACE_OPTIONS = Array.from({ length: 9 }, (_, value) => ({
  id: String(value),
  label: String(value),
  value
}));

export function ProductSettings({ workspaceId }) {
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
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="onframe-product-settings onframe-stack">
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
        disabled={saving}
        onChange={(label) => {
          const option = DECIMAL_PLACE_OPTIONS.find((candidate) => candidate.label === label);
          if (!option) return;
          setSaved(false);
          setError('');
          setValue(option.value);
        }}
      />
      <div className="onframe-product-settings-actions">
        <Button
          disabled={saving || value === savedValue}
          icon={
            saving ? (
              <Spinner size="xs" label="Salvando" />
            ) : saved ? (
              <Ph n="check-circle" size={17} />
            ) : (
              <Ph n="floppy-disk" size={17} />
            )
          }
          onClick={() => void save()}
        >
          {saving ? 'Salvando...' : saved ? 'Salvo' : 'Salvar alterações'}
        </Button>
      </div>
    </div>
  );
}
