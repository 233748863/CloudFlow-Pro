import assert from 'node:assert/strict';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

// Forward genuine protocol bytes; close only result-report connections belonging
// to the current database-backed test job. Never synthesize an execution result.
export async function createA3ReportFaultProxy({ authPort, jobId, ownsExecution, keys, secrets }) {
  assert.ok(Number.isSafeInteger(authPort) && authPort > 1024 && authPort < 65536);
  assert.match(String(jobId), /^[1-9][0-9]*$/);
  const reports = new Map(); const events = []; const sockets = new Set();
  const counters = { forwardedHeartbeats: 0, forwardedReports: 0, droppedReports: 0, rejected: 0, upstreamErrors: 0 };
  const digest = value => createHash('sha256').update(value).digest('hex');
  const authenticate = (request, body) => {
    const headers = request.headers;
    const source = headers['x-from-service'];
    assert.equal(source, 'cloudflow-service-hr'); assert.equal(headers['x-job-target'], 'cloudflow-auth');
    assert.equal(headers['x-inner-call'], 'true'); assert.equal(headers['x-job-body-sha256'], digest(body));
    assert.ok(Math.abs(Date.now() / 1000 - Number(headers['x-job-timestamp'])) <= 120);
    const canonical = ['CF-JOB-V1', request.method, request.url, source, 'cloudflow-auth', headers['x-tenant-id'] || '', headers['x-user-id'] || '',
      digest(headers.authorization || ''), digest(headers.cookie || ''), headers['x-job-body-sha256'], headers['x-job-timestamp'], headers['x-job-nonce']].join('\n');
    const expected = createHmac('sha256', Buffer.from(keys[source], 'base64')).update(canonical).digest('hex');
    const actual = headers['x-job-signature']; assert.match(actual || '', /^[a-f0-9]{64}$/);
    assert.ok(timingSafeEqual(Buffer.from(actual), Buffer.from(expected)), 'Original HR signature must match unchanged report'); secrets.add(actual);
  };
  const server = http.createServer(async (request, response) => {
    try {
      assert.equal(request.socket.remoteAddress, '127.0.0.1'); assert.equal(request.method, 'POST');
      assert.ok(['/inner/job/report', '/inner/job/handler/report', '/inner/job/business/register'].includes(request.url));
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes <= 1048576); chunks.push(chunk); }
      const body = Buffer.concat(chunks); authenticate(request, body);
      if (request.url === '/inner/job/report') {
        const value = JSON.parse(body.toString('utf8')); assert.match(value.executeNo || '', /^[a-f0-9-]{36}$/);
        if (ownsExecution(value.executeNo)) {
          assert.ok(!request.headers['x-tenant-id'] || request.headers['x-tenant-id'] === '100000');
          const captured = reports.get(value.executeNo);
          if (captured) assert.equal(captured.bodyHash, digest(body), 'Repeated real report changed');
          else reports.set(value.executeNo, { receivedAt: Date.now(), body: body.toString('utf8'), bodyHash: digest(body), value });
          counters.droppedReports++; events.push({ type: 'dropped_real_report', executeNo: value.executeNo, at: Date.now(), bodyHash: digest(body) });
          request.socket.destroy(); return;
        }
      }
      const headers = { ...request.headers, host: '127.0.0.1:' + authPort, 'content-length': String(body.length) };
      delete headers.connection; delete headers['transfer-encoding'];
      const upstream = http.request({ host: '127.0.0.1', port: authPort, path: request.url, method: request.method, headers, timeout: 15000 }, result => {
        response.writeHead(result.statusCode, result.headers); result.pipe(response);
        result.once('end', () => {
          if (result.statusCode !== 200) { counters.upstreamErrors++; return; }
          if (request.url === '/inner/job/handler/report') counters.forwardedHeartbeats++;
          if (request.url === '/inner/job/report') counters.forwardedReports++;
        });
      });
      upstream.once('timeout', () => upstream.destroy());
      upstream.once('error', () => { counters.upstreamErrors++; if (!response.headersSent) response.writeHead(503); response.end(); });
      upstream.end(body);
    } catch {
      counters.rejected++;
      if (!response.headersSent) response.writeHead(403);
      response.end();
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => { counters.rejected++; socket.destroy(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return { port, reports, counters, events,
    async close() { await new Promise(resolve => { server.close(resolve); for (const socket of sockets) socket.destroy(); }); },
  };
}
