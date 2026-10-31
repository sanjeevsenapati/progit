import React, { useState } from 'react';
import { useAuth, useTheme } from '../lib/theme';
import { 
  GitBranch, 
  Search, 
  Plus, 
  Sun, 
  Moon, 
  LogOut, 
  Settings, 
  User as UserIcon, 
  Shield, 
  Compass, 
  LayoutDashboard,
  CircleDot,
  GitPullRequest,
  Building2
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  return (
    <nav className="border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Brand & Navigation */}
          <div className="flex items-center space-x-6">
            <a href="/" className="flex items-center space-x-2.5 font-bold text-lg text-gray-900 dark:text-white hover:opacity-90">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                <GitBranch className="w-5 h-5" />
              </div>
              <span className="tracking-tight">ProGit</span>
            </a>

            {user && (
              <div className="hidden md:flex items-center space-x-1 text-sm font-medium">
                <a href="/dashboard" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                  <LayoutDashboard className="w-4 h-4 text-gray-500 dark:text-dark-muted" />
                  <span>Dashboard</span>
                </a>
                <a href="/explore" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                  <Compass className="w-4 h-4 text-gray-500 dark:text-dark-muted" />
                  <span>Explore</span>
                </a>
                {user.is_admin && (
                  <a href="/admin" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                    <Shield className="w-4 h-4" />
                    <span>Admin</span>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Center: Search */}
          <div className="hidden lg:flex flex-1 max-w-xs mx-6">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Search className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Type / to search repositories..."
                className="w-full pl-9 pr-3 py-1 text-sm rounded-md bg-gray-100 dark:bg-dark-bg border border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-dark-bg focus:outline-none dark:text-white placeholder-gray-400"
              />
            </div>
          </div>

          {/* Right: Actions & User */}
          <div className="flex items-center space-x-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
            </button>

            {user ? (
              <>
                {/* Create Menu */}
                <div className="relative">
                  <button
                    onClick={() => setCreateMenuOpen(!createMenuOpen)}
                    className="flex items-center space-x-1 p-1.5 rounded-md border border-gray-300 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {createMenuOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-sm z-50"
                      onClick={() => setCreateMenuOpen(false)}
                    >
                      <a href="/new" className="block px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                        New Repository
                      </a>
                      <a href="/org/new" className="block px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                        New Organization
                      </a>
                    </div>
                  )}
                </div>

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center space-x-2 focus:outline-none"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-500/20">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  </button>

                  {userMenuOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-56 rounded-md shadow-lg py-1 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-sm z-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-dark-border">
                        <p className="text-xs text-gray-500 dark:text-dark-muted">Signed in as</p>
                        <p className="font-semibold text-gray-900 dark:text-white truncate">@{user.username}</p>
                      </div>

                      <a href={`/user/${user.username}`} className="flex items-center px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                        <UserIcon className="w-4 h-4 mr-2 text-gray-500" />
                        Your Profile
                      </a>
                      <a href="/settings" className="flex items-center px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                        <Settings className="w-4 h-4 mr-2 text-gray-500" />
                        Settings
                      </a>
                      {user.is_admin && (
                        <a href="/admin" className="flex items-center px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                          <Shield className="w-4 h-4 mr-2 text-emerald-500" />
                          Administration
                        </a>
                      )}
                      <div className="border-t border-gray-100 dark:border-dark-border mt-1 pt-1">
                        <button
                          onClick={logout}
                          className="w-full text-left flex items-center px-4 py-2 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-dark-hover"
                        >
                          <LogOut className="w-4 h-4 mr-2" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2 text-sm font-medium">
                <a href="/login" className="px-3 py-1.5 rounded-md text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                  Sign in
                </a>
                <a href="/register" className="px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
                  Sign up
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

