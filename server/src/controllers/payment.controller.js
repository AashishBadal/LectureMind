import { prisma } from '../config/prisma.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import {
  CREDIT_PACKAGES,
  COST_PER_LECTURE_ANALYSIS,
  INITIAL_USER_CREDITS,
  generateEsewaSignature,
  decodeEsewaResponse,
  verifyEsewaSignature,
  verifyWithEsewaApi
} from '../services/esewa.service.js';

/**
 * GET /api/payments/packages
 * Returns available credit packages, rates in NPR, and lecture cost details
 */
export const getPackages = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      packages: CREDIT_PACKAGES,
      costPerLectureAnalysis: COST_PER_LECTURE_ANALYSIS,
      initialCredits: INITIAL_USER_CREDITS,
      currency: 'NPR',
      currencySymbol: 'रु'
    });
  } catch (error) {
    logger.error('Error fetching credit packages:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve credit packages.' }
    });
  }
};

/**
 * POST /api/payments/initiate
 * Initiates an eSewa payment order for a selected credit pack
 */
export const initiateEsewaPayment = async (req, res) => {
  try {
    const { packageId } = req.body;
    const userId = req.user.id;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Package selection is required.' }
      });
    }

    const selectedPack = CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
    if (!selectedPack) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid credit package selected.' }
      });
    }

    // Generate unique transaction UUID according to eSewa requirements (alphanumeric and hyphens)
    const uniqueSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionUuid = `LM-${Date.now()}-${uniqueSuffix}`;

    const amountStr = String(selectedPack.priceNpr);

    // Save pending payment in database
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount: selectedPack.priceNpr,
        credits: selectedPack.credits,
        transactionUuid,
        status: 'PENDING',
        gateway: 'ESEWA'
      }
    });

    // Generate HMAC-SHA256 signature
    const signature = generateEsewaSignature(
      amountStr,
      transactionUuid,
      config.esewa.productCode
    );

    // Build standard eSewa EPAY v2 form parameters
    const formData = {
      amount: amountStr,
      tax_amount: '0',
      total_amount: amountStr,
      transaction_uuid: transactionUuid,
      product_code: config.esewa.productCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: `${config.clientUrl}/payment/success`,
      failure_url: `${config.clientUrl}/payment/failure`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature
    };

    logger.info(`Initiated eSewa payment ${payment.id} for user ${userId}: Rs. ${selectedPack.priceNpr} (${selectedPack.credits} credits)`);

    return res.status(200).json({
      success: true,
      paymentId: payment.id,
      transactionUuid,
      paymentUrl: config.esewa.gatewayUrl,
      formData,
      package: selectedPack
    });
  } catch (error) {
    logger.error('Error initiating eSewa payment:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to initiate payment. Please try again.' }
    });
  }
};

/**
 * POST /api/payments/verify
 * Verifies eSewa payment callback, validates signature & status, and atomically credits user account
 */
export const verifyEsewaPayment = async (req, res) => {
  try {
    const { data: encodedData, payload: rawPayload } = req.body;

    let payload = rawPayload;
    if (encodedData && typeof encodedData === 'string') {
      payload = decodeEsewaResponse(encodedData);
    }

    if (!payload || !payload.transaction_uuid) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing transaction data in payment verification request.' }
      });
    }

    const { transaction_uuid, status, transaction_code, total_amount, product_code } = payload;

    // Find the pending payment
    const payment = await prisma.payment.findUnique({
      where: { transactionUuid: transaction_uuid }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { message: `Payment with reference ${transaction_uuid} not found.` }
      });
    }

    // Idempotency check: if already completed, return success immediately
    if (payment.status === 'COMPLETED') {
      const currentUser = await prisma.user.findUnique({
        where: { id: payment.userId },
        select: { id: true, credits: true, email: true, name: true }
      });

      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        message: 'Payment has already been confirmed and credited.',
        credits: currentUser?.credits || 0,
        payment
      });
    }

    // Check payment status from eSewa
    const isStatusComplete = status === 'COMPLETE' || status === 'COMPLETED';
    if (!isStatusComplete) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          rawResponse: payload
        }
      });

      return res.status(400).json({
        success: false,
        error: { message: `eSewa reported non-successful status: ${status}` }
      });
    }

    // Verify amount matches recorded payment to prevent tampering
    if (total_amount) {
      const returnedAmount = parseFloat(String(total_amount).replace(/,/g, ''));
      if (!isNaN(returnedAmount) && Math.abs(returnedAmount - payment.amount) > 0.01) {
        logger.warn(`Payment amount mismatch for ${transaction_uuid}: expected ${payment.amount}, received ${returnedAmount}`);
        return res.status(400).json({
          success: false,
          error: { message: 'Transaction amount mismatch.' }
        });
      }
    }

    // Verify signature
    const isSigValid = verifyEsewaSignature(payload);
    let apiRefId = null;

    if (!isSigValid) {
      // In sandbox mode or edge cases, query eSewa API directly
      const apiCheck = await verifyWithEsewaApi(
        product_code || config.esewa.productCode,
        payment.amount,
        transaction_uuid
      );

      const apiStatus = apiCheck.data?.status;
      if (apiStatus !== 'COMPLETE' && apiStatus !== 'COMPLETED') {
        logger.warn(`Signature and API verification failed for ${transaction_uuid}`);
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid payment signature or unconfirmed transaction.' }
        });
      }
      apiRefId = apiCheck.data?.ref_id;
    }

    const finalRefId = transaction_code || apiRefId || null;

    // Atomically update payment, user credits, and credit transaction ledger
    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark payment COMPLETED
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          esewaRefId: finalRefId,
          rawResponse: payload
        }
      });

      // 2. Increment user credits
      const updatedUser = await tx.user.update({
        where: { id: payment.userId },
        data: {
          credits: {
            increment: payment.credits
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          credits: true
        }
      });

      // 3. Record in credit transactions
      const creditTx = await tx.creditTransaction.create({
        data: {
          userId: payment.userId,
          paymentId: payment.id,
          amount: payment.credits,
          balanceAfter: updatedUser.credits,
          type: 'ESEWA_PURCHASE',
          description: `Top-up: +${payment.credits} credits via eSewa (Ref: ${transaction_code || transaction_uuid})`
        }
      });

      return {
        payment: updatedPayment,
        user: updatedUser,
        creditTx
      };
    });

    logger.info(`Payment verified and credited: user ${result.user.id} received ${payment.credits} credits. New balance: ${result.user.credits}`);

    return res.status(200).json({
      success: true,
      message: `Payment successful! Added ${payment.credits} credits to your account.`,
      credits: result.user.credits,
      payment: result.payment
    });
  } catch (error) {
    logger.error('Error verifying eSewa payment:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to verify payment with eSewa.' }
    });
  }
};

/**
 * GET /api/payments/history
 * Returns user's current credit balance and transaction history
 */
export const getCreditHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    });

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return res.status(200).json({
      success: true,
      credits: user?.credits ?? 0,
      transactions
    });
  } catch (error) {
    logger.error('Error fetching credit history:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch credit history.' }
    });
  }
};
