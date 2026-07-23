(function (root, factory) {
  const registry = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = registry;
  } else {
    root.OnFrameModuleRegistry = registry;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REQUIRED_METHODS = Object.freeze([
    'getStatus',
    'handlePageContextChange',
    'hide',
    'isBusy',
    'isLoaded',
    'reload',
    'reset',
    'scheduleRender',
    'show',
    'start'
  ]);

  function createModules(services) {
    const modules = [];
    const photos = createPhotosModule(services);
    const commerce = createCommerceModule(services);
    if (photos) modules.push(assertModuleContract(photos));
    if (commerce) modules.push(assertModuleContract(commerce));
    return modules;
  }

  function createPhotosModule(services) {
    const PhotosModule = services && services.PhotosModule;
    if (!PhotosModule || typeof PhotosModule.createPhotoModule !== 'function') return null;
    return PhotosModule.createPhotoModule(services);
  }

  function createCommerceModule(services) {
    const CommerceModule = services && services.CommerceModule;
    if (!CommerceModule || typeof CommerceModule.createCommerceModule !== 'function') return null;
    return CommerceModule.createCommerceModule(services);
  }

  function assertModuleContract(module) {
    if (!module || typeof module !== 'object') throw new Error('Modulo invalido.');
    const missing = REQUIRED_METHODS.filter((method) => typeof module[method] !== 'function');
    if (missing.length) {
      throw new Error(`Modulo ${module.id || '(sem id)'} sem contrato: ${missing.join(', ')}.`);
    }
    if (!module.id) throw new Error('Modulo sem id.');
    if (!module.label) throw new Error(`Modulo ${module.id} sem label.`);
    return module;
  }

  return {
    assertModuleContract,
    createModules
  };
});
