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
  CheckCheck, 
  MessageSquare,
  AlertCircle
} from 'lucide-react';

export const Messages: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Compose Modal State
  const [showCompose, setShowCompose] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState('');

  // Load message list and developers
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
    async function init() {
      try {
        const devs = await api.listDevelopers();
        setDevelopers(devs || []);
      } catch (err) {
        console.error(err);
      }
      
      // Check query params for `?to=username`
      const params = new URLSearchParams(window.location.search);
      const toUser = params.get('to');
      if (toUser) {
        setRecipient(toUser);
        setShowCompose(true);
      }
    }
    init();
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !content.trim()) {
      setComposeError('Please fill in all fields');
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
      setRecipient('');
      setSubject('');
      setContent('');
      showToast('Message sent successfully', 'success');

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
    setRecipient(tab === 'inbox' ? msg.sender_username : msg.recipient_username);
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
            Send private, direct messages and collaborate with other developers on ProGit.
          </p>
        </div>

        <button
          onClick={() => {
            setRecipient('');
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
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg transition-colors ${
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
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg transition-colors ${
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
                placeholder="Search messages..."
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
                      <span className="text-gray-400 font-normal flex-shrink-0">
                        {new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <h4 className={`text-xs truncate ${isUnread ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-dark-text'}`}>
                      {msg.subject}
                    </h4>

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
              <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {activeMessage.subject}
                  </h2>
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

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleReply(activeMessage)}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover text-xs font-semibold text-gray-700 dark:text-dark-text transition-colors cursor-pointer"
                    title="Reply"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>

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
                <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-100 dark:border-dark-border/40">
                  <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm">
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
                Select a message from the list on the left to read its contents, reply, or manage it.
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
                  Send Message to Developer
                </h3>
              </div>
              <button
                onClick={() => setShowCompose(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text p-1"
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
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-dark-text mb-1 uppercase tracking-wider">
                  Recipient Developer *
                </label>
                <div className="relative">
                  <select
                    required
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">-- Choose developer --</option>
                    {developers
                      .filter(d => !user || d.username !== user.username)
                      .map(dev => (
                        <option key={dev.id} value={dev.username}>
                          @{dev.username} {dev.full_name ? `(${dev.full_name})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
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
                  placeholder="Subject of your message..."
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
                  placeholder="Write your message..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  onClick={() => setShowCompose(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-700 dark:text-dark-text hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {sending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
