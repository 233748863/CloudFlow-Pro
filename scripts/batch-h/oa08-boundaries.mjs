import { check, jsonRows, pause, sqlText } from './live-lib.mjs';
import { id, same, stockPath } from './oa08-live.mjs';

const masterFields = ['name', 'model', 'unit', 'categoryId', 'brand', 'lowStockThreshold', 'targetStock',
  'maxStock', 'defaultSupplierId', 'warnEnabled', 'storageLocation', 'status'];
const masterData = value => Object.fromEntries(masterFields.map(field => [field, value[field] ?? null]));
const stockFacts = proof => ({ ...proof, balances: proof.balances.map(({ version, ...balance }) => balance) });

function storedMaster(live, materialId) {
  return jsonRows(`SELECT JSON_OBJECT('name', name, 'location', storage_location, 'version', version)
    FROM oa_consumable WHERE tenant_id = ${sqlText(live.tenantId)} AND consumable_id = ${sqlText(materialId)} AND deleted = 0`);
}

export async function restoreOwnedMasterData(live) {
  const saved = live.fixture.masterDataRestoration;
  if (!saved?.pending) return;
  const state = live.scenario('stale-edit');
  check('主数据恢复仅限本轮独占耗材及原始资料', saved.materialId === state.materialId
    && saved.original.name === state.materialName && state.materialName.startsWith(live.fixture.tag));
  const current = await live.readMaterial(saved.materialId);
  const signature = JSON.stringify(masterData(current));
  check('恢复前测试耗材资料未被其他操作者接管',
    [JSON.stringify(saved.original), JSON.stringify(saved.expected)].includes(signature));
  if (signature !== JSON.stringify(saved.original)) {
    await pause(5200);
    await live.ok('admin', stockPath, 'PUT', { ...saved.original, consumableId: saved.materialId, version: current.version });
  }
  const restored = await live.readMaterial(saved.materialId);
  same('测试耗材全部业务资料恢复原值', masterData(restored), saved.original);
  const persisted = storedMaster(live, saved.materialId);
  check('主数据恢复由真实API及只读SQL双重确认', persisted.length === 1 && persisted[0].name === saved.original.name
    && persisted[0].location === saved.original.storageLocation && persisted[0].version === restored.version);
  same('主数据编辑及恢复不产生任何库存业务事实', stockFacts(live.proof(saved.materialId)), stockFacts(saved.originalStock));
  saved.pending = false;
  saved.verifiedByApiAndSql = true;
  saved.restoredAt = new Date().toISOString();
  await live.persist();
}

export async function staleEdit(live) {
  await restoreOwnedMasterData(live);
  const materialId = id(await live.material('stale-edit'));
  await live.step('stale-edit:old-version-rejection', async () => {
    const current = await live.readMaterial(materialId);
    const original = masterData(current);
    const expected = { ...original, storageLocation: `${live.fixture.tag}-version-check` };
    check('旧版本编辑核验仅使用本次无库存独占耗材', current.name === live.scenario('stale-edit').materialName
      && current.quantity === 0 && current.warnEnabled === 0 && Number.isInteger(current.version));
    const saved = { materialId, original, expected, originalVersion: current.version,
      originalStock: live.proof(materialId), pending: true, verifiedByApiAndSql: false };
    live.fixture.masterDataRestoration = saved;
    await live.persist();
    let rejected;
    try {
      await pause(5200);
      await live.ok('admin', stockPath, 'PUT', { ...expected, consumableId: materialId, version: current.version });
      const updated = await live.readMaterial(materialId);
      check('真实合法编辑推进一个版本', updated.version === current.version + 1);
      same('真实合法编辑仅改变指定业务资料', masterData(updated), expected);
      const before = { material: masterData(updated), persisted: storedMaster(live, materialId), stock: live.proof(materialId) };
      await pause(5200);
      rejected = await live.deny('admin', stockPath, 'PUT', { ...original, consumableId: materialId, version: current.version },
        '旧版本耗材编辑', materialId, /VERSION_CONFLICT|数据已变更/);
      check('旧版本编辑由业务版本冲突明确拒绝', rejected.status === 409);
      same('旧版本编辑不更改资料版本缓存或任何流水',
        { material: masterData(await live.readMaterial(materialId)), persisted: storedMaster(live, materialId), stock: live.proof(materialId) }, before);
    } finally {
      await restoreOwnedMasterData(live);
    }
    live.fixture.boundaryCoverage ||= {};
    live.fixture.boundaryCoverage.staleEdit = { passed: true, materialId, httpStatus: rejected.status,
      originalVersion: saved.originalVersion, restoredByApiAndSql: saved.verifiedByApiAndSql, checkedAt: new Date().toISOString() };
    await live.persist();
  });
}
