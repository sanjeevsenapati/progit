import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/theme';
import { navigate } from '../lib/router';
import { GitBranch, Shield, Server, Database, Lock, Mail, User, AlertCircle, CheckCircle2 } from 'lucide-react';

export const Install: React.FC = () => {
  const { setUser } = useAuth();
  const [appName, setAppName] = useState('ProGit');
  const [domain, setDomain] = useState('localhost');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [httpPort, setHttpPort] = useState(3000);
  const [httpsPort, setHttpsPort] = useState(3443);
  const [rootUrl, setRootUrl] = useState('http://localhost:3000/');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [installLocked, setInstallLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkStatus() {
      try {
        const s = await api.getInstallStatus();
        setInstallLocked(s.install_locked);
        if (s.app_name) setAppName(s.app_name);
        if (s.domain) setDomain(s.domain);
        if (s.protocol && (s.protocol === 'http' || s.protocol === 'https')) {
          setProtocol(s.protocol);
        }
        if (s.http_port) setHttpPort(s.http_port);
        if (s.https_port) setHttpsPort(s.https_port);
        if (s.root_url) setRootUrl(s.root_url);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  const computeRootUrl = (proto: string, dom: string, hPort: number, sPort: number) => {
    if (proto === 'https') {
      if (sPort === 443) return `https://${dom}/`;
      return `https://${dom}:${sPort}/`;
    }
    if (hPort === 80) return `http://${dom}/`;
    return `http://${dom}:${hPort}/`;
  };

  const handleProtocolChange = (newProto: 'http' | 'https') => {
    setProtocol(newProto);
    setRootUrl(computeRootUrl(newProto, domain, httpPort, httpsPort));
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    setDomain(d);
    setRootUrl(computeRootUrl(protocol, d, httpPort, httpsPort));
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = parseInt(e.target.value, 10) || 3000;
    setHttpPort(p);
    setRootUrl(computeRootUrl(protocol, domain, p, httpsPort));
  };

  const handleHttpsPortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const p = parseInt(e.target.value, 10) || 3443;
    setHttpsPort(p);
    setRootUrl(computeRootUrl(protocol, domain, httpPort, p));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (adminPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Admin password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.install({
        app_name: appName,
        domain,
        protocol,
        http_port: httpPort,
        https_port: protocol === 'https' ? httpsPort : undefined,
        root_url: rootUrl,
        admin_username: adminUsername,
        admin_email: adminEmail,
        admin_password: adminPassword,
      });

      setSuccess(true);
      setUser(res.user);
      setTimeout(() => {
        navigate('/admin');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Installation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-24 text-center text-sm text-gray-400">Loading installation configuration...</div>;
  }

  if (installLocked) {
    return (
      <div className="max-w-xl mx-auto my-16 px-4">
        <div className="bg-white dark:bg-dark-surface p-8 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">ProGit Is Already Installed</h2>
          <p className="text-sm text-gray-600 dark:text-dark-muted">
            The installation has already been completed and locked. You can sign in using your Super Administrator account.
          </p>
          <div className="pt-2">
            <a
              href="/login"
              className="inline-block px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition-colors shadow-sm"
            >
              Go to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white mx-auto flex items-center justify-center shadow-md">
          <GitBranch className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          ProGit Initial Setup
        </h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted max-w-lg mx-auto">
          Configure your server settings and initialize the <strong>Super Administrator</strong> account to manage the entire platform.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Installation complete! Redirecting to Administration Dashboard...</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Server Config */}
        <div className="bg-white dark:bg-dark-surface p-6 sm:p-8 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm space-y-5">
          <div className="border-b border-gray-100 dark:border-dark-border pb-3 flex items-center space-x-2">
            <Server className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-base text-gray-900 dark:text-white">Server & Application Settings</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Application Name
              </label>
              <input
                type="text"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Domain Name
              </label>
              <input
                type="text"
                value={domain}
                onChange={handleDomainChange}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Protocol
              </label>
              <select
                value={protocol}
                onChange={e => handleProtocolChange(e.target.value as 'http' | 'https')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
              >
                <option value="http">HTTP (Standard)</option>
                <option value="https">HTTPS (TLS Encrypted)</option>
              </select>
            </div>

            {protocol === 'https' ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  HTTPS Port
                </label>
                <input
                  type="number"
                  value={httpsPort}
                  onChange={handleHttpsPortChange}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  HTTP Port
                </label>
                <input
                  type="number"
                  value={httpPort}
                  onChange={handlePortChange}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Application Root URL
              </label>
              <input
                type="url"
                value={rootUrl}
                onChange={e => setRootUrl(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
              />
              {protocol === 'https' && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center">
                  <Shield className="w-3 h-3 mr-1" />
                  HTTPS enabled: Automatic ECDSA self-signed certificate or Let's Encrypt ACME with HSTS.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Super Admin User Setup */}
        <div className="bg-white dark:bg-dark-surface p-6 sm:p-8 rounded-xl border border-gray-200 dark:border-dark-border shadow-sm space-y-5">
          <div className="border-b border-gray-100 dark:border-dark-border pb-3 flex items-center space-x-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="font-bold text-base text-gray-900 dark:text-white">Super Administrator Account</h2>
              <p className="text-xs text-gray-500 dark:text-dark-muted">
                This account has full control to manage users, repositories, and system telemetry.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Admin Username *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Admin Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Admin Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <span>Installing ProGit...</span>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Complete Installation & Create Super Admin</span>
              </>
            )}
          </button>
        </div>
      </form>

      <div className="text-center text-xs text-gray-500 dark:text-dark-muted space-y-1 pt-4 border-t border-gray-200 dark:border-dark-border/40">
        <p>
          Supported by <span className="font-semibold text-emerald-600 dark:text-emerald-400">Prodevans</span> • Created by <span className="font-semibold text-gray-900 dark:text-white">Sanjeev Senapati</span>
        </p>
        <p className="text-[11px] text-gray-400">
          Credit: Built on top of Gogs source code. Released under the MIT License.
        </p>
      </div>
    </div>
  );
};

