const { assertOwnedItem } = require('./item-context');
const { resolveFamilyTargets } = require('./bulk-actions');
const { sanitizeError } = require('./errors');

const BULK_SCOPE = 'user_product_family';
const CONCURRENCY_READ = 4;
const CONCURRENCY_WRITE = 2;
const EDITABLE_VALUE_TYPES = new Set(['string', 'number', 'number_unit', 'boolean', 'list']);
const BLOCKED_HIERARCHIES = new Set(['PARENT_PK', 'CHILD_PK']);
const PENDING_BLOCKED_HIERARCHIES = new Set(['PARENT_PK', 'CHILD_PK', 'PRODUCT_IDENTIFIER']);
const BLOCKED_TAGS = new Set([
  'fixed',
  'read_only',
  'variation_attribute',
  'allow_variations'
]);
const CONTEXTUAL_BLOCKED_TAGS = new Set(['hidden', 'multivalued']);
const SELLER_PACKAGE_ATTRIBUTE_IDS = new Set([
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
  'SELLER_PACKAGE_WIDTH'
]);
const READONLY_PACKAGE_ATTRIBUTE_IDS = new Set([
  'PACKAGE_HEIGHT',
  'PACKAGE_LENGTH',
  'PACKAGE_WEIGHT',
  'PACKAGE_WIDTH',
  'SHIPPING_PACKAGE',
  'SHIPPING_PACKAGING',
  'SHIPPING_PACKING'
]);
const PACKAGE_LOGISTICS_ATTRIBUTE_LABELS = new Set([
  'ALTURA DA EMBALAGEM',
  'ALTURA DA EMBALAGEM DO VENDEDOR',
  'COMPRIMENTO DA EMBALAGEM',
  'COMPRIMENTO DA EMBALAGEM DO VENDEDOR',
  'EMBALAGEM DO ENVIO',
  'LARGURA DA EMBALAGEM',
  'LARGURA DA EMBALAGEM DO VENDEDOR',
  'PESO DA EMBALAGEM',
  'PESO DA EMBALAGEM DO VENDEDOR'
]);
const PENDING_BLOCKED_ATTRIBUTE_IDS = new Set([
  'ADDITIONAL_INFO_REQUIRED',
  'AGID',
  'BATTERIES_FEATURES',
  'CATALOG_TITLE',
  'DESCRIPTIVE_TAGS',
  'EMPTY_GTIN_REASON',
  'EXCLUDED_PLATFORMS',
  'FILTRABLE_GENDER',
  'FOODS_AND_DRINKS',
  'HAS_COMPATIBILITIES',
  'HAZMAT_TRANSPORTABILITY',
  'IEPS',
  'IMPORT_DUTY',
  'INVOICE_PRODUCT_NAME',
  'IVA_FOR_RESALE',
  'LIMITED_MARKETPLACE_VISIBILITY_REASONS',
  'MEASURE_UNIT_DESCRIPTION',
  'MEASURE_UNIT_KEY',
  'MEDICINES',
  'PACKAGE_DATA_SOURCE',
  'PRODUCT_CHEMICAL_FEATURES',
  'PRODUCT_FEATURES',
  'SAT_KEY',
  'SEARCH_ENHANCEMENT_FIELDS',
  'SELLER_PACKAGE_DATA_SOURCE',
  'SHIPMENT_PACKING',
  'SYI_PYMES_ID',
  'VALUE_ADDED_TAX',
  'VERTICAL_TAGS'
]);

async function getCharacteristics(client, itemId) {
  const item = await assertOwnedItem(client, itemId);
  assertCharacteristicsVisibleItem(item);
  return buildCharacteristicsSnapshot(client, item);
}

async function updateCharacteristics(client, itemId, input = {}) {
  const item = await assertOwnedItem(client, itemId);
  assertCharacteristicsEditableItem(item);
  const result = await updateOwnedCharacteristics(client, item, input.attributes || []);
  return {
    ok: true,
    itemId: item.id,
    characteristics: result
  };
}

