import assert from 'node:assert/strict';

// Playwright does not propagate route-handler rejections to the owning test.
// Retain failures here and rethrow only from the awaited test's finally block.
export function captureOwnedLostResponse(onSubmission) {
  let failure;
  let saved = 0;
  const handler = async route => {
    try {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      onSubmission(route);
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'Owned response-loss request must succeed');
      assert.equal((await response.json()).code, 200, 'Owned response-loss operation must succeed');
      saved++;
      await route.abort('connectionreset');
    } catch (error) {
      failure ||= error;
      try { await route.abort('failed'); } catch { /* The request may already be closed. */ }
    }
  };
  return { handler, assertSucceeded() { if (failure) throw failure; assert.ok(saved > 0, 'No successful request observed before response loss'); } };
}
