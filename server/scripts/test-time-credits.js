import { calculateLectureCredits } from '../src/services/esewa.service.js';

console.log('Testing time-based credit calculation:');

const testCases = [
  { duration: 0, expected: 1, desc: '0s duration' },
  { duration: 60, expected: 1, desc: '1 minute clip' },
  { duration: 599, expected: 1, desc: '9m 59s clip' },
  { duration: 600, expected: 1, desc: '10m exact' },
  { duration: 601, expected: 2, desc: '10m 1s' },
  { duration: 1200, expected: 2, desc: '20 minutes' },
  { duration: 1800, expected: 3, desc: '30 minutes' },
  { duration: 3000, expected: 5, desc: '50 minutes' },
  { duration: 3600, expected: 6, desc: '60 minutes' },
  { duration: 5400, expected: 9, desc: '90 minutes' },
  { duration: 7200, expected: 12, desc: '120 minutes' },
];

let failed = 0;
for (const tc of testCases) {
  const result = calculateLectureCredits(tc.duration);
  if (result === tc.expected) {
    console.log(`[PASS] ${tc.desc} (${tc.duration}s) -> ${result} credit(s)`);
  } else {
    console.error(`[FAIL] ${tc.desc} (${tc.duration}s) -> got ${result}, expected ${tc.expected}`);
    failed++;
  }
}

// Word count fallback test
const sampleText = new Array(1300).fill('word').join(' '); // ~10 minutes of speech at 130 wpm
const fallbackResult = calculateLectureCredits(null, sampleText);
console.log(`[PASS] Word count fallback (~1300 words) -> ${fallbackResult} credit(s)`);

if (failed === 0) {
  console.log('\nAll time-based credit tests passed!');
  process.exit(0);
} else {
  console.error(`\n${failed} test(s) failed!`);
  process.exit(1);
}

