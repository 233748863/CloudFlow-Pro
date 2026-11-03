# 持久化 JSON 演示数据形状复核

2026-11-02，按 13:31 派工只读扫描；本代理未修改 Java、SQL、生成器，未构建、未连接服务器。

## 结论

当前 `07.cloudflow-demo-seed.sql` 有 **20 张表、23 个 List 字段**生成 JSON 对象，代码要求 JSON 数组；候选人列表 500 属于这一共同原因。扫描覆盖全部 Java/XML/YAML 中的 typeHandler 声明，共 **29 张表、37 个独立持久化字段**，其中 33 个字段经实体继承 Payload；另 1 处 Mapper SQL 的 metric_config 类型处理器与实体为同一字段，没有遗漏为另一项。未发现专门映射为业务实体类的 JSON 字段，也未发现自定义处理器或 XML/配置中的额外映射。

typeHandler = 数据库读取 JSON 后转换成 Java 字段类型的处理器；List = 数组，Map = 对象，JsonNode = 可容纳任意 JSON 结构。

根因在 `scripts/generate-demo-seed.ps1:679`：所有未单独处理的 JSON 列统一生成 `JSON_OBJECT('source','demo50','tenantId',100000+t.n,'table',表名,'row',r.n+1,'label','全链路演示数据')`。下表逐列拆分真实 INSERT/SELECT 表达式核对，37 个字段当前都命中该对象模板。不能通过允许对象自动转数组掩盖该种子问题。

## 建议主代理处理范围

对第一张表的 23 个字段同步修正生成器和 07，再仅修正正式库中本轮生成且仍为 demo50 对象的对应列；空数组 `JSON_ARRAY()` 可作为无附件/无子项的合法数据，但考勤规则、试卷题目、绩效分布等若要用于真实演示，需按已有写入端生成有业务含义的数组，不能把空数组验收等同于流程可运行。保留租户与样例主键范围，不把业务数据中的所有 JSON 对象一律替换。修复后用 `JSON_TYPE(列)='ARRAY'` 核对上述字段，并请求相应列表接口。

另 5 个 JsonNode 字段在数据库注释中明确是数组，07 同样生成对象；它们可以被 JsonNode 读取，因此应与 23 个会触发 List 读取错误的字段区分。其余 6 个 JsonNode 和 3 个 Map 顶层形状一致，通用对象的内部业务字段是否完整未在本次只读类型扫描中判定为通过。

## 确定不匹配的 List 字段

下表 ARRAY = JSON 数组；OBJECT = JSON 对象。源码路径以 `cloudflow-backend/` 为根；SQL 行为 07 中 INSERT 行，下一行是对应 SELECT。

