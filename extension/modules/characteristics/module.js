(function (rootScope) {
  rootScope.OnFrameCharacteristicsModule = {
    createCharacteristicsModule
  };

  function createCharacteristicsModule(services) {
    const Shared = services.Shared;
    const Detection = services.Detection;
    const CharacteristicsModel = services.CharacteristicsModel;
    const api = services.api;
    const escapeHtml = Shared.escapeHtml;
    const escapeAttribute = Shared.escapeAttribute;
    const isProductPageUrl = Detection.isProductPageUrl;
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
      message: '',
      error: '',
      editorRoot: null,
      sectionElement: null,
      inlineCellRecords: new Map(),
      inlineSyntheticRows: [],
      inlineEditableCount: 0,
      inlineMissingCount: 0,
      openSelectKey: '',
      forceInlineRender: false,
      documentEventsBound: false,
      renderTimer: null,
      requestId: 0,
      pageSignature: ''
    };

    function startCharacteristics() {
      state.pageSignature = readPageSignature();
      ensureDocumentEvents();
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
      state.message = '';
      state.error = '';
      state.inlineCellRecords = new Map();
      state.inlineSyntheticRows = [];
      state.inlineEditableCount = 0;
      state.inlineMissingCount = 0;
      state.openSelectKey = '';
      state.forceInlineRender = false;
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
        state.message = '';
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
      if (!state.visible || !isProductPageUrl(location.href) || !state.itemId || !CharacteristicsModel.canEditCharacteristics(state.context)) {
        removeInjectedActions();
        return;
      }

      const elements = getCharacteristicsElements();
      if (!elements.title || !elements.section) {
        removeInjectedActions();
        return;
      }

      state.sectionElement = elements.section;
      injectEditAction(elements);
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

    function injectEditAction(elements) {
      if (!elements.title) return;
      const existingAction = elements.section.querySelector('.onframe-characteristics-action');
      if (existingAction) {
        syncEditActionState(existingAction, elements.section);
        return;
      }
      const anchor = elements.titleRow || elements.title;
      const action = document.createElement('button');
      action.className = 'ob-button ghost onframe-characteristics-action';
      action.type = 'button';
      action.innerHTML = `${icon('pencil', 14)}Editar características`;
      action.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const section = action.closest('#highlighted_specs_attrs') ||
          action.closest('.ui-vpp-highlighted-specs') ||
          elements.section;
        if (isCharacteristicsCollapsed(section)) {
          scheduleRender(80);
          return;
        }
        void openEditor();
      });
      anchor.insertAdjacentElement('afterend', action);
      syncEditActionState(action, elements.section);
    }

    function syncEditActionState(action, section) {
      const collapsed = isCharacteristicsCollapsed(section);
      action.disabled = collapsed;
      action.classList.toggle('is-disabled', collapsed);
      action.setAttribute('aria-disabled', collapsed ? 'true' : 'false');
      if (collapsed) action.title = 'Conferir todas as características antes de editar.';
      else action.removeAttribute('title');
    }

    function isCharacteristicsCollapsed(section) {
      if (!section) return false;
      return Boolean(section.querySelector('.ui-pdp-collapsable--is-collapsed'));
    }

    async function openEditor() {
      if (!state.visible || !state.itemId || state.loading || state.saving || !CharacteristicsModel.canEditCharacteristics(state.context)) return;
      const elements = getCharacteristicsElements();
      if (elements.section && isCharacteristicsCollapsed(elements.section)) return;
      state.editing = true;
      state.loading = true;
      state.error = '';
      state.message = '';
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
        expandCharacteristicsSection(elements.section);
      }

      const disabled = state.loading || state.saving;
      if (!state.loading && state.snapshot && (state.forceInlineRender || !isInlineControlActive())) {
        state.forceInlineRender = false;
        renderInlineFields(elements.section, disabled);
      }

      if (!state.editorRoot || !state.editorRoot.isConnected) {
        state.editorRoot = document.createElement('div');
        state.editorRoot.className = 'onframe-characteristics-root';
        anchor.insertAdjacentElement('afterend', state.editorRoot);
      } else if (state.editorRoot.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement('afterend', state.editorRoot);
      }

      state.editorRoot.innerHTML = `${renderPackageDimensionsCard(disabled)}${renderFooterMarkup()}`;
      bindEditorEvents();
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

    function expandCharacteristicsSection(section) {
      section.querySelectorAll('.ui-pdp-collapsable--is-collapsed').forEach((node) => {
        node.classList.remove('ui-pdp-collapsable--is-collapsed');
      });
      section.querySelectorAll('.ui-pdp-collapsable__container').forEach((container) => {
        container.style.maxHeight = 'none';
        container.style.overflow = 'visible';
      });
    }

    function renderFooterMarkup() {
      const disabled = state.loading || state.saving;
      const canBulk = CharacteristicsModel.canBulkEditCharacteristics(state.context);
      if (!canBulk) state.bulkEnabled = false;
      return `
        <section class="onframe-characteristics-footer" aria-label="Ações da edição de características">
          <div class="onframe-characteristics-footer-head">
            <strong>Editando características</strong>
            ${state.loading ? `<span class="onframe-characteristics-state">${spinner()}Carregando ficha...</span>` : ''}
            ${state.saving ? `<span class="onframe-characteristics-state">${spinner()}Salvando...</span>` : ''}
          </div>
          ${renderInlineNotice()}
          ${canBulk ? renderBulkSwitch(disabled) : ''}
          ${state.error ? `<div class="onframe-characteristics-alert error">${escapeHtml(state.error)}</div>` : ''}
          ${state.message ? `<div class="onframe-characteristics-alert success">${escapeHtml(state.message)}</div>` : ''}
          ${renderBulkFailures()}
          <div class="onframe-characteristics-actions">
            <button class="ob-button primary" data-action="save-characteristics" type="button" ${disabled ? 'disabled' : ''}>${icon('checkCircle', 14)}Salvar</button>
            <button class="ob-button" data-action="cancel-characteristics" type="button" ${state.saving ? 'disabled' : ''}>Cancelar</button>
          </div>
        </section>
      `;
    }

    function renderPackageDimensionsCard(disabled) {
      const packageDimensions = state.snapshot && state.snapshot.packageDimensions ? state.snapshot.packageDimensions : null;
      const fields = getPackageDimensionFields();
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
            ${fields.map((field) => renderPackageDimensionField(field, disabled)).join('')}
          </div>
          <div class="onframe-characteristics-package-note">${icon('info', 12)}Peso e medidas afetam o cálculo do frete. Confira antes de salvar.</div>
        </section>
      `;
    }

    function renderPackageDimensionField(field, disabled) {
      if (!field) return '';
      const locked = disabled || !field.editable;
      return `
        <label class="onframe-characteristics-package-field">
          <span class="onframe-characteristics-package-label">
            ${escapeHtml(field.label)}
            ${!field.editable ? renderFieldStatusBadges(field) : ''}
          </span>
          ${field.editable ? renderPackageNumberUnitControl(field, locked) : renderPackageReadOnlyValue(field)}
        </label>
      `;
    }

    function renderPackageNumberUnitControl(field, disabled) {
      const draft = state.draft[field.id] || {};
      const units = collectUnits(field, draft.unit);
      return `
        <span class="onframe-characteristics-package-control">
          <span class="ob-field-shell onframe-characteristics-field-shell onframe-characteristics-package-number-shell ${disabled ? 'is-disabled' : ''}">
            <input class="ob-field-input onframe-characteristics-package-input" data-field-id="${escapeAttribute(field.id)}" data-field-part="number" aria-label="${escapeAttribute(field.label)}" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttribute(draft.number || '')}" ${disabled ? 'disabled' : ''}>
          </span>
          ${renderCustomSelectControl({
            field,
            part: 'unit',
            label: `Unidade de ${field.label}`,
            options: units.map((unit) => ({ value: unit, label: unit })),
            value: draft.unit,
            disabled,
            shellClass: 'onframe-characteristics-package-unit-shell'
          })}
        </span>
      `;
    }

    function renderPackageReadOnlyValue(field) {
      return `
        <span class="onframe-characteristics-package-readonly">
          ${escapeHtml(field.displayValue || field.valueName || '-')}
        </span>
      `;
    }

    function renderInlineNotice() {
      if (state.loading) return '<div class="onframe-characteristics-note">Carregando os campos editáveis.</div>';
      const groups = state.snapshot && Array.isArray(state.snapshot.groups) ? state.snapshot.groups : [];
      const packageFields = getPackageDimensionFields();
      const hasEditableGroupField = groups.some((group) => (group.attributes || []).some((field) => field.editable));
      const hasEditablePackageField = packageFields.some((field) => field.editable);
      if (!groups.length && !packageFields.length) return '<div class="onframe-characteristics-note">Nenhuma característica encontrada neste anúncio.</div>';
      if (!hasEditableGroupField && !hasEditablePackageField) {
        return '<div class="onframe-characteristics-note">O Mercado Livre não expôs campos editáveis para este anúncio.</div>';
      }
      if (!state.inlineEditableCount && !state.inlineMissingCount && !hasEditablePackageField) return '<div class="onframe-characteristics-note">Nenhuma característica editável está visível nesta ficha.</div>';
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
        const compositeResult = renderCompositeFieldTargets(targets, usedTargets, group, fields, disabled, activeIds);
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
          target.cell.innerHTML = renderFieldControl(field, disabled);
        }
      }

      restoreInactiveInlineCells(activeIds, fieldsById);
      state.inlineEditableCount = editableCount;
      state.inlineMissingCount = missingCount;
    }

    function renderCompositeFieldTargets(targets, usedTargets, group, fields, disabled, activeIds) {
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
        target.row.classList.add('onframe-characteristics-row-editable', 'onframe-characteristics-row-composite');
        target.cell.classList.add('onframe-characteristics-inline-cell', 'onframe-characteristics-composite-cell');
        matches.forEach((field) => {
          handledIds.add(field.id);
          activeIds.add(field.id);
          if (field.editable) editableCount += 1;
          ensureInlineCellRecord(field, target, { composite: true });
        });
        target.cell.innerHTML = renderCompositeFieldControls(matches, disabled);
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

    function insertSyntheticFieldRow(groupTargets, group, field, disabled) {
      const target = findRenderedGroupTarget(groupTargets, group, field);
      if (!target || !target.body) return false;
      const row = document.createElement('tr');
      row.className = 'andes-table__row ui-vpp-striped-specs__row onframe-characteristics-extra-row';
      row.dataset.fieldId = field.id;
      row.innerHTML = renderSyntheticFieldRow(field, disabled);
      target.body.appendChild(row);
      state.inlineSyntheticRows.push(row);
      return true;
    }

    function renderSyntheticFieldRow(field, disabled) {
      return `
        <th class="andes-table__header andes-table__header--left ui-vpp-striped-specs__row__column ui-vpp-striped-specs__row__column--id" scope="row">
          <div class="andes-table__header__container onframe-characteristics-extra-label">
            <span class="onframe-characteristics-extra-label-text">${escapeHtml(field.label)}</span>
            ${renderHiddenStatusBadge(field)}
          </div>
        </th>
        <td class="andes-table__column andes-table__column--left andes-table__column--vertical-align-center ui-vpp-striped-specs__row__column onframe-characteristics-inline-cell">
          ${renderSyntheticFieldValue(field, disabled)}
        </td>
      `;
    }

    function renderSyntheticFieldValue(field, disabled) {
      if (field.editable) {
        return `
          <span class="onframe-characteristics-extra-value">
            ${renderFieldControl(field, disabled)}
            ${renderFieldStatusBadges(field)}
          </span>
        `;
      }
      return `
        <span class="onframe-characteristics-extra-value">
          <span class="andes-table__column--value">${escapeHtml(field.displayValue || field.valueName || '-')}</span>
          ${renderFieldStatusBadges(field)}
        </span>
      `;
    }

    function renderCompositeFieldControls(fields, disabled) {
      if (canShareCompositeUnit(fields)) return renderSharedCompositeNumberUnitControls(fields, disabled);
      return `
        <span class="onframe-characteristics-composite-control">
          ${fields.map((field, index) => `
            ${index ? '<span class="onframe-characteristics-composite-separator" aria-hidden="true">x</span>' : ''}
            <span class="onframe-characteristics-composite-field" title="${escapeAttribute(field.label)}">
              ${field.editable ? renderFieldControl(field, disabled) : renderCompositeReadonlyValue(field)}
            </span>
          `).join('')}
        </span>
      `;
    }

    function canShareCompositeUnit(fields) {
      if (!Array.isArray(fields) || fields.length < 2) return false;
      if (!fields.every((field) => field && field.editable && field.valueType === 'number_unit')) return false;
      const firstSignature = unitsSignature(fields[0]);
      return Boolean(firstSignature) && fields.every((field) => unitsSignature(field) === firstSignature);
    }

    function renderSharedCompositeNumberUnitControls(fields, disabled) {
      const sharedUnit = getSharedCompositeUnit(fields);
      const units = collectUnits(fields[0], sharedUnit);
      const compositeLabel = fields.map((field) => field.label).join(' x ');
      return `
        <span class="onframe-characteristics-composite-control is-shared-unit">
          ${fields.map((field, index) => `
            ${index ? '<span class="onframe-characteristics-composite-separator" aria-hidden="true">x</span>' : ''}
            <span class="onframe-characteristics-composite-field" title="${escapeAttribute(field.label)}">
              ${renderCompositeNumberControl(field, disabled)}
            </span>
          `).join('')}
          ${renderCustomSelectControl({
            field: {
              id: `COMPOSITE_${fields.map((field) => field.id).join('_')}`,
              label: `Unidade de ${compositeLabel}`
            },
            part: 'unit',
            label: `Unidade de ${compositeLabel}`,
            options: units.map((unit) => ({ value: unit, label: unit })),
            value: sharedUnit,
            disabled,
            shellClass: 'onframe-characteristics-composite-unit-shell',
            compositeFieldIds: fields.map((field) => field.id)
          })}
        </span>
      `;
    }

    function renderCompositeNumberControl(field, disabled) {
      const draft = state.draft[field.id] || {};
      return `
        <span class="onframe-characteristics-inline-control onframe-characteristics-composite-number-only">
          <span class="ob-field-shell onframe-characteristics-field-shell onframe-characteristics-number-shell ${disabled ? 'is-disabled' : ''}">
            <input class="ob-field-input onframe-characteristics-compact-field" data-field-id="${escapeAttribute(field.id)}" data-field-part="number" aria-label="${escapeAttribute(field.label)}" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttribute(draft.number || '')}" ${disabled ? 'disabled' : ''}>
          </span>
        </span>
      `;
    }

    function renderCompositeReadonlyValue(field) {
      return `
        <span class="onframe-characteristics-composite-readonly">
          <span class="andes-table__column--value">${escapeHtml(field.displayValue || field.valueName || '-')}</span>
          ${renderFieldStatusBadges(field)}
        </span>
      `;
    }

    function renderFieldStatusBadges(field) {
      const readOnlyTitle = field && field.message ? field.message : 'Campo sem edição disponível.';
      const showReadOnlyBadge = field && !field.editable && field.reason !== 'hidden';
      return showReadOnlyBadge ? `<span class="ob-badge grey onframe-characteristics-status-badge" title="${escapeAttribute(readOnlyTitle)}">Leitura</span>` : '';
    }

    function renderHiddenStatusBadge(field) {
      if (!field || !Array.isArray(field.tags) || !field.tags.includes('hidden') || field.publicField) return '';
      return '<span class="ob-badge blue onframe-characteristics-status-badge" title="Campo não exibido na ficha pública">Oculto</span>';
    }

    function ensureInlineCellRecord(field, target, options = {}) {
      const current = state.inlineCellRecords.get(field.id);
      if (current && current.cell === target.cell) return;
      if (current) restoreInlineCell(current, field);
      state.inlineCellRecords.set(field.id, {
        cell: target.cell,
        row: target.row,
        composite: Boolean(options.composite),
        originalHtml: target.cell.innerHTML
      });
    }

    function renderFieldControl(field, disabled) {
      if (field.multivalued) return renderTextControl(field, disabled);
      if (field.valueType === 'list' || field.valueType === 'boolean') return renderSelectControl(field, disabled);
      if (field.valueType === 'number_unit') return renderNumberUnitControl(field, disabled);
      return renderTextControl(field, disabled);
    }

    function renderTextControl(field, disabled) {
      const draft = state.draft[field.id] || {};
      const inputMode = field.valueType === 'number' ? 'decimal' : 'text';
      return `
        <span class="onframe-characteristics-inline-control">
          <span class="ob-field-shell onframe-characteristics-field-shell ${disabled ? 'is-disabled' : ''}">
            <input class="ob-field-input onframe-characteristics-compact-field" data-field-id="${escapeAttribute(field.id)}" data-field-part="valueName" aria-label="${escapeAttribute(field.label)}" type="text" inputmode="${escapeAttribute(inputMode)}" autocomplete="off" value="${escapeAttribute(draft.valueName || '')}" ${disabled ? 'disabled' : ''}>
          </span>
        </span>
      `;
    }

    function renderNumberUnitControl(field, disabled) {
      const draft = state.draft[field.id] || {};
      const units = collectUnits(field, draft.unit);
      return `
        <span class="onframe-characteristics-inline-control onframe-characteristics-unit-row">
            <span class="ob-field-shell onframe-characteristics-field-shell onframe-characteristics-number-shell ${disabled ? 'is-disabled' : ''}">
              <input class="ob-field-input onframe-characteristics-compact-field" data-field-id="${escapeAttribute(field.id)}" data-field-part="number" aria-label="${escapeAttribute(field.label)}" type="text" inputmode="decimal" autocomplete="off" value="${escapeAttribute(draft.number || '')}" ${disabled ? 'disabled' : ''}>
            </span>
            ${renderCustomSelectControl({
              field,
              part: 'unit',
              label: `Unidade de ${field.label}`,
              options: units.map((unit) => ({ value: unit, label: unit })),
              value: draft.unit,
              disabled,
              shellClass: 'onframe-characteristics-unit-shell'
            })}
        </span>
      `;
    }

    function renderSelectControl(field, disabled) {
      const draft = state.draft[field.id] || {};
      const options = Array.isArray(field.options) ? field.options : [];
      return `
        <span class="onframe-characteristics-inline-control">
          ${renderCustomSelectControl({
            field,
            part: 'valueId',
            label: field.label,
            options: options.map((option) => ({ value: option.id, label: option.name })),
            value: draft.valueId,
            disabled
          })}
        </span>
      `;
    }

    function renderCustomSelectControl(config) {
      const field = config.field;
      const part = config.part;
      const options = Array.isArray(config.options) ? config.options : [];
      const value = config.value || '';
      const key = selectKey(field.id, part);
      const open = !config.disabled && state.openSelectKey === key;
      const selected = options.find((option) => option.value === value) || options[0] || { value: '', label: 'Selecione' };
      const shellClass = config.shellClass ? ` ${config.shellClass}` : '';
      const compositeIds = Array.isArray(config.compositeFieldIds) ? config.compositeFieldIds.filter(Boolean) : [];
      const compositeAttribute = compositeIds.length ? ` data-select-composite-ids="${escapeAttribute(compositeIds.join(','))}"` : '';
      return `
        <span class="ob-field-shell ob-select-shell onframe-characteristics-field-shell onframe-characteristics-select${shellClass} ${open ? 'is-open' : ''} ${config.disabled ? 'is-disabled' : ''}">
          <button
            class="ob-field-input onframe-characteristics-select-trigger onframe-characteristics-compact-field"
            data-action="characteristics-select"
            data-select-key="${escapeAttribute(key)}"
            data-select-field-id="${escapeAttribute(field.id)}"
            data-select-field-part="${escapeAttribute(part)}"
            ${compositeAttribute}
            type="button"
            aria-label="${escapeAttribute(config.label)}"
            aria-haspopup="listbox"
            aria-expanded="${open ? 'true' : 'false'}"
            ${config.disabled ? 'disabled' : ''}
          >
            <span class="onframe-characteristics-select-value">${escapeHtml(selected.label || selected.value || 'Selecione')}</span>
          </button>
          <span class="ob-select-caret" aria-hidden="true">${icon('caretDown', 12)}</span>
          ${open ? renderCustomSelectMenu(field, part, key, options, value, compositeIds) : ''}
        </span>
      `;
    }

    function renderCustomSelectMenu(field, part, key, options, value, compositeFieldIds = []) {
      if (!options.length) return '<span class="onframe-characteristics-select-menu empty">Nenhuma opção disponível.</span>';
      const compositeAttribute = compositeFieldIds.length ? ` data-select-composite-ids="${escapeAttribute(compositeFieldIds.join(','))}"` : '';
      return `
        <span class="onframe-characteristics-select-menu" role="listbox" aria-label="${escapeAttribute(field.label)}">
          ${options.map((option) => {
            const selected = option.value === value;
            return `
              <button
                class="onframe-characteristics-select-option ${selected ? 'is-selected' : ''}"
                data-action="characteristics-select-option"
                data-select-key="${escapeAttribute(key)}"
                data-select-field-id="${escapeAttribute(field.id)}"
                data-select-field-part="${escapeAttribute(part)}"
                data-select-value="${escapeAttribute(option.value)}"
                ${compositeAttribute}
                type="button"
                role="option"
                aria-selected="${selected ? 'true' : 'false'}"
              >
                <span>${escapeHtml(option.label || option.value)}</span>
                ${selected ? icon('check', 12) : ''}
              </button>
            `;
          }).join('')}
        </span>
      `;
    }

    function selectKey(fieldId, part) {
      return `${fieldId}:${part}`;
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
        if (row && row.isConnected) row.remove();
      }
      state.inlineSyntheticRows = [];
    }

    function restoreInlineCell(record, field) {
      if (!record || !record.cell || !record.cell.isConnected) return;
      record.cell.classList.remove('onframe-characteristics-inline-cell');
      record.cell.classList.remove('onframe-characteristics-composite-cell');
      if (record.row) record.row.classList.remove('onframe-characteristics-row-editable', 'onframe-characteristics-row-composite');
      record.cell.innerHTML = record.originalHtml;
      if (record.composite) return;
      if (!field) return;
      const valueNode = record.cell.querySelector('.andes-table__column--value') || record.cell;
      valueNode.textContent = field.displayValue || field.valueName || '-';
    }

    function isInlineControlActive() {
      const active = document.activeElement;
      return Boolean(active && typeof active.closest === 'function' && active.closest('.onframe-characteristics-inline-control'));
    }

    function renderBulkSwitch(disabled) {
      return `
        <button class="ob-checkbox onframe-characteristics-bulk-switch ${state.bulkEnabled ? 'is-checked' : ''}" data-action="toggle-characteristics-bulk" type="button" role="checkbox" aria-checked="${state.bulkEnabled ? 'true' : 'false'}" ${disabled ? 'disabled' : ''}>
          <span class="ob-checkbox-box" aria-hidden="true">${state.bulkEnabled ? icon('check', 12) : ''}</span>
          <span>
            <span class="ob-checkbox-label">Aplicar a todas as variações</span>
            <span class="ob-checkbox-description">Salva direto nas variações ativas deste user_product.</span>
          </span>
        </button>
      `;
    }

    function renderBulkFailures() {
      const result = state.bulkResult;
      const failures = result && Array.isArray(result.targets)
        ? result.targets.filter((target) => target.status === 'failed' || target.status === 'blocked')
        : [];
      if (!failures.length) return '';
      return `
        <details class="onframe-characteristics-failures">
          <summary>${failures.length} variação${failures.length === 1 ? '' : 'ões'} não alterada${failures.length === 1 ? '' : 's'}</summary>
          <ul>${failures.map((failure) => `<li>${escapeHtml(failure.itemId)}: ${escapeHtml(failure.message || 'Falha ao salvar.')}</li>`).join('')}</ul>
        </details>
      `;
    }

    function bindEditorEvents() {
      if (!state.editorRoot) return;
      [state.sectionElement, state.editorRoot].filter(Boolean).forEach((fieldContainer) => {
        fieldContainer.querySelectorAll('[data-field-id]').forEach((field) => {
          if (field.dataset.characteristicsBound === 'true') return;
          field.dataset.characteristicsBound = 'true';
          field.addEventListener('input', () => updateDraftFromControl(field));
          field.addEventListener('change', () => updateDraftFromControl(field));
        });
        fieldContainer.querySelectorAll('[data-action="characteristics-select"]').forEach((trigger) => {
          if (trigger.dataset.characteristicsBound === 'true') return;
          trigger.dataset.characteristicsBound = 'true';
          trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleCustomSelect(trigger.dataset.selectKey || '');
          });
          trigger.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeCustomSelect();
            }
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
              event.preventDefault();
              openCustomSelect(trigger.dataset.selectKey || '');
            }
          });
        });
        fieldContainer.querySelectorAll('[data-action="characteristics-select-option"]').forEach((option) => {
          if (option.dataset.characteristicsBound === 'true') return;
          option.dataset.characteristicsBound = 'true';
          option.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectCustomOption(option);
          });
        });
      });
      const save = state.editorRoot.querySelector('[data-action="save-characteristics"]');
      if (save) save.addEventListener('click', () => void saveCharacteristics());
      const cancel = state.editorRoot.querySelector('[data-action="cancel-characteristics"]');
      if (cancel) cancel.addEventListener('click', () => cancelEditor());
      const bulk = state.editorRoot.querySelector('[data-action="toggle-characteristics-bulk"]');
      if (bulk) {
        bulk.addEventListener('click', () => {
          if (state.saving || state.loading) return;
          state.bulkEnabled = !state.bulkEnabled;
          state.bulkResult = null;
          state.message = '';
          state.error = '';
          mountCharacteristics();
        });
      }
    }

    function ensureDocumentEvents() {
      if (state.documentEventsBound) return;
      state.documentEventsBound = true;
      document.addEventListener('click', (event) => {
        if (!state.openSelectKey) return;
        if (event.target && typeof event.target.closest === 'function' && event.target.closest('.onframe-characteristics-select')) return;
        closeCustomSelect();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.openSelectKey) closeCustomSelect();
      });
    }

    function toggleCustomSelect(key) {
      if (!key || state.loading || state.saving) return;
      state.openSelectKey = state.openSelectKey === key ? '' : key;
      state.forceInlineRender = true;
      mountCharacteristics();
    }

    function openCustomSelect(key) {
      if (!key || state.loading || state.saving) return;
      state.openSelectKey = key;
      state.forceInlineRender = true;
      mountCharacteristics();
    }

    function closeCustomSelect() {
      if (!state.openSelectKey) return;
      state.openSelectKey = '';
      state.forceInlineRender = true;
      mountCharacteristics();
    }

    function selectCustomOption(option) {
      const id = String(option.dataset.selectFieldId || '');
      const part = String(option.dataset.selectFieldPart || 'valueId');
      const compositeIds = String(option.dataset.selectCompositeIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (compositeIds.length) {
        compositeIds.forEach((fieldId) => {
          if (!state.draft[fieldId]) return;
          state.draft[fieldId] = Object.assign({}, state.draft[fieldId], {
            [part]: option.dataset.selectValue || ''
          });
        });
        state.openSelectKey = '';
        state.forceInlineRender = true;
        mountCharacteristics();
        return;
      }
      if (!id || !state.draft[id]) return;
      state.draft[id] = Object.assign({}, state.draft[id], {
        [part]: option.dataset.selectValue || ''
      });
      state.openSelectKey = '';
      state.forceInlineRender = true;
      mountCharacteristics();
    }

    function updateDraftFromControl(control) {
      const id = String(control.dataset.fieldId || '');
      const part = String(control.dataset.fieldPart || 'valueName');
      if (!id || !state.draft[id]) return;
      state.draft[id] = Object.assign({}, state.draft[id], {
        [part]: control.value
      });
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
      state.message = '';
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
          state.message = CharacteristicsModel.bulkResultMessage(result);
          if (isCurrentTargetApplied(result)) {
            state.originalDraft = cloneDraft(state.draft);
            applyDraftToSnapshotFields(updates);
          }
        } else if (result && result.characteristics) {
          setSnapshot(result.characteristics);
          state.message = 'Características salvas.';
        } else {
          state.message = 'Características salvas.';
          state.originalDraft = cloneDraft(state.draft);
          applyDraftToSnapshotFields(updates);
        }
        state.saving = false;
        mountCharacteristics();
      } catch (err) {
        state.saving = false;
        state.error = toUserError(err);
        mountCharacteristics();
      }
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
      state.message = '';
      state.error = '';
      state.openSelectKey = '';
      state.inlineCellRecords = new Map();
      state.inlineSyntheticRows = [];
      state.inlineEditableCount = 0;
      state.inlineMissingCount = 0;
    }

    function removeInjectedActions() {
      restoreInlineCells();
      document.querySelectorAll('.onframe-characteristics-action').forEach((node) => node.remove());
      document.querySelectorAll('.onframe-characteristics-is-editing').forEach((node) => node.classList.remove('onframe-characteristics-is-editing'));
      if (state.editorRoot) state.editorRoot.remove();
      state.editorRoot = null;
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
        const options = Array.isArray(field.options) ? field.options : [];
        const matched = options.find((option) => option.id === field.valueId) ||
          options.find((option) => normalizeText(option.name).toLowerCase() === normalizeText(field.valueName || field.displayValue).toLowerCase()) ||
          options[0] || {};
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

    function unitsSignature(field) {
      return collectUnits(field, state.draft[field.id] && state.draft[field.id].unit).join('|');
    }

    function getSharedCompositeUnit(fields) {
      const units = fields
        .map((field) => state.draft[field.id] && state.draft[field.id].unit)
        .map(normalizeText)
        .filter(Boolean);
      const first = units[0] || '';
      if (first && units.every((unit) => unit === first)) return first;
      return collectUnits(fields[0], first)[0] || first;
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

    function icon(name, size) {
      return window.OnblideIcons ? window.OnblideIcons.render(name, size) : '';
    }

    function spinner() {
      return '<span class="ob-spinner ob-spinner-sm" aria-hidden="true"></span>';
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
