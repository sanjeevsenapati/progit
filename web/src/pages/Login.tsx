import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/theme';
import { navigate } from '../lib/router';
import { GitBranch, Lock, User, AlertCircle, KeyRound, Globe } from 'lucide-react';

interface AuthProviders {
  local?: boolean;
  oidc?: {
    enabled: boolean;
    provider: string;
    display_name: string;
  };
}

export const Login: React.FC = () => {
  const { setUser } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<AuthProviders>({});

  useEffect(() => {
    // Check error query parameter
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('error');
    if (errCode === 'domain_not_allowed') {
      setError('Your email domain is not authorized. Please sign in with an authorized corporate email.');
    } else if (errCode === 'invalid_state') {
      setError('OIDC authentication expired or state mismatch. Please try signing in again.');
    } else if (errCode === 'account_suspended') {
      setError('Your user account has been suspended by an administrator.');
    } else if (errCode === 'oidc_disabled') {
      setError('OpenID Connect (OIDC) SSO is currently disabled on this server.');
    } else if (errCode === 'provision_failed') {
      setError('Failed to auto-provision account from OIDC identity provider.');
    }

    // Fetch enabled auth providers
    fetch('/api/v1/auth/providers')
      .then(res => (res.ok ? res.json() : {}))
      .then(data => setProviders(data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login({ username, password });
      setUser(res.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const renderOIDCButton = () => {
    if (!providers.oidc?.enabled) return null;

    const providerType = (providers.oidc.provider || 'google').toLowerCase();
    const displayName = providers.oidc.display_name || 'Sign in with Single Sign-On';

    return (
      <div className="space-y-4">
        <a
          href="/api/v1/auth/oidc/login"
          className="w-full flex items-center justify-center space-x-3 py-2.5 px-4 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg hover:bg-gray-50 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text font-semibold text-sm transition-all shadow-xs"
        >
          {providerType === 'google' ? (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          ) : providerType === 'github' ? (
            <svg className="w-4 h-4 flex-shrink-0 fill-current text-gray-900 dark:text-white" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          ) : providerType === 'microsoft' ? (
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
          ) : (
            <KeyRound className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{displayName}</span>
        </a>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200 dark:border-dark-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-dark-surface px-2 text-gray-500 dark:text-dark-muted font-medium">
              Or sign in with password
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white mx-auto flex items-center justify-center shadow-md mb-4">
            <GitBranch className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in to ProGit</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-muted">
            Self-hosted developer collaboration platform
          </p>
        </div>

        <div className="bg-white dark:bg-dark-surface p-8 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* OIDC / OAuth2 Single Sign-On Button */}
          {renderOIDCButton()}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Username or Corporate Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="e.g. dev or dev@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text uppercase tracking-wider">
                  Password
                </label>
                <a href="/forgot-password" className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors mt-2"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="p-4 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-center text-sm">
          <span className="text-gray-600 dark:text-dark-muted">New to ProGit? </span>
          <a href="/register" className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            Create an account
          </a>
        </div>
      </div>
    </div>
  );
};