| 表.列 | Java 类型 | 预期结构 | 07 当前结构 | 证据 |
| --- | --- | --- | --- | --- |
| `hr_attendance_rule.work_days` | `List<Integer>` | ARRAY | OBJECT | [HrAttendanceRulePayload.java:33](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrAttendanceRulePayload.java#L33); [07:349](../DB/07.cloudflow-demo-seed.sql#L349) |
| `hr_attendance_rule.check_methods` | `List<String>` | ARRAY | OBJECT | [HrAttendanceRulePayload.java:36](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrAttendanceRulePayload.java#L36); [07:349](../DB/07.cloudflow-demo-seed.sql#L349) |
| `hr_benefit_payment.items` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrBenefitPaymentPayload.java:32](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrBenefitPaymentPayload.java#L32); [07:355](../DB/07.cloudflow-demo-seed.sql#L355) |
| `hr_benefit_request.attachments` | `List<Object>` | ARRAY | OBJECT | [HrBenefitRequestPayload.java:31](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrBenefitRequestPayload.java#L31); [07:357](../DB/07.cloudflow-demo-seed.sql#L357) |
| `hr_candidate.resume_attachment_urls` | `List<String>` | ARRAY | OBJECT | [HrCandidatePayload.java:40](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrCandidatePayload.java#L40); [07:361](../DB/07.cloudflow-demo-seed.sql#L361) |
| `hr_dispute_arbitration.hearing_dates` | `List<String>` | ARRAY | OBJECT | [HrDisputeArbitrationPayload.java:28](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrDisputeArbitrationPayload.java#L28); [07:375](../DB/07.cloudflow-demo-seed.sql#L375) |
| `hr_employee_contract.attachment_urls` | `List<String>` | ARRAY | OBJECT | [HrEmployeeContractPayload.java:40](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrEmployeeContractPayload.java#L40); [07:389](../DB/07.cloudflow-demo-seed.sql#L389) |
| `hr_employee_document.attachment_urls` | `List<String>` | ARRAY | OBJECT | [HrEmployeeDocumentPayload.java:35](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrEmployeeDocumentPayload.java#L35); [07:391](../DB/07.cloudflow-demo-seed.sql#L391) |
| `hr_exam_attempt.answers` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrExamAttemptPayload.java:32](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrExamAttemptPayload.java#L32); [07:393](../DB/07.cloudflow-demo-seed.sql#L393) |
| `hr_exam_paper.question_ids` | `List<Long>` | ARRAY | OBJECT | [HrExamPaperPayload.java:31](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrExamPaperPayload.java#L31); [07:395](../DB/07.cloudflow-demo-seed.sql#L395) |
| `hr_exam_question_bank.options` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrExamQuestionBankPayload.java:28](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrExamQuestionBankPayload.java#L28); [07:397](../DB/07.cloudflow-demo-seed.sql#L397) |
| `hr_exam_question_bank.answer` | `List<Object>` | ARRAY | OBJECT | [HrExamQuestionBankPayload.java:31](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrExamQuestionBankPayload.java#L31); [07:397](../DB/07.cloudflow-demo-seed.sql#L397) |
| `hr_interview.interviewer_ids` | `List<Long>` | ARRAY | OBJECT | [HrInterviewPayload.java:41](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrInterviewPayload.java#L41); [07:403](../DB/07.cloudflow-demo-seed.sql#L403) |
| `hr_interview.interviewer_names` | `List<String>` | ARRAY | OBJECT | [HrInterviewPayload.java:44](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrInterviewPayload.java#L44); [07:403](../DB/07.cloudflow-demo-seed.sql#L403) |
| `hr_mall_item.images` | `List<String>` | ARRAY | OBJECT | [HrMallItemPayload.java:30](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrMallItemPayload.java#L30); [07:419](../DB/07.cloudflow-demo-seed.sql#L419) |
| `hr_salary_slip.components` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrSalarySlipPayload.java:33](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrSalarySlipPayload.java#L33); [07:457](../DB/07.cloudflow-demo-seed.sql#L457) |
| `hr_talent_calibration_session.participants` | `List<Long>` | ARRAY | OBJECT | [HrTalentCalibrationSessionPayload.java:29](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrTalentCalibrationSessionPayload.java#L29); [07:465](../DB/07.cloudflow-demo-seed.sql#L465) |
| `hr_training_certificate_template.fields` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrTrainingCertificateTemplatePayload.java:27](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrTrainingCertificateTemplatePayload.java#L27); [07:493](../DB/07.cloudflow-demo-seed.sql#L493) |
| `hr_training_course.materials` | `List<Long>` | ARRAY | OBJECT | [HrTrainingCoursePayload.java:32](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrTrainingCoursePayload.java#L32); [07:495](../DB/07.cloudflow-demo-seed.sql#L495) |
| `hr_work_injury_investigation.scene_photos` | `List<String>` | ARRAY | OBJECT | [HrWorkInjuryInvestigationPayload.java:26](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrWorkInjuryInvestigationPayload.java#L26); [07:509](../DB/07.cloudflow-demo-seed.sql#L509) |
| `hr_work_injury_treatment.receipts` | `List<Long>` | ARRAY | OBJECT | [HrWorkInjuryTreatmentPayload.java:37](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrWorkInjuryTreatmentPayload.java#L37); [07:513](../DB/07.cloudflow-demo-seed.sql#L513) |
| `hr_perf_distribution_rule.distribution` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrPerfDistributionRule.java:29](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/entity/HrPerfDistributionRule.java#L29); [07:427](../DB/07.cloudflow-demo-seed.sql#L427) |
| `hr_perf_evaluator_response.dimension_scores` | `List<Map<String, Object>>` | ARRAY | OBJECT | [HrPerfEvaluatorResponse.java:29](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/entity/HrPerfEvaluatorResponse.java#L29); [07:431](../DB/07.cloudflow-demo-seed.sql#L431) |

## JsonNode 中的数组业务字段

以下 5 项由表结构注释明确要求数组；JsonNode 自身接受对象，不能仅用接口未报反序列化错误作为验收。

| 表.列 | Java 类型 | 业务预期结构 | 07 当前结构 | 证据 |
| --- | --- | --- | --- | --- |
| `hr_attendance_appeal.evidence_urls` | `JsonNode` | `ARRAY<string>` | OBJECT | [HrAttendanceAppealPayload.java:36](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrAttendanceAppealPayload.java#L36); [DDL:2020](../DB/03.cloudflow-hr.sql#L2020); [07:343](../DB/07.cloudflow-demo-seed.sql#L343) |
| `hr_performance_interview.improvement_items` | `JsonNode` | `ARRAY<object>` | OBJECT | [HrPerformanceInterviewPayload.java:38](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrPerformanceInterviewPayload.java#L38); [DDL:1988](../DB/03.cloudflow-hr.sql#L1988); [07:435](../DB/07.cloudflow-demo-seed.sql#L435) |
| `hr_performance_interview.attachment_urls` | `JsonNode` | `ARRAY<string>` | OBJECT | [HrPerformanceInterviewPayload.java:44](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrPerformanceInterviewPayload.java#L44); [DDL:1991](../DB/03.cloudflow-hr.sql#L1991); [07:435](../DB/07.cloudflow-demo-seed.sql#L435) |
| `hr_resume_parsed_fields.parsed_skills` | `JsonNode` | `ARRAY<string>` | OBJECT | [HrResumeParsedFieldsPayload.java:33](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrResumeParsedFieldsPayload.java#L33); [DDL:1951](../DB/03.cloudflow-hr.sql#L1951); [07:455](../DB/07.cloudflow-demo-seed.sql#L455) |
| `hr_resume_parsed_fields.parsed_experiences` | `JsonNode` | `ARRAY<object>` | OBJECT | [HrResumeParsedFieldsPayload.java:36](../cloudflow-service-hr/src/main/java/com/cloudflow/hr/domain/dto/HrResumeParsedFieldsPayload.java#L36); [DDL:1952](../DB/03.cloudflow-hr.sql#L1952); [07:455](../DB/07.cloudflow-demo-seed.sql#L455) |

其中 `parsed_skills` 的前端另有契约偏差：`src/services/api/hr/batch2.ts:18,36` 定义为 string，`HrResumeParsePanel.tsx:213,303` 直接作为文字渲染和编辑；后端存 JsonNode、建表说明为字符串数组。修正 seed 只能消除当前对象形状错误，页面读写标准仍应单独统一，不能恢复双格式兜底。本代理按只读范围未修改此链路。

## 顶层形状一致的 9 个字段

| 表.列 | Java 类型 | 07 当前结构 | 判定与证据 |
| --- | --- | --- | --- |
| `hr_exam_paper.config` | `Map<String,Object>` | OBJECT | 顶层匹配；HrExamPaperPayload.java:36，07:395；内部组卷规则是否完整需业务验收 |
| `oa_frontend_error_log.tags` | `Map<String,String>` | OBJECT | 顶层匹配；FrontendErrorLog.java:68，07:551；模板含数值 tenantId/row，建议生成真正的字符串标签，未标记为 List 型读取错误 |
| `oa_frontend_error_log.extra` | `Map<String,Object>` | OBJECT | 形状匹配；FrontendErrorLog.java:72，07:551 |
| `hr_attendance_rule.config_json` | `JsonNode` | OBJECT | 允许对象；HrAttendanceRulePayload.java:39，07:349 |
| `hr_benefit_scheme.benefit_config` | `JsonNode` | OBJECT | 允许对象；HrBenefitSchemePayload.java:33，07:359；HrEssServiceImpl:606 按键取值，模板缺少福利业务键 |
| `hr_comp_structure.component_config` | `JsonNode` | OBJECT | 允许对象；HrCompStructurePayload.java:31，07:371；前端 compensation.ts:46,88 使用 itemIds 属性，模板缺少该属性 |
| `hr_leave_type.quota_rule` | `JsonNode` | OBJECT | 允许对象；HrLeaveTypePayload.java:33，07:411 |
| `hr_lifecycle_detail.detail_json` | `JsonNode` | OBJECT | 对象形状匹配；HrLifecycleDetailPayload.java:24，07:415；入职服务 HrEmployeeOnboardingService:168 复制为 ObjectNode |
| `hr_performance_objective.metric_config` | `JsonNode` | OBJECT | 允许对象；HrPerformanceObjectivePayload.java:30，07:437；Mapper:15/23 显式处理器与参数也为 JsonNode |

## 扫描与验收边界

使用 rg 全项目定位处理器声明，再以只读脚本逐一解析 TableName、TableField、继承关系、列名及 07 对应的 SELECT 表达式；37 个字段全部定位到建表列与 INSERT，没有未匹配项。`%TEMP%/cloudflow-json-field-scan.json` 保留结构化扫描结果供主代理修复使用（包含表、列、Java 类型、实体/源码路径及行号、SQL 表达式、DDL 行号），未包含凭据。该结果为源码和 SQL 静态检查；实际库数量、修复写入和接口复验由主代理负责。

## 13:49 技能数组链路实施决策

按主代理指令最小修改前端 `batch2.ts` 与 `HrResumeParsePanel.tsx`：接口的 parsedSkills 固定 `string[]`；编辑状态使用独立文本字段，打开时 join 换行，提交时逐行 trim/过滤空行并生成数组；列表 join 展示，文本框提示每行一项。不会加入 string/object/array 多类型转换或兼容。先记录本决策，再修改。

后端核实：`HrResumeParserServiceImpl:93,296` 的 extractSkills 创建 ArrayNode，仅添加词典字符串；无命中返回空数组。`listParsed:151` 通过 VO 的 JsonNode 原样输出数组；`updateParsed:245` 原样保存 payload.parsedSkills，当前合法数组请求不会再序列化成字符串。后端 DTO 的 JsonNode 本身未强制限制字符串/对象，但本次不扩展后端校验范围，未新增兼容。

同页面另有既有契约偏差，交主代理另行处理：后端 VO:32 返回 reviewStatus，前端使用 status（导致编辑按钮条件不成立）；后端 parsedExperiences 数组与前端 parsedWorkExperience 文本没有对应，更新还会把未传 parsedExperiences/parsedSchool 设为 null；服务 tenantId 固定 100000。上述问题不属于本次指定的 parsedSkills 最小修改，尚未改动。

实施完成：API 两处 parsedSkills 已改 string[]；页面独立 skillsText 保存用户的多行原文，提交前一次转换数组，空白输入提交 []；列表使用顿号连接，编辑回填使用换行连接，标签明确“每行一项”。未对后端返回值做字符串/对象兼容。两个源码文件 `git diff --check` 通过，静态搜索确认无残留 parsedSkills 文本类型。按统一构建调度没有运行 Maven/npm；前端 type-check/build 与页面交互由主代理验收。

## 14:13 简历解析契约与租户收尾决策

按主代理新授权继续处理上文暂留问题：前端固定使用 reviewStatus、parsedSchool、parsedExperiences；经历结构沿 extractExperiences 的 `{start,end,segment}` 对象数组，逐项展示与编辑起止时间和经历内容，完整回传院校、技能及经历。删除 parsedWorkExperience 和不存在的 reviewRemark/rawText 响应声明，不建立别名兼容。技能仍按每行一项编辑。

后端每个解析、列表、确认、驳回和修改入口均先读取可信 UserContext.tenantId，缺失则失败；移除固定 100000。解析前用候选人编号＋当前租户＋deleted=0 查询确认存在，避免为其他租户或已删除候选人创建解析记录。现有按租户筛选的查询保留，驳回和修改同步限定有效记录，正文租户不用于查写归属。保留现有正则抽取逻辑，不引入附件下载、PDF/DOCX 解析或新的推断规则。

新增定向测试拟覆盖非默认租户的解析写入/列表与修改、候选人不在可用范围时拒绝、技能和经历数组通过 JSON 请求与响应往返且院校保留、全部入口缺少租户上下文时拒绝。测试由主代理统一执行，本代理不运行 Maven/npm。

实施结果：前端接口与页面已使用 reviewStatus、parsedSchool、parsedExperiences；状态按钮直接判断 reviewStatus，经历可逐项编辑 start/end/segment、添加与删除，提交保留对象数组，院校独立编辑。清除 parsedWorkExperience、reviewRemark 等无对应响应字段，数组编辑不引入类型猜测。

后端 5 个入口均调用 requireTenantId，全部查询采用当前租户；解析新增一次候选人存在性查询，并同时约束编号、当前租户、deleted=0。正文 tenantId 不参与归属赋值，驳回/修改只取未删除记录。新增 `HrResumeParserContractTest` 共 5 项，覆盖解析范围与数组结果、不可用候选人拒绝、编辑 JSON 往返/院校保留/正文租户伪造无效、确认与驳回租户筛选、全部入口缺失上下文拒绝。源码 `git diff --check` 通过；测试尚未执行，交主代理 `mvn -B -ntp -f cloudflow-backend/pom.xml -pl cloudflow-service-hr -am verify`、前端 type-check/build 及运行验收。

仍存在的独立能力限制：当前页面触发解析仅传 resumeUrl，服务只对 rawText 做正则抽取，不负责下载附件及 PDF/DOCX 转文字；因此仅上传附件后触发解析不会产生正文提取结果。本轮未扩展该能力，不能把字段/租户修复等同于附件内容解析已接入。

## 主代理运行验收补记

28列的正式库demo50对象值已备份后精确修正，共70000个生成字段值；候选人列表恢复正常。简历链路HR verify及前端type-check/build通过，已部署；通过非默认租户真实调用解析、编辑、确认，reviewStatus、parsedSchool、parsedSkills和parsedExperiences完整往返，确认数据归属当前租户、跨租户候选人被拒绝。仅清理本次专用候选人/解析验收记录；手机号/邮箱接口保持脱敏，原值落库正确。附件URL自动提取正文仍为既有未接入能力，数组空样例不代表所有演示流程均已配置。
