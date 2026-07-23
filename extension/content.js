(function () {
  const Shared = window.OnFrameShared;
  const Detection = window.OnblideMlDetection;
  const PhotosModel = window.OnFramePhotosModel;
  const PhotosModule = window.OnFramePhotosModule;
  const CommerceModel = window.OnFrameCommerceModel;
  const CommerceModule = window.OnFrameCommerceModule;
  const ModuleRegistry = window.OnFrameModuleRegistry;
  const ContentShell = window.OnFrameContentShell;
  const api = Shared.createApi({ offlineMessage: 'Serviço local desligado. Abra o OnFrame.' });
  const toUserError = (err) => Shared.toUserError(err, { logPrefix: '[Onblide ML] detalhe tecnico:' });
  const root = document.createElement('div');
  root.id = 'onblide-ml-root';
  document.documentElement.appendChild(root);

  let shell = null;
  const modules = ModuleRegistry.createModules({
    Shared,
    Detection,
    PhotosModel,
    PhotosModule,
    CommerceModel,
    CommerceModule,
    api,
    root,
    requestPageContextReload: (reason) => shell.reloadPageContext(reason)
  });

  shell = ContentShell.createShell({
    Detection,
    api,
    modules,
    toUserError
  });
  shell.start();
})();
