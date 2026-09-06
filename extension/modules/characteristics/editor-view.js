(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OnFrameCharacteristicsEditorView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createEditorView(options) {
    const state = options.state;
    const model = options.model;
    const escapeHtml = options.escapeHtml;
    const icon = options.icon;

    function build() {
      const disabled = state.loading || state.saving;
      return `${renderPackageDimensionsCard(disabled)}${renderFooterMarkup(disabled)}`;
    }

    function renderFooterMarkup(disabled) {
      const canBulk = model.canBulkEditCharacteristics(state.context);
      if (!canBulk) state.bulkEnabled = false;
      return `
        <section class="onframe-characteristics-footer" aria-label="Ações da edição de características">
          <div class="onframe-characteristics-footer-head">
            <strong>Editando características</strong>
            ${state.loading ? `<span class="onframe-characteristics-state">${options.spinner()}Carregando ficha...</span>` : ''}
            ${state.saving ? `<span class="onframe-characteristics-state">${options.spinner()}Salvando...</span>` : ''}
          </div>
          ${options.renderInlineNotice()}
          ${canBulk ? options.renderBulkSwitch(disabled) : ''}
          ${state.error ? `<div class="onframe-characteristics-alert error">${escapeHtml(state.error)}</div>` : ''}
          ${options.renderBulkFailures()}
          <div class="onframe-characteristics-actions">
            <button class="ob-button primary" data-action="save-characteristics" type="button" ${disabled ? 'disabled' : ''}>${icon('checkCircle', 14)}Salvar</button>
            <button class="ob-button" data-action="cancel-characteristics" type="button" ${state.saving ? 'disabled' : ''}>Cancelar</button>
          </div>
        </section>
      `;
    }

    function renderPackageDimensionsCard(disabled) {
      const packageDimensions = state.snapshot && state.snapshot.packageDimensions ? state.snapshot.packageDimensions : null;
      const fields = options.getPackageDimensionFields();
      if (!fields.length) return '';
      return `
        <section class="onframe-characteristics-package-card" aria-label="Dimensões do pacote">
          <div class="onframe-characteristics-package-head">
            <span class="onframe-characteristics-package-icon" aria-hidden="true">${icon('package', 18)}</span>
            <div class="onframe-characteristics-package-title">
              <strong>${escapeHtml(packageDimensions.label || 'Dimensões do pacote')}</strong>
              <span>Medidas de envio, tratadas à parte dos atributos do produto.</span>
            </div>
            <span class="ob-badge grey onframe-characteristics-package-badge">${escapeHtml(packageDimensions.badge || 'LOGÍSTICA')}</span>
          </div>
          <div class="onframe-characteristics-package-grid">
            ${fields.map((field) => options.renderPackageDimensionField(field, disabled)).join('')}
          </div>
          <div class="onframe-characteristics-package-note">${icon('info', 12)}Peso e medidas afetam o cálculo do frete. Confira antes de salvar.</div>
        </section>
      `;
    }

    return { build };
  }

  return { createEditorView };
});