async function updateCharacteristicsFamily(client, itemId, input = {}) {
  if (String(input.scope || BULK_SCOPE) !== BULK_SCOPE) {
    const err = new Error('bulk_scope_not_supported');
    err.statusCode = 400;
    throw err;
  }

  const updates = Array.isArray(input.attributes) ? input.attributes : [];
  if (!updates.length) {
    const err = new Error('characteristics_missing_updates');
    err.statusCode = 400;
    throw err;
  }

  const targets = await resolveFamilyTargets(client, itemId, input);
  const prepared = await mapLimit(targets.items, CONCURRENCY_READ, async (target) => prepareCharacteristicsTarget(client, target));
  const editableTargets = prepared.filter((target) => target.eligible);
  const editableVariations = editableTargets.filter((target) => !target.current);

  if (!editableVariations.length) {
    const err = new Error('bulk_characteristics_no_editable_variations');
    err.statusCode = 409;
    throw err;
  }

  const results = await mapLimit(prepared, CONCURRENCY_WRITE, async (target) => {
    if (!target.eligible) return stripPreparedTarget(target);
    try {
      const result = await updateOwnedCharacteristics(client, target.item, updates);
      return {
        itemId: target.itemId,
        userProductId: target.userProductId || null,
        title: target.title || null,
        current: Boolean(target.current),
        eligible: true,
        status: 'applied',
        result
      };
    } catch (err) {
      return {
        itemId: target.itemId,
        userProductId: target.userProductId || null,
        title: target.title || null,
        current: Boolean(target.current),
        eligible: false,
        status: 'failed',
        reasonCode: err && err.message ? String(err.message) : 'characteristics_target_error',
        statusCode: err && err.statusCode ? err.statusCode : null,
        message: sanitizeError(err)
      };
    }
  });

  return buildCharacteristicsBulkResponse(targets, results);
}

async function updateOwnedCharacteristics(client, item, inputUpdates) {
  assertCharacteristicsEditableItem(item);
  const snapshot = await buildCharacteristicsSnapshot(client, item);
  const updates = normalizeAttributeUpdates(inputUpdates, snapshot);
  const payload = {
    attributes: mergeAttributes(item.attributes, updates)
  };
  await client.updateItem(item.id, payload);
  const freshItem = await client.getItem(item.id);
  return buildCharacteristicsSnapshot(client, freshItem || item);
}

async function buildCharacteristicsSnapshot(client, item) {
  const sourceItem = item && typeof item === 'object' ? item : {};
  const [categoryAttributes, technicalSpecs] = await Promise.all([
    loadCategoryAttributes(client, sourceItem.category_id),
    loadDomainTechnicalSpecs(client, sourceItem.domain_id)
  ]);
  const schemaById = new Map((Array.isArray(categoryAttributes) ? categoryAttributes : [])
    .filter((attribute) => attribute && attribute.id)
    .map((attribute) => [String(attribute.id), attribute]));
  const itemAttributes = Array.isArray(sourceItem.attributes) ? sourceItem.attributes : [];
  const itemById = new Map(itemAttributes
    .filter((attribute) => attribute && attribute.id)
    .map((attribute) => [String(attribute.id), attribute]));
  const groups = buildGroupsFromTechnicalSpecs(technicalSpecs, itemById, schemaById);
  appendUngroupedItemAttributes(groups, itemAttributes, schemaById);
  appendPendingSchemaAttributes(groups, categoryAttributes, itemById, schemaById);
  const packageDimensions = buildPackageDimensions(itemAttributes, schemaById);
  const flatFields = groups.flatMap((group) => group.attributes);
  const allFields = flatFields.concat(packageDimensions.fields);
  const editableCount = allFields.filter((field) => field.editable).length;
  const pendingCount = flatFields.filter((field) => field.pending).length;

  return {
    ok: true,
    item: summarizeItem(sourceItem),
    editable: Boolean(editableCount && !sourceItem.catalog_listing),
    fields: allFields,
    groups,
    packageDimensions,
    meta: {
      categoryId: sourceItem.category_id || null,
      domainId: sourceItem.domain_id || null,
      editableCount,
      pendingCount,
      totalCount: allFields.length
    }
  };
}

