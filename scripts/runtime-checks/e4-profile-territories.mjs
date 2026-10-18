export async function verifyE4Territories(context) {
  const { check, prove, evidence, fixture, marker, ok, api, rejected, territory, territories, readTerritory, identifier } = context;
  let root, destination, dragDestination, chain, foreign;
  await prove([6, 7], async () => {
    root = await territory('区域一级');
    destination = await territory('区域目标');
    dragDestination = await territory('页面移动目标');
    chain = [root];
    for (let depth = 2; depth <= 5; depth++) chain.push(await territory('区域' + depth + '级', { parentId: chain.at(-1).id }));
    let current = await territories('manager', root.id);
    check('five_level_tree_and_subtree_include_each_descendant_once', current.length === 5
      && new Set(current.map(value => String(value.territoryId))).size === 5
      && current.every(value => chain.some(sample => sample.id === String(value.territoryId))));
    for (let depth = 1; depth <= 5; depth++) {
      const sample = current.find(value => String(value.territoryId) === chain[depth - 1].id);
      check('territory_depth_' + depth + '_has_exact_materialized_path', sample.levelPath === '/' + chain.slice(0, depth).map(value => value.id).join('/') + '/');
    }
    const snapshot = JSON.stringify(await territories());
    rejected(await api('manager', '/crm/territory', { method: 'POST', body: { territoryCode: marker + '_DEPTH6', territoryName: '超层级区域', parentId: chain[4].id, status: 'ACTIVE' } }),
      'sixth_level_is_rejected', /最多5层/);
    check('sixth_level_rejection_rolls_back_insert', JSON.stringify(await territories()) === snapshot);
    const original = await readTerritory(root);
    for (const [name, parentId] of [['self', root.id], ['descendant', chain[3].id], ['excess_depth', destination.id]]) {
      rejected(await api('manager', '/crm/territory', { method: 'POST', body: { ...original, parentId } }), 'invalid_tree_move_' + name,
        name === 'excess_depth' ? /最多5层/ : /自身或子区域/);
      check('invalid_tree_move_' + name + '_keeps_all_nodes_and_versions', JSON.stringify(await territories()) === snapshot);
    }
    rejected(await api('manager', '/crm/territory', { method: 'POST', body: { territoryCode: original.territoryCode, territoryName: '重复编码', parentId: 0, status: 'ACTIVE' } }),
      'duplicate_territory_code_is_rejected', /区域编码已存在/);
    rejected(await api('manager', '/crm/territory/' + root.id, { method: 'DELETE' }), 'parent_with_children_cannot_be_deleted', /子区域/);
    check('duplicate_code_and_parent_delete_keep_entire_tree', JSON.stringify(await territories()) === snapshot);
    const stale = await readTerritory(destination);
    await ok('manager', '/crm/territory', 'POST', { ...stale, remark: marker + '_实际编辑' });
    const edited = await readTerritory(destination);
    check('territory_edit_increments_version_and_keeps_owner', edited.version === stale.version + 1 && edited.ownerId === stale.ownerId && edited.remark === marker + '_实际编辑');
    rejected(await api('manager', '/crm/territory', { method: 'POST', body: { ...stale, territoryName: '过期覆盖' } }),
      'stale_territory_edit_is_rejected', /^记录已被修改，请刷新后重试$/);
    check('rejected_stale_territory_edit_keeps_entire_record', JSON.stringify(await readTerritory(destination)) === JSON.stringify(edited));
    const branch = await readTerritory(chain[1]);
    await ok('manager', '/crm/territory', 'POST', { ...branch, parentId: destination.id });
    current = await territories('manager', destination.id);
    check('moving_branch_rewrites_all_descendant_paths', current.length === 5 && chain.slice(1).every((sample, index) => {
      const actual = current.find(value => String(value.territoryId) === sample.id);
      return actual?.levelPath === '/' + destination.id + '/' + chain.slice(1, index + 2).map(value => value.id).join('/') + '/';
    }));
    check('old_subtree_query_excludes_moved_branch', (await territories('manager', root.id)).length === 1);
    const unused = await territory('可删除末级区域', { parentId: dragDestination.id });
    await ok('manager', '/crm/territory/' + unused.id, 'DELETE');
    check('unreferenced_leaf_is_deleted', !(await territories()).some(value => String(value.territoryId) === unused.id));
    const inactive = await territory('已停用父区域', { status: 'INACTIVE' });
    const beforeInactive = JSON.stringify(await territories());
    rejected(await api('manager', '/crm/territory', { method: 'POST', body: { territoryCode: marker + '_DISABLED_PARENT', territoryName: '停用下新增', parentId: inactive.id } }),
      'inactive_parent_rejects_new_child', /父区域已停用/);
    check('inactive_parent_rejection_preserves_tree', JSON.stringify(await territories()) === beforeInactive);
    foreign = await territory('其他租户区域', {}, 'foreign');
    check('territory_tree_stays_in_local_tenant', !(await territories()).some(value => String(value.territoryId) === foreign.id));
    rejected(await api('manager', '/crm/territory/tree?parentId=' + foreign.id), 'foreign_subtree_cannot_be_read', /区域不存在/);
    rejected(await api('manager', '/crm/territory/' + foreign.id, { method: 'DELETE' }), 'foreign_territory_cannot_be_deleted', /区域不存在/);
    const currentRoot = await readTerritory(root);
    for (const actor of ['sales', 'readonly']) rejected(await api(actor, '/crm/territory', { method: 'POST', body: { ...currentRoot, territoryName: '无权修改' } }),
      actor + '_cannot_modify_territory_master', /权限|无权/);
    check('denied_master_writes_preserve_tree', JSON.stringify(await territories()) === beforeInactive);
    fixture.territoryCases = { originalRoot: root.id, currentRoot: destination.id, branch: chain[1].id, leaf: chain[4].id, dragDestination: dragDestination.id, foreign: foreign.id, inactive: inactive.id };
    evidence.territories = true; evidence.permissions = true;
  });
  return { root, destination, dragDestination, chain, leaf: chain[4], foreign };
}
