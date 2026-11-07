import React, { useEffect, useState } from 'react';
import { api, Message, Developer } from '../lib/api';
import { useAuth } from '../lib/theme';
import { showToast, showModalConfirm } from '../components/ModalDialog';
import { 
  Mail, 
  Send, 
  Inbox, 
  Trash2, 
  Reply, 
  Plus, 
  X, 
  Search, 
  MessageSquare,
  AlertCircle,
  Check,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Loader2,
  Clock,
  Ban
} from 'lucide-react';

export const Messages: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagingEnabled, setMessagingEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Compose Modal State
  const [showCompose, setShowCompose] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [selectedDev, setSelectedDev] = useState<Developer | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<Developer[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [hasSearchedUsers, setHasSearchedUsers] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Load message list
  const loadMessages = async () => {
    try {
      setLoading(true);
      const list = tab === 'inbox' 
        ? await api.listInboxMessages() 
        : await api.listSentMessages();
      setMessages(list || []);

      if (list && list.length > 0 && selectedId === null) {
        setSelectedId(list[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getFeatures().then(f => {
      if (f && f.messaging_enabled !== undefined) {
        setMessagingEnabled(f.messaging_enabled);
      }
    }).catch(() => {});

    // Check query params for `?to=username`
    const params = new URLSearchParams(window.location.search);
    const toUser = params.get('to');
    if (toUser) {
      setRecipient(toUser);
      setShowCompose(true);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [tab]);

  // Selected message
  const activeMessage = messages.find(m => m.id === selectedId) || null;

  // Mark message as read when selected
  useEffect(() => {
    if (activeMessage && tab === 'inbox' && !activeMessage.is_read) {
      api.markMessageRead(activeMessage.id).then(() => {
        setMessages(prev => prev.map(m => m.id === activeMessage.id ? { ...m, is_read: true } : m));
      }).catch(err => console.error(err));
    }
  }, [selectedId, tab]);

  // Dynamic user search with debounce
  useEffect(() => {
    const q = userSearchQuery.trim();
    if (!q) {
      setUserSearchResults([]);
      setHasSearchedUsers(false);
      setIsSearchingUsers(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingUsers(true);
        const results = await api.searchDevelopers(q);
        // Exclude current user from search results
        const filtered = (results || []).filter(u => !user || u.username !== user.username);
        setUserSearchResults(filtered);
        setHasSearchedUsers(true);
      } catch (err) {
        console.error('Search developers failed:', err);
        setUserSearchResults([]);
        setHasSearchedUsers(true);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [userSearchQuery, user]);

  const handleSelectDeveloper = (dev: Developer) => {
    setRecipient(dev.username);
    setSelectedDev(dev);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setHasSearchedUsers(false);
    setComposeError('');
  };

  const handleClearRecipient = () => {
    setRecipient('');
    setSelectedDev(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setHasSearchedUsers(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !content.trim()) {
      setComposeError('Please select a recipient and fill in all fields');
      return;
    }

    try {
      setSending(true);
      setComposeError('');
      await api.sendMessage({
        recipient_username: recipient.trim(),
        subject: subject.trim(),
        content: content.trim(),
      });

      setShowCompose(false);
      handleClearRecipient();
      setSubject('');
      setContent('');
      showToast('Message request sent successfully', 'success');

      if (tab === 'sent') {
        await loadMessages();
      } else {
        setTab('sent');
      }
    } catch (err: any) {
      setComposeError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAcceptMessage = async (msgId: number) => {
    try {
      setActionLoading(true);
      const updated = await api.acceptMessage(msgId);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'accepted' } : m));
      showToast('Message request accepted. You can now reply.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to accept message', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectMessage = async (msgId: number) => {
    const confirmed = await showModalConfirm({
      title: 'Decline Message Request',
      message: 'Are you sure you want to decline this message request? The sender will be notified and further messages from them will be blocked.',
      confirmText: 'Decline Request',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await api.rejectMessage(msgId);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'rejected' } : m));
      showToast('Message request declined. Sender has been notified.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to decline message', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    const confirmed = await showModalConfirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDanger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      if (selectedId === msgId) {
        setSelectedId(null);
      }
      showToast('Message deleted', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete message', 'error');
    }
  };

  const handleReply = (msg: Message) => {
    if (msg.status === 'pending') {
      showToast('Please accept the message request before replying.', 'info');
      return;
    }
    if (msg.status === 'rejected') {
      showToast('This message request was declined.', 'error');
      return;
    }

    const replyUser = tab === 'inbox' ? msg.sender_username : msg.recipient_username;
    setRecipient(replyUser);
    setSelectedDev(null);
    setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    setContent(`\n\n--- Original message from @${msg.sender_username} ---\n${msg.content}`);
    setShowCompose(true);
  };

  const filteredMessages = messages.filter(m => {
    const query = searchQuery.toLowerCase();
    const otherUser = tab === 'inbox' ? m.sender_username : m.recipient_username;
    return (
      m.subject.toLowerCase().includes(query) ||
      m.content.toLowerCase().includes(query) ||
      otherUser.toLowerCase().includes(query)
    );
  });

  const unreadCount = messages.filter(m => !m.is_read).length;

  if (!messagingEnabled) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <Mail className="w-12 h-12 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Direct Messaging Disabled</h2>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Direct messaging is currently disabled by administrator configuration on this ProGit server.</p>
        <a
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm"
        >
          Return Home
        </a>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <Mail className="w-12 h-12 text-gray-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Developer Messaging</h2>
        <p className="text-sm text-gray-500 dark:text-dark-muted">Please sign in to access your direct developer messages.</p>
        <a
          href="/login"
          className="inline-block px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm"
        >
          Sign In
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <Mail className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Developer Messages</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-dark-muted mt-1">
            Send private, direct messages and collaborate with other developers on ProGit securely.
          </p>
        </div>

        <button
          onClick={() => {
            handleClearRecipient();
            setSubject('');
            setContent('');
            setShowCompose(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Message</span>
        </button>
      </div>

      {/* Main Mailbox Grid */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-dark-border shadow-sm overflow-hidden min-h-[600px] flex flex-col md:flex-row">
        {/* Left Mailbox Column: Tabs + List */}
        <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-gray-200 dark:border-dark-border flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex items-center border-b border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-hover/30 p-2 gap-2 text-xs font-semibold">
            <button
              onClick={() => {
                setTab('inbox');
                setSelectedId(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                tab === 'inbox'
                  ? 'bg-white dark:bg-dark-surface shadow-xs text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Inbox</span>
              {tab === 'inbox' && unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab('sent');
                setSelectedId(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg transition-colors cursor-pointer ${
                tab === 'sent'
                  ? 'bg-white dark:bg-dark-surface shadow-xs text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-600 dark:text-dark-muted hover:text-gray-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-gray-100 dark:border-dark-border/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border/40 max-h-[500px] md:max-h-[calc(100vh-300px)]">
            {loading ? (
              <div className="py-16 text-center text-xs text-gray-400">Loading messages...</div>
            ) : filteredMessages.length === 0 ? (
              <div className="py-16 text-center space-y-2 px-4">
                <MessageSquare className="w-8 h-8 mx-auto text-gray-300 dark:text-dark-muted" />
                <p className="text-xs font-semibold text-gray-700 dark:text-dark-text">No messages</p>
                <p className="text-[11px] text-gray-400">
                  {tab === 'inbox' ? 'Your inbox is clear.' : 'You have not sent any messages yet.'}
                </p>
              </div>
            ) : (
              filteredMessages.map(msg => {
                const isSelected = msg.id === selectedId;
                const otherUser = tab === 'inbox' ? msg.sender_username : msg.recipient_username;
                const isUnread = tab === 'inbox' && !msg.is_read;
                const status = msg.status || 'pending';

                return (
                  <div
                    key={msg.id}
                    onClick={() => setSelectedId(msg.id)}
                    className={`p-3.5 cursor-pointer transition-colors relative ${
                      isSelected
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-l-4 border-l-emerald-600'
                        : isUnread
                        ? 'bg-white dark:bg-dark-surface font-semibold'
                        : 'bg-white dark:bg-dark-surface opacity-85 hover:bg-gray-50 dark:hover:bg-dark-hover/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center space-x-1.5 truncate">
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0" />
                        )}
                        <span className="font-bold text-gray-900 dark:text-white truncate">
                          {tab === 'inbox' ? `From: @${otherUser}` : `To: @${otherUser}`}
                        </span>
                      </div>
                      <span className="text-gray-400 font-normal flex-shrink-0 text-[10px]">
                        {new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs truncate ${isUnread ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-text'}`}>
                        {msg.subject}
                      </h4>
                      {/* Status indicator pills */}
                      {status === 'pending' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 flex-shrink-0 flex items-center space-x-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{tab === 'inbox' ? 'Request' : 'Pending'}</span>
                        </span>
                      )}
                      {status === 'accepted' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex-shrink-0 flex items-center space-x-0.5">
                          <Check className="w-2.5 h-2.5" />
                          <span>Accepted</span>
                        </span>
                      )}
                      {status === 'rejected' && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 flex-shrink-0 flex items-center space-x-0.5">
                          <Ban className="w-2.5 h-2.5" />
                          <span>Declined</span>
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-400 dark:text-dark-muted truncate mt-0.5">
                      {msg.content}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Message Reader / Detail Pane */}
        <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface">
          {activeMessage ? (
            <div className="flex-1 flex flex-col">
              {/* Header Actions */}
              <div className="p-4 border-b border-gray-200 dark:border-dark-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                      {activeMessage.subject}
                    </h2>
                    {activeMessage.status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{tab === 'inbox' ? 'Request Pending' : 'Pending Recipient Acceptance'}</span>
                      </span>
                    )}
                    {activeMessage.status === 'accepted' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center space-x-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Accepted</span>
                      </span>
                    )}
                    {activeMessage.status === 'rejected' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 flex items-center space-x-1">
                        <Ban className="w-3 h-3" />
                        <span>Declined</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-dark-muted">
                    <span>
                      {tab === 'inbox' ? 'From' : 'To'}:{' '}
                      <strong className="text-gray-800 dark:text-gray-200">
                        @{tab === 'inbox' ? activeMessage.sender_username : activeMessage.recipient_username}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>{new Date(activeMessage.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-auto">
                  {/* Reply button is only active when message is accepted */}
                  {activeMessage.status === 'accepted' ? (
                    <button
                      onClick={() => handleReply(activeMessage)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                  ) : activeMessage.status === 'pending' && tab === 'inbox' ? (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium italic">
                      Accept request below to reply
                    </span>
                  ) : null}

                  <button
                    onClick={() => handleDeleteMessage(activeMessage.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                    title="Delete message"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message Body */}
              <div className="p-6 flex-1 overflow-y-auto">
                {/* Accept / Decline Action Bar for Received Pending Messages */}
                {tab === 'inbox' && activeMessage.status === 'pending' && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 mb-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center space-x-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          Message Request from @{activeMessage.sender_username}
                        </h4>
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                          You must accept this request before you can reply. Declining will notify the sender and prevent future unsolicited messages.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => handleAcceptMessage(activeMessage.id)}
                        disabled={actionLoading}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Request</span>
                      </button>
                      <button
                        onClick={() => handleRejectMessage(activeMessage.id)}
                        disabled={actionLoading}
                        className="px-3.5 py-1.5 rounded-lg border border-red-300 dark:border-red-800/80 bg-white dark:bg-dark-surface hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold text-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sender Avatar & Info */}
                <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-100 dark:border-dark-border/40">
                  <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    {activeMessage.sender_username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                      @{activeMessage.sender_username}
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      To @{activeMessage.recipient_username}
                    </p>
                  </div>
                </div>

                <div className="text-sm text-gray-800 dark:text-dark-text whitespace-pre-wrap leading-relaxed font-sans">
                  {activeMessage.content}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <Mail className="w-12 h-12 text-gray-300 dark:text-dark-muted mb-3" />
              <h3 className="text-sm font-bold text-gray-700 dark:text-dark-text">No message selected</h3>
              <p className="text-xs text-gray-500 dark:text-dark-muted max-w-sm mt-1">
                Select a message from the list on the left to read its contents, accept requests, or reply.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Compose Message Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-xl max-w-lg w-full border border-gray-200 dark:border-dark-border p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2">
                <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">
                  Send Message Request
                </h3>
              </div>
              <button
                onClick={() => setShowCompose(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {composeError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{composeError}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="space-y-4">
              {/* Recipient Search & Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Recipient Developer *
                </label>

                {recipient ? (
                  /* Selected Recipient Card */
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        {recipient.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">@{recipient}</span>
                          {selectedDev?.full_name && (
                            <span className="text-[11px] text-gray-500 dark:text-dark-muted">({selectedDev.full_name})</span>
                          )}
                        </div>
                        {selectedDev?.id && (
                          <span className="text-[10px] text-gray-400">User ID #{selectedDev.id}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearRecipient}
                      className="px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-red-600 dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-dark-hover rounded transition-colors cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  /* Interactive Recipient Search */
                  <div className="relative space-y-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={e => setUserSearchQuery(e.target.value)}
                        placeholder="Search by username or user ID..."
                        autoFocus
                        className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {isSearchingUsers && (
                        <Loader2 className="w-3.5 h-3.5 absolute right-3 top-2.5 text-emerald-600 animate-spin" />
                      )}
                    </div>

                    <p className="text-[10px] text-gray-400 dark:text-dark-muted">
                      Usernames are protected. Search by username or user ID to find a developer.
                    </p>

                    {/* Search Results Dropdown */}
                    {hasSearchedUsers && !isSearchingUsers && userSearchResults.length > 0 && (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-lg divide-y divide-gray-100 dark:divide-dark-border/40">
                        {userSearchResults.map(dev => (
                          <button
                            key={dev.id}
                            type="button"
                            onClick={() => handleSelectDeveloper(dev)}
                            className="w-full text-left p-2.5 hover:bg-emerald-50/50 dark:hover:bg-dark-hover flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                                {dev.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-gray-900 dark:text-white">@{dev.username}</span>
                                {dev.full_name && (
                                  <span className="text-[11px] text-gray-500 dark:text-dark-muted ml-1.5">({dev.full_name})</span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400">ID #{dev.id}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* User Does Not Exist Banner */}
                    {hasSearchedUsers && !isSearchingUsers && userSearchResults.length === 0 && userSearchQuery.trim() !== '' && (
                      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-center space-x-2">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>User does not exist</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject of your message request..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Message Content *
                </label>
                <textarea
                  required
                  rows={5}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Write your message... The receiver will review and accept this request before replying."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !recipient}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {sending ? 'Sending Request...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