function buildGroupsFromTechnicalSpecs(technicalSpecs, itemById, schemaById) {
  const outputGroups = getNestedArray(technicalSpecs, ['output', 'groups']);
  const groups = [];
  const seen = new Set();

  for (const specGroup of outputGroups) {
    const fields = [];
    visitSpecNode(specGroup, (specAttribute, component) => {
      const id = normalizeAttributeId(specAttribute.id || specAttribute.attribute_id);
      if (!id || seen.has(id) || !itemById.has(id)) return;
      if (isLogisticsPackageAttribute(id, itemById.get(id), schemaById.get(id))) return;
      seen.add(id);
      fields.push(buildField(itemById.get(id), schemaById.get(id), {
        groupId: specGroup.id || specGroup.name || null,
        groupName: specGroup.label || specGroup.name || specGroup.id || 'Características',
        componentLabel: component && (component.label || component.name) || null,
        hierarchy: specAttribute.hierarchy || specAttribute.tags && specAttribute.tags.hierarchy || null,
        publicField: true
      }));
    });
    if (fields.length) {
      groups.push({
        id: String(specGroup.id || specGroup.name || `group_${groups.length + 1}`),
        label: String(specGroup.label || specGroup.name || specGroup.id || 'Características'),
        attributes: fields
      });
    }
  }

  return groups;
}

function appendUngroupedItemAttributes(groups, itemAttributes, schemaById) {
  const seen = new Set(groups.flatMap((group) => group.attributes.map((field) => field.id)));
  const grouped = new Map();
  for (const attribute of itemAttributes) {
    const id = normalizeAttributeId(attribute && attribute.id);
    if (!id || seen.has(id)) continue;
    if (isLogisticsPackageAttribute(id, attribute, schemaById.get(id))) continue;
    const groupName = attribute.attribute_group_name || 'Outros';
    const groupId = attribute.attribute_group_id || normalizeGroupId(groupName);
    if (!grouped.has(groupId)) grouped.set(groupId, {
      id: String(groupId),
      label: String(groupName),
      attributes: []
    });
    grouped.get(groupId).attributes.push(buildField(attribute, schemaById.get(id), {
      groupId,
      groupName
    }));
    seen.add(id);
  }
  grouped.forEach((group) => groups.push(group));
}

function appendPendingSchemaAttributes(groups, categoryAttributes, itemById, schemaById) {
  const seen = new Set(groups.flatMap((group) => group.attributes.map((field) => field.id)));
  for (const schemaAttribute of Array.isArray(categoryAttributes) ? categoryAttributes : []) {
    const id = normalizeAttributeId(schemaAttribute && schemaAttribute.id);
    if (!id || seen.has(id) || itemById.has(id)) continue;
    const schema = schemaById.get(id) || schemaAttribute;
    if (!isPendingSchemaAttribute(schema, id)) continue;
    const groupName = schema.attribute_group_name || schema.group_name || 'Outros';
    const groupId = schema.attribute_group_id || schema.group_id || normalizeGroupId(groupName);
    const field = buildField(null, schema, {
      groupId,
      groupName,
      pending: true
    });
    if (!field.editable) continue;
    appendFieldToGroup(groups, groupId, groupName, field);
    seen.add(id);
  }
}

function appendFieldToGroup(groups, groupId, groupName, field) {
  const normalizedGroupId = normalizeGroupId(groupId || groupName);
  const normalizedGroupName = normalizeAttributeLabel(groupName);
  let group = groups.find((candidate) => {
    const candidateId = normalizeGroupId(candidate && candidate.id);
    const candidateName = normalizeAttributeLabel(candidate && candidate.label);
    return candidateId === normalizedGroupId || Boolean(normalizedGroupName && candidateName === normalizedGroupName);
  });
  if (!group) {
    group = {
      id: String(groupId || normalizedGroupId || `group_${groups.length + 1}`),
      label: String(groupName || 'Outros'),
      attributes: []
    };
    groups.push(group);
  }
  group.attributes.push(field);
}

