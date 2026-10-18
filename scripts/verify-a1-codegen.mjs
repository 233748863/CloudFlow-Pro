import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyA1CodegenFoundation } from './verify-a1-codegen-foundation.mjs';
import { verifyA1CodegenDisabled } from './verify-a1-codegen-disabled.mjs';
import { verifyA1CodegenOutputs } from './verify-a1-codegen-outputs.mjs';
import { verifyA1CodegenPermissions } from './verify-a1-codegen-permissions.mjs';
import { verifyA1CodegenInterface } from './verify-a1-codegen-ui.mjs';

export async function verifyA1Codegen(context) {
  const { admin, successful, check, directory, caseTag, state, evidence } = context;
  const disabled = state.verification?.mode === 'A1_CODEGEN_DISABLED_INDEPENDENT';
  assert.ok(disabled || state.verification?.mode === 'A1_CODEGEN_INDEPENDENT');
  const generatedRoot = await fs.realpath(path.join(directory, 'codegen-output'));
  assert.equal(generatedRoot, await fs.realpath(state.codegenFixture.directory));
  assert.equal(state.codegenFixture.enabled, !disabled);
  const secretPath = path.join(directory, 'private/h3-core-secrets.json');
  const secrets = new Set(JSON.parse(await fs.readFile(secretPath, 'utf8')));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    if (!token) return;
    const secret = token.replace(/^Bearer /, '');
    if (!secrets.has(secret)) {
      secrets.add(secret);
      await fs.writeFile(secretPath, JSON.stringify([...secrets]));
    }
  };
  const session = async username => {
    const page = await context.session(username);
    await remember(page);
    return page;
  };
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const lastPosts = new WeakMap();
  const api = async (page, target, options = {}) => {
    const result = await context.api(page, target, options);
    if (String(options.method || 'GET').toUpperCase() === 'POST') {
      const history = lastPosts.get(page) || new Map();
      lastPosts.set(page, history);
      history.set(target + ':' + JSON.stringify(options.body || {}), Date.now());
    }
    return result;
  };
  const get = async (target, page = admin) => successful(await api(page, target), target);
  const post = async (target, body = {}, page = admin) => {
    const prior = lastPosts.get(page)?.get(target + ':' + JSON.stringify(body)) || 0;
    const remaining = 5200 - (Date.now() - prior);
    if (remaining > 0) await sleep(remaining);
    return successful(await api(page, target, { method: 'POST', body }), target);
  };
  const put = async (target, body, page = admin) => successful(await api(page, target, { method: 'PUT', body }), target);
  const reject = (result, label, message) => check(label,
    ([400, 401, 403, 404, 409].includes(result.status)
      || result.status === 200 && [400, 401, 403, 404, 409].includes(result.body?.code))
    && (message == null || result.body?.msg === message));
  const sql = value => 'CONVERT(0x' + Buffer.from(String(value)).toString('hex') + ' USING utf8mb4)';
  const rows = statement => context.database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const waitFor = async (read, accept, label, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    do {
      const value = await read();
      if (accept(value)) return value;
      await sleep(200);
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const generatedFileSnapshot = async () => {
    const files = [];
    const walk = async current => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        const metadata = await fs.lstat(target);
        assert.equal(metadata.isSymbolicLink(), false, 'Generated snapshot refuses redirected paths');
        if (metadata.isDirectory()) await walk(target);
        else if (metadata.isFile()) {
          const bytes = await fs.readFile(target);
          files.push({ path: path.relative(generatedRoot, target).replaceAll('\\', '/'), bytes: bytes.length,
            hash: createHash('sha256').update(bytes).digest('hex') });
        }
      }
    };
    await walk(generatedRoot);
    return files.sort((first, second) => first.path.localeCompare(second.path));
  };
  const generatedProducts = [];
  const productsRoot = path.join(directory, 'codegen-products-' + caseTag);
  await fs.mkdir(productsRoot);
  const retainGenerated = async (label, detail, files) => {
    assert.match(label, /^[a-z0-9_-]+$/);
    assert.ok(!generatedProducts.some(product => product.label === label));
    const productRoot = path.join(productsRoot, label);
    await fs.mkdir(productRoot);
    const retainedFiles = [];
    for (const [relative, content] of Object.entries(files)) {
      assert.equal(typeof content, 'string');
      assert.ok(relative && !path.isAbsolute(relative) && !relative.includes('..') && !relative.includes('\\'));
      const target = path.resolve(productRoot, relative);
      assert.ok(target.startsWith(productRoot + path.sep));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, { flag: 'wx' });
      retainedFiles.push({ name: relative, path: target, bytes: Buffer.byteLength(content),
        hash: createHash('sha256').update(content).digest('hex'), java: relative.endsWith('.java') });
    }
    const configuration = path.join(productRoot, 'configuration.json');
    await fs.writeFile(configuration, JSON.stringify(detail, null, 2), { flag: 'wx' });
    const receipt = { label, tableId: detail.table.tableId, tableName: detail.table.tableName,
      template: detail.table.tplCategory, root: productRoot, actualPreview: true, configuration,
      configurationHash: createHash('sha256').update(await fs.readFile(configuration)).digest('hex'), files: retainedFiles };
    generatedProducts.push(receipt);
    return receipt;
  };
  const ctx = { ...context, disabled, generatedRoot, productsRoot, generatedProducts, generatedFileSnapshot,
    retainGenerated, session, remember, api, get, post, put, reject, sql, rows, waitFor, sleep,
    marker: 'A1_' + caseTag };
  await remember(admin);
  try {
    if (disabled) {
      await verifyA1CodegenDisabled(ctx);
    } else {
      await verifyA1CodegenFoundation(ctx);
      await verifyA1CodegenOutputs(ctx);
      await verifyA1CodegenPermissions(ctx);
    }
    await verifyA1CodegenInterface(ctx);
  } finally {
    try {
      if (ctx.codegenPermissionCleanup) await ctx.codegenPermissionCleanup();
    } finally {
      await fs.writeFile(path.join(directory, 'a1-generated-products-' + caseTag + '.json'), JSON.stringify({
        caseTag, products: generatedProducts, originalPreviewsPreserved: true,
        compilationExecuted: false, referenceRuntimeWritten: false, productModified: false,
      }, null, 2), { flag: 'wx' });
    }
  }
}
