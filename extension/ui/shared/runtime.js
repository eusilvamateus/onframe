export function sendRemoteMessage(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'onframe:remote', action, ...payload }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message || 'Não foi possível acessar o OnFrame.'));
        return;
      }
      if (!response || response.ok !== true) {
        const error = new Error(response?.error || 'Não foi possível acessar o OnFrame.');
        error.code = response?.code || (response?.error === 'Ação remota inválida.' ? 'remote_action_unsupported' : '');
        reject(error);
        return;
      }
      resolve(response.body || {});
    });
  });
}

export function userError(error, fallback = 'Não foi possível concluir a ação.') {
  const code = String(error?.code || '');
  const messages = {
    remote_action_unsupported: 'A extensão ainda está usando um background antigo. Recarregue a extensão e reabra esta tela.',
    security_backend_unavailable: 'Os novos recursos de segurança ainda não estão disponíveis no servidor conectado. Recarregar a extensão não atualiza o servidor.',
    security_data_unavailable: 'Não foi possível carregar os dados de segurança. Tente novamente.',
    identity_conflict: 'Esta identidade não pôde ser vinculada. Entre em contato com a administração para revisar a conta.',
    mfa_required: 'Confirme o código do aplicativo autenticador para entrar.',
    identity_session_invalid: 'Sua sessão foi encerrada após uma alteração de segurança. Entre novamente.',
    identity_security_unconfigured: 'A verificação de segurança do acesso ainda não foi configurada.',
    identity_security_unavailable: 'Não foi possível verificar seu acesso agora. Tente novamente em instantes.',
    workspace_admin_required: 'Esta ação exige uma pessoa administradora.',
    workspace_last_admin_required: 'O workspace precisa manter uma pessoa administradora.',
    avatar_storage_unconfigured: 'O envio de avatar ainda não foi configurado.',
    avatar_storage_authorization_failed: 'O serviço de imagens não aceitou a configuração atual. Tente novamente mais tarde.',
    avatar_storage_bucket_unavailable: 'O armazenamento de imagens está indisponível no momento. Tente novamente mais tarde.',
    avatar_storage_unavailable: 'O armazenamento de imagens está indisponível no momento. Tente novamente mais tarde.',
    avatar_upload_failed: 'Não foi possível enviar a imagem agora. Tente novamente.',
    avatar_profile_update_failed: 'A imagem foi recebida, mas não foi possível atualizar seu perfil. Tente novamente.',
    avatar_profile_remove_failed: 'Não foi possível remover a imagem agora. Tente novamente.',
    avatar_too_large: 'Escolha uma imagem de até 2 MB.',
    invalid_avatar: 'Escolha uma imagem PNG, JPEG ou WebP válida.',
    workspace_invitation_delivery_failed: 'Não foi possível enviar o convite agora. Tente novamente.',
    extension_session_unauthorized: 'Sua sessão expirou. Entre novamente para continuar.'
  };
  return messages[code] || String(error?.message || fallback);
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function initials(value) {
  return String(value || 'OnFrame')
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'OF';
}

export function openUpdater() {
  const link = document.createElement('a');
  link.href = 'onframe-updater://update';
  link.click();
}

export function openExternal(url) {
  chrome.tabs.create({ url });
}

export function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export function manifestVersion() {
  return chrome.runtime?.getManifest?.().version || '-';
}