function isPendingSchemaAttribute(schemaAttribute, id) {
  const schema = schemaAttribute && typeof schemaAttribute === 'object' ? schemaAttribute : {};
  const normalizedId = normalizeAttributeId(id || schema.id);
  if (!normalizedId || PENDING_BLOCKED_ATTRIBUTE_IDS.has(normalizedId)) return false;
  if (isLogisticsPackageAttribute(normalizedId, null, schema)) return false;
  const valueType = String(schema.value_type || '').toLowerCase();
  if (!EDITABLE_VALUE_TYPES.has(valueType)) return false;
  const tags = collectTags(schema.tags);
  const hierarchy = String(schema.hierarchy || schema.tags && schema.tags.hierarchy || '').trim().toUpperCase();
  if (PENDING_BLOCKED_HIERARCHIES.has(hierarchy)) return false;
  for (const tag of BLOCKED_TAGS) {
    if (tags.has(tag)) return false;
  }
  if ((valueType === 'list' || valueType === 'boolean') && !normalizeOptions(schema.values).length) return false;
  if (tags.has('multivalued') && !canEditMultivaluedField({ pending: true, valueType })) return false;
  return tags.has('hidden') || tags.has('required') || tags.has('conditional_required');
}

function buildPackageDimensions(itemAttributes, schemaById) {
  const byId = new Map((Array.isArray(itemAttributes) ? itemAttributes : [])
    .filter((attribute) => attribute && isSellerPackageAttribute(attribute.id))
    .map((attribute) => [normalizeAttributeId(attribute.id), attribute]));
  const fields = [
    buildPackageDimensionField('SELLER_PACKAGE_HEIGHT', 'Altura do pacote', byId, schemaById, ['cm']),
    buildPackageDimensionField('SELLER_PACKAGE_WIDTH', 'Largura do pacote', byId, schemaById, ['cm']),
    buildPackageDimensionField('SELLER_PACKAGE_LENGTH', 'Comprimento do pacote', byId, schemaById, ['cm']),
    buildPackageDimensionField('SELLER_PACKAGE_WEIGHT', 'Peso do pacote', byId, schemaById, ['g'])
  ].filter(Boolean);
  const editableCount = fields.filter((field) => field.editable).length;
  return {
    available: Boolean(fields.length),
    label: 'Dimensões do pacote',
    badge: 'LOGÍSTICA',
    fields,
    editable: Boolean(editableCount),
    editableCount
  };
}

function buildPackageDimensionField(id, label, itemById, schemaById, fallbackUnits) {
  const normalizedId = normalizeAttributeId(id);
  const attribute = itemById.get(normalizedId);
  if (!attribute) return null;
  const field = buildField(attribute, schemaById.get(normalizedId), {
    groupId: 'SELLER_PACKAGE',
    groupName: 'Dimensões do pacote'
  });
  return Object.assign({}, field, {
    label,
    allowedUnits: field.allowedUnits.length ? field.allowedUnits : fallbackUnits,
    defaultUnit: field.defaultUnit || fallbackUnits[0] || '',
    packageDimension: true
  });
}

function buildField(itemAttribute, schema, spec = {}) {
  const attribute = itemAttribute && typeof itemAttribute === 'object' ? itemAttribute : {};
  const schemaAttribute = schema && typeof schema === 'object' ? schema : {};
  const id = normalizeAttributeId(attribute.id || schemaAttribute.id);
  const valueType = String(schemaAttribute.value_type || attribute.value_type || inferValueType(attribute)).toLowerCase();
  const tags = collectTags(schemaAttribute.tags, attribute.tags);
  const hierarchy = String(spec.hierarchy || schemaAttribute.hierarchy || schemaAttribute.tags && schemaAttribute.tags.hierarchy || '').trim();
  const pending = Boolean(spec.pending);
  const editability = resolveFieldEditability({
    attribute,
    schema: schemaAttribute,
    id,
    valueType,
    tags,
    hierarchy,
    publicField: Boolean(spec.publicField),
    pending
  });
  const options = normalizeOptions(schemaAttribute.values);
  const value = readAttributeValue(attribute);

  return {
    id,
    label: String(attribute.name || schemaAttribute.name || spec.componentLabel || id),
    valueType,
    displayValue: formatAttributeDisplayValue(attribute),
    valueId: value.valueId,
    valueName: value.valueName,
    valueStruct: value.valueStruct,
    options,
    allowedUnits: normalizeAllowedUnits(schemaAttribute.allowed_units),
    defaultUnit: normalizeUnit(schemaAttribute.default_unit),
    groupId: spec.groupId || attribute.attribute_group_id || null,
    groupName: spec.groupName || attribute.attribute_group_name || null,
    componentLabel: spec.componentLabel || null,
    editable: editability.editable,
    reason: editability.reason,
    message: editability.message,
    multivalued: tags.has('multivalued'),
    pending,
    publicField: Boolean(spec.publicField),
    tags: Array.from(tags).sort(),
    hierarchy: hierarchy || null
  };
}

