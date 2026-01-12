/**
 * Credits Page - Purchase credits for generating 3D scenes
 */

import { motion } from 'framer-motion';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { NavBar } from '../components/NavBar';
import { getCreditPackages, createCheckoutSession, type CreditPackage } from '../lib/api';
import { CloudBackground } from '../components/CloudBackground';

export function CreditsPage() {
  const { dbUser, getIdToken } = useAuth();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

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

  const navigateBack = () => {
    window.location.hash = '';
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <CloudBackground />
      
      <NavBar currentPage="home" />

      <div className="relative z-10 pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <button
              onClick={navigateBack}
              className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6 font-mono text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>back</span>
            </button>

            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-8 h-8 text-purple-400" />
              <h1 className="font-mono text-4xl text-white">Buy Credits</h1>
            </div>

            <p className="text-white/60 font-mono text-sm max-w-2xl">
              Each 3D generation costs <span className="text-purple-400 font-semibold">1 credit</span>. 
              Purchase credits to create unlimited immersive scenes.
            </p>

            {dbUser && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-400/30 font-mono text-sm text-purple-200">
                <Sparkles className="w-4 h-4" />
                <span>
                  You have {dbUser.credits === Infinity ? '∞' : (dbUser.credits || 0)} credits
                </span>
              </div>
            )}
          </motion.div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-lg bg-red-500/20 border border-red-500/30"
            >
              <p className="text-red-300 text-sm font-mono">{error}</p>
            </motion.div>
          )}

          {/* Packages Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((pkg, index) => {
                const perCredit = (pkg.price / pkg.credits).toFixed(2);
                const isPurchasing = purchasing === pkg.credits;
                const isBestValue = pkg.credits >= 20;
                
                return (
                  <motion.div
                    key={pkg.credits}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <motion.button
                      onClick={() => handlePurchase(pkg)}
                      disabled={isPurchasing}
                      className={`w-full p-6 rounded-xl glass-strong text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed relative ${
                        isBestValue ? 'ring-2 ring-purple-400/50' : ''
                      }`}
                      whileHover={!isPurchasing ? { scale: 1.02, y: -2 } : {}}
                      whileTap={!isPurchasing ? { scale: 0.98 } : {}}
                    >
                      {isBestValue && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: index * 0.1 + 0.2 }}
                          className="absolute -top-2 -right-2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xs font-mono font-semibold shadow-lg border-2 border-white/20 z-10"
                        >
                          Best Value
                        </motion.div>
                      )}

                      <div className="flex items-start justify-between mb-4">
                        <div className={isBestValue ? 'pr-20' : ''}>
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-5 h-5 text-purple-400" />
                            <span className="font-mono text-2xl text-white font-semibold">
                              {pkg.credits} Credits
                            </span>
                          </div>
                          <p className="text-white/50 text-sm font-mono">
                            ${perCredit} per generation
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-3xl text-white font-semibold">
                            ${pkg.price.toFixed(2)}
                          </div>
                          {isPurchasing && (
                            <div className="text-xs text-purple-400 font-mono mt-2">
                              Redirecting...
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/10">
                        <p className="text-white/40 text-xs font-mono">
                          {pkg.credits} scene{pkg.credits !== 1 ? 's' : ''} • One-time purchase
                        </p>
                      </div>
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Footer Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 p-6 rounded-xl glass text-center"
          >
            <p className="text-white/40 text-xs font-mono mb-2">
              Secure payment processing via Stripe
            </p>
            <p className="text-white/30 text-xs font-mono">
              Credits never expire • Refunded if generation fails
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

