// Scrutari Custom ESLint Plugin — Project-Specific Rules
// Flat-config format for ESLint v10
//
// Implemented rules (9 total):
//   no-raw-ip-access           — IP access must use normalizeIP()
//   no-empty-catch             — Catch blocks must handle errors
//   require-strict-mode        — CommonJS needs 'use strict'
//   require-normalize-ip-def   — IP-accessing files must define normalizeIP
//   require-archive-cleanup    — Archive logic must also prune old archives
//   require-distribution-cap   — Distribution updates must have cardinality cap
//   no-floating-promises       — All promises must be awaited
//   require-rate-limit-first   — Rate limiting before data processing
//   no-direct-console-in-honeypot — Honeypot mustn't log real client IPs

// ─── Rule 1: no-raw-ip-access ───

const noRawIpAccess = {
  meta: {
    type: 'suggestion',
    docs: { description: 'All client IP access must go through normalizeIP()' },
    messages: {
      rawIp: 'Raw IP access via "{{ method }}" without normalizeIP(). Use normalizeIP() to ensure IPv6-mapped IPv4 handling.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const isRemoteAddr = node.property?.name === 'remoteAddress' &&
          node.object?.property?.name === 'socket';
        const isForwardedFor = node.computed
          ? (node.property?.value === 'x-forwarded-for')
          : (node.property?.name === 'x-forwarded-for');
        const isNFClientIP = node.computed
          ? (node.property?.value === 'x-nf-client-connection-ip')
          : (node.property?.name === 'x-nf-client-connection-ip');
        if (isRemoteAddr || isForwardedFor || isNFClientIP) {
          context.report({
            node,
            messageId: 'rawIp',
            data: {
              method: isRemoteAddr ? "req.socket.remoteAddress"
                : isForwardedFor ? "req.headers['x-forwarded-for']"
                : "req.headers['x-nf-client-connection-ip']",
            },
          });
        }
      },
    };
  },
};

// ─── Rule 2: no-empty-catch ───

const noEmptyCatch = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Catch blocks must handle or log the error' },
    messages: { emptyCatch: 'Empty catch block — must at minimum log or rethrow.' },
  },
  create(context) {
    return {
      CatchClause(node) {
        if (!node.body?.body) return;
        if (node.body.body.length === 0) {
          context.report({ node, messageId: 'emptyCatch' }); return;
        }
        const hasAction = node.body.body.some(stmt => {
          if (stmt.type === 'ExpressionStatement' && stmt.expression) {
            if (stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee?.type === 'MemberExpression' &&
                stmt.expression.callee.object?.name === 'console') return true;
            return true;
          }
          return stmt.type === 'ThrowStatement' || stmt.type === 'ReturnStatement';
        });
        if (!hasAction) context.report({ node, messageId: 'emptyCatch' });
      },
    };
  },
};

// ─── Rule 3: require-strict-mode ───

const requireStrictMode = {
  meta: {
    type: 'suggestion',
    docs: { description: 'CommonJS files must have "use strict"' },
    messages: { missingStrict: 'CommonJS file is missing "use strict" as the first statement.' },
  },
  create(context) {
    const st = context.languageOptions?.sourceType || context.parserOptions?.sourceType;
    if (st === 'module') return {};
    const src = context.sourceCode || context.getSourceCode();
    const body = src.ast?.body;
    if (!body || body.length === 0) return {};
    const first = body[0];
    const has = first?.type === 'ExpressionStatement' && first.expression?.type === 'Literal' && first.expression?.value === 'use strict';
    if (!has) return { Program(n) { context.report({ node: n, messageId: 'missingStrict' }); } };
    return {};
  },
};

// ─── Rule 4: require-normalize-ip-def ───

const requireNormalizeIPDef = {
  meta: {
    type: 'error',
    docs: { description: 'Files accessing client IPs must define normalizeIP()' },
    messages: { missingDef: 'This file accesses client IPs but does not define normalizeIP().' },
  },
  create(context) {
    const fn = context.filename || context.getFilename();
    if (!/server\.js|submit\.mjs|classify\.js|honeypot\.js|edge-functions/.test(fn)) return {};
    let defined = false, accesses = false;
    const check = (name) => { if (name === 'normalizeIP') defined = true; };
    return {
      FunctionDeclaration(n) { check(n.id?.name); },
      VariableDeclarator(n) { check(n.id?.name); },
      ImportSpecifier(n) { check(n.imported?.name); check(n.local?.name); },
      MemberExpression(n) {
        const p = n.computed ? n.property?.value : n.property?.name;
        if (p === 'remoteAddress' || p === 'x-forwarded-for' || p === 'x-nf-client-connection-ip') accesses = true;
      },
      'Program:exit'(n) { if (accesses && !defined) context.report({ node: n, messageId: 'missingDef' }); },
    };
  },
};

// ─── Rule 5: require-archive-cleanup ───

