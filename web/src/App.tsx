import React, { useEffect, useState } from 'react';
import { useAuth } from './lib/theme';
import { Navbar } from './components/Navbar';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ForgotPassword } from './pages/ForgotPassword';
import { Dashboard } from './pages/Dashboard';
import { Explore } from './pages/Explore';
import { NewRepo } from './pages/NewRepo';
import { RepoCode } from './pages/RepoCode';
import { FileView } from './pages/FileView';
import { FileEditor } from './pages/FileEditor';
import { UploadFiles } from './pages/UploadFiles';
import { Commits } from './pages/Commits';
import { CommitDetail } from './pages/CommitDetail';
import { Branches } from './pages/Branches';
import { Tags } from './pages/Tags';
import { IssuesList } from './pages/IssuesList';
import { NewIssue } from './pages/NewIssue';
import { IssueDetail } from './pages/IssueDetail';
import { PullsList } from './pages/PullsList';
import { CompareBranches } from './pages/CompareBranches';
import { PullDetail } from './pages/PullDetail';
import { UserSettings } from './pages/UserSettings';
import { RepoSettings } from './pages/RepoSettings';
import { Wiki } from './pages/Wiki';
import { PagesSettings } from './pages/PagesSettings';
import { AdminDashboard } from './pages/AdminDashboard';
import { UserProfile } from './pages/UserProfile';
import { Install } from './pages/Install';

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg text-gray-400">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-semibold">Connecting to ProGit...</p>
        </div>
      </div>
    );
  }

  const renderRoute = () => {
    const path = currentPath;

    if (path === '/') {
      return user ? <Dashboard /> : <Landing />;
    }
    if (path === '/login') return <Login />;
    if (path === '/register') return <Register />;
    if (path === '/forgot-password') return <ForgotPassword />;
    if (path === '/dashboard') return <Dashboard />;
    if (path === '/explore') return <Explore />;
    if (path === '/new') return <NewRepo />;
    if (path === '/settings') return <UserSettings />;
    if (path === '/admin') return <AdminDashboard />;
    if (path === '/install') return <Install />;

    // User Profile: /user/:username
    if (path.startsWith('/user/')) {
      const username = path.split('/')[2];
      return <UserProfile username={username} />;
    }

    // Repository Routes: /:owner/:repo/...
    const segments = path.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const owner = segments[0];
      const repo = segments[1];

      // Exact repo root: /:owner/:repo
      if (segments.length === 2) {
        return <RepoCode owner={owner} repo={repo} />;
      }

      const subAction = segments[2];

      if (subAction === 'tree') {
        const branch = segments[3] || 'main';
        const initialPath = segments.slice(4).join('/');
        return <RepoCode owner={owner} repo={repo} initialPath={initialPath} />;
      }

      if (subAction === 'blob') {
        const branch = segments[3] || 'main';
        const filePath = segments.slice(4).join('/');
        return <FileView owner={owner} repo={repo} branch={branch} filePath={filePath} />;
      }

      if (subAction === 'new') {
        const branch = segments[3] || 'main';
        const initialDirectory = segments.slice(4).join('/');
        return <FileEditor owner={owner} repo={repo} branch={branch} initialDirectory={initialDirectory} mode="new" />;
      }

      if (subAction === 'edit') {
        const branch = segments[3] || 'main';
        const filePath = segments.slice(4).join('/');
        return <FileEditor owner={owner} repo={repo} branch={branch} filePath={filePath} mode="edit" />;
      }

      if (subAction === 'upload') {
        const branch = segments[3] || 'main';
        const initialPath = segments.slice(4).join('/');
        return <UploadFiles owner={owner} repo={repo} branch={branch} initialPath={initialPath} />;
      }

      if (subAction === 'commits') {
        return <Commits owner={owner} repo={repo} />;
      }

      if (subAction === 'commit' && segments.length >= 4) {
        return <CommitDetail owner={owner} repo={repo} sha={segments[3]} />;
      }

      if (subAction === 'branches') {
        return <Branches owner={owner} repo={repo} />;
      }

      if (subAction === 'tags') {
        return <Tags owner={owner} repo={repo} />;
      }

      if (subAction === 'issues') {
        if (segments[3] === 'new') {
          return <NewIssue owner={owner} repo={repo} />;
        }
        if (segments[3]) {
          return <IssueDetail owner={owner} repo={repo} index={parseInt(segments[3], 10)} />;
        }
        return <IssuesList owner={owner} repo={repo} />;
      }

      if (subAction === 'pulls') {
        if (segments[3]) {
          return <PullDetail owner={owner} repo={repo} index={parseInt(segments[3], 10)} />;
        }
        return <PullsList owner={owner} repo={repo} />;
      }

      if (subAction === 'compare') {
        return <CompareBranches owner={owner} repo={repo} />;
      }

      if (subAction === 'wiki') {
        const slug = segments.slice(3).join('/') || 'Home';
        return <Wiki owner={owner} repo={repo} initialSlug={slug} />;
      }

      if (subAction === 'pages') {
        return <PagesSettings owner={owner} repo={repo} />;
      }

      if (subAction === 'settings') {
        return <RepoSettings owner={owner} repo={repo} />;
      }
    }

    // 404 Not Found fallback
    return (
      <div className="py-24 text-center space-y-3">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">404</h1>
        <p className="text-sm text-gray-500 dark:text-dark-muted">The requested page does not exist.</p>
        <a href="/" className="inline-block text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
          Return to Homepage
        </a>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-dark-text flex flex-col">
      <Navbar />
      <main className="flex-1">{renderRoute()}</main>
    </div>
  );
};