function resolveFieldEditability({ attribute, schema, id, valueType, tags, hierarchy, publicField, pending }) {
  if (!schema || !schema.id) {
    return blocked('missing_schema', 'Contrato do campo indisponível.');
  }
  if (BLOCKED_HIERARCHIES.has(String(hierarchy || '').toUpperCase())) {
    return blocked('product_key', 'Chave do produto controlada pelo Mercado Livre.');
  }
  for (const tag of BLOCKED_TAGS) {
    if (!tags.has(tag)) continue;
    if (tag === 'variation_attribute' || tag === 'allow_variations') {
      return blocked('variation_attribute', 'Atributo de variação.');
    }
    if (tag === 'read_only' || tag === 'fixed') return blocked('read_only', 'Campo somente leitura.');
  }
  for (const tag of CONTEXTUAL_BLOCKED_TAGS) {
    if (!tags.has(tag)) continue;
    if (tag === 'hidden' && !publicField && !isSellerPackageAttribute(id) && !pending) {
      return blocked('hidden', 'Campo oculto pelo Mercado Livre.');
    }
    if (tag === 'multivalued' && !canEditMultivaluedField({ publicField, pending, valueType })) {
      return blocked('multivalued', 'Campo com múltiplos valores.');
    }
  }
  if (!EDITABLE_VALUE_TYPES.has(valueType)) {
    return blocked('unsupported_type', 'Tipo de campo indisponível.');
  }
  if ((valueType === 'list' || valueType === 'boolean') && !normalizeOptions(schema.values).length) {
    return blocked('missing_options', 'Opções indisponíveis.');
  }
  if ((!attribute || !attribute.id) && !pending) {
    return blocked('missing_attribute', 'Campo ainda não existe no anúncio.');
  }
  return {
    editable: true,
    reason: null,
    message: null
  };
}

function isSellerPackageAttribute(id) {
  return SELLER_PACKAGE_ATTRIBUTE_IDS.has(normalizeAttributeId(id));
}

function isLogisticsPackageAttribute(id, itemAttribute, schemaAttribute) {
  const normalizedId = normalizeAttributeId(id);
  if (isSellerPackageAttribute(normalizedId) || READONLY_PACKAGE_ATTRIBUTE_IDS.has(normalizedId)) return true;
  const label = normalizeAttributeLabel(
    itemAttribute && itemAttribute.name || schemaAttribute && schemaAttribute.name || ''
  );
  return PACKAGE_LOGISTICS_ATTRIBUTE_LABELS.has(label);
}

function canEditMultivaluedField({ publicField, pending, valueType }) {
  if (!publicField && !pending) return false;
  return valueType === 'string' || valueType === 'list';
}

function blocked(reason, message) {
  return {
    editable: false,
    reason,
    message
  };
}

function normalizeAttributeUpdates(inputUpdates, snapshot) {
  const fields = new Map((snapshot && Array.isArray(snapshot.fields) ? snapshot.fields : [])
    .map((field) => [field.id, field]));
  const updates = [];
  for (const input of Array.isArray(inputUpdates) ? inputUpdates : []) {
    const id = normalizeAttributeId(input && input.id);
    const field = fields.get(id);
    if (!field) throwUserError('characteristics_attribute_not_found', 400);
    if (!field.editable) throwUserError('characteristics_attribute_not_editable', 409);
    updates.push(toPayloadAttribute(input, field));
  }
  if (!updates.length) throwUserError('characteristics_missing_updates', 400);
  return updates;
}

