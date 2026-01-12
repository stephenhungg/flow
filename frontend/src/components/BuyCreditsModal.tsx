/**
 * Buy Credits Card - Expanded card dropdown for purchasing credits
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCreditPackages, createCheckoutSession, type CreditPackage } from '../lib/api';

interface BuyCreditsCardProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function BuyCreditsCard({ isOpen, onClose, anchorRef }: BuyCreditsCardProps) {
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

  const cardRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        cardRef.current &&
        !cardRef.current.contains(event.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="absolute top-full right-0 mt-2 z-50"
        style={{ minWidth: '320px' }}
      >
        <div className="glass-strong rounded-2xl p-5 shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h2 className="font-mono text-lg text-white">Buy Credits</h2>
          </div>

          {/* Info */}
          <p className="text-white/50 text-xs mb-4 font-mono">
            Each generation costs <span className="text-purple-400 font-semibold">1 credit</span>
          </p>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30">
              <p className="text-red-300 text-sm font-mono">{error}</p>
            </div>
          )}

          {/* Packages */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {packages.map((pkg) => {
                const perCredit = (pkg.price / pkg.credits).toFixed(2);
                const isPurchasing = purchasing === pkg.credits;
                
                return (
                  <motion.button
                    key={pkg.credits}
                    onClick={() => handlePurchase(pkg)}
                    disabled={isPurchasing}
                    className="w-full p-3 rounded-lg glass border border-white/10 hover:border-purple-400/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={!isPurchasing ? { scale: 1.01 } : {}}
                    whileTap={!isPurchasing ? { scale: 0.99 } : {}}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm text-white font-semibold">
                            {pkg.credits} Credits
                          </span>
                          {pkg.credits >= 20 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono">
                              Best
                            </span>
                          )}
                        </div>
                        <p className="text-white/40 text-[10px] font-mono">
                          ${perCredit}/gen
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-base text-white font-semibold">
                          ${pkg.price.toFixed(2)}
                        </div>
                        {isPurchasing && (
                          <div className="text-[10px] text-purple-400 font-mono mt-0.5">
                            ...
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
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-white/30 text-[10px] font-mono text-center">
              Secure payment via Stripe
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

