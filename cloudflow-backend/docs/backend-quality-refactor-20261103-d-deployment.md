# D 盘版本服务器部署只读核查与切换计划

核查时间：2026-11-03 17:18:33—17:20:36（Asia/Shanghai）。目标为用户指定的 `192.168.1.173`；SSH 主机指纹与仓库已有固定值一致。用户已明确授权更新服务器、重建测试库；本记录的平台代理只做只读检查，Root负责统一备份、切换与运行验收。未停止服务、改库、清缓存、上传制品或发布Nacos配置。SSH口令仅由进程环境传入；服务器密码和密钥只在内存使用，未打印值或写入仓库。

## 当前实际运行状态

六个服务都是 `systemd` 管理的 Java17 `java -jar` 原生进程，运行用户/组 `cloudflow:cloudflow`，均 `active/running`、`NRestarts=0`；管理健康接口均 `UP`。前端由主机Nginx运行，18080返回HTTP200。实际可复用检查脚本为 `scripts/quality-checks/inspect-native-server.py`，从环境变量 `CLOUDFLOW_SERVER_SSH_PASSWORD` 读取SSH口令，默认输出经过秘密字段过滤的JSON；仅执行文件读取、健康GET、数据库SELECT、Redis INFO/SCAN和Nacos读取。可在切换前后复用，禁止将口令写入命令脚本或文档。

| 名称 | systemd 单元 | 当前 PID | 业务端口 | 管理端口 | app.jar 字节数 |
| --- | --- | ---: | ---: | ---: | ---: |
| gateway | cloudflow-gateway.service | 1953429 | 19000 | 19100 | 83067683 |
| auth | cloudflow-auth.service | 1938397 | 19001 | 19101 | 185928744 |
| workflow | cloudflow-workflow.service | 1938398 | 19002 | 19102 | 108514465 |
| oa | cloudflow-oa.service | 2249426 | 19003 | 19103 | 143341019 |
| crm | cloudflow-crm.service | 1938400 | 19004 | 19104 | 147595390 |
| hr | cloudflow-hr.service | 1938403 | 19005 | 19105 | 163055408 |

业务地址均为192.168.1.173，管理地址均为127.0.0.1。六个单元文件位于 `/etc/systemd/system/cloudflow-{name}.service`，工作目录 `/data/cloudflow/native/{name}`；启动命令统一为：

```text
/usr/lib/jvm/jre-17/bin/java -Xms128m -Xmx768m -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai -jar /data/cloudflow/runtime/apps/{name}/app.jar
```

现场六包的 `META-INF/MANIFEST.MF` 均为 `Main-Class: org.springframework.boot.loader.launch.JarLauncher`，`Start-Class`分别是六个应用入口；`Class-Path`项数均0，依赖在 `BOOT-INF/lib/` 内，依赖项数依次146/301/198/247/274/284。因此直接替换Root刚完成clean package的六个Spring Boot完整包即可，无须生成薄包、复用旧runtime/lib或改systemd启动命令；先验证新包的Main-Class/Start-Class及BOOT-INF目录再切换。旧包SHA-256与 `version-consolidation-20261102.md` 末表全部相同，不将历史旧包验收计作此次新包验收。

前端单元 `cloudflow-frontend.service` 使用 `/opt/gitlab/embedded/sbin/nginx -p /data/cloudflow/native/nginx/ -c nginx.conf -g "daemon off;"`，配置 `/data/cloudflow/native/nginx/nginx.conf`；监听 `192.168.1.173:18080`，静态目录 `/data/cloudflow/runtime/frontend`，网关上游 `192.168.1.173:19000`。现有index SHA-256=`28da2e03eac713d13c106726b0ff68bf3c9dee235adc202cb81117b396a14b23`，1235字节。保留Nginx预览转发和所有存储目录，只替换本次前端构建目录内容。

## 配置和基础设施