function toPayloadAttribute(input, field) {
  const source = input && typeof input === 'object' ? input : {};
  if (field.multivalued) {
    const values = normalizeMultivalueInput(source.valueName || source.value_name || field.displayValue || field.valueName, field);
    if (!values.length) throwUserError('characteristics_empty_value', 400);
    return {
      id: field.id,
      values
    };
  }

  if (field.valueType === 'number_unit') {
    const number = normalizeNumber(source.number !== undefined ? source.number : source.valueName);
    const unit = normalizeRequestedUnit(source.unit, field);
    if (!Number.isFinite(number) || !unit) throwUserError('characteristics_invalid_number_unit', 400);
    return {
      id: field.id,
      value_name: `${formatNumber(number)} ${unit}`
    };
  }

  if (field.valueType === 'number') {
    const number = normalizeNumber(source.valueName);
    if (!Number.isFinite(number)) throwUserError('characteristics_invalid_value', 400);
    return {
      id: field.id,
      value_name: formatNumber(number)
    };
  }

  if (field.valueType === 'list' || field.valueType === 'boolean') {
    const option = resolveOption(source, field);
    if (!option) throwUserError('characteristics_invalid_value', 400);
    return {
      id: field.id,
      value_id: option.id
    };
  }

  const valueName = normalizeText(source.valueName);
  if (!valueName) throwUserError('characteristics_empty_value', 400);
  return {
    id: field.id,
    value_name: valueName
  };
}

function resolveOption(input, field) {
  const requestedId = String(input.valueId || input.value_id || '').trim();
  const requestedName = normalizeText(input.valueName || input.value_name);
  const options = Array.isArray(field.options) ? field.options : [];
  if (requestedId) return options.find((option) => String(option.id) === requestedId) || null;
  if (!requestedName) return null;
  return options.find((option) => normalizeText(option.name).toLowerCase() === requestedName.toLowerCase()) || null;
}

function normalizeMultivalueInput(value, field) {
  const options = Array.isArray(field && field.options) ? field.options : [];
  const optionsByName = new Map(options.map((option) => [
    normalizeText(option.name).toLowerCase(),
    option
  ]));
  return String(value === undefined || value === null ? '' : value)
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .map((name) => {
      const option = optionsByName.get(name.toLowerCase());
      if (option && option.id) return { id: option.id, name: option.name };
      return { name };
    });
}

function mergeAttributes(currentAttributes, updates) {
  const merged = new Map();
  for (const attribute of Array.isArray(currentAttributes) ? currentAttributes : []) {
    const payload = cleanCurrentAttribute(attribute);
    if (payload && payload.id) merged.set(payload.id, payload);
  }
  for (const update of updates) {
    merged.set(update.id, cleanPayloadAttribute(update));
  }
  return Array.from(merged.values());
}

function cleanCurrentAttribute(attribute) {
  if (!attribute || !attribute.id) return null;
  const payload = { id: String(attribute.id) };
  if (attribute.value_id !== undefined && attribute.value_id !== null) payload.value_id = attribute.value_id;
  if (attribute.value_name !== undefined && attribute.value_name !== null) payload.value_name = attribute.value_name;
  if (attribute.value_struct && typeof attribute.value_struct === 'object') payload.value_struct = attribute.value_struct;
  if (Array.isArray(attribute.values)) payload.values = attribute.values.map(cleanAttributeValue).filter(Boolean);
  return payload;
}

function cleanPayloadAttribute(attribute) {
  const payload = { id: String(attribute.id) };
  if (attribute.value_id !== undefined) payload.value_id = attribute.value_id;
  if (attribute.value_name !== undefined) payload.value_name = attribute.value_name;
  if (attribute.value_struct !== undefined) payload.value_struct = attribute.value_struct;
  if (Array.isArray(attribute.values)) payload.values = attribute.values.map(cleanAttributeValue).filter(Boolean);
  return payload;
}

