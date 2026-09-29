/** Android packaging expands .gz assets; use the bundled uncompressed language data. */
export async function createNativeOcrWorker() {
  const { createWorker } = await import('tesseract.js');
  return new Promise<Awaited<ReturnType<typeof createWorker>>>((resolve, reject) => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('native_ocr_load_failed'));
    };
    const timer = setTimeout(fail, 30_000);
    void createWorker(['kor', 'eng'], 1, {
      workerPath: '/ocr/worker.min.js', workerBlobURL: false,
      corePath: '/ocr/tesseract-core-lstm.wasm.js', langPath: '/ocr/lang', gzip: false,
      errorHandler: fail,
    }).then(worker => {
      if (settled) { void worker.terminate(); return; }
      settled = true; clearTimeout(timer); resolve(worker);
    }, fail);
  });
}
