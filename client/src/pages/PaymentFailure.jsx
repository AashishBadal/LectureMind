import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft, RefreshCw, HelpCircle } from 'lucide-react';
import PaymentModal from '../components/PaymentModal';

export default function PaymentFailure() {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="max-w-md mx-auto my-12 p-6 sm:p-8 bg-white dark:bg-[#202020] border border-gray-200 dark:border-[#333333] rounded-2xl shadow-xl text-center">
      <div className="h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4 ring-8 ring-rose-50 dark:ring-rose-950/20">
        <XCircle className="h-10 w-10" />
      </div>

      <span className="text-[11px] font-bold tracking-widest text-rose-700 dark:text-rose-400 uppercase bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 rounded-full">
        Payment Incomplete
      </span>

      <h2 className="text-2xl font-black text-gray-900 dark:text-white mt-3">
        eSewa Transaction Cancelled
      </h2>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
        Your payment was not completed or was cancelled on eSewa. No credits were added and no money was deducted.
      </p>

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => setIsModalOpen(true)}
          style={{ backgroundColor: '#60bb46' }}
          className="w-full sm:w-auto px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-md hover:brightness-105 transition-all flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try Payment Again</span>
        </button>

        <Link
          to="/dashboard"
          className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-[#2c2c2c] dark:hover:bg-[#383838] text-gray-700 dark:text-gray-200 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
