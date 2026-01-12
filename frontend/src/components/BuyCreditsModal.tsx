/**
 * Buy Credits Modal - Stripe checkout for purchasing credits
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCreditPackages, createCheckoutSession, type CreditPackage } from '../lib/api';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BuyCreditsModal({ isOpen, onClose }: BuyCreditsModalProps) {
  const { getIdToken } = useAuth();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPackages();
    }
  }, [isOpen]);

  const loadPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      const pkgs = await getCreditPackages();
      setPackages(pkgs.sort((a, b) => a.credits - b.credits));
    } catch (err: any) {
      setError(err.message || 'Failed to load credit packages');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pkg: CreditPackage) => {
    try {
      setPurchasing(pkg.credits);
      setError(null);

      const token = await getIdToken();
      if (!token) {
        throw new Error('Please sign in to purchase credits');
      }

      const { url } = await createCheckoutSession(token, pkg.credits);
      
      // Redirect to Stripe checkout
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Failed to start checkout');
      setPurchasing(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-strong rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h2 className="font-mono text-xl text-white">Buy Credits</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/70" />
            </button>
          </div>

          {/* Info */}
          <p className="text-white/60 text-sm mb-6 font-mono">
            Each 3D generation costs <span className="text-purple-400 font-semibold">1 credit</span>. 
            Purchase credits to create unlimited scenes.
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30">
              <p className="text-red-300 text-sm font-mono">{error}</p>
            </div>
          )}

          {/* Packages */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {packages.map((pkg) => {
                const perCredit = (pkg.price / pkg.credits).toFixed(2);
                const isPurchasing = purchasing === pkg.credits;
                
                return (
                  <motion.button
                    key={pkg.credits}
                    onClick={() => handlePurchase(pkg)}
                    disabled={isPurchasing}
                    className="w-full p-4 rounded-lg glass border border-white/10 hover:border-purple-400/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={!isPurchasing ? { scale: 1.02 } : {}}
                    whileTap={!isPurchasing ? { scale: 0.98 } : {}}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-lg text-white font-semibold">
                            {pkg.credits} Credits
                          </span>
                          {pkg.credits >= 20 && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-mono">
                              Best Value
                            </span>
                          )}
                        </div>
                        <p className="text-white/50 text-xs font-mono">
                          ${perCredit} per generation
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xl text-white font-semibold">
                          ${pkg.price.toFixed(2)}
                        </div>
                        {isPurchasing && (
                          <div className="text-xs text-purple-400 font-mono mt-1">
                            Redirecting...
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-white/40 text-xs font-mono text-center">
              Powered by Stripe • Secure payment processing
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

