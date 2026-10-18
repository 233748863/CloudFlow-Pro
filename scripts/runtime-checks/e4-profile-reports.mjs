export async function verifyE4Reports(context) {
  const { check, prove, evidence, fixture, ok, api, rejected, rows, database, sql, tenant, user } = context;
  const scope = (actor, alias) => {
    const department = context.identifier(database('SELECT dept_id FROM sys_user WHERE tenant_id=' + tenant(actor) + ' AND user_id=' + user(actor) + ';'));
    return alias + '.tenant_id=' + tenant(actor) + ' AND ' + alias + '.deleted=0'
      + (actor === 'sales' ? ' AND ' + alias + '.owner_id=' + user(actor) : actor === 'manager' ? ' AND ' + alias + '.dept_id=' + department : '');
  };
  const normalized = object => JSON.stringify(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
  const observations = [];
  await prove(13, async () => {
    for (const actor of ['sales', 'manager', 'readonly', 'admin', 'foreign']) {
      const leadWhere = scope(actor, 'source_lead'), customerWhere = scope(actor, 'customer');
      const funnelRows = rows("SELECT JSON_OBJECT('name',qualification_group,'count',lead_count) FROM (SELECT CASE WHEN source_lead.converted_customer_id IS NOT NULL THEN 'CONVERTED' ELSE source_lead.qualification_status END AS qualification_group,COUNT(*) AS lead_count FROM crm_lead source_lead WHERE "
        + leadWhere + ' GROUP BY qualification_group) grouped_funnel;');
      const funnel = Object.fromEntries(['UNQUALIFIED', 'QUALIFYING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'].map(name => [name, 0]));
      for (const entry of funnelRows) funnel[entry.name] = Number(entry.count);
      for (const dimension of ['territory', 'segment', 'industry', 'score']) {
        const key = (alias, kind) => dimension === 'territory' ? "COALESCE((SELECT territory_name FROM crm_territory territory WHERE territory.territory_id=" + alias + ".territory_id AND territory.tenant_id=" + alias + ".tenant_id AND territory.deleted=0),'未设置')"
          : dimension === 'score' ? "CASE WHEN lead_score IS NULL OR lead_score<=0 THEN '0及以下' WHEN lead_score<=30 THEN '1-30' WHEN lead_score<=60 THEN '31-60' WHEN lead_score<=100 THEN '61-100' ELSE '100以上' END"
          : "CASE WHEN " + alias + "." + (dimension === 'segment' ? 'market_segment' : 'industry') + " IS NULL OR TRIM(" + alias + "." + (dimension === 'segment' ? 'market_segment' : 'industry') + ")='' THEN '未设置' ELSE " + alias + "." + (dimension === 'segment' ? 'market_segment' : 'industry') + " END";
        const statement = "SELECT JSON_OBJECT('name',name,'leads',SUM(lead_count),'customers',SUM(customer_count)) FROM (SELECT " + key('source_lead', 'lead')
          + ' AS name,COUNT(*) AS lead_count,0 AS customer_count FROM crm_lead source_lead WHERE ' + leadWhere + ' GROUP BY name'
          + (dimension === 'score' ? '' : ' UNION ALL SELECT ' + key('customer', 'customer') + ' AS name,0 AS lead_count,COUNT(*) AS customer_count FROM crm_customer customer WHERE ' + customerWhere + ' GROUP BY name')
          + ') distributions GROUP BY name ORDER BY name;';
        const expected = rows(statement).map(value => ({ name: value.name, leads: Number(value.leads), customers: Number(value.customers) }));
        const actual = await ok(actor, '/crm/profile-report?dimension=' + dimension);
        check(actor + '_' + dimension + '_funnel_matches_all_visible_real_leads', normalized(actual.funnel) === normalized(funnel));
        check(actor + '_' + dimension + '_distribution_matches_independent_sql_aggregation', actual.distribution.length === expected.length
          && expected.every(value => actual.distribution.some(candidate => candidate.name === value.name && candidate.leads === value.leads && candidate.customers === value.customers)));
        check(actor + '_' + dimension + '_totals_include_each_visible_record_once', actual.distribution.reduce((sum, value) => sum + value.leads, 0) === Object.values(funnel).reduce((sum, value) => sum + value, 0));
        if (dimension === 'score') check(actor + '_score_report_does_not_invent_customer_scores', actual.distribution.every(value => value.customers === 0));
        observations.push({ actor, dimension, funnel: actual.funnel, distribution: actual.distribution, source: 'actual_http_compared_to_independent_sql_aggregation' });
      }
    }
    rejected(await api('sales', '/crm/profile-report?dimension=invalid'), 'report_rejects_unknown_dimension', /分层统计维度无效/);
    rejected(await api('employee', '/crm/profile-report?dimension=territory'), 'report_requires_explicit_permission', /权限|无权/);
    check('department_report_excludes_other_department_owned_records', observations.find(value => value.actor === 'manager' && value.dimension === 'score').distribution.reduce((sum, value) => sum + value.leads, 0)
      < observations.find(value => value.actor === 'admin' && value.dimension === 'score').distribution.reduce((sum, value) => sum + value.leads, 0));
    fixture.reportObservations = observations; evidence.reports = true; evidence.permissions = true;
  });
  return observations;
}
