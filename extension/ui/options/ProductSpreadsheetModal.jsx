import React, { useMemo, useState } from 'react';
import { Alert, Badge, Button, FileUpload, Modal, Ph, Stepper, Table } from '@onblide/ui';
import { sendRemoteMessage, userError } from '../shared/runtime';
import { downloadProductTemplate, parseProductSpreadsheetFile } from './product-spreadsheet';

const ACTION_META = {
  create: { label: 'Novo produto', tone: 'green' },
  update: { label: 'Será atualizado', tone: 'blue' },
  unchanged: { label: 'Nenhuma mudança', tone: 'grey' },
  error: { label: 'Requer revisão', tone: 'red' },
  created: { label: 'Criado', tone: 'green' },
  updated: { label: 'Atualizado', tone: 'blue' },
  rejected: { label: 'Rejeitado', tone: 'red' }
};

function Summary({ values, result = false }) {
  const entries = result ? [
    ['Criados', values.created, 'green'],
    ['Atualizados', values.updated, 'blue'],
    ['Sem alteração', values.unchanged, 'grey'],
    ['Rejeitados', values.rejected, 'red']
  ] : [
    ['Novos', values.create, 'green'],
    ['Atualizações', values.update, 'blue'],
    ['Sem alteração', values.unchanged, 'grey'],
    ['Com erro', values.error, 'red']
  ];
  const total = Number(values.total || 0);
  return <div className="onframe-product-import-summary" role="status">
    <span className="onframe-product-import-summary-total">
      <strong>{total}</strong>
      {total === 1 ? 'produto analisado' : 'produtos analisados'}
    </span>
    {entries.map(([label, value, tone]) => <span className={`onframe-product-import-summary-${tone}${value ? '' : ' onframe-product-import-summary-empty'}`} key={label}>
      <span className="onframe-product-import-summary-marker" aria-hidden="true" />
      <strong>{value || 0}</strong>
      {label}
    </span>)}
  </div>;
}

function outcome(row, result) {
  const key = result ? row.result : row.action;
  return ACTION_META[key] || ACTION_META.error;
}

function observation(row, result) {
  if (row.errors?.length) return row.errors.join(' ');
  const action = result ? row.result : row.action;
  return {
    create: 'Novo produto será criado.',
    update: 'Dados do produto serão atualizados.',
    unchanged: 'Os dados já estão atualizados.',
    created: 'Produto criado com sucesso.',
    updated: 'Produto atualizado com sucesso.',
    rejected: 'O produto não foi importado.'
  }[action] || '-';
}

function reviewDescription(summary) {
  const total = Number(summary.total || 0);
  const actionable = Number(summary.create || 0) + Number(summary.update || 0);
  const errors = Number(summary.error || 0);
  const analyzed = `${total} ${total === 1 ? 'produto analisado' : 'produtos analisados'}.`;
  if (actionable === 0 && errors === 0) return `${analyzed} Nenhuma mudança foi encontrada.`;
  if (actionable === 0) return `${analyzed} Corrija os erros antes de importar.`;
  if (errors > 0) return `${analyzed} ${actionable} ${actionable === 1 ? 'produto está pronto' : 'produtos estão prontos'} para importar.`;
  return `${analyzed} Revise as alterações antes de continuar.`;
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
  const actionable = Number(preview?.summary?.create || 0) + Number(preview?.summary?.update || 0);
  const displayedRows = useMemo(() => {
    const priority = result
      ? { rejected: 0, updated: 1, created: 2, unchanged: 3 }
      : { error: 0, update: 1, create: 2, unchanged: 3 };
    const key = result ? 'result' : 'action';
    return [...(displayed?.rows || [])].sort((left, right) => (priority[left[key]] ?? 9) - (priority[right[key]] ?? 9));
  }, [displayed, result]);
  const columns = useMemo(() => [
    { key: 'name', label: 'Produto', bold: true, width: 270 },
    { key: 'sku', label: 'SKU', bold: true, width: 210 },
    {
      key: result ? 'result' : 'action',
      label: result ? 'Resultado' : 'Ação',
      width: 160,
      render: (_, row) => {
        const meta = outcome(row, Boolean(result));
        return <Badge tone={meta.tone}>{meta.label}</Badge>;
      }
    },
    {
      key: 'errors',
      label: 'Observação',
      render: (_, row) => observation(row, Boolean(result))
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
    <Button kind="secondary" disabled={busy} onClick={reset}>Trocar arquivo</Button>
    <Button disabled={busy || actionable === 0} icon={<Ph n="upload-simple" size={17} />} onClick={() => void commit()}>
      {actionable === 0 ? 'Nada para importar' : `Importar ${actionable} ${actionable === 1 ? 'produto' : 'produtos'}`}
    </Button>
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
          <li><Ph n="percent" size={16} /><span>Exceções tributárias ficam na aba Impostos por conta.</span></li>
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
        <div className="onframe-product-import-review-heading">
          <h3>Revise os produtos</h3>
          <p>{reviewDescription(preview.summary)}</p>
        </div>
        <Summary values={preview.summary} />
        {preview.summary.error > 0 && <Alert tone="warning">As linhas com erro serão ignoradas. Corrija a planilha para importar todo o catálogo.</Alert>}
      </>}

      {step === 'result' && result && <>
        <div className="onframe-product-import-review-heading">
          <h3>Resultado da importação</h3>
          <p>Confira o processamento de cada produto.</p>
        </div>
        <Summary values={result.summary} result />
        {result.summary.rejected > 0 && <Alert tone="warning">Algumas linhas não foram gravadas. Consulte a observação e importe novamente após a correção.</Alert>}
      </>}

      {displayed && <div className="onframe-product-import-table">
        <Table columns={columns} rows={displayedRows} />
      </div>}
    </div>
  </Modal>;
}
