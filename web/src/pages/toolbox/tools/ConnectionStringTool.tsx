import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Import, Plus, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

type DbEngine = 'postgresql' | 'mysql' | 'mariadb' | 'sqlserver' | 'oracle' | 'sqlite' | 'mongodb' | 'redis';

interface EnginePreset {
  id: DbEngine;
  label: string;
  defaultPort: string;
  defaultUser: string;
  defaultDb: string;
}

const ENGINE_PRESETS: EnginePreset[] = [
  { id: 'postgresql', label: 'PostgreSQL', defaultPort: '5432', defaultUser: 'postgres', defaultDb: 'progit' },
  { id: 'mysql', label: 'MySQL', defaultPort: '3306', defaultUser: 'root', defaultDb: 'progit' },
  { id: 'mariadb', label: 'MariaDB', defaultPort: '3306', defaultUser: 'root', defaultDb: 'progit' },
  { id: 'sqlserver', label: 'SQL Server (MSSQL)', defaultPort: '1433', defaultUser: 'sa', defaultDb: 'progit' },
  { id: 'oracle', label: 'Oracle Database', defaultPort: '1521', defaultUser: 'system', defaultDb: 'ORCLPDB1' },
  { id: 'sqlite', label: 'SQLite', defaultPort: '', defaultUser: '', defaultDb: '/data/db/progit.db' },
  { id: 'mongodb', label: 'MongoDB', defaultPort: '27017', defaultUser: 'admin', defaultDb: 'progit' },
  { id: 'redis', label: 'Redis', defaultPort: '6379', defaultUser: 'default', defaultDb: '0' },
];

interface ParamRow {
  key: string;
  value: string;
}

