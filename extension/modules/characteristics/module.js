(function (rootScope) {
  rootScope.OnFrameCharacteristicsModule = {
    createCharacteristicsModule
  };

  function createCharacteristicsModule(services) {
    const Shared = services.Shared;
    const Detection = services.Detection;
    const CharacteristicsModel = services.CharacteristicsModel;
    const api = services.api;
    const toast = services.toast;
    const isProductPageUrl = Detection.isProductPageUrl;
    const CharacteristicsView = rootScope.OnFrameCharacteristicsView;
    const hasCharacteristicsView = Boolean(
      CharacteristicsView &&
      typeof CharacteristicsView.renderAction === 'function' &&
      typeof CharacteristicsView.renderCatalogNotice === 'function' &&
      typeof CharacteristicsView.renderFooter === 'function' &&
      typeof CharacteristicsView.renderPackageDimensions === 'function' &&
      typeof CharacteristicsView.renderInlineField === 'function' &&
      typeof CharacteristicsView.renderSyntheticFieldLabel === 'function' &&
      typeof CharacteristicsView.unmount === 'function'
    );
    if (!hasCharacteristicsView) throw new Error('Interface de características indisponível.');
    const toUserError = (err) => CharacteristicsModel.friendlyError(Shared.toUserError(err, { logPrefix: '[OnFrame características] detalhe tecnico:' }));

    const state = {
      context: null,
      itemId: null,
      ownerUserId: null,
      visible: true,
      loaded: false,
      busy: false,
      editing: false,
      loading: false,
      saving: false,
      snapshot: null,
      draft: {},
      originalDraft: {},
      bulkEnabled: false,
      bulkResult: null,
      error: '',
      editorRoot: null,
      sectionElement: null,
      inlineCellRecords: new Map(),
      inlineSyntheticRows: [],
      inlineEditableCount: 0,
      inlineMissingCount: 0,
      renderTimer: null,
      requestId: 0,
      pageSignature: ''
    };

    function startCharacteristics() {
      state.pageSignature = readPageSignature();
      if (state.visible) mountCharacteristics();
    }

    function resetState() {
      closeEditor();
      if (state.renderTimer) clearTimeout(state.renderTimer);
      state.context = null;
      state.itemId = null;
      state.ownerUserId = null;
      state.visible = true;
      state.loaded = false;
      state.busy = false;
      state.editing = false;
      state.loading = false;
      state.saving = false;
      state.snapshot = null;
      state.draft = {};
      state.originalDraft = {};
      state.bulkEnabled = false;
      state.bulkResult = null;
      state.error = '';
      state.inlineCellRecords = new Map();
      state.inlineSyntheticRows = [];
      state.inlineEditableCount = 0;
      state.inlineMissingCount = 0;
      state.renderTimer = null;
      state.requestId += 1;
      state.pageSignature = readPageSignature();
      removeInjectedActions();
    }

    function scheduleRender(delay = 120) {
      if (state.renderTimer) return;
      state.renderTimer = setTimeout(() => {
        state.renderTimer = null;
        mountCharacteristics();
      }, delay);
    }

    function handlePageContextChange(update) {
      const status = update && update.status ? update.status : '';
      const pageSignature = update && update.signature ? update.signature : readPageSignature();

      if (status === 'not_product') {
        resetState();
        return;
      }

      if (status === 'loading' || status === 'identifying') {
        state.pageSignature = pageSignature;
        state.busy = true;
        state.error = '';
        mountCharacteristics();
        return;
      }

      if (status === 'hydration-error') {
        state.busy = false;
        state.loaded = true;
        state.error = update && update.error ? update.error : '';
        mountCharacteristics();
        return;
      }

      if (status === 'error') {
        state.context = null;
        state.itemId = null;
        state.ownerUserId = null;
        state.busy = false;
        state.loaded = true;
        state.error = update && update.error ? update.error : 'Não foi possível ler este anúncio.';
        closeEditor();
        removeInjectedActions();
        return;
      }

      if (status !== 'ready' && status !== 'quick-ready') return;

      const context = update && update.context ? update.context : null;
      const nextItemId = context && context.item && context.item.id ? String(context.item.id) : '';
      const nextOwnerUserId = context && context.ownerAccount && context.ownerAccount.user_id ? String(context.ownerAccount.user_id) : '';
      const changedItem = nextItemId && state.itemId && nextItemId !== String(state.itemId);

      if (changedItem) closeEditor();
      state.context = context;
      state.itemId = nextItemId || null;
      state.ownerUserId = nextOwnerUserId || null;
      state.loaded = true;
      state.busy = false;
      state.pageSignature = pageSignature;
      state.error = '';
      if (!CharacteristicsModel.canBulkEditCharacteristics(state.context)) state.bulkEnabled = false;
      if (!CharacteristicsModel.canEditCharacteristics(state.context) && state.editing) closeEditor();
      mountCharacteristics();
    }

    function mountCharacteristics() {
      if (!state.visible || !isProductPageUrl(location.href) || !state.itemId) {
        removeInjectedActions();
        return;
      }

      const elements = getCharacteristicsElements();
      if (!elements.title || !elements.section) {
        removeInjectedActions();
        return;
      }

      if (!CharacteristicsModel.canEditCharacteristics(state.context)) {
        removeInjectedActions();
        if (isCatalogListing()) injectCatalogNotice(elements);
        return;
      }

      state.sectionElement = elements.section;
      injectEditAction(elements, isCharacteristicsCollapsed(elements.section));
      if (state.editing) renderEditor(elements);
    }

    function getCharacteristicsElements() {
      const title = Array.from(document.querySelectorAll('h2, h3'))
        .find((node) => normalizeHeading(node.textContent) === 'caracteristicas do produto');
      if (!title) return {};
      const section = title.closest('#highlighted_specs_attrs') ||
        title.closest('.ui-vpp-highlighted-specs') ||
        title.closest('section') ||
        title.closest('.ui-pdp-container__row') ||
        title.parentElement;
      return {
        title,
        titleRow: title.closest('.ui-pdp-container__row--highlighted-specs-title') || title.parentElement,
        section
      };
    }

    function injectEditAction(elements, disabled) {
      if (!elements.title) return;
      let actionRoot = elements.section.querySelector('.onframe-characteristics-action-root');
      if (!actionRoot) {
        const anchor = elements.titleRow || elements.title;
        actionRoot = document.createElement('span');
        actionRoot.className = 'onframe-characteristics-action-root';
        anchor.insertAdjacentElement('afterend', actionRoot);
      }
      CharacteristicsView.renderAction(actionRoot, { disabled }, {
        onEdit: () => void openEditor(),
        onError: handleCharacteristicsViewFailure
      });
    }

    function injectCatalogNotice(elements) {
      if (!elements.title || !elements.section) return;
      let noticeRoot = elements.section.querySelector('.onframe-characteristics-catalog-notice');
      if (!noticeRoot) {
        const anchor = elements.titleRow || elements.title;
        noticeRoot = document.createElement('div');
        noticeRoot.className = 'onframe-characteristics-catalog-notice';
        anchor.insertAdjacentElement('afterend', noticeRoot);
      }
      CharacteristicsView.renderCatalogNotice(noticeRoot, { onError: handleCharacteristicsViewFailure });
    }

    function isCharacteristicsCollapsed(section) {
      if (!section) return false;
      return Boolean(section.querySelector('.ui-pdp-collapsable--is-collapsed'));
    }

    async function openEditor() {
      if (!state.visible || !state.itemId || state.loading || state.saving || !CharacteristicsModel.canEditCharacteristics(state.context)) return;
      const elements = getCharacteristicsElements();
      if (!elements.section || isCharacteristicsCollapsed(elements.section)) return;
      state.editing = true;
      state.loading = true;
      state.error = '';
      state.bulkEnabled = false;
      state.bulkResult = null;
      const requestId = ++state.requestId;
      mountCharacteristics();

      try {
        const snapshot = await api(itemApiPath('/characteristics'));
        if (requestId !== state.requestId) return;
        setSnapshot(snapshot);
        state.loading = false;
        mountCharacteristics();
      } catch (err) {
        if (requestId !== state.requestId) return;
        state.loading = false;
        state.error = toUserError(err);
        mountCharacteristics();
      }
    }

    function setSnapshot(snapshot) {
      state.snapshot = snapshot && snapshot.ok ? snapshot : null;
      state.draft = createDraft(state.snapshot);
      state.originalDraft = createDraft(state.snapshot);
    }

    function renderEditor(elements) {
      const anchor = findFooterAnchor(elements);
      if (!anchor) return;
      if (elements.section) {
        elements.section.classList.add('onframe-characteristics-is-editing');
      }

      const disabled = state.loading || state.saving;
      if (!state.loading && state.snapshot && !isInlineControlActive()) {
        renderInlineFields(elements.section, disabled);
      }

      if (!state.editorRoot || !state.editorRoot.isConnected) {
        state.editorRoot = document.createElement('div');
        state.editorRoot.className = 'onframe-characteristics-root';
        anchor.insertAdjacentElement('afterend', state.editorRoot);
      } else if (state.editorRoot.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement('afterend', state.editorRoot);
      }

      let packageRoot = state.editorRoot.querySelector('.onframe-characteristics-package-root');
      if (!packageRoot) {
        packageRoot = document.createElement('div');
        packageRoot.className = 'onframe-characteristics-package-root';
        state.editorRoot.appendChild(packageRoot);
      }
      CharacteristicsView.renderPackageDimensions(packageRoot, buildPackageDimensionsViewModel(disabled), {
        onFieldChange: updateDraftField,
        onError: handleCharacteristicsViewFailure
      });

      let footerRoot = state.editorRoot.querySelector('.onframe-characteristics-footer-root');
      if (!footerRoot) {
        footerRoot = document.createElement('div');
        footerRoot.className = 'onframe-characteristics-footer-root';
        state.editorRoot.appendChild(footerRoot);
      }
      CharacteristicsView.renderFooter(footerRoot, buildFooterViewModel(), {
        onBulkChange: (checked) => {
          if (state.saving || state.loading) return;
          state.bulkEnabled = checked;
          state.bulkResult = null;
          state.error = '';
          mountCharacteristics();
        },
        onSave: () => void saveCharacteristics(),
        onCancel: cancelEditor,
        onError: handleCharacteristicsViewFailure
      });
    }

    function findFooterAnchor(elements) {
      const section = elements && elements.section ? elements.section : null;
      if (!section) return null;
      return section.querySelector('.ui-pdp-container__row--technical-specifications') ||
        section.querySelector('.ui-vpp-highlighted-specs__striped-specs') ||
        section.querySelector('.ui-pdp-collapsable') ||
        elements.titleRow ||
        elements.title;
    }

    function buildFooterViewModel() {
      const disabled = state.loading || state.saving;
      const canBulk = CharacteristicsModel.canBulkEditCharacteristics(state.context);
      if (!canBulk) state.bulkEnabled = false;
      const result = state.bulkResult;
      const failures = result && Array.isArray(result.targets)
        ? result.targets.filter((target) => target.status === 'failed' || target.status === 'blocked')
        : [];
      return {
        disabled,
        saving: state.saving,
        status: state.loading ? 'Carregando ficha...' : state.saving ? 'Salvando...' : '',
        notice: getInlineNoticeMessage(),
        canBulk,
        bulkEnabled: state.bulkEnabled,
        error: state.error,
        failures: failures.map((failure) => ({
          itemId: String(failure.itemId || 'Variação'),
          message: String(failure.message || 'Falha ao salvar.')
        }))
      };
    }

    function buildPackageDimensionsViewModel(disabled) {
      const packageDimensions = state.snapshot && state.snapshot.packageDimensions ? state.snapshot.packageDimensions : null;
      const fields = getPackageDimensionFields();
      return {
        label: packageDimensions && packageDimensions.label ? String(packageDimensions.label) : 'Dimensões do pacote',
        fields: fields.map((field) => {
          const draft = state.draft[field.id] || {};
          return {
            id: field.id,
            label: field.label,
            editable: Boolean(field.editable),
            disabled: disabled || !field.editable,
            number: String(draft.number || ''),
            unit: String(draft.unit || ''),
            units: collectUnits(field, draft.unit),
            displayValue: String(field.displayValue || field.valueName || '-'),
            status: buildCharacteristicStatusViewModel(field)
          };
        })
      };
    }

    function getInlineNoticeMessage() {
      if (state.loading) return 'Carregando os campos editáveis.';
      const groups = state.snapshot && Array.isArray(state.snapshot.groups) ? state.snapshot.groups : [];
      const packageFields = getPackageDimensionFields();
      const hasEditableGroupField = groups.some((group) => (group.attributes || []).some((field) => field.editable));
      const hasEditablePackageField = packageFields.some((field) => field.editable);
      if (!groups.length && !packageFields.length) return 'Nenhuma característica encontrada neste anúncio.';
      if (!hasEditableGroupField && !hasEditablePackageField) {
        return 'O Mercado Livre não expôs campos editáveis para este anúncio.';
      }
      if (!state.inlineEditableCount && !state.inlineMissingCount && !hasEditablePackageField) return 'Nenhuma característica editável está visível nesta ficha.';
      return '';
    }

    function getPackageDimensionFields() {
      const packageDimensions = state.snapshot && state.snapshot.packageDimensions ? state.snapshot.packageDimensions : null;
      return packageDimensions && Array.isArray(packageDimensions.fields) ? packageDimensions.fields : [];
    }

    function renderInlineFields(section, disabled) {
      const groups = state.snapshot && Array.isArray(state.snapshot.groups) ? state.snapshot.groups : [];
      const fieldsById = new Map((state.snapshot && Array.isArray(state.snapshot.fields) ? state.snapshot.fields : [])
        .map((field) => [field.id, field]));
      removeSyntheticRows();
      const targets = collectRenderedFieldTargets(section);
      const groupTargets = collectRenderedGroupTargets(section);
      const activeIds = new Set();
      const usedTargets = new Set();
      let editableCount = 0;
      let missingCount = 0;

      for (const group of groups) {
        const fields = Array.isArray(group.attributes) ? group.attributes : [];
        const compositeResult = splitCompositeFieldTargets(targets, usedTargets, groupTargets, group, fields, disabled);
        const handledCompositeIds = compositeResult.handledIds;
        editableCount += compositeResult.editableCount;
        for (const field of fields) {
          if (handledCompositeIds.has(field.id)) continue;
          const target = findRenderedFieldTarget(targets, usedTargets, group, field);
          if (!target) {
            missingCount += 1;
            if (field.editable) editableCount += 1;
            insertSyntheticFieldRow(groupTargets, group, field, disabled);
            continue;
          }
          if (!field.editable) continue;
          activeIds.add(field.id);
          editableCount += 1;
          ensureInlineCellRecord(field, target);
          target.row.classList.add('onframe-characteristics-row-editable');
          target.cell.classList.add('onframe-characteristics-inline-cell');
          const record = state.inlineCellRecords.get(field.id);
          if (record) record.react = true;
          CharacteristicsView.renderInlineField(target.cell, buildInlineFieldViewModel(field, disabled), {
            onFieldChange: updateDraftField,
            onError: handleCharacteristicsViewFailure
          });
        }
      }

      restoreInactiveInlineCells(activeIds, fieldsById);
      state.inlineEditableCount = editableCount;
      state.inlineMissingCount = missingCount;
    }

    function splitCompositeFieldTargets(targets, usedTargets, groupTargets, group, fields, disabled) {
      const handledIds = new Set();
      let editableCount = 0;
      for (const target of targets) {
        if (usedTargets.has(target.key) || !isCompositeHeading(target.fieldLabel)) continue;
        const matches = fields.filter((field) => {
          if (!field || handledIds.has(field.id)) return false;
          if (hasExactRenderedFieldTarget(targets, group, field)) return false;
          return isCompositeRenderedFieldTarget(target, group, field);
        });
        if (matches.length < 2) continue;
        const editableMatches = matches.filter((field) => field.editable);
        if (!editableMatches.length) {
          matches.forEach((field) => handledIds.add(field.id));
          continue;
        }
        usedTargets.add(target.key);
        const body = target.row.parentElement;
        if (!body) continue;
        target.row.classList.add('onframe-characteristics-composite-source');
        const beforeNode = target.row.nextSibling;
        matches.forEach((field) => {
          handledIds.add(field.id);
          if (field.editable) editableCount += 1;
          insertSyntheticFieldRow(groupTargets, group, field, disabled, { body, beforeNode });
        });
      }
      return { handledIds, editableCount };
    }

    function collectRenderedFieldTargets(section) {
      if (!section) return [];
      const targets = [];
      section.querySelectorAll('.ui-vpp-striped-specs__table').forEach((table, tableIndex) => {
        const groupTitle = table.querySelector('.ui-vpp-striped-specs__header');
        const groupLabel = normalizeHeading(groupTitle ? groupTitle.textContent : '');
        table.querySelectorAll('tr.andes-table__row, tr.ui-vpp-striped-specs__row').forEach((row, rowIndex) => {
          const header = row.querySelector('th .andes-table__header__container') || row.querySelector('th');
          const cell = row.querySelector('td');
          const fieldLabel = normalizeHeading(header ? header.textContent : '');
          if (!fieldLabel || !cell) return;
          targets.push({
            cell,
            fieldLabel,
            groupLabel,
            key: `${tableIndex}:${rowIndex}`,
            row
          });
        });
      });
      return targets;
    }

    function collectRenderedGroupTargets(section) {
      if (!section) return [];
      const groups = [];
      section.querySelectorAll('.ui-vpp-striped-specs__table').forEach((table, tableIndex) => {
        const groupTitle = table.querySelector('.ui-vpp-striped-specs__header');
        const groupLabel = normalizeHeading(groupTitle ? groupTitle.textContent : '');
        const body = table.querySelector('tbody');
        if (!body) return;
        groups.push({
          body,
          groupLabel,
          key: `group:${tableIndex}`,
          table
        });
      });
      return groups;
    }

    function findRenderedFieldTarget(targets, usedTargets, group, field) {
      const fieldLabel = normalizeHeading(field.label);
      const groupLabels = [
        group && group.label,
        field.groupName
      ].map(normalizeHeading).filter(Boolean);
      const candidates = targets.filter((target) => target.fieldLabel === fieldLabel && !usedTargets.has(target.key));
      const exact = candidates.find((target) => groupLabels.includes(target.groupLabel));
      const target = exact || (candidates.length === 1 ? candidates[0] : null);
      if (target) usedTargets.add(target.key);
      return target;
    }

    function hasExactRenderedFieldTarget(targets, group, field) {
      const fieldLabel = normalizeHeading(field && field.label);
      if (!fieldLabel) return false;
      const candidates = targets.filter((target) => target.fieldLabel === fieldLabel);
      if (!candidates.length) return false;
      if (candidates.length === 1) return true;
      return candidates.some((target) => isRenderedGroupMatch(target, group, field));
    }

    function isCompositeRenderedFieldTarget(target, group, field) {
      const fieldLabel = normalizeHeading(field && field.label);
      const componentLabel = normalizeHeading(field && field.componentLabel);
      if (!fieldLabel || !target || target.fieldLabel === fieldLabel) return false;
      if (!isRenderedGroupMatch(target, group, field)) return false;
      if (componentLabel && target.fieldLabel === componentLabel) return true;
      return splitCompositeHeading(target.fieldLabel).includes(fieldLabel);
    }

    function isRenderedGroupMatch(target, group, field) {
      const labels = [
        group && group.label,
        field && field.groupName
      ].map(normalizeHeading).filter(Boolean);
      if (!labels.length || !target || !target.groupLabel) return true;
      return labels.some((label) => label === target.groupLabel || label.includes(target.groupLabel) || target.groupLabel.includes(label));
    }

    function isCompositeHeading(label) {
      return splitCompositeHeading(label).length > 1;
    }

    function splitCompositeHeading(label) {
      return normalizeHeading(label)
        .split(/\s+(?:x|e)\s+|[\/+,]/)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    function findRenderedGroupTarget(groupTargets, group, field) {
      const labels = [
        group && group.label,
        field && field.groupName
      ].map(normalizeHeading).filter(Boolean);
      const exact = groupTargets.find((target) => labels.includes(target.groupLabel));
      if (exact) return exact;
      const partial = groupTargets.find((target) => target.groupLabel && labels.some((label) => target.groupLabel.includes(label) || label.includes(target.groupLabel)));
      return partial || groupTargets[0] || null;
    }

    function insertSyntheticFieldRow(groupTargets, group, field, disabled, placement = {}) {
      const target = placement.body ? { body: placement.body } : findRenderedGroupTarget(groupTargets, group, field);
      if (!target || !target.body) return false;
      const row = document.createElement('tr');
      row.className = 'andes-table__row ui-vpp-striped-specs__row onframe-characteristics-extra-row';
      row.dataset.characteristicsExtraFieldId = field.id;

      const header = document.createElement('th');
      header.className = 'andes-table__header andes-table__header--left ui-vpp-striped-specs__row__column ui-vpp-striped-specs__row__column--id';
      header.scope = 'row';
      const labelRoot = document.createElement('div');
      labelRoot.className = 'andes-table__header__container onframe-characteristics-extra-label';
      labelRoot.dataset.onframeCharacteristicsRoot = 'true';
      header.appendChild(labelRoot);

      const cell = document.createElement('td');
      cell.className = 'andes-table__column andes-table__column--left andes-table__column--vertical-align-center ui-vpp-striped-specs__row__column';
      row.append(header, cell);
      const beforeNode = placement.beforeNode && placement.beforeNode.parentElement === target.body
        ? placement.beforeNode
        : null;
      target.body.insertBefore(row, beforeNode);
      state.inlineSyntheticRows.push(row);

      CharacteristicsView.renderSyntheticFieldLabel(labelRoot, {
        label: field.label,
        status: buildCharacteristicStatusViewModel(field)
      }, { onError: handleCharacteristicsViewFailure });

      if (field.editable) {
        cell.classList.add('onframe-characteristics-inline-cell');
        cell.dataset.onframeCharacteristicsRoot = 'true';
        CharacteristicsView.renderInlineField(cell, buildInlineFieldViewModel(field, disabled), {
          onFieldChange: updateDraftField,
          onError: handleCharacteristicsViewFailure
        });
        return true;
      }

      const value = document.createElement('span');
      value.className = 'onframe-characteristics-extra-value';
      const valueText = document.createElement('span');
      valueText.className = 'andes-table__column--value';
      valueText.textContent = field.displayValue || field.valueName || '-';
      value.appendChild(valueText);
      cell.appendChild(value);
      return true;
    }

    function getCharacteristicStatus(field) {
      if (!field) return null;
      const hidden = isHiddenField(field);
      if (field.pending) {
        return {
          kind: 'pending',
          tone: 'orange',
          label: 'Pendente',
          title: hidden
            ? 'Campo existe no contrato da categoria, ainda não está preenchido e não aparece na ficha pública.'
            : 'Campo existe no contrato da categoria, mas ainda não está preenchido no anúncio.'
        };
      }
      const readOnlyTitle = field && field.message ? field.message : 'Campo sem edição disponível.';
      const showReadOnlyBadge = field && !field.editable && field.reason !== 'hidden';
      if (showReadOnlyBadge) {
        return {
          kind: 'readonly',
          tone: 'grey',
          label: 'Leitura',
          title: hidden ? `${readOnlyTitle} Campo não exibido na ficha pública.` : readOnlyTitle
        };
      }
      if (hidden) {
        return {
          kind: 'hidden',
          tone: 'blue',
          label: 'Oculto',
          title: 'Campo não exibido na ficha pública.'
        };
      }
      return null;
    }

    function buildCharacteristicStatusViewModel(field) {
      const status = getCharacteristicStatus(field);
      return status ? {
        label: status.label,
        title: status.title,
        tone: status.tone
      } : null;
    }

    function buildInlineFieldViewModel(field, disabled) {
      const draft = state.draft[field.id] || {};
      if (field.valueType === 'list' || field.valueType === 'boolean') {
        const options = (Array.isArray(field.options) ? field.options : []).map((option) => ({
          label: String(option.name || option.id || ''),
          value: String(option.id || '')
        }));
        const selected = options.find((option) => option.value === String(draft.valueId || ''));
        return {
          id: field.id,
          label: field.label,
          type: 'select',
          disabled,
          value: selected ? selected.label : '',
          options
        };
      }
      if (field.valueType === 'number_unit') {
        return {
          id: field.id,
          label: field.label,
          type: 'number_unit',
          disabled,
          number: String(draft.number || ''),
          unit: String(draft.unit || ''),
          units: collectUnits(field, draft.unit)
        };
      }
      return {
        id: field.id,
        label: field.label,
        type: 'text',
        disabled,
        inputMode: field.valueType === 'number' ? 'decimal' : 'text',
        placeholder: field.pending ? 'Digite o valor' : '',
        value: String(draft.valueName || '')
      };
    }

    function isHiddenField(field) {
      return Boolean(field && Array.isArray(field.tags) && field.tags.includes('hidden') && !field.publicField);
    }

    function ensureInlineCellRecord(field, target) {
      const current = state.inlineCellRecords.get(field.id);
      if (current && current.cell === target.cell) return;
      if (current) restoreInlineCell(current, field);
      state.inlineCellRecords.set(field.id, {
        cell: target.cell,
        row: target.row,
        originalHtml: target.cell.innerHTML
      });
    }

    function restoreInactiveInlineCells(activeIds, fieldsById) {
      for (const [fieldId, record] of Array.from(state.inlineCellRecords.entries())) {
        if (activeIds.has(fieldId)) continue;
        restoreInlineCell(record, fieldsById.get(fieldId));
        state.inlineCellRecords.delete(fieldId);
      }
    }

    function restoreInlineCells() {
      const fieldsById = new Map((state.snapshot && Array.isArray(state.snapshot.fields) ? state.snapshot.fields : [])
        .map((field) => [field.id, field]));
      removeSyntheticRows();
      for (const [fieldId, record] of Array.from(state.inlineCellRecords.entries())) {
        restoreInlineCell(record, fieldsById.get(fieldId));
      }
      state.inlineCellRecords.clear();
      state.inlineEditableCount = 0;
      state.inlineMissingCount = 0;
    }

    function removeSyntheticRows() {
      for (const row of state.inlineSyntheticRows || []) {
        if (row) {
          row.querySelectorAll('[data-onframe-characteristics-root="true"]').forEach((host) => {
            CharacteristicsView.unmount(host);
          });
        }
        if (row && row.isConnected) row.remove();
      }
      state.inlineSyntheticRows = [];
      document.querySelectorAll('.onframe-characteristics-composite-source').forEach((row) => {
        row.classList.remove('onframe-characteristics-composite-source');
      });
    }

    function restoreInlineCell(record, field) {
      if (!record || !record.cell) return;
      if (record.react) CharacteristicsView.unmount(record.cell);
      if (!record.cell.isConnected) return;
      record.cell.classList.remove('onframe-characteristics-inline-cell');
      if (record.row) record.row.classList.remove('onframe-characteristics-row-editable');
      record.cell.innerHTML = record.originalHtml;
      if (!field) return;
      const valueNode = record.cell.querySelector('.andes-table__column--value') || record.cell;
      valueNode.textContent = field.displayValue || field.valueName || '-';
    }

    function isInlineControlActive() {
      const active = document.activeElement;
      return Boolean(active && typeof active.closest === 'function' && active.closest('.onframe-characteristics-inline-control'));
    }

    function updateDraftField(id, part, value) {
      const fieldId = String(id || '');
      const fieldPart = String(part || '');
      if (!fieldId || !fieldPart || !state.draft[fieldId]) return;
      state.draft[fieldId] = Object.assign({}, state.draft[fieldId], {
        [fieldPart]: value
      });
      state.bulkResult = null;
      state.error = '';
    }

    async function saveCharacteristics() {
      if (!state.itemId || state.saving || state.loading || !CharacteristicsModel.canEditCharacteristics(state.context)) return;
      const updates = buildChangedUpdates();
      if (!updates.length) {
        state.error = 'Altere ao menos uma característica.';
        mountCharacteristics();
        return;
      }

      state.saving = true;
      state.error = '';
      state.bulkResult = null;
      mountCharacteristics();

      try {
        const result = state.bulkEnabled
          ? await api(itemApiPath('/characteristics/bulk'), {
              method: 'POST',
              body: JSON.stringify({ scope: 'user_product_family', attributes: updates })
            })
          : await api(itemApiPath('/characteristics'), {
              method: 'PUT',
              body: JSON.stringify({ attributes: updates })
            });

        if (state.bulkEnabled) {
          state.bulkResult = result;
          if (isCurrentTargetApplied(result)) {
            state.originalDraft = cloneDraft(state.draft);
            applyDraftToSnapshotFields(updates);
          }
        } else if (result && result.characteristics) {
          setSnapshot(result.characteristics);
        } else {
          state.originalDraft = cloneDraft(state.draft);
          applyDraftToSnapshotFields(updates);
        }
        state.saving = false;
        notifySaveResult(result, 'Características salvas', state.bulkEnabled);
        mountCharacteristics();
      } catch (err) {
        state.saving = false;
        state.error = toUserError(err);
        mountCharacteristics();
      }
    }

    function notifySaveResult(result, title, bulk) {
      if (!bulk) {
        showToast('success', title);
        return;
      }
      const counts = result && result.counts ? result.counts : {};
      const applied = Number(counts.applied || 0);
      const notChanged = Number(counts.failed || 0) + Number(counts.blocked || 0) + Number(counts.skipped || 0);
      if (!applied) {
        state.error = 'Nenhuma variação foi alterada.';
        return;
      }
      const body = notChanged
        ? `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}. ${notChanged} não foi${notChanged === 1 ? '' : 'ram'} alterada${notChanged === 1 ? '' : 's'}.`
        : `${applied} variação${applied === 1 ? '' : 'ões'} alterada${applied === 1 ? '' : 's'}.`;
      showToast(notChanged ? 'warning' : 'success', title, body);
    }

    function showToast(tone, title, body) {
      if (!toast || typeof toast.show !== 'function') return;
      toast.show({ tone, title, body });
    }

    function buildChangedUpdates() {
      const fields = state.snapshot && Array.isArray(state.snapshot.fields) ? state.snapshot.fields : [];
      const updates = [];
      for (const field of fields) {
        if (!field.editable) continue;
        const draft = state.draft[field.id] || {};
        const original = state.originalDraft[field.id] || {};
        if (draftSignature(draft, field) === draftSignature(original, field)) continue;
        updates.push(buildUpdate(field, draft));
      }
      return updates;
    }

    function buildUpdate(field, draft) {
      if (field.multivalued) {
        return {
          id: field.id,
          valueName: CharacteristicsModel.normalizeFieldText(draft.valueName)
        };
      }
      if (field.valueType === 'number_unit') {
        return {
          id: field.id,
          number: CharacteristicsModel.normalizeFieldText(draft.number),
          unit: CharacteristicsModel.normalizeFieldText(draft.unit)
        };
      }
      if (field.valueType === 'list' || field.valueType === 'boolean') {
        return {
          id: field.id,
          valueId: CharacteristicsModel.normalizeFieldText(draft.valueId)
        };
      }
      return {
        id: field.id,
        valueName: CharacteristicsModel.normalizeFieldText(draft.valueName)
      };
    }

    function applyDraftToSnapshotFields(updates) {
      const changedIds = new Set((Array.isArray(updates) ? updates : []).map((update) => String(update.id || '')));
      const fields = state.snapshot && Array.isArray(state.snapshot.fields) ? state.snapshot.fields : [];
      fields.forEach((field) => {
        if (!changedIds.has(field.id)) return;
        const draft = state.draft[field.id] || {};
        const displayValue = formatDraftDisplayValue(field, draft);
        field.pending = false;
        field.displayValue = displayValue || field.displayValue;
        if (field.multivalued) {
          field.valueName = displayValue;
        } else if (field.valueType === 'list' || field.valueType === 'boolean') {
          field.valueId = CharacteristicsModel.normalizeFieldText(draft.valueId);
          field.valueName = displayValue;
        } else if (field.valueType === 'number_unit') {
          field.valueName = displayValue;
          field.valueStruct = {
            number: CharacteristicsModel.normalizeFieldText(draft.number),
            unit: CharacteristicsModel.normalizeFieldText(draft.unit)
          };
        } else {
          field.valueName = displayValue;
        }
      });
    }

    function formatDraftDisplayValue(field, draft) {
      if (field.multivalued) return formatMultivalueText(draft.valueName);
      if (field.valueType === 'number_unit') {
        const number = CharacteristicsModel.normalizeFieldText(draft.number);
        const unit = CharacteristicsModel.normalizeFieldText(draft.unit);
        return [number, unit].filter(Boolean).join(' ');
      }
      if (field.valueType === 'list' || field.valueType === 'boolean') {
        const valueId = CharacteristicsModel.normalizeFieldText(draft.valueId);
        const option = (Array.isArray(field.options) ? field.options : []).find((candidate) => String(candidate.id) === valueId);
        return option && option.name ? String(option.name) : valueId;
      }
      return CharacteristicsModel.normalizeFieldText(draft.valueName);
    }

    function formatMultivalueText(value) {
      return String(value || '')
        .split(',')
        .map((item) => CharacteristicsModel.normalizeFieldText(item))
        .filter(Boolean)
        .join(', ');
    }

    function cancelEditor() {
      closeEditor();
      mountCharacteristics();
    }

    function closeEditor() {
      restoreInlineCells();
      unmountEditorViews();
      if (state.editorRoot) state.editorRoot.remove();
      state.editorRoot = null;
      if (state.sectionElement) state.sectionElement.classList.remove('onframe-characteristics-is-editing');
      state.editing = false;
      state.loading = false;
      state.saving = false;
      state.snapshot = null;
      state.draft = {};
      state.originalDraft = {};
      state.bulkEnabled = false;
      state.bulkResult = null;
      state.error = '';
      state.inlineCellRecords = new Map();
      state.inlineSyntheticRows = [];
      state.inlineEditableCount = 0;
      state.inlineMissingCount = 0;
    }

    function removeInjectedActions() {
      restoreInlineCells();
      document.querySelectorAll('.onframe-characteristics-action-root, .onframe-characteristics-catalog-notice').forEach((node) => {
        CharacteristicsView.unmount(node);
        node.remove();
      });
      unmountEditorViews();
      document.querySelectorAll('.onframe-characteristics-is-editing').forEach((node) => node.classList.remove('onframe-characteristics-is-editing'));
      if (state.editorRoot) state.editorRoot.remove();
      state.editorRoot = null;
    }

    function unmountEditorViews() {
      if (!state.editorRoot) return;
      state.editorRoot.querySelectorAll('.onframe-characteristics-package-root, .onframe-characteristics-footer-root')
        .forEach((node) => CharacteristicsView.unmount(node));
    }

    function isCatalogListing() {
      return Boolean(state.context && state.context.item && state.context.item.catalog_listing);
    }

    function hideCharacteristics() {
      state.visible = false;
      closeEditor();
      removeInjectedActions();
      return getCharacteristicsStatus();
    }

    function showCharacteristics() {
      state.visible = true;
      mountCharacteristics();
      return getCharacteristicsStatus();
    }

    function reloadCharacteristics() {
      state.visible = true;
      mountCharacteristics();
      return getCharacteristicsStatus();
    }

    function getCharacteristicsStatus() {
      return {
        ok: true,
        isProductPage: isProductPageUrl(location.href),
        loaded: state.loaded,
        busy: state.busy || state.loading || state.saving,
        editorVisible: state.visible,
        dirty: state.editing && JSON.stringify(state.draft) !== JSON.stringify(state.originalDraft),
        error: state.error,
        itemId: state.itemId,
        mode: state.context && state.context.mode ? state.context.mode : null,
        url: location.href
      };
    }

    function createDraft(snapshot) {
      const draft = {};
      const fields = snapshot && Array.isArray(snapshot.fields) ? snapshot.fields : [];
      fields.filter((field) => field.editable).forEach((field) => {
        draft[field.id] = readFieldDraft(field);
      });
      return draft;
    }

    function readFieldDraft(field) {
      if (field.valueType === 'number_unit') {
        return {
          number: field.valueStruct && field.valueStruct.number !== undefined ? String(field.valueStruct.number) : extractNumber(field.displayValue || field.valueName),
          unit: field.valueStruct && field.valueStruct.unit ? String(field.valueStruct.unit) : collectUnits(field)[0] || ''
        };
      }
      if (field.multivalued) {
        return {
          valueName: formatMultivalueText(field.displayValue || field.valueName || '')
        };
      }
      if (field.valueType === 'list' || field.valueType === 'boolean') {
        if (field.pending && !field.valueId && !field.valueName && !field.displayValue) return { valueId: '' };
        const options = Array.isArray(field.options) ? field.options : [];
        const matched = options.find((option) => option.id === field.valueId) ||
          options.find((option) => normalizeText(option.name).toLowerCase() === normalizeText(field.valueName || field.displayValue).toLowerCase()) ||
          {};
        return { valueId: matched.id || '' };
      }
      return {
        valueName: field.valueName || field.displayValue || ''
      };
    }

    function draftSignature(draft, field) {
      if (field.valueType === 'number_unit') return `${normalizeText(draft.number)}|${normalizeText(draft.unit)}`;
      if (field.multivalued) return formatMultivalueText(draft.valueName).toLowerCase();
      if (field.valueType === 'list' || field.valueType === 'boolean') return normalizeText(draft.valueId);
      return normalizeText(draft.valueName);
    }

    function collectUnits(field, currentUnit) {
      const units = [];
      addUnit(units, currentUnit);
      addUnit(units, field && field.valueStruct && field.valueStruct.unit);
      addUnit(units, field && field.defaultUnit);
      (Array.isArray(field && field.allowedUnits) ? field.allowedUnits : []).forEach((unit) => addUnit(units, unit));
      return units;
    }

    function addUnit(units, unit) {
      const value = normalizeText(unit);
      if (value && !units.includes(value)) units.push(value);
    }

    function extractNumber(value) {
      const match = String(value || '').match(/-?\d+(?:[.,]\d+)?/);
      return match ? match[0] : '';
    }

    function cloneDraft(draft) {
      return JSON.parse(JSON.stringify(draft || {}));
    }

    function isCurrentTargetApplied(result) {
      const targets = result && Array.isArray(result.targets) ? result.targets : [];
      const current = targets.find((target) => target.current);
      return !current || current.status === 'applied';
    }

    function itemApiPath(suffix) {
      const query = new URLSearchParams();
      if (state.ownerUserId) query.set('owner_user_id', String(state.ownerUserId));
      const search = query.toString();
      return `/api/items/${encodeURIComponent(state.itemId)}${suffix}${search ? `?${search}` : ''}`;
    }

    function normalizeHeading(value) {
      return normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    }

    function normalizeText(value) {
      return String(value === undefined || value === null ? '' : value).trim();
    }

    function readPageSignature() {
      return Detection.createPageSignature(document, location.href);
    }

    function handleCharacteristicsViewFailure(error) {
      if (rootScope.console && typeof rootScope.console.error === 'function') {
        rootScope.console.error('[OnFrame] A interface de características falhou.', error);
      }
    }

    return {
      id: 'characteristics',
      label: 'Características',
      getStatus: getCharacteristicsStatus,
      handlePageContextChange,
      hide: hideCharacteristics,
      isBusy: () => Boolean(state.busy || state.loading || state.saving),
      isLoaded: () => Boolean(state.loaded),
      reload: reloadCharacteristics,
      reset: resetState,
      scheduleRender,
      show: showCharacteristics,
      start: startCharacteristics
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
