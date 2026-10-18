import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRuntime, check, checks, failureSummary, privateDirectory, saveResult } from './live-lib.mjs';
import { OaLive, suite } from './oa08-live.mjs';
import { collectCoverage, writeCoverageSummary } from './oa08-coverage.mjs';

const phases = Object.freeze({ inventory: 'stock', approval: 'stock', partial: 'stock', concurrency: 'stock',
  purchase: 'business', warning: 'business', warningIgnore: 'business', browser: 'ui', matrix: 'access', policy: 'access', reports: 'reports', businessUi: 'ui-business', staleEdit: 'boundaries' });

async function lockRun() {
  const filename = path.join(privateDirectory, 'oa08-acceptance.lock');
  let handle;
  try { handle = await fs.open(filename, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!Number.isSafeInteger(existing.pid) || existing.pid < 1) throw new Error('H_OA_LOCK_INVALID');
    try { process.kill(existing.pid, 0); throw new Error('H_OA_ACCEPTANCE_ALREADY_RUNNING'); }
    catch (inspection) {
      if (inspection.code !== 'ESRCH') throw inspection;
      await fs.rm(filename);
      handle = await fs.open(filename, 'wx');
    }
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => { await handle.close(); await fs.rm(filename); };
}

export async function runOaAcceptance() {
  if (process.argv.includes('--coverage-only')) {
    await writeCoverageSummary(Object.keys(phases));
    return;
  }
  const selected = process.argv.find(argument => argument.startsWith('--phase='))?.slice(8);
  const restoreOnly = process.argv.includes('--restore-config');
  const chosen = selected ? selected.split(',') : Object.keys(phases);
  if (chosen.some(phase => !Object.hasOwn(phases, phase))) throw new Error('H_OA_PHASE_INVALID');
  let release;
  let failure;
  let ready = false;
  const live = new OaLive();
  try {
    assertRuntime();
    ready = true;
    release = await lockRun();
    await live.initialize();
    for (const name of restoreOnly ? [] : chosen) {
      if (live.fixture.phases[name]?.passed && name !== 'reports') continue;
      const started = checks.length;
      let phaseFailure;
      try {
        live.phase = name;
        const implementation = await import(`./oa08-${phases[name]}.mjs`);
        await implementation[name](live);
      } catch (error) {
        phaseFailure = error;
        failure ??= error;
        console.error(JSON.stringify({ phase: name, failure: failureSummary(error) }));
      } finally {
        try { await live.restore(); }
        catch (error) { phaseFailure = error; failure = error; }
        live.fixture.phases[name] = { passed: !phaseFailure, checks: checks.slice(started),
          failure: phaseFailure ? failureSummary(phaseFailure) : null, completedAt: new Date().toISOString() };
        await live.persist();
      }
      if (Object.values(live.fixture.configurations).some(configuration => configuration.pending)
        || live.fixture.rulePolicy?.pending || live.fixture.identityRestoration?.pending || live.fixture.ownedRoleRestoration?.pending
        || live.fixture.masterDataRestoration?.pending) break;
    }
  } catch (error) {
    failure ??= error;
    console.error(JSON.stringify(failureSummary(error)));
  } finally {
    try { await live.restore(); }
    catch (error) { failure = error; console.error(JSON.stringify(failureSummary(error))); }
    if (live.sessions?.browser) {
      try { await live.sessions.browser.close(); }
      catch (error) { failure ??= error; }
    }
    if (ready) {
      try {
        const coverage = await collectCoverage(live.fixture ?? {}, Object.keys(phases));
        await saveResult(suite, failure, { ...coverage, scope: restoreOnly ? '仅恢复配置' : `真实API阶段:${chosen.join(',')}`,
          selectedPhasesPassed: !failure, allRequiredPhasesPassed: coverage.pendingCoverage.length === 0,
          currentPassedChecks: checks.filter(entry => entry.passed).length,
          warningCoverage: live.fixture?.warningCoverage ?? null,
          boundaryCoverage: live.fixture?.boundaryCoverage ?? {} });
        console.log(JSON.stringify({ suite, selectedPhasesPassed: !failure, allRequiredPhasesPassed: coverage.pendingCoverage.length === 0,
          allCoverageVerifiedOnline: coverage.allCoverageVerifiedOnline,
          passedChecks: checks.filter(entry => entry.passed).length, pendingCoverage: coverage.pendingCoverage,
          onlineUnverifiedBoundaryCount: coverage.onlineUnverifiedCoverage.length, configurationRestored: coverage.configurationRestored }));
      } catch (error) { failure ??= error; console.error(JSON.stringify(failureSummary(error))); }
    }
    if (release) { try { await release(); } catch (error) { failure ??= error; } }
    if (failure) process.exitCode = 1;
  }
}
