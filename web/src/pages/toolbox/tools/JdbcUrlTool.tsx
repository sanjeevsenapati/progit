import React, { useMemo, useState } from 'react';
import { Coffee, Plus, Trash2 } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

type JdbcVendor =
  | 'postgresql'
  | 'mysql'
  | 'mariadb'
  | 'oracle-service'
  | 'oracle-sid'
  | 'sqlserver'
  | 'h2-mem'
  | 'h2-file'
  | 'sqlite'
  | 'db2';

interface VendorSpec {
  id: JdbcVendor;
  label: string;
  defaultPort: string;
  defaultDb: string;
  driverClass: string;
  maven: { groupId: string; artifactId: string; version: string };
}

const JDBC_VENDORS: VendorSpec[] = [
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    defaultPort: '5432',
    defaultDb: 'progit',
    driverClass: 'org.postgresql.Driver',
    maven: { groupId: 'org.postgresql', artifactId: 'postgresql', version: '42.7.4' },
  },
  {
    id: 'mysql',
    label: 'MySQL 8+ (Connector/J)',
    defaultPort: '3306',
    defaultDb: 'progit',
    driverClass: 'com.mysql.cj.jdbc.Driver',
    maven: { groupId: 'com.mysql', artifactId: 'mysql-connector-j', version: '9.1.0' },
  },
  {
    id: 'mariadb',
    label: 'MariaDB',
    defaultPort: '3306',
    defaultDb: 'progit',
    driverClass: 'org.mariadb.jdbc.Driver',
    maven: { groupId: 'org.mariadb.jdbc', artifactId: 'mariadb-java-client', version: '3.5.0' },
  },
  {
    id: 'oracle-service',
    label: 'Oracle Thin (Service Name)',
    defaultPort: '1521',
    defaultDb: 'ORCLPDB1',
    driverClass: 'oracle.jdbc.OracleDriver',
    maven: { groupId: 'com.oracle.database.jdbc', artifactId: 'ojdbc11', version: '23.5.0.24.07' },
  },
  {
    id: 'oracle-sid',
    label: 'Oracle Thin (SID)',
    defaultPort: '1521',
    defaultDb: 'ORCL',
    driverClass: 'oracle.jdbc.OracleDriver',
    maven: { groupId: 'com.oracle.database.jdbc', artifactId: 'ojdbc11', version: '23.5.0.24.07' },
  },
  {
    id: 'sqlserver',
    label: 'Microsoft SQL Server',
    defaultPort: '1433',
    defaultDb: 'progit',
    driverClass: 'com.microsoft.sqlserver.jdbc.SQLServerDriver',
    maven: { groupId: 'com.microsoft.sqlserver', artifactId: 'mssql-jdbc', version: '12.8.1.jre11' },
  },
  {
    id: 'h2-mem',
    label: 'H2 Database (In-Memory)',
    defaultPort: '',
    defaultDb: 'testdb',
    driverClass: 'org.h2.Driver',
    maven: { groupId: 'com.h2database', artifactId: 'h2', version: '2.3.232' },
  },
  {
    id: 'h2-file',
    label: 'H2 Database (Embedded File)',
    defaultPort: '',
    defaultDb: './data/progit',
    driverClass: 'org.h2.Driver',
    maven: { groupId: 'com.h2database', artifactId: 'h2', version: '2.3.232' },
  },
  {
    id: 'sqlite',
    label: 'SQLite (Xerial JDBC)',
    defaultPort: '',
    defaultDb: '/data/db/progit.db',
    driverClass: 'org.sqlite.JDBC',
    maven: { groupId: 'org.xerial', artifactId: 'sqlite-jdbc', version: '3.47.0.0' },
  },
  {
    id: 'db2',
    label: 'IBM DB2',
    defaultPort: '50000',
    defaultDb: 'PROGIT',
    driverClass: 'com.ibm.db2.jcc.DB2Driver',
    maven: { groupId: 'com.ibm.db2', artifactId: 'jcc', version: '11.5.9.0' },
  },
];

