(function () {
  const Shared = window.OnFrameShared;
  const Detection = window.OnblideMlDetection;
  const PhotosModel = window.OnFramePhotosModel;
  const PhotosModule = window.OnFramePhotosModule;
  const CommerceModel = window.OnFrameCommerceModel;
  const CommerceModule = window.OnFrameCommerceModule;
  const DescriptionModel = window.OnFrameDescriptionModel;
  const DescriptionModule = window.OnFrameDescriptionModule;
  const CharacteristicsModel = window.OnFrameCharacteristicsModel;
  const CharacteristicsModule = window.OnFrameCharacteristicsModule;
  const ModuleRegistry = window.OnFrameModuleRegistry;
  const ContextStore = window.OnFrameContextStore;
  const SurfaceHost = window.OnFrameSurfaceHost;
  const PageRuntime = window.OnFramePageRuntime;
  const toast = window.OnFrameToast;
  const api = Shared.createApi({ offlineMessage: 'Serviço local desligado. Abra o OnFrame.' });
  const toUserError = (err) => Shared.toUserError(err, { logPrefix: '[Onblide ML] detalhe tecnico:' });
  const contextStore = ContextStore.createStore();
  const repository = ContextStore.createRepository({ api, ttlMs: 60 * 1000 });
  const hosts = SurfaceHost.createSurfaceHost({ document, rootId: 'onblide-ml-root' });
  const root = hosts.ensureRoot();

  let runtime = null;
  const modules = ModuleRegistry.createModules({
    Shared,
    Detection,
    PhotosModel,
    PhotosModule,
    CommerceModel,
    CommerceModule,
    DescriptionModel,
    DescriptionModule,
    CharacteristicsModel,
    CharacteristicsModule,
    api,
    contextStore,
    contextUpdates: ContextStore,
    hosts,
    root,
    toast,
    requestPageContextReload: (reason) => runtime.reload(reason),
    invalidatePageContext: (reason) => runtime.invalidate(reason)
  });

  runtime = PageRuntime.createRuntime({
    Detection,
    store: contextStore,
    repository,
    hosts,
    modules,
    toUserError
  });
  runtime.start();
})();
