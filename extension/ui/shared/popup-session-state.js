const POPUP_SESSION_STATE_KEY = 'onframePopupSessionState';
const POPUP_VIEWS = new Set(['home', 'workspace', 'integrations', 'history']);
const AUTH_MODES = new Set(['signin', 'signup', 'magic', 'recovery']);
const AUTH_PHASES = {
  signin: new Set(['email', 'password']),
  signup: new Set(['email', 'sent']),
  magic: new Set(['email', 'code']),
  recovery: new Set(['email', 'sent'])
};

function text(value, limit = 320) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item).slice(0, 100))];
}

export function emptyPopupSessionState() {
  return {
    view: 'home',
    auth: null,
    workspace: null,
    integrations: { mode: 'list' }
  };
}

export function normalizeAuthResumeState(value) {
  if (!value || typeof value !== 'object') return null;
  const mode = AUTH_MODES.has(value.mode) ? value.mode : 'signin';
  const phase = AUTH_PHASES[mode].has(value.phase) ? value.phase : 'email';
  return {
    mode,
    phase,
    name: text(value.name, 160),
    email: text(value.email),
    cooldownUntil: Number.isFinite(value.cooldownUntil) && value.cooldownUntil > 0 ? value.cooldownUntil : 0
  };
}

export function normalizeInviteDraft(value) {
  const draft = value && typeof value === 'object' ? value : {};
  return {
    kind: draft.kind === 'link' ? 'link' : 'email',
    email: text(draft.email),
    role: draft.role === 'admin' ? 'admin' : 'collaborator',
    accountIds: stringList(draft.accountIds)
  };
}

export function normalizePopupSessionState(value) {
  const state = value && typeof value === 'object' ? value : {};
  const workspace = state.workspace && typeof state.workspace === 'object'
    ? {
        workspaceId: text(state.workspace.workspaceId, 160),
        inviteOpen: state.workspace.inviteOpen === true,
        inviteDraft: normalizeInviteDraft(state.workspace.inviteDraft)
      }
    : null;

  return {
    view: POPUP_VIEWS.has(state.view) ? state.view : 'home',
    auth: normalizeAuthResumeState(state.auth),
    workspace: workspace?.workspaceId ? workspace : null,
    integrations: { mode: state.integrations?.mode === 'cards' ? 'cards' : 'list' }
  };
}

function sessionStorageArea() {
  return globalThis.chrome?.storage?.session || null;
}

export function readPopupSessionState() {
  return new Promise((resolve) => {
    const storage = sessionStorageArea();
    if (!storage?.get) {
      resolve(emptyPopupSessionState());
      return;
    }
    try {
      storage.get({ [POPUP_SESSION_STATE_KEY]: null }, (result) => {
        if (globalThis.chrome?.runtime?.lastError) {
          resolve(emptyPopupSessionState());
          return;
        }
        resolve(normalizePopupSessionState(result?.[POPUP_SESSION_STATE_KEY]));
      });
    } catch {
      resolve(emptyPopupSessionState());
    }
  });
}

export function writePopupSessionState(value) {
  return new Promise((resolve) => {
    const storage = sessionStorageArea();
    if (!storage?.set) {
      resolve(false);
      return;
    }
    try {
      storage.set({ [POPUP_SESSION_STATE_KEY]: normalizePopupSessionState(value) }, () => {
        resolve(!globalThis.chrome?.runtime?.lastError);
      });
    } catch {
      resolve(false);
    }
  });
}

export function clearPopupSessionState() {
  return new Promise((resolve) => {
    const storage = sessionStorageArea();
    if (!storage?.remove) {
      resolve(false);
      return;
    }
    try {
      storage.remove(POPUP_SESSION_STATE_KEY, () => {
        resolve(!globalThis.chrome?.runtime?.lastError);
      });
    } catch {
      resolve(false);
    }
  });
}

export { POPUP_SESSION_STATE_KEY };
