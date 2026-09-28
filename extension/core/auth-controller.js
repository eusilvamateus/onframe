(function () {
  const RemoteAuth = window.OnFrameRemoteAuth;

  function sendRemoteMessage(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(Object.assign({ type: 'onframe:remote', action }, payload), (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) return reject(new Error(runtimeError.message || 'Não consegui acessar o OnFrame remoto.'));
        if (!response || response.ok !== true) {
          const error = new Error(response && response.error ? response.error : 'Não consegui acessar o OnFrame remoto.');
          error.code = response && response.code ? response.code : '';
          return reject(error);
        }
        resolve(response.body || {});
      });
    });
  }

  function create(root, callbacks = {}) {
    const state = { busy: false, challenges: {}, config: null, mode: 'signin' };
    const feedback = root.querySelector('[data-auth-feedback]');
    const forms = Array.from(root.querySelectorAll('[data-auth-form]'));
    const tabs = Array.from(root.querySelectorAll('[data-auth-tab]'));

    function feedbackMessage(message, tone = 'danger') {
      feedback.textContent = message;
      feedback.dataset.tone = tone;
      feedback.hidden = false;
    }

    function clearFeedback() {
      feedback.textContent = '';
      feedback.hidden = true;
      delete feedback.dataset.tone;
    }

    function render() {
      forms.forEach((form) => { form.hidden = form.dataset.authForm !== state.mode; });
      tabs.forEach((tab) => {
        const selected = tab.dataset.authTab === state.mode;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      root.querySelectorAll('[data-auth-action], [data-auth-tab], input, button').forEach((control) => {
        if (control.matches('[data-auth-password]')) return;
        control.disabled = state.busy;
      });
    }

    function challenge(mode) {
      if (state.challenges[mode]) return state.challenges[mode];
      const target = root.querySelector(`[data-auth-challenge="${mode}"]`);
      if (!target) return null;
      state.challenges[mode] = RemoteAuth.createChallenge(
        target,
        (token) => {
          if (token) clearFeedback();
        },
        () => feedbackMessage('A confirmação de segurança está indisponível. Atualize a página e tente novamente.')
      );
      return state.challenges[mode];
    }

    function show(mode) {
      if (!['signin', 'signup', 'magic', 'recovery'].includes(mode)) return;
      state.mode = mode;
      clearFeedback();
      render();
      challenge(mode);
      const email = root.querySelector(`[data-auth-form="${mode}"] input[name="email"]`);
      if (email) setTimeout(() => email.focus(), 0);
    }

    function setBusy(value) {
      state.busy = value;
      render();
    }

    function getCaptcha() {
      const instance = challenge(state.mode);
      if (instance && instance.isLoading()) {
        feedbackMessage('A confirmação de segurança ainda está sendo carregada. Aguarde um instante.');
        return '';
      }
      if (instance && !instance.isAvailable()) {
        feedbackMessage('A confirmação de segurança está indisponível. Atualize a página e tente novamente.');
        return '';
      }
      const token = instance && instance.getToken();
      if (!token) {
        feedbackMessage('Conclua a confirmação de segurança para continuar.');
        return '';
      }
      return token;
    }

    async function authenticate(accessToken) {
      const connection = await sendRemoteMessage('authenticate', { accessToken });
      callbacks.onConnected?.(connection);
      return connection;
    }

    async function startFlow() {
      return sendRemoteMessage('auth-flow-start');
    }

    async function signIn(form) {
      const email = RemoteAuth.normalizeEmail(form.elements.email.value);
      const password = form.elements.password.value;
      const captcha = getCaptcha();
      if (!email) {
        form.elements.email.focus();
        feedbackMessage('Informe um e-mail válido.');
        return;
      }
      if (!password) {
        form.elements.password.focus();
        feedbackMessage('Informe sua senha.');
        return;
      }
      if (!captcha) return;
      setBusy(true);
      try {
        const session = await RemoteAuth.request(state.config, 'token?grant_type=password', {
          email,
          password,
          gotrue_meta_security: { captcha_token: captcha }
        });
        await authenticate(session.access_token);
      } catch (error) {
        feedbackMessage(RemoteAuth.authErrorMessage(error, 'E-mail ou senha incorretos. Tente novamente.'));
      } finally {
        const instance = state.challenges.signin;
        if (instance) instance.reset();
        setBusy(false);
      }
    }

    async function signUp(form) {
      const email = RemoteAuth.normalizeEmail(form.elements.email.value);
      const password = form.elements.password.value;
      const confirmation = form.elements.confirmation.value;
      const captcha = getCaptcha();
      if (!email) {
        form.elements.email.focus();
        feedbackMessage('Informe um e-mail válido.');
        return;
      }
      if (!password) {
        form.elements.password.focus();
        feedbackMessage('Crie uma senha para continuar.');
        return;
      }
      if (password !== confirmation) {
        form.elements.confirmation.focus();
        feedbackMessage('As senhas não coincidem.');
        return;
      }
      if (!captcha) return;
      setBusy(true);
      try {
        const flow = await startFlow();
        const result = await RemoteAuth.request(state.config, 'signup', {
          email,
          password,
          gotrue_meta_security: { captcha_token: captcha }
        }, { redirectTo: flow.redirectTo });
        if (result.access_token) {
          await authenticate(result.access_token);
          return;
        }
        feedbackMessage('Confira seu e-mail para confirmar a conta. Depois, volte a esta extensão.', 'info');
        callbacks.onPending?.(flow);
      } catch (error) {
        feedbackMessage(RemoteAuth.authErrorMessage(error, 'Não foi possível criar a conta agora. Tente novamente.'));
      } finally {
        const instance = state.challenges.signup;
        if (instance) instance.reset();
        setBusy(false);
      }
    }

    async function sendMagicLink(form) {
      const email = RemoteAuth.normalizeEmail(form.elements.email.value);
      const captcha = getCaptcha();
      if (!email) {
        form.elements.email.focus();
        feedbackMessage('Informe um e-mail válido.');
        return;
      }
      if (!captcha) return;
      setBusy(true);
      try {
        const flow = await startFlow();
        await RemoteAuth.request(state.config, 'otp', {
          email,
          create_user: false,
          gotrue_meta_security: { captcha_token: captcha }
        }, { redirectTo: flow.redirectTo });
        feedbackMessage('Se existir uma conta para este e-mail, enviamos um link de acesso. Depois, volte a esta extensão.', 'info');
        callbacks.onPending?.(flow);
      } catch (error) {
        feedbackMessage(RemoteAuth.authErrorMessage(error, 'Não foi possível enviar o link agora. Tente novamente.'));
      } finally {
        const instance = state.challenges.magic;
        if (instance) instance.reset();
        setBusy(false);
      }
    }

    async function sendRecoveryLink(form) {
      const email = RemoteAuth.normalizeEmail(form.elements.email.value);
      const captcha = getCaptcha();
      if (!email) {
        form.elements.email.focus();
        feedbackMessage('Informe um e-mail válido.');
        return;
      }
      if (!captcha) return;
      setBusy(true);
      try {
        const flow = await startFlow();
        await RemoteAuth.request(state.config, 'recover', {
          email,
          gotrue_meta_security: { captcha_token: captcha }
        }, { redirectTo: flow.redirectTo });
        feedbackMessage('Se existir uma conta para este e-mail, enviamos um link para atualizar sua senha. Depois, volte a esta extensão.', 'info');
        callbacks.onPending?.(flow);
      } catch (error) {
        feedbackMessage(RemoteAuth.authErrorMessage(error, 'Não foi possível enviar o link agora. Tente novamente.'));
      } finally {
        const instance = state.challenges.recovery;
        if (instance) instance.reset();
        setBusy(false);
      }
    }

    function togglePassword(button) {
      const input = root.querySelector(`#${button.dataset.authPassword}`);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.setAttribute('aria-pressed', String(!visible));
      button.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
      button.innerHTML = `<i class="ph ${visible ? 'ph-eye' : 'ph-eye-closed'}" aria-hidden="true"></i>`;
    }

    root.addEventListener('click', (event) => {
      const target = event.target.closest('button, a');
      if (!target) return;
      if (target.dataset.authTab) {
        event.preventDefault();
        show(target.dataset.authTab);
      }
      if (target.dataset.authAction) {
        event.preventDefault();
        show(target.dataset.authAction);
      }
      if (target.dataset.authPassword) {
        event.preventDefault();
        togglePassword(target);
      }
    });
    forms.forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (state.busy || !state.config) return;
      if (form.dataset.authForm === 'signin') void signIn(form);
      if (form.dataset.authForm === 'signup') void signUp(form);
      if (form.dataset.authForm === 'magic') void sendMagicLink(form);
      if (form.dataset.authForm === 'recovery') void sendRecoveryLink(form);
    }));

    return {
      async init() {
        setBusy(true);
        try {
          state.config = await RemoteAuth.loadConfig();
          show('signin');
        } catch (error) {
          feedbackMessage(error.message || 'Não foi possível preparar o acesso ao OnFrame.');
        } finally {
          setBusy(false);
        }
      },
      destroy() {
        Object.values(state.challenges).forEach((instance) => instance.destroy());
      }
    };
  }

  window.OnFrameAuthController = { create };
})();