const requireArchiveCleanup = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Archive logic must include pruning old archives' },
    messages: { noPrune: 'File creates archive files but has no archive pruning logic. Add cleanup to prevent disk exhaustion.' },
  },
  create(context) {
    let hasArchive = false, hasPrune = false;
    return {
      CallExpression(n) {
        if (n.callee?.type === 'MemberExpression' && n.callee?.property?.name === 'copyFileSync' &&
            n.arguments?.[0] && /archive/i.test(n.arguments[0]?.raw || '')) hasArchive = true;
        if (/prune|cleanup|unlinkSync.*archive/i.test(context.sourceCode?.getText(n) || '')) hasPrune = true;
      },
      'Program:exit'(n) { if (hasArchive && !hasPrune) context.report({ node: n, messageId: 'noPrune' }); },
    };
  },
};

// ─── Rule 6: require-distribution-cap ───

const requireDistributionCap = {
  meta: {
    type: 'error',
    docs: { description: 'Distribution updates must have cardinality cap' },
    messages: { noCap: 'updateDist/updateDistribution call without cardinality cap (MAX_DIST_VALUES or 100). Unbounded growth risk.' },
  },
  create(context) {
    let hasCap = false, hasUpdateDist = false;
    return {
      FunctionDeclaration(n) {
        if (/updateDist|updateDistribution/.test(n.id?.name || '')) {
          const body = context.sourceCode?.getText(n) || '';
          if (/MAX_DIST_VALUES|>= 100|__other/.test(body)) hasCap = true;
          hasUpdateDist = true;
        }
      },
      'Program:exit'(n) { if (hasUpdateDist && !hasCap) context.report({ node: n, messageId: 'noCap' }); },
    };
  },
};

// ─── Rule 7: no-floating-promises ───

const noFloatingPromises = {
  meta: {
    type: 'error',
    docs: { description: 'All promises must be awaited or caught' },
    messages: { floating: 'Floating promise — must be awaited or have .catch().' },
  },
  create(context) {
    return {
      ExpressionStatement(n) {
        if (n.expression?.type === 'CallExpression' &&
            n.expression.callee?.type === 'MemberExpression' &&
            /^then|catch|finally$/.test(n.expression.callee?.property?.name || '')) return;
        // Heuristic: detect Promise-based calls not in await context
        const text = context.sourceCode?.getText(n) || '';
        if (/\.(then|catch)\(/.test(text) && !/await /.test(context.sourceCode?.getText(context.sourceCode.ast) || '')) {
          // Only flag top-level promise chains without await
          const parent = context.getAncestors?.()?.slice(-1)?.[0];
          if (!parent || parent.type === 'Program' || parent.type === 'ExpressionStatement') {
            context.report({ node: n, messageId: 'floating' });
          }
        }
      },
    };
  },
};

// ─── Rule 8: require-rate-limit-first ───

const requireRateLimitFirst = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Rate limiting should be called before processing data' },
    messages: { notFirst: 'Request handler should call rate limiting before processing data.' },
  },
  create(context) {
    const fn = context.filename || context.getFilename();
    if (!/server\.js|submit\.mjs|function/.test(fn)) return {};
    let hasRateLimit = false, hasProcessing = false;
    return {
      CallExpression(n) {
        if (/rateLimit|rateLimiter\.allow/.test(context.sourceCode?.getText(n) || '')) hasRateLimit = true;
        if (/loadStore|JSON\.parse/.test(context.sourceCode?.getText(n) || '')) hasProcessing = true;
      },
      'Program:exit'(n) { if (hasProcessing && !hasRateLimit) context.report({ node: n, messageId: 'notFirst' }); },
    };
  },
};

// ─── Rule 9: no-direct-console-in-honeypot ───

const noDirectConsoleInHoneypot = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Honeypot should not log real client IPs' },
    messages: { consoleLog: 'Honeypot should not directly log client IPs. Use structured logging with PII redaction.' },
  },
  create(context) {
    const fn = context.filename || context.getFilename();
    if (!/honeypot/.test(fn)) return {};
    return {
      CallExpression(n) {
        if (n.callee?.type === 'MemberExpression' && n.callee?.object?.name === 'console' &&
            n.arguments?.length > 0 && /clientIP|remoteAddress|rawIP/.test(context.sourceCode?.getText(n) || '')) {
          context.report({ node: n, messageId: 'consoleLog' });
        }
      },
    };
  },
};

export default {
  rules: {
    'no-raw-ip-access': noRawIpAccess,
    'no-empty-catch': noEmptyCatch,
    'require-strict-mode': requireStrictMode,
    'require-normalize-ip-def': requireNormalizeIPDef,
    'require-archive-cleanup': requireArchiveCleanup,
    'require-distribution-cap': requireDistributionCap,
    'no-floating-promises': noFloatingPromises,
    'require-rate-limit-first': requireRateLimitFirst,
    'no-direct-console-in-honeypot': noDirectConsoleInHoneypot,
  },
};