export const ConnectionStringTool: React.FC = () => {
  const [engine, setEngine] = useState<DbEngine>('postgresql');
  const [host, setHost] = useState('db.internal.local');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('progit');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('S3cur3#Pass!');
  const [showPassword, setShowPassword] = useState(false);
  const [maskOutputPassword, setMaskOutputPassword] = useState(false);
  const [sslMode, setSslMode] = useState<'disable' | 'prefer' | 'require' | 'verify-full'>('require');
  const [timeoutSec, setTimeoutSec] = useState('10');
  const [params, setParams] = useState<ParamRow[]>([{ key: 'application_name', value: 'progit' }]);
  const [parseInput, setParseInput] = useState('');
  const [parseMessage, setParseMessage] = useState<string | null>(null);

  const handleEngineChange = (next: string) => {
    const id = next as DbEngine;
    const preset = ENGINE_PRESETS.find(e => e.id === id);
    setEngine(id);
    if (preset) {
      setPort(preset.defaultPort);
      setUsername(preset.defaultUser);
      setDatabase(preset.defaultDb);
      if (id === 'sqlite') {
        setHost('');
        setPassword('');
      } else if (!host) {
        setHost('localhost');
      }
    }
  };

  const handleParseUri = () => {
    const raw = parseInput.trim();
    if (!raw) return;
    try {
      const normalized = raw.replace(/^jdbc:/i, '');
      const u = new URL(normalized);
      const scheme = u.protocol.replace(':', '').toLowerCase();
      if (scheme.startsWith('postgres')) setEngine('postgresql');
      else if (scheme === 'mysql') setEngine('mysql');
      else if (scheme === 'mariadb') setEngine('mariadb');
      else if (scheme === 'sqlserver' || scheme === 'mssql') setEngine('sqlserver');
      else if (scheme === 'oracle') setEngine('oracle');
      else if (scheme === 'sqlite' || scheme === 'file') setEngine('sqlite');
      else if (scheme.startsWith('mongodb')) setEngine('mongodb');
      else if (scheme.startsWith('redis')) setEngine('redis');

      if (u.hostname) setHost(u.hostname);
      if (u.port) setPort(u.port);
      if (u.username) setUsername(decodeURIComponent(u.username));
      if (u.password) setPassword(decodeURIComponent(u.password));
      if (u.pathname && u.pathname !== '/') {
        setDatabase(scheme === 'sqlite' ? u.pathname : u.pathname.replace(/^\//, ''));
      }
      const nextParams: ParamRow[] = [];
      u.searchParams.forEach((v, k) => {
        if (k.toLowerCase() === 'sslmode' && ['disable', 'prefer', 'require', 'verify-full'].includes(v)) {
          setSslMode(v as typeof sslMode);
        } else {
          nextParams.push({ key: k, value: v });
        }
      });
      setParams(nextParams);
      setParseMessage('Parsed connection string into form fields.');
    } catch {
      setParseMessage('Could not parse URI. Expected standard format like postgresql://user:pass@host:5432/db.');
    }
  };

  const outputs = useMemo(() => {
    const pwdDisplay = maskOutputPassword && password ? '********' : password;
    const encUser = username ? encodeURIComponent(username) : '';
    const encPass = pwdDisplay ? (maskOutputPassword ? '********' : encodeURIComponent(pwdDisplay)) : '';
    const authPart = encUser ? (encPass ? `${encUser}:${encPass}@` : `${encUser}@`) : '';
    const hostPort = port ? `${host || 'localhost'}:${port}` : host || 'localhost';

    const queryPairs: [string, string][] = [];
    if (engine === 'postgresql') {
      if (sslMode) queryPairs.push(['sslmode', sslMode]);
      if (timeoutSec) queryPairs.push(['connect_timeout', timeoutSec]);
    } else if (engine === 'mysql' || engine === 'mariadb') {
      if (sslMode !== 'disable') queryPairs.push(['ssl-mode', sslMode === 'verify-full' ? 'VERIFY_IDENTITY' : 'REQUIRED']);
      if (timeoutSec) queryPairs.push(['connectTimeout', `${Number(timeoutSec) * 1000}`]);
    } else if (engine === 'mongodb') {
      if (sslMode !== 'disable') queryPairs.push(['tls', 'true']);
      if (timeoutSec) queryPairs.push(['connectTimeoutMS', `${Number(timeoutSec) * 1000}`]);
    } else if (engine === 'sqlserver') {
      queryPairs.push(['encrypt', sslMode === 'disable' ? 'false' : 'true']);
      if (timeoutSec) queryPairs.push(['connection timeout', timeoutSec]);
    }

    for (const p of params) {
      if (p.key.trim()) queryPairs.push([p.key.trim(), p.value.trim()]);
    }

    const qs = queryPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const qSuffix = qs ? `?${qs}` : '';

    let uri = '';
    let jdbc = '';
    let altLabel = 'Native / Driver DSN';
    let altDsn = '';

    if (engine === 'postgresql') {
      uri = `postgresql://${authPart}${hostPort}/${database}${qSuffix}`;
      jdbc = `jdbc:postgresql://${hostPort}/${database}${qSuffix}`;
      altLabel = 'libpq Key-Value DSN';
      altDsn = `host=${host || 'localhost'} port=${port || '5432'} dbname=${database} user=${username} password=${pwdDisplay} sslmode=${sslMode}`;
    } else if (engine === 'mysql') {
      uri = `mysql://${authPart}${hostPort}/${database}${qSuffix}`;
      jdbc = `jdbc:mysql://${hostPort}/${database}${qSuffix}`;
      altLabel = 'Go go-sql-driver/mysql DSN';
      altDsn = `${username}:${pwdDisplay}@tcp(${hostPort})/${database}?parseTime=true${sslMode !== 'disable' ? '&tls=true' : ''}`;
    } else if (engine === 'mariadb') {
      uri = `mariadb://${authPart}${hostPort}/${database}${qSuffix}`;
      jdbc = `jdbc:mariadb://${hostPort}/${database}${qSuffix}`;
      altLabel = 'Go / C MariaDB DSN';
      altDsn = `${username}:${pwdDisplay}@tcp(${hostPort})/${database}?parseTime=true`;
    } else if (engine === 'sqlserver') {
      uri = `sqlserver://${authPart}${hostPort}?database=${encodeURIComponent(database)}${qs ? '&' + qs : ''}`;
      jdbc = `jdbc:sqlserver://${hostPort};databaseName=${database};encrypt=${sslMode !== 'disable' ? 'true' : 'false'};trustServerCertificate=${sslMode === 'require' ? 'true' : 'false'}`;
      altLabel = '.NET ADO.NET Connection String';
      altDsn = `Server=${host || 'localhost'},${port || '1433'};Database=${database};User Id=${username};Password=${pwdDisplay};Encrypt=${sslMode !== 'disable' ? 'True' : 'False'};`;
    } else if (engine === 'oracle') {
      uri = `oracle://${authPart}${hostPort}/${database}${qSuffix}`;
      jdbc = `jdbc:oracle:thin:@//${hostPort}/${database}`;
      altLabel = 'Oracle Easy Connect';
      altDsn = `${username}/${pwdDisplay}@//${hostPort}/${database}`;
    } else if (engine === 'sqlite') {
      const dbPath = database || './progit.db';
      uri = `sqlite:///${dbPath.replace(/^\//, '')}${qSuffix}`;
      jdbc = `jdbc:sqlite:${dbPath}`;
      altLabel = 'SQLite File URI';
      altDsn = `file:${dbPath}?_journal_mode=WAL&_busy_timeout=${Number(timeoutSec || '5') * 1000}`;
    } else if (engine === 'mongodb') {
      uri = `mongodb://${authPart}${hostPort}/${database}${qSuffix}`;
      jdbc = `N/A (Use MongoDB Java Driver URI: ${uri})`;
      altLabel = 'MongoDB SRV (Atlas)';
      altDsn = `mongodb+srv://${authPart}${host || 'cluster0.example.mongodb.net'}/${database}?retryWrites=true&w=majority`;
    } else {
      const scheme = sslMode !== 'disable' ? 'rediss' : 'redis';
      uri = `${scheme}://${authPart}${hostPort}/${database || '0'}${qSuffix}`;
      jdbc = `N/A (Use Jedis / Lettuce URI: ${uri})`;
      altLabel = 'redis-cli Command';
      altDsn = `redis-cli -u "${uri}"`;
    }

    const envSnippet = `DATABASE_URL="${uri}"`;
    return { uri, jdbc, altLabel, altDsn, envSnippet };
  }, [engine, host, port, database, username, password, maskOutputPassword, sslMode, timeoutSec, params]);

  return (
    <div className="space-y-5">
      {/* Reverse Parser Bar */}
      <div className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-bg space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={parseInput}
            onChange={e => setParseInput(e.target.value)}
            placeholder="Paste existing URI to parse into fields (e.g. postgresql://user:pass@host:5432/mydb?sslmode=require)"
            className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleParseUri}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer flex-shrink-0"
          >
            <Import className="w-3.5 h-3.5" />
            <span>Parse URI</span>
          </button>
        </div>
        {parseMessage && <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">{parseMessage}</p>}
      </div>

      {/* Form Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Database Engine</label>
          <ThemedSelect
            value={engine}
            onChange={handleEngineChange}
            options={ENGINE_PRESETS.map(e => ({ value: e.id, label: e.label }))}
          />
        </div>

        {engine !== 'sqlite' && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Host / Endpoint</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="localhost"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Port</label>
              <input
                type="text"
                value={port}
                onChange={e => setPort(e.target.value)}
                placeholder="5432"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            {engine === 'sqlite' ? 'Database File Path' : engine === 'oracle' ? 'Service Name' : engine === 'redis' ? 'DB Index' : 'Database Name'}
          </label>
          <input
            type="text"
            value={database}
            onChange={e => setDatabase(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {engine !== 'sqlite' && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Password (auto URL-encoded)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-700 dark:hover:text-white cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">SSL / TLS Mode</label>
              <ThemedSelect
                value={sslMode}
                onChange={v => setSslMode(v as typeof sslMode)}
                options={[
                  { value: 'disable', label: 'Disable (Plaintext)' },
                  { value: 'prefer', label: 'Prefer TLS' },
                  { value: 'require', label: 'Require TLS' },
                  { value: 'verify-full', label: 'Verify Full CA + Host' },
                ]}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Connect Timeout (sec)</label>
              <input
                type="number"
                min="1"
                value={timeoutSec}
                onChange={e => setTimeoutSec(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Custom Parameters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Extra Query Parameters</span>
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-1.5 text-xs font-medium text-gray-700 dark:text-dark-text cursor-pointer">
              <input
                type="checkbox"
                checked={maskOutputPassword}
                onChange={e => setMaskOutputPassword(e.target.checked)}
                className="accent-emerald-600"
              />
              <span>Mask password in output</span>
            </label>
            <button
              type="button"
              onClick={() => setParams([...params, { key: '', value: '' }])}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Param</span>
            </button>
          </div>
        </div>
        {params.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={p.key}
              onChange={e => setParams(params.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row)))}
              placeholder="key (e.g. pool_max_conns)"
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
            <input
              type="text"
              value={p.value}
              onChange={e => setParams(params.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))}
              placeholder="value"
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setParams(params.filter((_, i) => i !== idx))}
              className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Generated Outputs */}
      <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-dark-border">
        {[
          { label: 'Standard Connection URI', value: outputs.uri },
          { label: 'JDBC URL', value: outputs.jdbc },
          { label: outputs.altLabel, value: outputs.altDsn },
          { label: '.env Variable', value: outputs.envSnippet },
        ].map(item => (
          <div key={item.label} className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-bg space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">{item.label}</span>
              <CopyButton value={item.value} />
            </div>
            <div className="font-mono text-xs text-emerald-700 dark:text-emerald-300 break-all select-all">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConnectionStringTool;
