import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { resolveMedicationImage, getLocalMedicationProductImage } from '../lib/medication-images.ts';
import { enrichOfficialMedication } from '../lib/medication-enrichment.ts';
import { FREQUENT_MEDICATIONS } from '../lib/frequent-medications.ts';
const generic = '/icons/medication-fallback-64.svg';
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
for (const medication of FREQUENT_MEDICATIONS) {
  const local = getLocalMedicationProductImage({ medicationName: medication.displayLabel });
  assert.ok(local); assert.ok((await stat(new URL('../public' + local.src, import.meta.url))).size > 0); checks += 2;
  equal(resolveMedicationImage({ medicationName: medication.displayLabel }), { type: 'product', src: local.src });
  equal(getLocalMedicationProductImage({ medicationId: local.catalogId })?.src, local.src);
}
for (const name of [' 아토목신 캡슐 40 ㎎ ', '아토목신캡슐(40mg)', '아토목신캡슐 40.0밀리그램 (명인제약(주))', '아토목신캡슐 40mg 명인제약', '아토목신캡슐 ４０ｍｇ']) {
  equal(resolveMedicationImage({ medicationName: name }), { type: 'product', src: '/medications/atomoxine-40.jpg' });
}
for (const name of ['아토목세틴캡슐 40mg', '아토목신 40mg', '아토목신정 40mg', '아토목신캡슐 41mg', '아토목신캡슐 40mg (다른제조사)', '아토목신캡슐 40mg (불확실)', '자나팜정 0.25mg', '자니팜정 0.25mg']) {
  equal(resolveMedicationImage({ medicationName: name }), { type: 'fallback', src: generic });
}
equal(resolveMedicationImage({ medicationId: 'unknown', medicationName: '아토목신캡슐 40mg' }), { type: 'fallback', src: generic });
const request = { medicationId: '201111088', medicationName: '메디키넷리타드캡슐 10mg', existingImage: '/api/medications/image/201111088', fallbackImage: generic };
equal(resolveMedicationImage(request), { type: 'product', src: request.existingImage });
equal(resolveMedicationImage({ ...request, failedSources: new Set([request.existingImage]) }), { type: 'product', src: '/medications/medikinet-10.jpg' });
equal(resolveMedicationImage({ ...request, failedSources: new Set([request.existingImage, '/medications/medikinet-10.jpg']) }), { type: 'fallback', src: generic });
equal(resolveMedicationImage({ existingImage: '/icons/pill.svg', fallbackImage: '/icons/pill.svg' }), { type: 'fallback', src: generic });
equal(resolveMedicationImage({ legacyImage: '/medications/concerta-36.png' }), { type: 'product', src: '/medications/concerta-36.png' });
equal(resolveMedicationImage({ existingImage: '   ', legacyImage: '/medications/concerta-36.png' }), { type: 'product', src: '/medications/concerta-36.png' });
const originalFetch = globalThis.fetch;
try {
  const saved = { catalogId: '201111088', name: '메디키넷리타드캡슐', strengthValue: 10, strengthUnit: 'mg', productImage: '/api/medications/image/201111088', imagePath: '/api/medications/image/201111088', imageType: 'product', imageSourceName: 'saved source' };
  globalThis.fetch = async () => new Response(JSON.stringify({ medication: { ...saved, productImage: undefined, imagePath: generic, imageType: 'fallback', manufacturer: '명인제약(주)' } }));
  const enriched = await enrichOfficialMedication(saved);
  equal(enriched.productImage, saved.productImage); equal(enriched.imagePath, saved.imagePath); equal(enriched.imageSourceName, saved.imageSourceName); equal(enriched.manufacturer, '명인제약(주)');
} finally { globalThis.fetch = originalFetch; }
console.log(`PASS ${checks} medication image assertions`);