function cleanAttributeValue(value) {
  if (!value || typeof value !== 'object') return null;
  const payload = {};
  if (value.id !== undefined && value.id !== null) payload.id = String(value.id);
  if (value.name !== undefined && value.name !== null) payload.name = String(value.name);
  if (value.value_id !== undefined && value.value_id !== null) payload.id = String(value.value_id);
  if (value.value_name !== undefined && value.value_name !== null) payload.name = String(value.value_name);
  if (value.struct && typeof value.struct === 'object') payload.struct = value.struct;
  return payload.id || payload.name || payload.struct ? payload : null;
}

async function prepareCharacteristicsTarget(client, target) {
  try {
    const item = await assertOwnedItem(client, target.itemId);
    if (item.catalog_listing) {
      return blockedTarget(target, item, 'catalog_listing_characteristics_read_only', 'Catálogo: características bloqueadas pelo Mercado Livre.');
    }

    return {
      item,
      itemId: item.id,
      userProductId: target.userProductId || item.user_product_id || null,
      title: target.title || item.title || null,
      current: Boolean(target.current),
      eligible: true,
      status: 'eligible'
    };
  } catch (err) {
    return {
      itemId: target.itemId,
      userProductId: target.userProductId || null,
      title: target.title || null,
      current: Boolean(target.current),
      eligible: false,
      status: 'failed',
      reasonCode: err && err.message ? String(err.message) : 'characteristics_target_error',
      statusCode: err && err.statusCode ? err.statusCode : null,
      message: sanitizeError(err)
    };
  }
}

function blockedTarget(target, item, reasonCode, message) {
  return {
    itemId: item.id,
    userProductId: target.userProductId || item.user_product_id || null,
    title: target.title || item.title || null,
    current: Boolean(target.current),
    eligible: false,
    status: 'blocked',
    reasonCode,
    statusCode: 409,
    message
  };
}

function stripPreparedTarget(target) {
  const output = Object.assign({}, target);
  delete output.item;
  return output;
}

function buildCharacteristicsBulkResponse(targets, results) {
  const entries = Array.isArray(results) ? results : [];
  return {
    ok: true,
    phase: 'commit',
    scope: BULK_SCOPE,
    action: 'characteristics.update',
    source: targets.source,
    counts: {
      total: entries.length,
      eligible: entries.filter((entry) => entry.eligible).length,
      blocked: entries.filter((entry) => entry.status === 'blocked').length,
      applied: entries.filter((entry) => entry.status === 'applied').length,
      skipped: 0,
      failed: entries.filter((entry) => entry.status === 'failed').length
    },
    targets: entries
  };
}

function assertCharacteristicsVisibleItem(item) {
  if (!item || !item.id) {
    const err = new Error('Item nao encontrado.');
    err.statusCode = 404;
    throw err;
  }
}

function assertCharacteristicsEditableItem(item) {
  assertCharacteristicsVisibleItem(item);
  if (item.catalog_listing) {
    const err = new Error('catalog_listing_characteristics_read_only');
    err.statusCode = 409;
    throw err;
  }
}

async function loadCategoryAttributes(client, categoryId) {
  if (!categoryId) return [];
  try {
    if (client && typeof client.getCategoryAttributes === 'function') return await client.getCategoryAttributes(categoryId);
    return await client.request(`/categories/${encodeURIComponent(categoryId)}/attributes`);
  } catch (err) {
    return [];
  }
}

async function loadDomainTechnicalSpecs(client, domainId) {
  if (!domainId) return null;
  try {
    if (client && typeof client.getDomainTechnicalSpecs === 'function') return await client.getDomainTechnicalSpecs(domainId);
    return await client.request(`/domains/${encodeURIComponent(domainId)}/technical_specs`);
  } catch (err) {
    return null;
  }
}

function visitSpecNode(node, onAttribute, currentComponent = null) {
  if (!node || typeof node !== 'object') return;
  const component = node.component || node.type || node.label || node.attributes ? node : currentComponent;
  const attributes = Array.isArray(node.attributes) ? node.attributes : [];
  attributes.forEach((attribute) => onAttribute(attribute, component));
  for (const key of ['components', 'children', 'rows', 'sections']) {
    const children = Array.isArray(node[key]) ? node[key] : [];
    children.forEach((child) => visitSpecNode(child, onAttribute, component));
  }
}

