import React, { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Reset your password</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-muted">
            Enter your registered email address and we'll send reset instructions.
          </p>
        </div>

        <div className="bg-white dark:bg-dark-surface p-8 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">
          {submitted ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">Check your email</h3>
              <p className="text-sm text-gray-600 dark:text-dark-muted">
                If an account exists with <span className="font-semibold text-emerald-600 dark:text-emerald-400">{email}</span>, a password reset link has been dispatched.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    placeholder="alex@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-colors"
              >
                Send Password Reset Email
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-dark-border text-center">
            <a href="/login" className="inline-flex items-center text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

