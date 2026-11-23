import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { verifyPaymentApi } from '../services/api';
import { CheckCircle, AlertCircle, ArrowRight, BookOpen, LayoutDashboard, Sparkles, RefreshCw } from 'lucide-react';

export default function PaymentSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser, updateCredits } = useAuth();

  const [status, setStatus] = useState('VERIFYING'); // 'VERIFYING' | 'SUCCESS' | 'ERROR'
  const [resultData, setResultData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function handleVerification() {
      const searchParams = new URLSearchParams(location.search);
      const encodedData = searchParams.get('data');

      if (!encodedData) {
        // Check if individual query parameters were passed
        const transaction_uuid = searchParams.get('transaction_uuid') || searchParams.get('oid');
        const total_amount = searchParams.get('total_amount') || searchParams.get('amt');
        const transaction_code = searchParams.get('transaction_code') || searchParams.get('refId');

        if (!transaction_uuid) {
          if (isMounted) {
            setStatus('ERROR');
            setErrorMessage('No payment verification token or data received from eSewa.');
          }
          return;
        }

        try {
          const payload = {
            transaction_uuid,
            total_amount,
            transaction_code,
            status: 'COMPLETE'
          };
          const res = await verifyPaymentApi({ payload });
          if (isMounted) {
            if (res?.success) {
              setResultData(res);
              if (res.credits !== undefined) {
                updateCredits(res.credits);
              }
              await refreshUser();
              setStatus('SUCCESS');
            } else {
              throw new Error(res?.error?.message || 'Verification failed');
            }
          }
        } catch (err) {
          if (isMounted) {
            setStatus('ERROR');
            setErrorMessage(err.message || 'Failed to verify transaction with backend.');
          }
        }
        return;
      }

      try {
        const res = await verifyPaymentApi({ data: encodedData });
        if (isMounted) {
          if (res?.success) {
            setResultData(res);
            if (res.credits !== undefined) {
              updateCredits(res.credits);
            }
            await refreshUser();
            setStatus('SUCCESS');
          } else {
            throw new Error(res?.error?.message || 'Verification failed');
          }
        }
      } catch (err) {
        if (isMounted) {
          setStatus('ERROR');
          setErrorMessage(err.message || 'Payment confirmation failed. Please contact support if your money was debited.');
        }
      }
    }

    handleVerification();

    return () => {
      isMounted = false;
    };
  }, [location.search]);

  return (
    <div className="max-w-xl mx-auto my-12 p-6 sm:p-8 bg-white dark:bg-[#202020] border border-gray-200 dark:border-[#333333] rounded-2xl shadow-xl text-center">
      {status === 'VERIFYING' && (
        <div className="py-12 flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 border-4 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xl">
              🪙
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Confirming eSewa Payment
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
              We are securely verifying your transaction signature with eSewa Nepal and adding credits to your wallet...
            </p>
          </div>
        </div>
      )}

      {status === 'SUCCESS' && (
        <div className="py-6 flex flex-col items-center">
          <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 ring-8 ring-emerald-50 dark:ring-emerald-950/20">
            <CheckCircle className="h-10 w-10" />
          </div>

          <span className="text-[11px] font-bold tracking-widest text-emerald-700 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full mb-2">
            Payment Verified
          </span>

          <h2 className="text-2xl font-black text-gray-900 dark:text-white">
            Credits Successfully Added!
          </h2>

          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 max-w-md">
            {resultData?.message || 'Your eSewa payment was successfully completed and your credits are ready to use.'}
          </p>

          {/* New Balance Card */}
          <div className="my-6 w-full p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-[#242e27] dark:to-[#1c241f] border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-around">
            <div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase font-semibold">
                Updated Credit Balance
              </span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1.5 mt-0.5">
                <span>🪙</span>
                <span>{resultData?.credits ?? '—'}</span>
                <span className="text-xs font-semibold text-gray-500">Credits</span>
              </div>
            </div>

            <div className="h-10 w-px bg-emerald-200 dark:bg-emerald-800/60" />

            <div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 uppercase font-semibold">
                Payment Method
              </span>
              <div className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-[#60bb46]">
                  eSewa
                </span>
                <span>EPAY 2.0</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
            <Link
              to="/upload"
              className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>Analyze New Lecture</span>
            </Link>

            <Link
              to="/dashboard"
              className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-[#2c2c2c] dark:hover:bg-[#383838] text-gray-700 dark:text-gray-200 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Go to Dashboard</span>
            </Link>
          </div>
        </div>
      )}

      {status === 'ERROR' && (
        <div className="py-6 flex flex-col items-center">
          <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mb-4 ring-8 ring-red-50 dark:ring-red-950/20">
            <AlertCircle className="h-10 w-10" />
          </div>

          <h2 className="text-2xl font-black text-gray-900 dark:text-white">
            Verification Issue
          </h2>

          <p className="text-sm text-red-600 dark:text-red-400 mt-2 max-w-md">
            {errorMessage}
          </p>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-md">
            If your funds were deducted from eSewa, please do not worry. Simply contact support with your transaction reference.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-100 dark:bg-[#2c2c2c] text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Verification
            </button>
            <Link
              to="/dashboard"
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