function getNestedArray(source, path) {
  let current = source;
  for (const part of path) {
    current = current && current[part];
  }
  return Array.isArray(current) ? current : [];
}

function readAttributeValue(attribute) {
  const values = Array.isArray(attribute && attribute.values) ? attribute.values : [];
  const first = values[0] || null;
  const valueId = attribute && attribute.value_id !== undefined && attribute.value_id !== null
    ? String(attribute.value_id)
    : first && first.id !== undefined && first.id !== null ? String(first.id) : '';
  const valueName = attribute && attribute.value_name !== undefined && attribute.value_name !== null
    ? String(attribute.value_name)
    : first && first.name !== undefined && first.name !== null ? String(first.name) : '';
  const valueStruct = attribute && attribute.value_struct && typeof attribute.value_struct === 'object'
    ? attribute.value_struct
    : first && first.struct && typeof first.struct === 'object' ? first.struct : null;
  return { valueId, valueName, valueStruct };
}

function formatAttributeDisplayValue(attribute) {
  const values = Array.isArray(attribute && attribute.values) ? attribute.values : [];
  if (values.length) {
    return values
      .map((value) => value && (value.name || value.value_name || value.id))
      .filter(Boolean)
      .join(', ');
  }
  const value = readAttributeValue(attribute);
  return value.valueName || '';
}

function inferValueType(attribute) {
  const value = readAttributeValue(attribute);
  if (value.valueStruct && value.valueStruct.number !== undefined && value.valueStruct.unit) return 'number_unit';
  if (value.valueId) return 'list';
  return 'string';
}

function normalizeOptions(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => ({
      id: value && value.id !== undefined && value.id !== null ? String(value.id) : '',
      name: value && value.name !== undefined && value.name !== null ? String(value.name) : ''
    }))
    .filter((value) => value.id && value.name);
}

function normalizeAllowedUnits(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => normalizeUnit(value && (value.id || value.name || value)))
    .filter(Boolean);
}

function normalizeRequestedUnit(value, field) {
  const requested = normalizeUnit(value) || normalizeUnit(field.valueStruct && field.valueStruct.unit) || normalizeUnit(field.defaultUnit);
  const allowed = Array.isArray(field.allowedUnits) ? field.allowedUnits : [];
  if (!requested) return '';
  if (allowed.length && !allowed.includes(requested)) return '';
  return requested;
}

function normalizeUnit(value) {
  return String(value || '').trim();
}

function normalizeAttributeId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

function normalizeAttributeLabel(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function normalizeGroupId(value) {
  return String(value || 'OTHERS').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_') || 'OTHERS';
}

function normalizeText(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function normalizeNumber(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) return NaN;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  return Number(normalized);
}

function formatNumber(value) {
  const fixed = Number(value).toFixed(6);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function collectTags() {
  const output = new Set();
  for (const value of arguments) {
    if (!value) continue;
    if (Array.isArray(value)) {
      value.forEach((tag) => output.add(String(tag || '').toLowerCase()));
      continue;
    }
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        if (item === true || item === 'true' || item === 1) output.add(String(key).toLowerCase());
        if (key === 'hierarchy' && item) output.add(String(item).toLowerCase());
      });
    }
  }
  return output;
}

function summarizeItem(item) {
  return {
    id: item.id || null,
    title: item.title || null,
    sellerId: item.seller_id || null,
    categoryId: item.category_id || null,
    domainId: item.domain_id || null,
    userProductId: item.user_product_id || null,
    catalogListing: Boolean(item.catalog_listing)
  };
}

function throwUserError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

async function mapLimit(items, limit, iteratee) {
  const input = Array.isArray(items) ? items : [];
  const output = new Array(input.length);
  let index = 0;
  async function worker() {
    while (index < input.length) {
      const current = index;
      index += 1;
      output[current] = await iteratee(input[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, input.length) }, worker));
  return output;
}

module.exports = {
  buildCharacteristicsSnapshot,
  getCharacteristics,
  mergeAttributes,
  normalizeAttributeUpdates,
  updateCharacteristics,
  updateCharacteristicsFamily
};
