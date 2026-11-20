import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Code2, HelpCircle, Lightbulb, Sparkles } from 'lucide-react';
import { CopyButton, ThemedSelect } from '../components/ToolUI';

const SAMPLE_TRACES = {
  javaNpe: {
    label: 'Java NullPointerException (Spring Boot)',
    trace: `java.lang.NullPointerException: Cannot invoke "io.progit.model.User.getEmail()" because "user" is null
    at io.progit.service.NotificationService.sendWelcomeEmail(NotificationService.java:42)
    at io.progit.controller.UserController.register(UserController.java:88)
    at java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)
    at java.base/java.lang.reflect.Method.invoke(Method.java:580)
    at org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:255)
    at org.springframework.web.method.support.InvocableHandlerMethod.invokeForRequest(InvocableHandlerMethod.java:188)`,
  },
  pythonKeyError: {
    label: 'Python KeyError (FastAPI / Flask)',
    trace: `Traceback (most recent call last):
  File "/app/progit/api/routes.py", line 124, in get_repo_details
    owner_id = request.state.auth_user["tenant_id"]
KeyError: 'tenant_id'`,
  },
  nodeTypeError: {
    label: 'Node.js / Express TypeError',
    trace: `TypeError: Cannot read properties of undefined (reading 'split')
    at parseHeader (/app/progit/middleware/auth.js:18:32)
    at authMiddleware (/app/progit/middleware/auth.js:35:5)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at next (/app/node_modules/express/lib/router/route.js:144:13)`,
  },
  goPanic: {
    label: 'Go Nil Pointer Dereference Panic',
    trace: `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x2 addr=0x18 pc=0x1029482]

goroutine 1 [running]:
progit.io/progit/internal/auth.ValidateToken(0x0, 0x0)
	/src/internal/auth/oidc.go:88 +0x34
progit.io/progit/internal/api.(*Server).handleLogin(0x140001ae000, 0x103a890, 0x140001aa000)
	/src/internal/api/api.go:142 +0xa8
net/http.HandlerFunc.ServeHTTP(0x103a890, 0x140001aa000)
	/usr/local/go/src/net/http/server.go:2136 +0x2c`,
  },
};

interface Frame {
  file: string;
  line?: string;
  func?: string;
  isAppCode: boolean;
  raw: string;
}

