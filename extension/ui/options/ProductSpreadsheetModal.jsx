import React, { useMemo, useState } from 'react';
import { Alert, Badge, Button, FileUpload, Modal, Ph, Table } from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { downloadProductTemplate, parseProductSpreadsheetFile } from './product-spreadsheet';

const ACTION_META = {
  create: { label: 'Criar', tone: 'green' },
  update: { label: 'Atualizar', tone: 'blue' },
  unchanged: { label: 'Sem alteração', tone: 'grey' },
  error: { label: 'Revisar', tone: 'red' },
  created: { label: 'Criado', tone: 'green' },
  updated: { label: 'Atualizado', tone: 'blue' },
  rejected: { label: 'Rejeitado', tone: 'red' }
};

function Summary({ values, result = false }) {
  const entries = result ? [
    ['Criados', values.created],
    ['Atualizados', values.updated],
    ['Sem alteração', values.unchanged],
    ['Rejeitados', values.rejected]
  ] : [
    ['Novos', values.create],
    ['Atualizações', values.update],
    ['Sem alteração', values.unchanged],
    ['Com erro', values.error]
  ];
  return <div className="onframe-product-import-summary">
    {entries.map(([label, value]) => <div key={label}>
      <strong>{value || 0}</strong>
      <span>{label}</span>
    </div>)}
  </div>;
}

function outcome(row, result) {
  const key = result ? row.result : row.action;
  return ACTION_META[key] || ACTION_META.error;
}

export function ProductSpreadsheetModal({ onClose, onImported }) {
  const [step, setStep] = useState('select');
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadKey, setUploadKey] = useState(0);

  const displayed = result || preview;
  const columns = useMemo(() => [
    { key: 'rowNumber', label: 'Linha', width: 75 },
    { key: 'sku', label: 'SKU', bold: true, width: 150 },
    { key: 'name', label: 'Produto', bold: true },
    {
      key: result ? 'result' : 'action',
      label: 'Resultado',
      width: 130,
      render: (_, row) => {
        const meta = outcome(row, Boolean(result));
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      }
    },
    {
      key: 'errors',
      label: 'Observação',
      render: (errors) => errors?.length ? errors.join(' ') : '-'
    }
  ], [result]);

  async function upload(file, onProgress) {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      onProgress(20);
      const parsedRows = await parseProductSpreadsheetFile(file);
      onProgress(55);
      const nextPreview = await sendRemoteMessage('product-import-preview', { payload: { rows: parsedRows } });
      onProgress(100);
      setRows(parsedRows);
      setPreview(nextPreview);
      setStep('preview');
    } catch (failure) {
      const message = userError(failure, 'Não foi possível validar a planilha.');
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError('');
    try {
      const imported = await sendRemoteMessage('product-import-commit', { payload: { rows } });
      setResult(imported);
      setStep('result');
      onImported(imported);
    } catch (failure) {
      setError(userError(failure, 'Não foi possível importar os produtos.'));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setRows([]);
    setPreview(null);
    setResult(null);
    setError('');
    setUploadKey((value) => value + 1);
    setStep('select');
  }

  const footer = step === 'preview' ? <>
    <Button kind="secondary" disabled={busy} onClick={reset}>Trocar arquivo</Button>
    <Button disabled={busy} icon={<Ph n="upload-simple" size={17} />} onClick={() => void commit()}>Confirmar importação</Button>
  </> : <Button kind="secondary" disabled={busy} onClick={onClose}>Fechar</Button>;

  return <Modal
    open
    onClose={busy ? undefined : onClose}
    title={step === 'result' ? 'Importação concluída' : 'Importar produtos'}
    size="lg"
    maxHeight="calc(100vh - 48px)"
    footer={footer}
  >
    <div className="onframe-product-import onframe-stack">
      {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {step === 'select' && <>
        <div className="onframe-product-import-intro">
          <div>
            <h3 className="onframe-product-section-title">Planilha do catálogo</h3>
            <p className="onframe-product-section-copy">O SKU identifica produtos existentes. Linhas com SKU novo criam produtos; as demais atualizam os dados cadastrados.</p>
          </div>
          <Button kind="secondary" disabled={busy} icon={<Ph n="download-simple" size={16} />} onClick={downloadProductTemplate}>Baixar modelo</Button>
        </div>
        <FileUpload
          key={uploadKey}
          multiple={false}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          acceptLabel="uma planilha XLSX"
          maxSize={10 * 1024 * 1024}
          label="Arquivo XLSX"
          hint="Use o modelo oficial e importe até 2.000 produtos por vez."
          disabled={busy}
          upload={upload}
          onChange={(files) => {
            if (files.length === 0) {
              setRows([]);
              setPreview(null);
              setError('');
            }
          }}
        />
      </>}

      {step === 'preview' && preview && <>
        <Summary values={preview.summary} />
        {preview.summary.error > 0 && <Alert tone="warning">As linhas com erro serão ignoradas. Corrija a planilha para importar todo o catálogo.</Alert>}
      </>}

      {step === 'result' && result && <>
        <Summary values={result.summary} result />
        {result.summary.rejected > 0 && <Alert tone="warning">Algumas linhas não foram gravadas. Consulte a observação e importe novamente após a correção.</Alert>}
      </>}

      {displayed && <div className="onframe-product-import-table">
        <Table columns={columns} rows={displayed.rows || []} />
      </div>}
    </div>
  </Modal>;
}
