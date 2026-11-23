import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import {
  getPaymentPackagesApi,
  initiatePaymentApi,
  getCreditHistoryApi
} from '../services/api';
import {
  X,
  Coins,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Zap,
  ArrowRight,
  Clock,
  ExternalLink,
  History,
  AlertCircle
} from 'lucide-react';

export default function PaymentModal({ isOpen, onClose, defaultReason = '' }) {
  const { user, credits, updateCredits } = useAuth();
  const [packages, setPackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState('scholar');
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [isInitiating, setIsInitiating] = useState(false);
  const [activeTab, setActiveTab] = useState('packages'); // 'packages' | 'history'
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch packages on open
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    async function loadData() {
      try {
        setLoadingPackages(true);
        const res = await getPaymentPackagesApi();
        if (res?.success && Array.isArray(res.packages)) {
          setPackages(res.packages);
          // Default to popular package if available
          const popular = res.packages.find((p) => p.popular);
          if (popular) {
            setSelectedPackageId(popular.id);
          } else if (res.packages[0]) {
            setSelectedPackageId(res.packages[0].id);
          }
        }
      } catch (err) {
        console.error('Failed loading payment packages:', err);
        setErrorMsg('Failed to load credit plans. Please check your connection.');
      } finally {
        setLoadingPackages(false);
      }
    }

    loadData();
  }, [isOpen]);

  // Fetch history when history tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'history') return;

    async function loadHistory() {
      try {
        setLoadingHistory(true);
        const res = await getCreditHistoryApi();
        if (res?.success) {
          setHistory(res.transactions || []);
          if (res.credits !== undefined) {
            updateCredits(res.credits);
          }
        }
      } catch (err) {
        console.error('Failed loading credit history:', err);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadHistory();
  }, [isOpen, activeTab]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isInitiating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isInitiating, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedPack = packages.find((p) => p.id === selectedPackageId);

  // Handle Pay with eSewa
  const handleProceedToEsewa = async () => {
    if (!selectedPackageId) return;

    try {
      setIsInitiating(true);
      setErrorMsg('');

      const res = await initiatePaymentApi(selectedPackageId);

      if (!res?.success || !res?.paymentUrl || !res?.formData) {
        throw new Error(res?.error?.message || 'Failed to initialize payment gateway.');
      }

      // Create dynamic hidden form and submit to eSewa EPAY v2 gateway
      const form = document.createElement('form');
      form.setAttribute('method', 'POST');
      form.setAttribute('action', res.paymentUrl);
      form.style.display = 'none';

      Object.entries(res.formData).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.setAttribute('type', 'hidden');
        input.setAttribute('name', key);
        input.setAttribute('value', value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      console.error('eSewa initiation error:', err);
      setErrorMsg(err.message || 'Could not connect to eSewa. Please try again.');
      setIsInitiating(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] overflow-y-auto bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-amber-400" />

        {/* Modal Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/40">
                <Coins className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                LectureMind Credits
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Refill credits to generate smart summaries, concept graphs, and AI tutoring.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isInitiating}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Reason Banner if opened due to insufficient credits */}
        {defaultReason && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{defaultReason}</span>
          </div>
        )}

        {/* Balance & Rule Bar */}
        <div className="mx-6 mt-4 p-4 rounded-xl bg-gradient-to-r from-teal-50/70 to-emerald-50/70 dark:from-slate-850 dark:to-slate-800 border border-teal-200/70 dark:border-teal-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              🪙
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider font-bold text-teal-800 dark:text-teal-400">
                Your Current Balance
              </span>
              <div className="text-lg font-extrabold text-slate-900 dark:text-white">
                {credits}{' '}
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Credits
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/60 text-xs text-teal-800 dark:text-teal-300 font-medium">
            <Zap className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span>Time-Based Pricing: 1 Credit per 10 minutes of lecture audio</span>
          </div>
        </div>

        {/* Tabs: Buy Credits vs Transaction History */}
        <div className="px-6 pt-4 flex border-b border-slate-100 dark:border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('packages')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'packages'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Choose a Credit Pack
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Transaction History
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto max-h-[58vh]">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'packages' ? (
            <div>
              {loadingPackages ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <div className="h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading available packages...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {packages.map((pkg) => {
                    const isSelected = pkg.id === selectedPackageId;
                    return (
                      <div
                        key={pkg.id}
                        onClick={() => setSelectedPackageId(pkg.id)}
                        className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/20 shadow-md ring-2 ring-teal-500/20'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-850'
                        }`}
                      >
                        {/* Badges */}
                        {pkg.badge && (
                          <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase shadow-sm bg-teal-600 text-white">
                            {pkg.badge}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {pkg.name}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            )}
                          </div>

                          <div className="mt-2 flex items-baseline gap-1.5">
                            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                              रु {pkg.priceNpr}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              NPR
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-100/80 dark:bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800/50">
                              🪙 {pkg.credits} Credits
                            </span>
                            {pkg.bonus && (
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-1.5 py-0.5 rounded">
                                {pkg.bonus}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                            {pkg.description}
                          </p>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                          <span>Includes:</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-200">
                            {pkg.analyses} Lecture Analyses
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* eSewa Test Info Notice */}
              <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333333] text-[11px] text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                <div className="space-y-1">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      eSewa Sandbox (UAT) Test Credentials
                    </span>
                    :
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span>Account 1 (Primary):</span>
                    <span className="text-gray-500">ID:</span>
                    <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-[#333333] text-gray-800 dark:text-gray-200 rounded font-mono text-[10px] font-bold">
                      9711111111
                    </code>
                    <span className="text-gray-500">Password:</span>
                    <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-[#333333] text-emerald-700 dark:text-emerald-400 rounded font-mono text-[10px] font-bold">
                      Test@123
                    </code>
                    <span className="text-gray-500">OTP:</span>
                    <code className="px-1.5 py-0.5 bg-gray-200 dark:bg-[#333333] text-gray-800 dark:text-gray-200 rounded font-mono text-[10px] font-bold">
                      123456
                    </code>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <span>Alternative:</span>
                    <span>ID: <code className="font-mono text-gray-700 dark:text-gray-300">9841000000</code></span>
                    <span>Password: <code className="font-mono text-gray-700 dark:text-gray-300">Nepal@123</code></span>
                    <span>OTP: <code className="font-mono text-gray-700 dark:text-gray-300">123456</code></span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {loadingHistory ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <div className="h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">Loading transaction history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No credit transactions recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-[#2c2c2c]">
                  {history.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <div
                        key={tx.id}
                        className="py-3 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg font-bold ${
                              isPositive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {tx.amount}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                              {tx.description || tx.type}
                            </div>
                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />
                              {new Date(tx.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-medium text-gray-500 dark:text-gray-400 text-[11px]">
                            Balance: {tx.balanceAfter}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Checkout Action */}
        {activeTab === 'packages' && (
          <div className="px-6 py-4 bg-gray-50/90 dark:bg-[#181818] border-t border-gray-200 dark:border-[#2a2a2a] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Selected Plan
              </span>
              <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>{selectedPack ? selectedPack.name : 'Choose a pack'}</span>
                {selectedPack && (
                  <span className="text-xs font-normal text-gray-500">
                    ({selectedPack.credits} Credits)
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleProceedToEsewa}
              disabled={isInitiating || !selectedPack || loadingPackages}
              style={{ backgroundColor: '#60bb46' }}
              className="w-full sm:w-auto px-6 py-2.5 text-white font-bold text-xs tracking-wide rounded-xl shadow-lg hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isInitiating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Connecting to eSewa...</span>
                </>
              ) : (
                <>
                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] font-black">
                    eSewa
                  </span>
                  <span>
                    Pay रु {selectedPack?.priceNpr || 0} via eSewa
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