export const StackTraceExplainerTool: React.FC = () => {
  const [sampleKey, setSampleKey] = useState<string>('javaNpe');
  const [rawTrace, setRawTrace] = useState<string>(SAMPLE_TRACES.javaNpe.trace);

  const { runtime, rootCause, appFrame, frames, explanation, fixSuggestion } = useMemo(() => {
    const text = rawTrace.trim();
    if (!text) return { runtime: 'Unknown', rootCause: '', appFrame: null, frames: [], explanation: '', fixSuggestion: '' };

    let lang = 'Generic';
    let cause = '';
    const parsedFrames: Frame[] = [];

    // Java
    if (/^[a-zA-Z0-9_$.]+(?:Exception|Error|Throwable):/m.test(text) || text.includes('at java.') || text.includes('at org.springframework')) {
      lang = 'Java';
      const firstLine = text.split('\n')[0];
      cause = firstLine;

      const atMatches = text.matchAll(/^\s*at\s+([a-zA-Z0-9_$.]+)\((.*?)\)/gm);
      for (const m of atMatches) {
        const method = m[1];
        const location = m[2];
        const isApp = !method.startsWith('java.') && !method.startsWith('jdk.') && !method.startsWith('org.springframework.');
        const [file, line] = location.split(':');
        parsedFrames.push({
          file: file || location,
          line,
          func: method,
          isAppCode: isApp,
          raw: m[0].trim(),
        });
      }
    } else if (text.includes('Traceback (most recent call last):') || /^[A-Z][a-zA-Z]*Error:/m.test(text)) {
      // Python
      lang = 'Python';
      const lines = text.split('\n');
      cause = lines[lines.length - 1];

      const pyMatches = text.matchAll(/File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+([^\n]+))?/g);
      for (const m of pyMatches) {
        const file = m[1];
        const line = m[2];
        const func = m[3];
        const isApp = !file.includes('/lib/python') && !file.includes('/site-packages/');
        parsedFrames.push({
          file,
          line,
          func,
          isAppCode: isApp,
          raw: m[0],
        });
      }
    } else if (/^[a-zA-Z]*Error:/m.test(text) || text.includes('node_modules')) {
      // Node.js
      lang = 'Node.js / JavaScript';
      const firstLine = text.split('\n')[0];
      cause = firstLine;

      const jsMatches = text.matchAll(/^\s*at\s+(?:([^\s(]+)\s+\()?([^:)]+):(\d+)(?::(\d+))?\)?/gm);
      for (const m of jsMatches) {
        const func = m[1] || 'anonymous';
        const file = m[2];
        const line = m[3];
        const isApp = !file.includes('node_modules') && !file.startsWith('node:');
        parsedFrames.push({
          file,
          line,
          func,
          isAppCode: isApp,
          raw: m[0].trim(),
        });
      }
    } else if (text.includes('panic:') || text.includes('goroutine 1')) {
      // Go
      lang = 'Go';
      const panicLine = text.match(/panic:\s+([^\n]+)/);
      cause = panicLine ? panicLine[0] : 'Go Runtime Panic';

      const lines = text.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].includes('(') && lines[i + 1]?.trim().startsWith('/')) {
          const func = lines[i].trim();
          const [file, line] = lines[i + 1].trim().split(' ')[0].split(':');
          const isApp = !file.includes('/usr/local/go/');
          parsedFrames.push({
            file,
            line,
            func,
            isAppCode: isApp,
            raw: `${func} at ${file}:${line}`,
          });
        }
      }
    }

    const firstAppFrame = parsedFrames.find(f => f.isAppCode) || parsedFrames[0] || null;

    // Plain English explanations & Fixes
    let explain = '';
    let fix = '';

    if (cause.toLowerCase().includes('nullpointer') || cause.toLowerCase().includes('nil pointer')) {
      explain = 'A method or field was accessed on a reference variable that was null. The object was either not initialized or a previous lookup (such as a database query or token lookup) returned no match.';
      fix = 'Add a null check before calling methods: e.g. `if (user == null) { return error; }` or use optional chaining `user?.email`.';
    } else if (cause.toLowerCase().includes('keyerror')) {
      explain = 'The application attempted to read a dictionary/hash key that does not exist in the object payload.';
      fix = 'Use `.get("key", default)` instead of direct subscript `["key"]`, or verify the key is populated in request state.';
    } else if (cause.toLowerCase().includes('cannot read propert')) {
      explain = 'JavaScript tried to access a property on an `undefined` or `null` value.';
      fix = 'Use optional chaining `header?.split?.(" ")` or verify the variable is defined before operating on it.';
    } else {
      explain = 'An unhandled exception propagated to the top of the call stack, halting execution of the thread.';
      fix = 'Inspect the parameters passed to the failing function at the identified line number.';
    }

    return {
      runtime: lang,
      rootCause: cause || 'Exception occurred in application stack',
      appFrame: firstAppFrame,
      frames: parsedFrames,
      explanation: explain,
      fixSuggestion: fix,
    };
  }, [rawTrace]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-semibold text-gray-500">Preset:</span>
          <div className="w-64">
            <ThemedSelect
              value={sampleKey}
              onChange={val => {
                setSampleKey(val);
                if (SAMPLE_TRACES[val as keyof typeof SAMPLE_TRACES]) {
                  setRawTrace(SAMPLE_TRACES[val as keyof typeof SAMPLE_TRACES].trace);
                }
              }}
              options={Object.entries(SAMPLE_TRACES).map(([k, v]) => ({ value: k, label: v.label }))}
            />
          </div>
        </div>

        <CopyButton value={rawTrace} label="Copy Trace" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Raw Stack Trace Input */}
        <div className="lg:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold uppercase tracking-wider">Raw Stack Trace</span>
            <span>{rawTrace.split('\n').length} lines</span>
          </div>
          <textarea
            value={rawTrace}
            onChange={e => setRawTrace(e.target.value)}
            rows={18}
            className="w-full font-mono text-xs p-3 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y leading-relaxed"
            placeholder="Paste Java, Python, Node.js, or Go stack trace here..."
          />
        </div>

        {/* Right: Diagnosis & Root Cause */}
        <div className="lg:col-span-7 space-y-3">
          {/* Root Cause Banner */}
          <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                {runtime} Error
              </span>
              <span className="text-xs text-gray-500">Detected Failure</span>
            </div>
            <h3 className="text-sm font-mono font-bold text-rose-900 dark:text-rose-200 break-all">
              {rootCause}
            </h3>
          </div>

          {/* Failing Application Frame */}
          {appFrame && (
            <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 text-xs space-y-1.5">
              <span className="font-bold text-amber-800 dark:text-amber-400 flex items-center space-x-1.5 uppercase tracking-wider text-[11px]">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Primary Culprit Frame (Application Code)</span>
              </span>
              <div className="font-mono p-2 rounded bg-white dark:bg-dark-bg border border-amber-200 dark:border-amber-900/40 text-gray-800 dark:text-dark-text space-y-0.5">
                <div>
                  <span className="text-gray-400">File: </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{appFrame.file}</span>
                  {appFrame.line && <span className="text-amber-600 dark:text-amber-400 font-bold">:{appFrame.line}</span>}
                </div>
                {appFrame.func && (
                  <div>
                    <span className="text-gray-400">Function: </span>
                    <span className="text-sky-600 dark:text-sky-400">{appFrame.func}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Explanation & Remediation */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg space-y-2.5 text-xs">
            <span className="font-bold text-gray-700 dark:text-dark-text flex items-center space-x-1.5 uppercase tracking-wider text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Plain-English Root Cause Explanation</span>
            </span>
            <p className="text-gray-600 dark:text-dark-muted leading-relaxed">{explanation}</p>

            <div className="pt-2 border-t border-gray-100 dark:border-dark-border space-y-1">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Recommended Fix</span>
              </span>
              <p className="text-gray-600 dark:text-dark-muted font-mono text-[11px] bg-gray-50 dark:bg-dark-border/40 p-2 rounded">
                {fixSuggestion}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StackTraceExplainerTool;
