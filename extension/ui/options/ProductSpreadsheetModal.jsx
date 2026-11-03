import React, { useMemo, useState } from 'react';
import { Alert, Badge, Button, FileUpload, Modal, Ph, Stepper, Table } from '@onblide/ui';
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
  const [selectedFile, setSelectedFile] = useState(null);
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

  async function review() {
    if (!selectedFile) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const parsedRows = await parseProductSpreadsheetFile(selectedFile);
      const nextPreview = await sendRemoteMessage('product-import-preview', { payload: { rows: parsedRows } });
      setRows(parsedRows);
      setPreview(nextPreview);
      setStep('preview');
    } catch (failure) {
      setError(userError(failure, 'Não foi possível validar a planilha.'));
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
    setSelectedFile(null);
    setError('');
    setUploadKey((value) => value + 1);
    setStep('select');
  }

  const footer = step === 'select' ? <>
    <Button kind="secondary" disabled={busy} onClick={onClose}>Cancelar</Button>
    <Button disabled={busy || !selectedFile} icon={<Ph n="arrow-right" size={17} />} onClick={() => void review()}>Revisar planilha</Button>
  </> : step === 'preview' ? <>
    <Button kind="secondary" disabled={busy} onClick={reset}>Voltar</Button>
    <Button disabled={busy} icon={<Ph n="upload-simple" size={17} />} onClick={() => void commit()}>Confirmar importação</Button>
  </> : <Button kind="secondary" disabled={busy} onClick={onClose}>Fechar</Button>;

  return <Modal
    open
    onClose={busy ? undefined : onClose}
    title={step === 'result' ? 'Importação concluída' : 'Importar produtos'}
    width={step === 'select' ? 720 : 960}
    maxHeight="calc(100vh - 48px)"
    footer={footer}
  >
    <div className="onframe-product-import onframe-stack">
      <Stepper
        current={step === 'select' ? 0 : step === 'preview' ? 1 : 2}
        size="md"
        steps={[{ label: 'Arquivo' }, { label: 'Revisão' }, { label: 'Resultado' }]}
      />
      {error && <Alert tone="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

      {step === 'select' && <>
        <div className="onframe-product-import-intro">
          <p>Use o modelo oficial para evitar erros de formatação.</p>
          <Button kind="secondary" disabled={busy} icon={<Ph n="download-simple" size={16} />} onClick={downloadProductTemplate}>Baixar modelo</Button>
        </div>
        <ul className="onframe-product-import-guidance">
          <li><Ph n="plus-circle" size={16} /><span>SKU novo cria o produto.</span></li>
          <li><Ph n="arrows-clockwise" size={16} /><span>SKU já cadastrado atualiza os dados do produto.</span></li>
          <li><Ph n="currency-circle-dollar" size={16} /><span>Custos personalizados ficam na aba Custos.</span></li>
          <li><Ph n="stack" size={16} /><span>Até 2.000 produtos por vez.</span></li>
        </ul>
        <div className="onframe-product-import-upload">
          <FileUpload
            key={uploadKey}
            multiple={false}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            acceptLabel="uma planilha XLSX"
            maxSize={10 * 1024 * 1024}
            disabled={busy}
            upload={async () => {}}
            onChange={(files) => {
              const file = files.find((item) => item.status === 'done')?.file || null;
              setSelectedFile(file);
              setRows([]);
              setPreview(null);
              setError('');
            }}
          />
        </div>
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
