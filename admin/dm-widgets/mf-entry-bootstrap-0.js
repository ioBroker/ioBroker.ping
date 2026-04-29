
const __mfCacheGlobalKey = "__mf_module_cache__";
globalThis[__mfCacheGlobalKey] ||= { share: {}, remote: {} };
globalThis[__mfCacheGlobalKey].share ||= {};
globalThis[__mfCacheGlobalKey].remote ||= {};
const __mfModuleCache = globalThis[__mfCacheGlobalKey];

(async () => {
  const { initHost } = await import("./assets/hostInit-C6Ss2hKJ.js");
  const runtime = await initHost();
  const __mfRemotePreloads = [];
  await Promise.all(__mfRemotePreloads);
})().then(() => import("./assets/index-CYIT9WDW.js"));
