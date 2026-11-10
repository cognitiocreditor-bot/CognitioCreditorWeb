/**
 * TEST HELPER — COGNITIO CREDITOR
 */
let passed = 0;
let failed = 0;

export function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALLÓ: ${message}`);
    failed++;
  }
}

export function reportSummary(suiteName) {
  console.log(`\n========================================`);
  console.log(`[${suiteName}] TOTAL: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
  console.log(`========================================`);
  if (failed > 0) {
    process.exit(1);
  }
}