六个进程均读 `/data/cloudflow/native.env`，权限0600，profile=`prod`；各自通过 `SPRING_CONFIG_ADDITIONAL_LOCATION` 同时加载 `/data/cloudflow/runtime/config/cloudflow-common.yaml` 和对应模块YAML。七份外部YAML解析后的内容均与D盘当前 `config/` 相同，网关14条路由已含 `/oauth2/**`、`/portal/**` 且不去前缀，退订、门户及通用X-Trace-Id跨域配置也一致；当前站点来源仍为 `http://192.168.1.173:18080`。本轮无需为已相同内容发布Nacos或覆盖环境文件；Root若随最终制品保存配置快照，只保存普通外部YAML，保留服务器既有环境变量值。

Nacos实际地址 `192.168.1.173:8848`、namespace=`cloudflow-prod`、group=`DEFAULT_GROUP`；本次登录成功，7个普通DataId及7个prod DataId全部404。六个应用各有且只有一个健康启用实例，分别注册19000—19005。Nacos继续负责发现服务，当前有效外部业务配置存于服务器文件。

MySQL/Redis仍为Docker，现场容器为：mysql=`a4268a169e99`，镜像 `ma-mysql-runtime:phase2-393-559899160`；redis=`2d1b5ab6165d`，镜像 `ma-redis:7.4.11`；nacos=`ec9b500196a7`，镜像 `nacos:phase2-389-307d7bf0e`。服务器同时运行其他项目容器，本次不得执行Docker应用启动、compose切换、停止/重建基础设施或全局清理。应用六包不依赖Docker应用容器。

正式测试库实测目标 `192.168.1.173:3306/cloud_flow_db`，MySQL版本8.4.11，376表、6990列，`@@read_only=0`。各应用进程的Redis均为 `192.168.1.173:6379`，`SPRING_DATA_REDIS_DATABASE=10`且 `SPRING_APPLICATION_JSON.spring.data.redis.database=10`；PING成功，Redis7.4.11。17:20读取INFO时DB10有37315键，SCAN期间各前缀数量可能随运行写入变化，不能把在线数量当作停机后的清理清单。Redis另有DB0/5/12/13/14/15，均属于必须保留的其他范围；不得FLUSHALL。DB10已见cloudflow、sys、crm、workflow、hr、wf、CAPTCHA前缀和未归类键，Root应在停机后确认并备份完整项目键范围再清理，不能只删除某一个前缀。

环境文件中已存在的秘密键名：`DB_PASSWORD`、`NACOS_PASSWORD`、`REDIS_PASSWORD`、`CLOUDFLOW_JOB_AUTH_KEY`、`CLOUDFLOW_JOB_WORKFLOW_KEY`、`CLOUDFLOW_JOB_OA_KEY`、`CLOUDFLOW_JOB_CRM_KEY`、`CLOUDFLOW_JOB_HR_KEY`、`CLOUDFLOW_MESSAGE_SECRET_KEY`、`TOTP_ENCRYPTION_KEY`。没有 `CLOUDFLOW_ENCRYPT_AES_KEY` / `CLOUDFLOW_ENCRYPT_ENABLED`；HR金额加密继续属于历史既有关闭边界，不能据本次部署声明薪资等要求AES的功能已可用。门户和TOTP开关仍false，代码生成仍沿用现值；没有因为部署打开新业务开关。

## Root切换顺序与必要保护

