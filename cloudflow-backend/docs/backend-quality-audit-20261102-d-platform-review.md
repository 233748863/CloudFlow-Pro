# OA/CRM重点结论交叉复核

基线：`D:\CloudFlowPro`，`e0b9e7d27b7690e5eac5f3c02be55b59a52924bf`。仅复核OC08、OC09、OC13；只读源码和本机依赖字节码，未构建、未连接数据库或服务器。以下相对路径均从 `cloudflow-backend` 起算。

## 同意

| 原报告项 | 复核结果及保留边界 |
| --- | --- |
| OC08：普通实体更新删除标记失效 | 同意。复核费用标准、合同模板、证照、印章及出差的实际分支，均把deleted放在更新实体中；OA `src/main/resources/application.yml:105–107`已配置逻辑删除。独立读取本机MyBatis-Plus 3.5.7字节码：UpdateById调用sqlSet时传入`isWithLogicDelete`，Update调用时首参数也为true；TableInfo.getAllSqlSet过滤逻辑删除列。因此出差的`update(entity, wrapper)`也在本项范围，不能因带wrapper误判已正确写deleted。`ExpenseClaimServiceImpl.java:222–228`通过wrapper.set显式写列则不同。统一逻辑删除成立，借出限制/租户/版本及审计保留；没有运行数据库验证。 |
| OC09：固定租户和请求tenantId应收敛 | 同意。`OaExpenseStandardController.java:54,65`直接接收实体，Service:80–82只在null时补100000，update:103直接持久化；模板同理。`common-data/.../MyMetaObjectHandler.java:50–53`不会覆盖已有值。另独立核实3.5.7的TenantLineHandler.ignoreInsert：插入列已含tenant_id即跳过补列，项目MybatisPlusConfig:54–84没有覆写该行为；更新拦截器增加WHERE租户条件，没有强制改写SET中的租户值。因此现有多租户插件不能当作归属已校验的反证；报告保留“未做运行时越权复现”的限定正确。 |
| OC13：周期限额未实现 | 同意。`OaExpenseStandardServiceImpl.java:142–164`只比较当前item.amount与选中金额，limitType仅写回结果；173–205行选择标准不区分周期。全OA生产源码搜索getLimitType/limit_type及validateExceed，未找到另一套日/月/年累计计算。应保留limit_type字段并补业务计算，不能归为无用列删除。 |

## 需修正或补充

**OC13应增加“具体城市尚未接入实际提交校验”的事实边界。** `cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/ExpenseClaimServiceImpl.java:556–559`明确将applicantLevel与city同时设null，再调用validateExceed；唯一生产调用链由提交方法265行进入。因此当前具体城市标准虽可保存，匹配器184–185行要求具体城市相等，它们不会在正常提交链命中，实际只会使用职级/城市均通用的标准。原表格“city：具体城市，可空通用”描述了配置存储能力，需补上“提交链未传城市”的计算限制；城市取费用发生地、出差目的地还是员工所在地仍应明确，不能直接用员工档案城市替代。

其余两项无需撤回。上述补充只涉及原有三项的证据范围，没有扩展新审计或修改他人报告。
