import React, { useState, useEffect, useRef } from 'react';
import { useAuth, useTheme } from '../lib/theme';
import { api, Repository } from '../lib/api';
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
  Building2,
  Mail,
  Lock,
  Star,
  Loader2,
  X
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Repository[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Focus search with '/' shortcut and close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search queries
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      setSelectedIndex(-1);
      return;
    }

    setSearchLoading(true);
    setSelectedIndex(-1);
    const timer = setTimeout(() => {
      api.searchRepos(trimmed)
        .then(data => {
          setSearchResults(data.repositories || data.data || []);
        })
        .catch(() => {
          setSearchResults([]);
        })
        .finally(() => {
          setSearchLoading(false);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchDropdownRef.current && 
        !searchDropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        const target = searchResults[selectedIndex];
        setSearchOpen(false);
        window.location.href = `/${target.owner_name}/${target.name}`;
      } else if (searchQuery.trim()) {
        setSearchOpen(false);
        if (window.location.pathname === '/explore') {
          window.location.search = `?q=${encodeURIComponent(searchQuery.trim())}`;
        } else {
          window.location.href = `/explore?q=${encodeURIComponent(searchQuery.trim())}`;
        }
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    const fetchUnread = () => {
      api.getUnreadMessageCount().then(data => {
        setUnreadCount(data?.unread_count || 0);
      }).catch(() => {});
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 30000);
    return () => clearInterval(timer);
  }, [user]);

  return (
    <nav className="border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface sticky top-0 z-50 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Brand & Navigation */}
          <div className="flex items-center space-x-3 sm:space-x-6 flex-shrink-0">
            <a href="/" className="flex items-center space-x-2.5 font-bold text-lg text-gray-900 dark:text-white hover:opacity-90 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                <GitBranch className="w-5 h-5" />
              </div>
              <span className="tracking-tight hidden xs:inline">ProGit</span>
            </a>

            <div className="hidden md:flex items-center space-x-1 text-sm font-medium">
              {user && (
                <a href="/dashboard" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                  <LayoutDashboard className="w-4 h-4 text-gray-500 dark:text-dark-muted" />
                  <span>Dashboard</span>
                </a>
              )}
              <a href="/explore" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover">
                <Compass className="w-4 h-4 text-gray-500 dark:text-dark-muted" />
                <span>Explore</span>
              </a>
              {user?.is_admin && (
                <a href="/admin" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                  <Shield className="w-4 h-4" />
                  <span>Admin</span>
                </a>
              )}
            </div>
          </div>

          {/* Center: Search */}
          <div className="flex flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-2 sm:mx-6 relative">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                {searchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchQuery.trim()) setSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Type / to search repositories..."
                className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-dark-bg border border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-dark-bg focus:outline-none dark:text-white placeholder-gray-400 shadow-inner transition-all"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchOpen(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-dark-hover rounded border border-gray-300 dark:border-dark-border">
                    /
                  </kbd>
                </div>
              )}
            </div>

            {/* Search Dropdown */}
            {searchOpen && searchQuery.trim() && (
              <div
                ref={searchDropdownRef}
                className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-2xl z-50 text-xs overflow-hidden divide-y divide-gray-100 dark:divide-dark-border"
              >
                {searchLoading && searchResults.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Searching repositories...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-dark-border/40">
                    {searchResults.slice(0, 8).map((repo, idx) => (
                      <a
                        key={repo.id}
                        href={`/${repo.owner_name}/${repo.name}`}
                        className={`flex items-start justify-between px-3.5 py-2.5 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors ${
                          selectedIndex === idx ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : ''
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          setSearchOpen(false);
                          window.location.href = `/${repo.owner_name}/${repo.name}`;
                        }}
                      >
                        <div className="flex items-start space-x-2.5 min-w-0 pr-2">
                          <div className="mt-0.5 w-5 h-5 rounded-md bg-gray-100 dark:bg-dark-bg flex items-center justify-center text-gray-500 dark:text-dark-muted flex-shrink-0">
                            {repo.is_private ? <Lock className="w-3 h-3 text-amber-500" /> : <GitBranch className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-gray-500 dark:text-dark-muted font-normal">{repo.owner_name} /</span>
                              <span className="font-bold text-gray-900 dark:text-white truncate">{repo.name}</span>
                              {repo.is_private && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full border border-amber-500/30 text-amber-500 bg-amber-500/10">
                                  Private
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-gray-500 dark:text-dark-muted truncate mt-0.5 max-w-xs">
                                {repo.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-1 text-gray-400 text-[11px] flex-shrink-0 pt-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{repo.num_stars}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-gray-500 dark:text-dark-muted">
                    No repositories found matching "<span className="font-semibold text-gray-800 dark:text-white">{searchQuery}</span>"
                  </div>
                )}

                <a
                  href={`/explore?q=${encodeURIComponent(searchQuery.trim())}`}
                  className="block px-3.5 py-2.5 text-center text-emerald-600 dark:text-emerald-400 hover:bg-gray-50 dark:hover:bg-dark-hover font-semibold transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchOpen(false);
                    if (window.location.pathname === '/explore') {
                      window.location.search = `?q=${encodeURIComponent(searchQuery.trim())}`;
                    } else {
                      window.location.href = `/explore?q=${encodeURIComponent(searchQuery.trim())}`;
                    }
                  }}
                >
                  Search all repositories for "{searchQuery}" &rarr;
                </a>
              </div>
            )}
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

            {user && (
              <a
                href="/messages"
                className="relative p-2 rounded-lg text-gray-500 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="Messages"
              >
                <Mail className="w-4 h-4 text-gray-600 dark:text-dark-muted" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-600 rounded-full ring-2 ring-white dark:ring-dark-surface" />
                )}
              </a>
            )}

            {user ? (
              <>
                {/* Create Menu */}
                <div className="relative">
                  <button
                    onClick={() => setCreateMenuOpen(!createMenuOpen)}
                    className="flex items-center space-x-1 p-1.5 rounded-md border border-gray-300 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-700 dark:text-dark-text text-sm font-medium cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {createMenuOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-52 rounded-xl shadow-2xl py-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs z-50 divide-y divide-gray-100 dark:divide-dark-border/40 overflow-hidden"
                      onClick={() => setCreateMenuOpen(false)}
                    >
                      <div className="py-1">
                        <a href="/new" className="flex items-center space-x-2.5 px-3.5 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors">
                          <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>New Repository</span>
                        </a>
                        <a href="/org/new" className="flex items-center space-x-2.5 px-3.5 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-emerald-600 dark:hover:text-emerald-400 font-medium transition-colors">
                          <Building2 className="w-4 h-4 text-blue-500" />
                          <span>New Organization</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* User Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center space-x-2 focus:outline-none cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-500/20">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                  </button>

                  {userMenuOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl py-1.5 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs z-50 divide-y divide-gray-100 dark:divide-dark-border/40 overflow-hidden"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-dark-hover/30">
                        <p className="text-[11px] text-gray-500 dark:text-dark-muted">Signed in as</p>
                        <p className="font-bold text-gray-900 dark:text-white truncate text-xs">@{user.username}</p>
                      </div>

                      <div className="py-1">
                        <a href={`/user/${user.username}`} className="flex items-center px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                          <UserIcon className="w-4 h-4 mr-2.5 text-gray-400" />
                          <span>Your Profile</span>
                        </a>
                        <a href="/messages" className="flex items-center justify-between px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 mr-2.5 text-gray-400" />
                            <span>Messages</span>
                          </div>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                              {unreadCount}
                            </span>
                          )}
                        </a>
                        <a href="/settings" className="flex items-center px-4 py-2 text-gray-700 dark:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-hover hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                          <Settings className="w-4 h-4 mr-2.5 text-gray-400" />
                          <span>Settings</span>
                        </a>
                        {user.is_admin && (
                          <a href="/admin" className="flex items-center px-4 py-2 text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                            <Shield className="w-4 h-4 mr-2.5" />
                            <span>Administration</span>
                          </a>
                        )}
                      </div>

                      <div className="py-1">
                        <button
                          onClick={logout}
                          className="w-full text-left flex items-center px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 mr-2.5" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <a
                  href="/login"
                  className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-dark-text hover:text-gray-900 dark:hover:text-white"
                >
                  Sign in
                </a>
                <a
                  href="/register"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
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