1. 本地准备：使用D盘本次clean package六个完整jar、新前端生产目录、当前01—07七份SQL；生成本次唯一发布编号和含源码commit、各制品/SQL SHA-256的清单。上传到 `/data/cloudflow/releases/<本次编号>/` 的独立目录，检查绝对路径、父目录/子项非链接、上传摘要以及包入口一致性；保留现有runtime、native.env、profile、uploads、.cloudflow、data和Nginx配置。切换前复核本页PID/包摘要/外部配置未被他人更改。17:20检查所在盘可用空间102736539648字节；执行前须重新读取精确字节数并写入本次记录。
2. 停机及数据备份：先停止前端和gateway，再停止auth/workflow/oa/crm/hr，并确认七单元inactive、六管理端口已退出。只备份本次替换的六个旧jar、前端目录、普通外部配置和现有release-manifest，以及cloud_flow_db完整SQL与DB10项目键；备份目录 `/data/cloudflow/backups/<本次编号>/` 权限0700。MySQL凭据来自native.env的内存值，数据库备份包含routines/triggers/events/hex-blob并校验可解压；数据库及Redis备份必须覆盖停机后同一旧版本状态，失败时保留停机和备份，不继续删除库。其他数据库、Redis其他DB、文件存储和Docker容器保持运行。
3. 重建及替换：在已确认备份存在和七服务停止后，仅重建cloud_flow_db，按01→07顺序导入本次已验证SQL；检查表/列及本轮新增字段、负责人关联、正式HR审批类型、种子口令与待发送消息状态，以Root本地最终种子检查结果为基准，不硬编码旧376/6990。对停机后已确认的DB10项目缓存先备份后清理。将六个新jar以`.next`暂存后原子改名到原app.jar路径，前端采用已检查的同盘目录切换；设置可被cloudflow读取的权限，环境文件和systemd单元无需改变。失败需作为一组恢复旧jar/前端/库/缓存，禁止让旧代码使用新结构或新代码使用旧结构。
4. 启动验收：先启动auth/workflow/oa/crm/hr，再gateway，六管理端口UP且Nacos注册正确后启动frontend；复核七单元状态/重启计数、当前jar和index摘要、新表与关键字段、前端HTTP200、验证码登录及本轮实际改动的入口。按具体失败复查相关项；完整全站回归未执行，不标作通过。保存准确源码版本、数据库结果、验证范围和未解决事项至本页及最终交付记录。
5. 清理：本次验收通过且结果写入文档后，按项目清理公约删除本次独立发布暂存、旧包/库/缓存备份和重复本地产物；删除前重新核实路径/链接、运行引用及受版本控制边界，记录清理范围和磁盘前后可用字节。同盘其他项目有写入，差值不能归为本项目独立释放量。只保留当前运行文件、源码及可复用脚本。

上列是执行计划，未执行任何服务器修改。用户已授权本次部署与重建测试库，Root完成制品核对后可以在授权范围统一操作；平台代理等待Root的切换安排。

## 可复用脚本与不适用脚本

- `scripts/quality-checks/inspect-native-server.py`：本次已实际运行成功的只读现况检查，覆盖原生服务/包manifest/配置/健康/数据库/Redis/Nacos；可直接复用。Python依赖paramiko、pymysql、requests、PyYAML、redis当前均已存在，未为此安装依赖。
- `scripts/demo_seed_server.py`：已有固定主机指纹及SSH/MySQL连接辅助函数，凭据从环境及远端native.env读取；`scripts/quality-checks/verify-refactor-seed.py` 及当前SQL检查辅助可供Root适配正式目标后的只读数据核对。
- `scripts/deploy-server-native.py` 属2026-10-18首次Docker应用到systemd的迁移，prepare依赖旧deployment.json且switch处理旧应用容器，本次不能原样调用；`scripts/deploy-server-runtime.py`为旧Docker部署，同样不调用。`scripts/rebuild-demo-database.py`会在prepare中停止七服务、使用旧导入状态和验收入口，不作为只读预检使用，也不得与Root此次制品切换独立并行执行。

只读检查未生成截图、独立服务、数据库或磁盘报告副本；新脚本是可复用源码，无需清理。此前本地临时目录被审批拒绝的清理遗留仍按平台实施记录处理，不能借服务器部署绕过本地拒绝。

Redis归属补核：初次SCAN未归类的4317键经二次只读结构统计全部为数字租户前缀，二级命名空间全部sys；50个租户前缀均存在于当前cloud_flow_db.sys_tenant，未知租户数量0。未输出完整键名或缓存值，此证据补充项目缓存归属，不能代替停机后的精确备份清单。