export const JdbcUrlTool: React.FC = () => {
  const [vendor, setVendor] = useState<JdbcVendor>('postgresql');
  const [host, setHost] = useState('db.company.local');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('progit');
  const [schema, setSchema] = useState('public');
  const [username, setUsername] = useState('app_user');
  const [useSsl, setUseSsl] = useState(true);
  const [serverTimezone, setServerTimezone] = useState('UTC');
  const [extraProps, setExtraProps] = useState<{ key: string; value: string }[]>([
    { key: 'ApplicationName', value: 'progit-service' },
  ]);
  const [snippetTab, setSnippetTab] = useState<'spring-props' | 'spring-yml' | 'java' | 'maven' | 'gradle'>('spring-props');

  const spec = JDBC_VENDORS.find(v => v.id === vendor) || JDBC_VENDORS[0];
  const isEmbedded = vendor === 'h2-mem' || vendor === 'h2-file' || vendor === 'sqlite';

  const handleVendorChange = (next: string) => {
    const id = next as JdbcVendor;
    const found = JDBC_VENDORS.find(v => v.id === id);
    setVendor(id);
    if (found) {
      setPort(found.defaultPort);
      setDatabase(found.defaultDb);
      setExtraProps(id === 'postgresql' ? [{ key: 'ApplicationName', value: 'progit-service' }] : []);
    }
  };

  const { jdbcUrl, snippet } = useMemo(() => {
    const hp = port ? `${host || 'localhost'}:${port}` : host || 'localhost';
    const customPairs = extraProps.filter(p => p.key.trim()).map(p => [p.key.trim(), p.value.trim()] as [string, string]);

    let url = '';
    if (vendor === 'postgresql') {
      const q: [string, string][] = [];
      if (schema && schema !== 'public') q.push(['currentSchema', schema]);
      if (useSsl) q.push(['sslmode', 'require']);
      q.push(...customPairs);
      const qs = q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      url = `jdbc:postgresql://${hp}/${database}${qs ? '?' + qs : ''}`;
    } else if (vendor === 'mysql') {
      const q: [string, string][] = [
        ['useSSL', useSsl ? 'true' : 'false'],
        ['serverTimezone', serverTimezone || 'UTC'],
        ['characterEncoding', 'UTF-8'],
        ...customPairs,
      ];
      url = `jdbc:mysql://${hp}/${database}?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
    } else if (vendor === 'mariadb') {
      const q: [string, string][] = [];
      if (useSsl) q.push(['sslMode', 'trust']);
      q.push(...customPairs);
      const qs = q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      url = `jdbc:mariadb://${hp}/${database}${qs ? '?' + qs : ''}`;
    } else if (vendor === 'oracle-service') {
      url = `jdbc:oracle:thin:@//${hp}/${database}`;
    } else if (vendor === 'oracle-sid') {
      url = `jdbc:oracle:thin:@${hp}:${database}`;
    } else if (vendor === 'sqlserver') {
      const p: [string, string][] = [
        ['databaseName', database],
        ['encrypt', useSsl ? 'true' : 'false'],
        ['trustServerCertificate', 'true'],
        ...customPairs,
      ];
      url = `jdbc:sqlserver://${hp};${p.map(([k, v]) => `${k}=${v}`).join(';')}`;
    } else if (vendor === 'h2-mem') {
      const p: [string, string][] = [['DB_CLOSE_DELAY', '-1'], ...customPairs];
      url = `jdbc:h2:mem:${database};${p.map(([k, v]) => `${k}=${v}`).join(';')}`;
    } else if (vendor === 'h2-file') {
      const p: [string, string][] = [['AUTO_SERVER', 'TRUE'], ...customPairs];
      url = `jdbc:h2:file:${database};${p.map(([k, v]) => `${k}=${v}`).join(';')}`;
    } else if (vendor === 'sqlite') {
      const qs = customPairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      url = `jdbc:sqlite:${database}${qs ? '?' + qs : ''}`;
    } else {
      const p = customPairs.map(([k, v]) => `${k}=${v};`).join('');
      url = `jdbc:db2://${hp}/${database}${p ? ':' + p : ''}`;
    }

    let code = '';
    if (snippetTab === 'spring-props') {
      code = `spring.datasource.url=${url}
spring.datasource.driver-class-name=${spec.driverClass}
spring.datasource.username=${username || 'db_user'}
spring.datasource.password=\${DB_PASSWORD}
spring.datasource.hikari.maximum-pool-size=10
spring.datasource.hikari.connection-timeout=30000`;
    } else if (snippetTab === 'spring-yml') {
      code = `spring:
  datasource:
    url: "${url}"
    driver-class-name: ${spec.driverClass}
    username: ${username || 'db_user'}
    password: \${DB_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000`;
    } else if (snippetTab === 'java') {
      code = `import java.sql.Connection;
import java.sql.DriverManager;

String url = "${url}";
String user = "${username || 'db_user'}";
String password = System.getenv("DB_PASSWORD");

try (Connection conn = DriverManager.getConnection(url, user, password)) {
    System.out.println("Connected: " + conn.getMetaData().getDatabaseProductName());
}`;
    } else if (snippetTab === 'maven') {
      code = `<dependency>
    <groupId>${spec.maven.groupId}</groupId>
    <artifactId>${spec.maven.artifactId}</artifactId>
    <version>${spec.maven.version}</version>
    <scope>runtime</scope>
</dependency>`;
    } else {
      code = `runtimeOnly '${spec.maven.groupId}:${spec.maven.artifactId}:${spec.maven.version}'`;
    }

    return { jdbcUrl: url, snippet: code };
  }, [vendor, host, port, database, schema, username, useSsl, serverTimezone, extraProps, snippetTab, spec]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">JDBC Database Driver</label>
          <ThemedSelect
            value={vendor}
            onChange={handleVendorChange}
            options={JDBC_VENDORS.map(v => ({ value: v.id, label: v.label }))}
          />
        </div>

        {!isEmbedded && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Host</label>
              <input
                type="text"
                value={host}
                onChange={e => setHost(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Port</label>
              <input
                type="text"
                value={port}
                onChange={e => setPort(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">
            {vendor === 'oracle-service' ? 'Service Name' : vendor === 'oracle-sid' ? 'Oracle SID' : isEmbedded ? 'DB Name / File Path' : 'Database'}
          </label>
          <input
            type="text"
            value={database}
            onChange={e => setDatabase(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {vendor === 'postgresql' && (
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Current Schema</label>
            <input
              type="text"
              value={schema}
              onChange={e => setSchema(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        {vendor === 'mysql' && (
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Server Timezone</label>
            <input
              type="text"
              value={serverTimezone}
              onChange={e => setServerTimezone(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Username (for snippets)</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {!isEmbedded && (
          <div className="flex items-end pb-2">
            <label className="flex items-center space-x-2 text-xs font-semibold text-gray-700 dark:text-dark-text cursor-pointer">
              <input
                type="checkbox"
                checked={useSsl}
                onChange={e => setUseSsl(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              <span>Require SSL / TLS Encryption</span>
            </label>
          </div>
        )}
      </div>

      {/* Extra JDBC Properties */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Custom JDBC Properties</span>
          <button
            type="button"
            onClick={() => setExtraProps([...extraProps, { key: '', value: '' }])}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-hover cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Property</span>
          </button>
        </div>
        {extraProps.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={p.key}
              onChange={e => setExtraProps(extraProps.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row)))}
              placeholder="property name"
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
            <input
              type="text"
              value={p.value}
              onChange={e => setExtraProps(extraProps.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row)))}
              placeholder="value"
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setExtraProps(extraProps.filter((_, i) => i !== idx))}
              className="p-1.5 text-gray-400 hover:text-red-500 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Primary JDBC URL & Driver Class */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center space-x-1.5">
              <Coffee className="w-3.5 h-3.5" />
              <span>Generated Java JDBC URL</span>
            </span>
            <CopyButton value={jdbcUrl} />
          </div>
          <div className="font-mono text-xs sm:text-sm font-bold text-gray-900 dark:text-emerald-300 break-all select-all">
            {jdbcUrl}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-bg space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-dark-muted">Driver Class Name</span>
            <CopyButton value={spec.driverClass} />
          </div>
          <div className="font-mono text-xs font-semibold text-gray-800 dark:text-white break-all select-all">
            {spec.driverClass}
          </div>
        </div>
      </div>

      {/* Ready-to-Use Code & Build Snippets */}
      <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-dark-hover border-b border-gray-200 dark:border-dark-border">
          <div className="flex flex-wrap gap-1 text-xs">
            {[
              { id: 'spring-props', label: 'Spring .properties' },
              { id: 'spring-yml', label: 'Spring .yml (Hikari)' },
              { id: 'java', label: 'Java DriverManager' },
              { id: 'maven', label: 'Maven XML' },
              { id: 'gradle', label: 'Gradle' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSnippetTab(tab.id as typeof snippetTab)}
                className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                  snippetTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-600 dark:text-dark-muted hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <CopyButton value={snippet} />
        </div>
        <pre className="p-4 bg-white dark:bg-dark-bg font-mono text-xs text-gray-800 dark:text-emerald-200 overflow-x-auto leading-relaxed">
          {snippet}
        </pre>
      </div>
    </div>
  );
};

export default JdbcUrlTool;
