import React from 'react';
import { GitBranch, Shield, Zap, Terminal, Server, CheckCircle2 } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-between">
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 mb-8">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>ProGit 1.0 — Production-Ready Self-Hosted Git Hosting</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
          Modern Git Collaboration <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
            Self-Hosted & Pain-Free.
          </span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-dark-muted max-w-2xl mx-auto">
          Ultra-lightweight Go backend powered by pure SQLite and native Git. Zero CGO, native SSH server on port 2222, and a premium GitHub-grade developer interface.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/register"
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md transition-all hover:scale-105"
          >
            Get Started Free
          </a>
          <a
            href="/explore"
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-white dark:bg-dark-surface border border-gray-300 dark:border-dark-border text-gray-800 dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-dark-hover shadow-sm transition-all"
          >
            Explore Repositories
          </a>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-16 bg-white dark:bg-dark-surface border-t border-gray-200 dark:border-dark-border transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/50">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Native Git Smart HTTP & SSH</h3>
              <p className="text-sm text-gray-600 dark:text-dark-muted">
                Direct integration with git-upload-pack and git-receive-pack. Built-in Go SSH daemon eliminates OpenSSH dependencies.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/50">
              <div className="w-10 h-10 rounded-lg bg-teal-600/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Zero-Config SQLite WAL</h3>
              <p className="text-sm text-gray-600 dark:text-dark-muted">
                Robust transactional data layer with automatic Write-Ahead Logging and migrations. Zero extra database container required.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg/50">
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Production Podman Deployment</h3>
              <p className="text-sm text-gray-600 dark:text-dark-muted">
                Preconfigured Containerfile, Podman compose, non-root system users, SELinux volume isolation, and automated backup scripts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-gray-200 dark:border-dark-border text-center text-xs text-gray-500 dark:text-dark-muted">
        <p>© 2026 ProGit Project. Released under the MIT License.</p>
      </footer>
    </div>
  );
};

