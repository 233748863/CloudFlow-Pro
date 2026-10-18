import assert from 'node:assert/strict';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

export async function verifyImRecoveryJob(context, employee) {
  const { admin, api, successful, database, check, state, evidence } = context;
  const redis = await ownedGatewayRedis(state);
  const entry = '/auth/system/job/1784';
  const before = database("SELECT CONCAT((SELECT COUNT(*) FROM sys_im_config),':',(SELECT COUNT(*) FROM sys_im_sync_run),':',(SELECT COUNT(*) FROM sys_user),':',(SELECT COUNT(*) FROM sys_dept));");
  const job = successful(await api(admin, entry), '读取已确认同步恢复任务');
  check('正式恢复任务每60秒执行且不可并发', job.jobId === 1784 && job.tenantId === 100000 && job.serviceName === 'auth'
    && job.handlerName === 'imSyncRecovery' && job.triggerType === 'FIXED_DELAY' && job.intervalMs === 60000 && job.concurrentFlag === 0
    && job.status === 'ENABLED' && job.timeoutSeconds === 240 && job.lockTimeSeconds === 300);
  const handlers = successful(await api(admin, '/auth/system/job/handlers?serviceName=auth'), '读取真实任务处理器');
  const matching = handlers.filter(handler => handler.handlerName === 'imSyncRecovery');
  check('真实服务已上报唯一恢复处理器', matching.length === 1 && matching[0].status === 'ONLINE');
  check('EMPLOYEE不能读取或触发集中恢复任务', (await api(employee, entry)).status === 403
    && (await api(employee, `${entry}/trigger`, { method: 'POST', body: {} })).status === 403);
  check('运行环境没有厂商配置或待同步批次', database('SELECT COUNT(*) FROM sys_im_config;') === '0'
    && database('SELECT COUNT(*) FROM sys_im_sync_run;') === '0');
  const timing = () => JSON.parse(database("SELECT JSON_OBJECT('last',last_fire_time,'next',next_fire_time,'failed',consecutive_fail_count) FROM sys_job WHERE job_id=1784 AND tenant_id=100000;"));
  const initial = timing();
  const deadline = Date.now() + 80000;
  let scheduled;
  while (Date.now() < deadline) {
    scheduled = timing();
    if (scheduled.last && scheduled.last !== initial.last && scheduled.next > scheduled.last) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  check('真实集中调度自动执行并收到完成回报后安排下一轮', scheduled.last && scheduled.last !== initial.last
    && scheduled.next > scheduled.last && scheduled.failed === 0);
  const triggered = successful(await api(admin, `${entry}/trigger`, { method: 'POST', body: {} }), '真实管理员触发恢复任务');
  check('任务平台接受恢复任务并分配执行编号', triggered.accepted === true);
  assert.match(triggered.executeNo, /^[a-f0-9-]{36}$/);
  const key = `cloudflow:job:execution:${triggered.executeNo}`;
  const finishedAt = Date.now() + 20000;
  let result;
  while (Date.now() < finishedAt) {
    const value = redis('GET', key);
    result = value ? JSON.parse(value) : null;
    if (result && result.executeStatus !== 'RUNNING'
      && database(`SELECT COUNT(*) FROM sys_job_log WHERE job_id=1784 AND execute_no='${triggered.executeNo}' AND execute_status='RUNNING';`) === '0') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  check('真实处理器完成空批次且执行结果可反查', result?.executeStatus === 'SUCCESS' && result.affectedRows === 0
    && result.resultMsg === '已检查=0；已完成=0；待继续=0；失败=0');
  check('执行状态保留真实480秒过期策略', Number(redis('TTL', key)) > 0 && Number(redis('TTL', key)) <= 480);
  check('真实结果回报结束RUNNING且没有失败记录', database("SELECT COUNT(*) FROM sys_job_log WHERE job_id=1784 AND execute_status<>'SUCCESS';") === '0');
  check('停用环境调度不新建配置批次或组织记录', before === database("SELECT CONCAT((SELECT COUNT(*) FROM sys_im_config),':',(SELECT COUNT(*) FROM sys_im_sync_run),':',(SELECT COUNT(*) FROM sys_user),':',(SELECT COUNT(*) FROM sys_dept));"));
  evidence.recoveryJob = true;
  console.log('G4_IM_RECOVERY_LIVE: job_id=1784; interval_ms=60000; handler_online=true; automatic_dispatch=true; manual_dispatch=true; result=SUCCESS; affected=0; real_mysql=true; real_redis=true; real_report_receiver=true; employee_trigger=403; business_rows_unchanged=true; vendor_configured=false; production_modified=false');
}
