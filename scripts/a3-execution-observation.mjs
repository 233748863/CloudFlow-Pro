// Only a task's owned execution number, phase, timestamp and client port survive.
// The raw Redis payload (which may contain unrelated secrets) is never returned.
export function a3ExecutionWriteMetadata(line, ownsExecution) {
  const match = line.match(/^([0-9]+\.[0-9]+) \[[0-9]+ 127\.0\.0\.1:([0-9]+)\] "(SET|SETEX|PSETEX)" "cloudflow:job:execution:([a-f0-9-]{36})" (.*)$/);
  if (!match) return null;
  // Spring Data uses SET with NX for acceptance, then SETEX/PSETEX for completion.
  // Their expiry argument precedes the value. Retain only command metadata.
  const value = match[3] === 'SET' ? match[5] : match[5].match(/^"[1-9][0-9]*" (.*)$/)?.[1];
  const status = value?.match(/^"\{\\"executeStatus\\":\\"(RUNNING|SUCCESS|FAILED|SKIPPED|TIMEOUT)\\"[,}]/)?.[1];
  if (!status || !ownsExecution(match[4])) return null;
  return { at: Math.round(Number(match[1]) * 1000), port: Number(match[2]), executeNo: match[4], command: 'RESULT_SET', redisCommand: match[3], status };
}
