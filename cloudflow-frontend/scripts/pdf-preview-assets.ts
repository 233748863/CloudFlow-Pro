import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export function pdfPreviewAssets(projectRoot: string): Plugin {
  const root = path.resolve(projectRoot, 'node_modules/pdfjs-dist');
  const files = new Map<string, string>();
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
      if (entry.isFile()) files.set(`${folder}/${entry.name}`, path.join(root, folder, entry.name));
    }
  }
  for (const name of ['LICENSE', 'NOTICE']) {
    if (fs.existsSync(path.join(root, name))) files.set(name, path.join(root, name));
  }
  return {
    name: 'self-hosted-pdf-preview-assets',
    configureServer(server) {
      server.middlewares.use('/pdf-preview-assets/', (request, response) => {
        let name: string;
        try { name = decodeURIComponent(new URL(request.url || '', 'http://localhost').pathname.slice(1)); }
        catch { response.statusCode = 400; response.end(); return; }
        const file = files.get(name);
        if (!file || !['GET', 'HEAD'].includes(request.method || '')) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.method === 'HEAD') response.end();
        else fs.createReadStream(file).on('error', () => { response.destroy(); }).pipe(response);
      });
    },
    generateBundle() {
      for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `pdf-preview-assets/${name}`, source: fs.readFileSync(file) });
    },
  };
}
