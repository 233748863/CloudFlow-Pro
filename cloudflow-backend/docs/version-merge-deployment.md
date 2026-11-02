# 合并版部署配置只读预检

检查时间：2026-11-02。只读比较 f576fd1a 与当前工作树的 7 份 config/*.yaml、6 服务 application.yml，并读取 192.168.1.173 的 /data/cloudflow/runtime/config/、native.env、6 个 systemd 单元及相关运行进程的配置变量；Nacos 仅登录读取配置，没有写入配置、数据库或服务器文件，没有构建或 Git 索引操作。所有秘密仅核对存在与格式，未写入本文。

## 结论与必须同步项

服务器 7 份外部 YAML 与本地 config 在解析后的键值上完全一致，但外部网关路由仍覆盖了程序中的新版列表。完整使用本轮新增薪资业务还缺人事加密配置；该项必须同时处理新建测试数据的加密格式，不能只切开关。

| 项目 | 当前实况与影响 | 主代理部署时的具体处理 |
| --- | --- | --- |
| 新网关路由 | 外部 config/cloudflow-gateway.yaml 为 12 条旧路由；新 jar application.yml 为 13 条，新增 cloudflow-oauth2 与 cloudflow-portal-auth。Spring 的列表配置由高优先级来源整组覆盖，单更新 jar 无法提供这 2 个入口。 | 在本地 config 和服务器对应外部配置中同步 2 条路由：id=cloudflow-oauth2、Path=/oauth2/**、uri=lb://cloudflow-auth；id=cloudflow-portal-auth、Path=/portal/**、uri=lb://cloudflow-auth；两条都不设置 StripPrefix。保留外部已有 auth-tenant-options 等有效规则。核对新版 [/crm/track/unsubscribe]、[/portal/**] 和 [/**] 的跨域键最终合并结果，保留当前站点来源 http://192.168.1.173:18080。 |
| HR 薪资与工作流触发加密 | native.env、运行 HR 进程与有效外部配置均无可用 AES 密钥；HR cloudflow.encrypt.enabled 目前 false。HrHCipherService:25–33 对薪资核价、加班核价/结算、预支等明确拒绝，报 PAY_ENCRYPTION_UNAVAILABLE；WorkflowTriggerSecrets:34、69–73 也要求 AES 密钥。 | 对完整业务验收，需要 CLOUDFLOW_ENCRYPT_ENABLED=true 和 CLOUDFLOW_ENCRYPT_AES_KEY；AES 密钥要求 UTF-8 编码后为 16、24 或 32 字节，推荐新建独立随机 32 字节 ASCII 密钥并持久保存于受保护环境配置。先将重建后的测试敏感字段按同一密钥生成/写入，再启用；HR 外部 YAML 已有环境变量占位，无须在代码写秘密。SM4 未发现本范围强制需要，保持缺省。 |

HR 数据注意事项：当前 06 中 hr_offer.salary（例如 06:11438）等为明文测试值，通用 EncryptUtils.decrypt 遇到非密文会返回 ***；HrHCipherService 的新增金额采用 H1: 前缀。此处是新版测试数据初始化与功能开关的协调要求，不要求兼容存量数据，也不得通过新增解密失败回退来绕开。预检未修改种子或打开开关。

## 已具备，保留现有值

- 消息中心：CLOUDFLOW_MESSAGE_SECRET_KEY 已具备，满足至少 32 字符；cloudflow.message.secret-key 的新版 jar 占位会自动读取。receiver-expand-limit=500、短信 daily-limit=10、expire-minutes=5 均有 jar 默认值，不需复制。外部邮件/短信供应商凭据仍由对应业务配置提供。
- 集中任务：CLOUDFLOW_JOB_AUTH_KEY / WORKFLOW_KEY / OA_KEY / CRM_KEY / HR_KEY 均已具备，5 个值全部通过 Base64 解码后恰为 32 字节的代码约束。CLOUDFLOW_JOB_AUTH_URL=http://192.168.1.173:19001，符合原生 Auth 实际端口；不能恢复模板默认 9001。新 report-enabled、service-endpoints 与公共 handler 周期参数已经在外部配置。
- 服务地址：6 单元均读取 /data/cloudflow/native.env；分别以 SPRING_CONFIG_ADDITIONAL_LOCATION 加载公共外部配置与本服务外部配置。应用端口 19000–19005、管理端口 19100–19105 已独立设置。Redis 有效库为 10，由环境与 SPRING_APPLICATION_JSON 双重指向；不按 YAML 默认 0 操作。DB / Redis / Nacos 凭据已具备，不需重设。
- 报表：新版 ReportFeignConfiguration 设置连接 1,000 ms、读取 6,500 ms、禁止重试；4 个报表客户端使用已有服务发现名称，无新增密钥或固定 URL 需要注入。新前端组件随本次构建产物更新即可。
- 原文件保留：CLOUDFLOW_IMPORT_DELETE_ORIGINAL_AFTER_IMPORT 未设置，新版默认空，沿用 30 天保留，不影响导入功能；无需为了升级改成删除原文件。

## 需业务接入资料的可选能力

| 能力 | 实际配置状态 | 启用条件与建议 |
| --- | --- | --- |
| 企业微信 IM | cloudflow.im.enabled 默认为 false；独立 secret-key、公网 public-url 与 login-redirect-paths 缺失。 | 保持关闭可正常登录和审批。实际接入时提供 cloudflow.im.enabled、独立 secret-key（至少 32 字符）、有效 HTTPS public-url，以及登录精确跳转路径名单和租户企业微信凭据；不要将消息中心密钥当作已配置 IM 的证据。 |
| 第三方 OAuth2 | cloudflow.oauth2.enabled 默认为 false，独立 secret-key/public-url 未配置。 | 本轮补齐路由后仍保持既有关闭状态；实际启用需独立 secret-key（至少 32 字符）、public-url 及受控 service-user-ids 等业务配置。 |
| 外部文件存储 | CLOUDFLOW_FILE_STORAGE_SECRET_KEY 缺失。 | 本地文件驱动无需外部供应商秘密；配置需要保存访问密钥的外部存储前，补独立 cloudflow.file-storage.secret-key 或 CLOUDFLOW_FILE_STORAGE_SECRET_KEY（至少 32 字符）。 |
| 外部门户 | CLOUDFLOW_PORTAL_ENABLED=false，public-url 缺失。 | 保留关闭；正式启用再配置站点地址与对应跨域来源，不因本次版本升级自动公开门户。 |

IM / OAuth2 的属性没有现成 YAML 环境占位。实际接入时建议在受保护外部配置显式添加相应键和环境占位，或向已有 SPRING_APPLICATION_JSON 合并准确的层级键，避免误用环境变量命名而未绑定；不得整段覆盖现有 Redis、连接池和审计开关。

## 配置来源与验证边界

与 f576fd1a 相比，公共/Auth 外部模板新增集中任务与代码生成开关，HR 外部模板将 Redis 超时改为 10s；这些已与服务器一致。6 个 jar application.yml 新增消息、任务签名密钥、导入、门户、新路由、文件上传限制、跨服务超时及 traceId 日志等，除上表外均随新 jar 生效或由现有环境满足。

Nacos 当前实际 namespace 的 7 个普通 DataId 与 7 个 prod DataId（cloudflow-common、gateway、auth、service-workflow、service-oa、service-crm、service-hr）读取均为 HTTP 404；登录成功，未发现 Nacos 中另有配置补足缺失键。本轮仅核对当前配置来源，没有改变 Nacos 内容。

已保留现有 CLOUDFLOW_CODEGEN_ENABLED=true、CLOUDFLOW_PORTAL_ENABLED=false、CLOUDFLOW_TOTP_ENABLED=false；没有为本次部署调整这些业务开关。本分工未创建配置副本、秘密落盘或临时产物，未进行接口、浏览器或全站回归；运行验收由主代理按部署后实际影响执行。

## 主代理实施结果

七份外部配置此前已与仓库一致，网关新增两条路由及三组跨域规则现已同步到仓库和服务器，最终14条路由，保留既有auth-tenant-options、站点来源和WebSocket前缀；网关已单独重启，实际登录及退出通过。门户、OAuth2等业务开关仍按原配置关闭，补齐路由不代表已开通这些业务。

人事金额加密仍沿用既有关闭配置，未临时生成密钥后强制解密明文种子，也未增加明文兼容回退。薪资核价、加班核价/结算、预支及需要AES的流程触发密钥功能属于已确认配置边界，本次未验收为可用；启用需将密钥管理和相应敏感测试数据初始化一起处理。此边界不影响本次已验证的招聘来源、部门负责人和费用标准契约。

本次部署源代码为合并103c9f1b加修复a9c5b942。六个服务java17 -jar原生运行，MySQL与Redis仍由Docker运行；前端同机18080端口。实际文件摘要与本地发布包一致，七份SQL重建376表6990列，Redis10确认的87143条项目缓存备份后清理。运行验收覆盖六服务健康、前端HTTP200及index摘要、真实验证码登录、8个核心接口、来源独立渠道可空、EMAIL身份归属、费用具体城市四周期/租户隔离/实际逻辑删除、退出后旧token返回401；测试数据精确清理，审计保留。启动后读取的运行日志ERROR为0。详细时间与最终分支状态见版本合并主记录。
