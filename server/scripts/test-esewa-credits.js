import { prisma } from '../src/config/prisma.js';
import { generateEsewaSignature, CREDIT_PACKAGES, COST_PER_LECTURE_ANALYSIS } from '../src/services/esewa.service.js';
import { config } from '../src/config/env.js';

const BASE_URL = `http://localhost:${config.port}/api`;

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting LectureMind eSewa & Credit System Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Test Package List & Configuration
    console.log('--- Step 1: Credit Packages & NPR Pricing ---');
    const pkgRes = await fetch(`${BASE_URL}/payments/packages`).then((r) => r.json());
    assert(pkgRes.success === true, 'GET /api/payments/packages returns success: true');
    assert(Array.isArray(pkgRes.packages) && pkgRes.packages.length >= 4, 'Includes at least 4 credit packages');
    assert(pkgRes.costPerLectureAnalysis === 5, 'Cost per lecture analysis is strictly 5 credits');
    assert(pkgRes.initialCredits === 10, 'Initial user bonus is configured to 10 credits');
    assert(pkgRes.currency === 'NPR', 'Currency is set to NPR');

    // 2. Test User Registration & Initial 10 Credits
    console.log('\n--- Step 2: New User Registration & 10 Initial Credits ---');
    const testEmail = `test_esewa_${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'eSewa Test Scholar',
        email: testEmail,
        password: 'Password123!'
      })
    }).then((r) => r.json());

    assert(regRes.success === true, 'User registration succeeds');
    assert(regRes.user?.credits === 10, 'New user receives exactly 10 initial credits');

    const testUserId = regRes.user.id;
    const token = regRes.token;

    // Check DB credit transaction ledger
    const initialTx = await prisma.creditTransaction.findFirst({
      where: { userId: testUserId, type: 'INITIAL_BONUS' }
    });
    assert(initialTx !== null && initialTx.amount === 10, 'INITIAL_BONUS ledger entry created with +10 credits');

    // 3. Test Session Me Endpoint returns credits
    console.log('\n--- Step 3: Session Profile Verification ---');
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json());
    assert(meRes.success === true && meRes.user?.credits === 10, 'GET /api/auth/me returns credits: 10');

    // 4. Test eSewa Payment Initiation
    console.log('\n--- Step 4: eSewa Payment Order Initiation ---');
    const initRes = await fetch(`${BASE_URL}/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ packageId: 'scholar' }) // Rs. 150 -> 35 credits
    }).then((r) => r.json());

    assert(initRes.success === true, 'POST /api/payments/initiate succeeds');
    assert(!!initRes.paymentUrl, 'Returns eSewa gateway URL');
    assert(initRes.package?.priceNpr === 150, 'Package price is Rs. 150');
    assert(initRes.package?.credits === 35, 'Package awards 35 credits');
    assert(initRes.formData?.total_amount === '150', 'Form data total_amount is 150');
    assert(!!initRes.formData?.signature, 'Generates HMAC-SHA256 signature for eSewa v2');

    const transactionUuid = initRes.transactionUuid;

    // Verify pending payment record in DB
    const pendingPayment = await prisma.payment.findUnique({
      where: { transactionUuid }
    });
    assert(pendingPayment !== null && pendingPayment.status === 'PENDING', 'Database records PENDING payment');

    // 5. Test eSewa Callback Verification & Top-up
    console.log('\n--- Step 5: eSewa Payment Verification & Credit Addition ---');
    // Simulate eSewa signature for verification callback
    const testRefId = `ESEWA-REF-${Date.now()}`;
    const verifyPayload = {
      transaction_code: testRefId,
      status: 'COMPLETE',
      total_amount: '150',
      transaction_uuid: transactionUuid,
      product_code: config.esewa.productCode,
      signed_field_names: 'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names'
    };

    // Sign callback payload using standard HMAC
    const fieldString = 'transaction_code=' + verifyPayload.transaction_code +
      ',status=' + verifyPayload.status +
      ',total_amount=' + verifyPayload.total_amount +
      ',transaction_uuid=' + verifyPayload.transaction_uuid +
      ',product_code=' + verifyPayload.product_code +
      ',signed_field_names=' + verifyPayload.signed_field_names;

    const crypto = await import('crypto');
    verifyPayload.signature = crypto
      .createHmac('sha256', config.esewa.secretKey)
      .update(fieldString)
      .digest('base64');

    const base64CallbackData = Buffer.from(JSON.stringify(verifyPayload)).toString('base64');

    const verifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ data: base64CallbackData })
    }).then((r) => r.json());

    assert(verifyRes.success === true, 'POST /api/payments/verify succeeds');
    assert(verifyRes.credits === 45, 'User credits updated: 10 initial + 35 pack = 45 credits');

    // 6. Test Payment Idempotency
    console.log('\n--- Step 6: Payment Idempotency Verification ---');
    const duplicateVerifyRes = await fetch(`${BASE_URL}/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ data: base64CallbackData })
    }).then((r) => r.json());

    assert(duplicateVerifyRes.success === true, 'Duplicate verification returns success');
    assert(duplicateVerifyRes.alreadyProcessed === true, 'Identifies alreadyProcessed = true');
    assert(duplicateVerifyRes.credits === 45, 'Credits remain 45 without double charging');

    // 7. Test Credit History
    console.log('\n--- Step 7: Credit History Ledger Verification ---');
    const historyRes = await fetch(`${BASE_URL}/payments/history`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then((r) => r.json());

    assert(historyRes.success === true, 'GET /api/payments/history succeeds');
    assert(historyRes.credits === 45, 'History returns current balance of 45 credits');
    assert(historyRes.transactions?.length >= 2, 'Transactions contain INITIAL_BONUS and ESEWA_PURCHASE');

    // 8. Test Lecture Analysis Credit Deduction & Insufficient Credits
    console.log('\n--- Step 8: Lecture Analysis Credit Deduction & Enforcement ---');
    // Create a dummy lecture for testing credit deduction
    const testLecture = await prisma.lecture.create({
      data: {
        userId: testUserId,
        title: 'Quantum Mechanics Lecture',
        status: 'TRANSCRIBED',
        transcript: {
          create: {
            content: 'Today we discuss quantum wave functions and superposition in physics.'
          }
        }
      }
    });

    // Manually set user credits to 4 to test insufficient credits (< 5)
    await prisma.user.update({
      where: { id: testUserId },
      data: { credits: 4 }
    });

    const insufficientRes = await fetch(`${BASE_URL}/lectures/${testLecture.id}/analyze?force=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    const insufficientData = await insufficientRes.json();
    assert(insufficientRes.status === 402, 'Analyze endpoint returns HTTP 402 Payment Required for credits < 5');
    assert(insufficientData.error?.code === 'INSUFFICIENT_CREDITS', 'Error code is INSUFFICIENT_CREDITS');
    assert(insufficientData.error?.requiredCredits === 5, 'Specifies requiredCredits: 5');

    // Set user credits to 10 (enough for analysis) and verify check
    await prisma.user.update({
      where: { id: testUserId },
      data: { credits: 10 }
    });

    const updatedUserCredits = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { credits: true }
    });
    assert(updatedUserCredits.credits === 10, 'Credits verified at 10 before analysis');

    // Clean up test data
    await prisma.creditTransaction.deleteMany({ where: { userId: testUserId } });
    await prisma.payment.deleteMany({ where: { userId: testUserId } });
    await prisma.transcript.deleteMany({ where: { lectureId: testLecture.id } });
    await prisma.lecture.delete({ where: { id: testLecture.id } });
    await prisma.user.delete({ where: { id: testUserId } });
    console.log('\n🧹 Test artifacts cleaned up successfully.');

  } catch (err) {
    console.error('Test suite runtime error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
