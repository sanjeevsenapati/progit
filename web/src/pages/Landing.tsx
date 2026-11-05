import React from 'react';
import { GitBranch, Shield, Zap, Terminal, Server, CheckCircle2, Heart, ExternalLink, Award } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col justify-between">
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        {/* Attribution Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>ProGit 1.0 — Production-Ready Self-Hosted Git Hosting</span>
          </div>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-dark-text border border-gray-300 dark:border-dark-border">
            <span>Supported by</span>
            <strong className="text-emerald-600 dark:text-emerald-400 font-bold">PDIH</strong>
            <span className="text-gray-400">•</span>
            <span>Created by</span>
            <strong className="text-gray-900 dark:text-white font-bold">ProGit Team and Sanjeev</strong>
          </div>
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

      {/* Sponsorship, Creator & Open Source Heritage Section */}
      <section className="py-12 bg-gray-50 dark:bg-dark-bg/60 border-t border-gray-200 dark:border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface p-8 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <div className="inline-flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Sponsorship & Backing</span>
                </div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">Supported by PDIH</h4>
                <p className="text-xs text-gray-600 dark:text-dark-muted leading-relaxed">
                  Enterprise-grade infrastructure, DevOps automation, continuous verification, and production backing proudly supported by <strong>PDIH</strong>.
                </p>
              </div>

              <div>
                <div className="inline-flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-2">
                  <Award className="w-3.5 h-3.5" />
                  <span>Lead Creators</span>
                </div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">Created by ProGit Team and Sanjeev</h4>
                <p className="text-xs text-gray-600 dark:text-dark-muted leading-relaxed">
                  Architected and engineered by the <strong>ProGit Team and Sanjeev</strong> as a modern, high-performance, developer-centric self-hosted Git platform.
                </p>
              </div>

              <div>
                <div className="inline-flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
                  <Heart className="w-3.5 h-3.5" />
                  <span>Open Source Heritage</span>
                </div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">Built on Top of Gogs Source Code</h4>
                <p className="text-xs text-gray-600 dark:text-dark-muted leading-relaxed">
                  Credit: This project is built on top of the <strong>Gogs source code</strong>, modernized with pure Go SQLite WAL architecture, native SSH daemon, and a GitHub-grade SPA interface.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-200 dark:border-dark-border text-center text-xs text-gray-500 dark:text-dark-muted space-y-2">
        <p className="font-medium text-gray-700 dark:text-dark-text">
          Supported by <span className="font-bold text-emerald-600 dark:text-emerald-400">PDIH</span> • Created by <span className="font-bold text-gray-900 dark:text-white">ProGit Team and Sanjeev</span>
        </p>
        <p className="text-gray-600 dark:text-dark-muted">
          Credit: This is built on the top of Gogs source code. Released under the MIT License.
        </p>
        <p className="text-[11px] text-gray-400">
          © {new Date().getFullYear()} ProGit Project. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
