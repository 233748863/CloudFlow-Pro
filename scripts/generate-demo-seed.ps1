[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB\07.cloudflow-demo-seed.sql'),
    [string]$SchemaPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB'),
    [ValidateRange(50, 50)][int]$RowsPerTenant = 50,
    [ValidateRange(50, 50)][int]$TenantCount = 50,
    [string[]]$Tables = @(),
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'demo-seed-oa-operations.ps1')
. (Join-Path $PSScriptRoot 'demo-seed-h-enhancements.ps1')

$tenantBase = 100000
$tenantLast = $tenantBase + $TenantCount - 1
$idBase = 1000000
$tableStride = 100000
$tenantStride = 1000
$demoPassword = '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC'

$tenantProfiles = @(
    @{ Code='yunshan'; Name='上海云杉数字科技有限公司'; City='上海'; Industry='软件服务' },
    @{ Code='xinghe'; Name='杭州星河数据科技有限公司'; City='杭州'; Industry='软件服务' },
    @{ Code='qichen'; Name='深圳启辰智能科技有限公司'; City='深圳'; Industry='智能制造' },
    @{ Code='zhixing'; Name='北京知行云联科技有限公司'; City='北京'; Industry='软件服务' },
    @{ Code='qinglan'; Name='成都青岚软件有限公司'; City='成都'; Industry='软件服务' },
    @{ Code='tuowei'; Name='广州拓维信息服务有限公司'; City='广州'; Industry='信息服务' },
    @{ Code='lantu'; Name='苏州澜图工业技术有限公司'; City='苏州'; Industry='智能制造' },
    @{ Code='hengyuan'; Name='南京衡远信息技术有限公司'; City='南京'; Industry='信息服务' },
    @{ Code='guanghe'; Name='武汉光合软件有限公司'; City='武汉'; Industry='软件服务' },
    @{ Code='yunqi'; Name='西安云启数科有限公司'; City='西安'; Industry='软件服务' },
    @{ Code='haiyue'; Name='青岛海岳精密制造有限公司'; City='青岛'; Industry='智能制造' },
    @{ Code='dingxin'; Name='宁波鼎新机电有限公司'; City='宁波'; Industry='智能制造' },
    @{ Code='zhizao'; Name='无锡智造装备有限公司'; City='无锡'; Industry='智能制造' },
    @{ Code='kerui'; Name='合肥科瑞自动化有限公司'; City='合肥'; Industry='智能制造' },
    @{ Code='lianhua'; Name='佛山联华新材料有限公司'; City='佛山'; Industry='新材料' },
    @{ Code='hemu'; Name='杭州禾木商贸有限公司'; City='杭州'; Industry='连锁零售' },
    @{ Code='shiguang'; Name='上海拾光零售有限公司'; City='上海'; Industry='连锁零售' },
    @{ Code='youxuan'; Name='成都优选供应链有限公司'; City='成都'; Industry='连锁零售' },
    @{ Code='haian'; Name='厦门海岸生活服务有限公司'; City='厦门'; Industry='连锁零售' },
    @{ Code='jiahe'; Name='郑州嘉禾商业管理有限公司'; City='郑州'; Industry='连锁零售' },
    @{ Code='kangyuan'; Name='南京康源医药科技有限公司'; City='南京'; Industry='医药健康' },
    @{ Code='anhe'; Name='广州安和医疗器械有限公司'; City='广州'; Industry='医药健康' },
    @{ Code='ruining'; Name='济南瑞宁生物技术有限公司'; City='济南'; Industry='医药健康' },
    @{ Code='qingyuan'; Name='长沙清源健康管理有限公司'; City='长沙'; Industry='医药健康' },
    @{ Code='yikang'; Name='福州益康药业有限公司'; City='福州'; Industry='医药健康' },
    @{ Code='zhongcheng'; Name='上海中澄金融信息服务有限公司'; City='上海'; Industry='金融服务' },
    @{ Code='huarui'; Name='北京华瑞企业管理咨询有限公司'; City='北京'; Industry='专业咨询' },
    @{ Code='juncheng'; Name='深圳君成资产管理有限公司'; City='深圳'; Industry='金融服务' },
    @{ Code='rongxin'; Name='重庆融信供应链管理有限公司'; City='重庆'; Industry='现代物流' },
    @{ Code='jinyu'; Name='天津锦誉物流科技有限公司'; City='天津'; Industry='现代物流' },
    @{ Code='luhai'; Name='济南陆海运输有限公司'; City='济南'; Industry='现代物流' },
    @{ Code='beichen'; Name='武汉北辰仓储有限公司'; City='武汉'; Industry='现代物流' },
    @{ Code='haoyuan'; Name='苏州昊远新能源有限公司'; City='苏州'; Industry='新能源' },
    @{ Code='lianchuang'; Name='常州联创储能科技有限公司'; City='常州'; Industry='新能源' },
    @{ Code='tiancheng'; Name='南昌天成光伏技术有限公司'; City='南昌'; Industry='新能源' },
    @{ Code='weilan'; Name='厦门蔚蓝能源设备有限公司'; City='厦门'; Industry='新能源' },
    @{ Code='shuren'; Name='杭州树人教育科技有限公司'; City='杭州'; Industry='教育服务' },
    @{ Code='boxue'; Name='北京博学在线教育有限公司'; City='北京'; Industry='教育服务' },
    @{ Code='mingde'; Name='成都明德职业培训学校有限公司'; City='成都'; Industry='教育服务' },
    @{ Code='xuetang'; Name='广州学堂教育服务有限公司'; City='广州'; Industry='教育服务' },
    @{ Code='huacheng'; Name='南京华成建设工程有限公司'; City='南京'; Industry='工程建设' },
    @{ Code='jianyuan'; Name='杭州建元项目管理有限公司'; City='杭州'; Industry='工程建设' },
    @{ Code='anrui'; Name='重庆安瑞建筑设计有限公司'; City='重庆'; Industry='工程建设' },
    @{ Code='chengxin'; Name='西安诚鑫工程咨询有限公司'; City='西安'; Industry='工程建设' },
    @{ Code='hezhong'; Name='深圳合众人力资源有限公司'; City='深圳'; Industry='专业咨询' },
    @{ Code='zhongtai'; Name='上海中泰质量技术服务有限公司'; City='上海'; Industry='专业咨询' },
    @{ Code='jingshi'; Name='北京景时市场研究有限公司'; City='北京'; Industry='专业咨询' },
    @{ Code='yuanjing'; Name='武汉远景企业服务有限公司'; City='武汉'; Industry='专业咨询' },
    @{ Code='haoran'; Name='宁波浩然跨境贸易有限公司'; City='宁波'; Industry='跨境贸易' },
    @{ Code='huanyu'; Name='青岛环宇国际贸易有限公司'; City='青岛'; Industry='跨境贸易' }
)
$people = @('李晨','王子涵','张嘉宁','刘思远','陈雅宁','杨宇轩','黄清禾','赵俊杰','周欣怡','吴文博','徐雨桐','孙浩然','胡婉晴','朱泽宇','高佳琪','林明远','何诗涵','郭博文','马若琳','罗天佑','周明远','沈悦宁','唐子墨','许安然','顾言川','蒋若曦','方知远','叶清妍','韩东阳','宋佳','袁可欣','邵文昊','杜若琳','秦浩宇','吕欣怡','魏子谦','程雨薇','谢承泽','傅诗涵','金昊','邱婉莹','薛凯文','谭思琪','陆景行','白若雪','郝俊峰','彭雅楠','孟星河','钟意','严可为')
$departments = @('总经办','产品研发部','技术架构部','项目交付部','销售部','客户成功部','市场品牌部','财务部','人力资源部','行政管理部','采购供应部','质量管理部','法务合规部','信息安全部','数据运营部','供应链管理部','培训发展部','售后服务部','审计监察部','战略投资部')
$posts = @('总经理','副总经理','研发经理','产品经理','项目经理','高级工程师','实施顾问','销售经理','客户成功经理','市场专员','财务主管','人事专员','行政主管','采购专员','质量工程师','法务专员','数据分析师','运维工程师','培训主管','审计专员')
$positions = @('Java开发工程师','前端开发工程师','数据工程师','产品运营经理','交付项目经理','客户成功顾问','解决方案架构师','销售总监','市场策划经理','财务分析师','招聘经理','行政专员','采购经理','质量管理经理','法务经理','信息安全工程师','供应链经理','培训经理','审计经理','业务分析师')
$families = @('技术研发序列','产品管理序列','项目交付序列','市场销售序列','客户成功序列','财务管理序列','人力行政序列','供应链序列','质量合规序列','数据运营序列')
$levels = @('P1 初级','P2 中级','P3 高级','P4 专家','M1 主管','M2 经理','M3 总监','M4 事业部负责人','E1 执行专员','E2 资深专员')
$partners = @('华东智联科技有限公司','南方精工制造有限公司','北辰医药集团有限公司','远景零售管理有限公司','中科云数信息技术有限公司','海岳供应链有限公司','瑞宁医疗器械有限公司','启明能源设备有限公司','嘉禾商业管理有限公司','联创项目咨询有限公司','安和电子商务有限公司','星瀚汽车零部件有限公司','鼎盛建筑工程有限公司','禾木生活服务有限公司','诚远物流有限公司','天际教育科技有限公司','恒达新材料有限公司','华信金融服务有限公司','蓝海数据中心有限公司','卓越企业服务有限公司','东海智能装备有限公司','新城物业管理有限公司','科瑞自动化系统有限公司','致远软件服务有限公司','金桥国际贸易有限公司','清源环保科技有限公司','锦程人力资源有限公司','云帆市场研究有限公司','中环节能技术有限公司','合创数字营销有限公司','万象仓储运营有限公司','极星工业设计有限公司','启航培训服务有限公司','盛安安全技术有限公司','博雅品牌咨询有限公司','融通支付科技有限公司','众诚质量认证有限公司','森海健康管理有限公司','极光网络技术有限公司','万里工程监理有限公司','睿达商业地产有限公司','尚品家居连锁有限公司','普惠供应链金融有限公司','新锐机器人有限公司','同济设计研究院有限公司','青禾农产品有限公司','优橙软件外包有限公司','瑞景文化传媒有限公司','高新检测技术有限公司','合信企业管理有限公司')
$products = @('云流协同办公平台','客户关系管理套件','智能审批引擎','人力资源管理平台','项目交付管理系统','数据分析与经营驾驶舱','供应链协同平台','合同风险管理模块','移动考勤助手','客户服务工单中心','统一身份认证服务','企业费用管理模块','电子签章服务','培训学习管理平台','资产运营管理系统','销售预测分析工具','智能库存预警模块','招聘流程管理平台','绩效管理与360评估','企业数据安全网关')
$projects = @('华东区域数字化升级项目','客户服务中心建设项目','智能制造执行系统实施项目','集团人力资源一体化项目','供应链协同平台改造项目','数据中台建设项目','移动办公平台推广项目','合同管理流程优化项目','客户成功体系建设项目','企业安全合规整改项目','销售管理平台升级项目','财务共享中心建设项目','园区运营数字化项目','零售门店管理系统项目','新能源项目管理平台项目','医药质量追溯项目','员工学习发展平台项目','采购协同优化项目','经营分析驾驶舱项目','业务流程自动化项目')
$contractNames = @('软件平台采购及实施合同','年度技术服务合同','系统运维服务协议','客户成功咨询服务合同','数据分析项目服务合同','人力资源管理系统合同','项目交付实施合同','供应链平台建设合同','云资源服务采购合同','电子签章服务协议','信息安全评估服务合同','培训服务采购合同','设备采购及安装合同','市场推广服务合同','办公场地租赁合同','物流仓储服务合同','软件许可使用协议','数据治理咨询合同','质量认证服务合同','工程监理服务合同')
$courses = @('新员工入职培训','项目管理实务','客户成功方法论','信息安全与合规','Excel经营分析','企业合同风险识别','领导力发展训练','销售谈判技巧','绩效目标设定','财务报销制度','商务沟通与写作','数据隐私保护培训','供应链管理基础','产品需求分析','职业健康安全培训','企业文化与价值观','智能办公工具应用','招聘面试技巧','质量管理体系培训','应急演练与消防安全')
$cities = @('上海','杭州','深圳','北京','成都','广州','苏州','南京','武汉','西安','青岛','宁波','无锡','合肥','佛山','厦门','郑州','济南','长沙','福州','重庆','天津','常州','南昌')
$provinces = @('上海市','浙江省','广东省','北京市','四川省','江苏省','湖北省','陕西省','山东省','福建省','河南省','湖南省','安徽省','重庆市','天津市','江西省')
$workflowNames = @('采购申请审批','费用报销审批','合同用印审批','员工请假审批','加班申请审批','招聘需求审批','供应商准入审批','付款申请审批','出差申请审批','资产领用审批','印章续期审批','证照借用审批','知识库发布审批','项目立项审批','预算调整审批','发票核销审批','薪资调整审批','绩效结果审批','转正申请审批','离职交接审批')
$roomNames = @('A栋 301 会议室','A栋 302 会议室','A栋 501 董事会议室','B栋 201 培训室','B栋 202 研讨室','B栋 305 视频会议室','创新中心路演厅','客户体验中心','多功能报告厅','项目交付作战室')
$assetNames = @('联想 ThinkPad T14 笔记本','戴尔 Latitude 7440 笔记本','华为 MateBook 商务本','小米 4K 显示器','罗技 MX Keys 键盘','惠普 LaserJet 打印机','Cisco 企业交换机','Poly 视频会议终端','华为云服务器资源','西门子工业网关')
$vehicleNames = @('别克 GL8 ES','特斯拉 Model Y','大众帕萨特 380TSI','丰田凯美瑞','奔驰 V260L','本田雅阁','福特全顺','广汽传祺 M8','比亚迪汉 EV','红旗 H5')
$dictNames = @('员工状态','审批状态','费用类别','合同类型','发票状态','客户等级','线索来源','项目阶段','风险等级','通知类型','培训类型','证件类型','资产类别','车辆类型','币种','性别','是否启用','考勤异常类型','用印类型','证照类型')
$opportunities = @('华东区域协同平台采购','集团客户服务中心升级','智能工厂数据采集建设','人力资源共享中心建设','供应链可视化项目','零售门店数字化改造','医药质量追溯平台','新能源项目管理平台','企业数据安全治理','财务共享与费控一体化')
$ticketTitles = @('登录认证偶发超时','客户报表导出失败','移动端考勤定位异常','合同审批节点未流转','接口响应时间过长','权限变更未及时生效','发票核销状态不一致','项目成员无法添加','培训课程视频无法播放','数据看板指标待确认')
$fileNames = @('客户需求说明书.docx','项目周报.xlsx','合同审批附件.pdf','员工花名册.xlsx','供应商资质证明.pdf','会议纪要.docx','费用报销发票.zip','产品白皮书.pdf','系统验收报告.docx','培训签到表.xlsx')
$rules = @('合同金额超过十万元需副总审批','单笔报销超过五千元需财务复核','员工连续迟到三次触发提醒','客户超过三十天未跟进进入预警','项目预算使用率超过百分之八十提醒','供应商证照到期提前三十天提醒','高风险操作必须二次确认','离职员工账号自动停用','发票金额与付款申请必须一致','招聘岗位薪资超标需总经理审批')
$specs = @('标准版','专业版','企业版','旗舰版','私有化部署版','基础服务包','高级服务包','年度订阅包','实施服务包','运维服务包')
$units = @('套','人月','台','件','次','项','年','月','张','盒')
$objectives = @('提升重点客户续约率','完成核心产品版本迭代','缩短项目交付周期','提升客户工单一次解决率','降低采购综合成本','完善员工培养与晋升体系','提高应收账款回款率','完成信息安全整改闭环','优化供应链库存周转','建立标准化项目交付流程','提升销售线索转化率','完成财务共享流程上线','改善关键岗位招聘周期','提高研发缺陷修复效率','完成年度合规审计','提升培训课程完成率','降低办公资产闲置率','建立客户健康度预警机制','完成经营分析指标统一','提升跨部门协作效率')
$meetingTitles = @('2026年第一季度经营复盘会','客户成功月度例会','产品路线图评审会','项目交付周例会','年度预算沟通会','信息安全专项会议','员工关怀委员会会议','供应商评审会议','销售预测校准会议','培训项目结项会议')

function Join-SqlLiterals([object[]]$values) {
    return (($values | ForEach-Object { "'" + ([string]$_).Replace("'", "''") + "'" }) -join ',')
}
function Get-TenantFieldExpression([string]$property) {
    return "ELT(MOD(t.n,50)+1,$(Join-SqlLiterals ($tenantProfiles | ForEach-Object { $_[$property] })))"
}
function Get-CatalogExpression([object[]]$values, [string]$offset = 't.n+r.n') {
    return "ELT(MOD($offset,$($values.Count))+1,$(Join-SqlLiterals $values))"
}
function Get-PersonExpression() { return Get-CatalogExpression $people }
function Get-DepartmentExpression() { return Get-CatalogExpression $departments }
function Get-PostExpression() { return Get-CatalogExpression $posts }
function Get-PositionExpression() { return Get-CatalogExpression $positions }
function Get-FamilyExpression() { return Get-CatalogExpression $families }
function Get-LevelExpression() { return Get-CatalogExpression $levels }
function Get-PartnerExpression() { return Get-CatalogExpression $partners }
function Get-ProductExpression() { return Get-CatalogExpression $products }
function Get-ProjectExpression() { return Get-CatalogExpression $projects }
function Get-ContractNameExpression() { return Get-CatalogExpression $contractNames }
function Get-CourseExpression() { return Get-CatalogExpression $courses }
function Get-WorkflowExpression() { return Get-CatalogExpression $workflowNames }
function Get-RoomExpression() { return Get-CatalogExpression $roomNames }
function Get-AssetExpression() { return Get-CatalogExpression $assetNames }
function Get-VehicleExpression() { return Get-CatalogExpression $vehicleNames }
function Get-DictNameExpression() { return Get-CatalogExpression $dictNames }
function Get-OpportunityExpression() { return Get-CatalogExpression $opportunities }
function Get-TicketTitleExpression() { return Get-CatalogExpression $ticketTitles }
function Get-FileNameExpression() { return Get-CatalogExpression $fileNames }
function Get-RuleExpression() { return Get-CatalogExpression $rules }
function Get-SpecExpression() { return Get-CatalogExpression $specs }
function Get-UnitExpression() { return Get-CatalogExpression $units }
function Get-ObjectiveExpression() { return Get-CatalogExpression $objectives }
function Get-MeetingTitleExpression() { return Get-CatalogExpression $meetingTitles }
function Get-IndustryExpression() { return Get-CatalogExpression @('软件服务','智能制造','医药健康','零售连锁','现代物流','金融服务','新能源','教育服务','工程建设','专业咨询') }
function Get-ProvinceExpression() { return Get-CatalogExpression $provinces }
function Get-HealthLevelExpression() { return Get-CatalogExpression @('A','A','B','B','C','D') }
function Get-DemoModuleExpression() { return "ELT(MOD(r.n,5)+1,'system','oa','crm','hr','workflow')" }
function Get-DemoServiceExpression() { return "ELT(MOD(r.n,5)+1,'auth','workflow','oa','crm','hr')" }
function Get-DemoHandlerExpression() { return "CONCAT('demoJobT',LPAD(t.n,2,'0'),'R',LPAD(r.n+1,3,'0'))" }
function Get-DemoMessageChannelExpression() { return "ELT(MOD(r.n,7)+1,'INTERNAL','EMAIL','SMS','WECOM','DINGTALK','FEISHU','WEBHOOK')" }
function Get-DemoMessageCategoryExpression() { return "ELT(MOD(r.n,5)+1,'TODO','CC','ANNOUNCEMENT','SYSTEM','BIZ_REMINDER')" }
function Get-DemoMessageStatusExpression() { return "ELT(MOD(r.n,6)+1,'PENDING','SENDING','SUCCESS','FAILED','CANCELLED','SKIPPED')" }
function Get-DemoJobTriggerExpression() { return "ELT(MOD(r.n,3)+1,'CRON','FIXED_RATE','FIXED_DELAY')" }
function Get-DemoJobLogTriggerExpression() { return "ELT(MOD(r.n,3)+1,'CRON','MANUAL','RETRY')" }
function Get-DemoJobLogStatusExpression() { return "ELT(MOD(r.n,6)+1,'RUNNING','SUCCESS','FAILED','TIMEOUT','SKIPPED','DISPATCH_FAILED')" }
function Get-DemoHolidayDateExpression() { return "DATE_ADD('2026-01-01', INTERVAL r.n DAY)" }
function Get-DemoHolidayTypeExpression() { return "ELT(MOD(r.n,3)+1,'WORKDAY','HOLIDAY','REST')" }

function Split-SqlParts([string]$text) {
    $parts = [System.Collections.Generic.List[string]]::new()
    $start = 0
    $depth = 0
    $quote = ''
    for ($index = 0; $index -lt $text.Length; $index++) {
        $character = $text[$index]
        if ($quote) {
            if ($character -eq $quote) {
                if ($index + 1 -lt $text.Length -and $text[$index + 1] -eq $quote) { $index++ } else { $quote = '' }
            }
        } elseif ($character -eq "'" -or $character -eq '"' -or [int][char]$character -eq 96) {
            $quote = $character
        } elseif ($character -eq '(') {
            $depth++
        } elseif ($character -eq ')') {
            $depth--
        } elseif ($character -eq ',' -and $depth -eq 0) {
            $parts.Add($text.Substring($start, $index - $start).Trim())
            $start = $index + 1
        }
    }
    if ($start -lt $text.Length) { $parts.Add($text.Substring($start).Trim()) }
    return $parts.ToArray()
}

function Read-Schema([string]$root) {
    $definitions = [System.Collections.Generic.List[object]]::new()
    $files = if (Test-Path -LiteralPath $root -PathType Leaf) { Get-Item -LiteralPath $root } else {
        Get-ChildItem -LiteralPath $root -Filter '*.sql' | Where-Object Name -Match '^0[1-5]\.' | Sort-Object Name
    }
    foreach ($file in $files) {
        $sql = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        $matches = [regex]::Matches($sql, '(?is)CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\x60?cloud_flow_db\x60?\.)?\x60?([a-z0-9_]+)\x60?\s*\((.*?)\)\s*ENGINE=')
        foreach ($match in $matches) {
            $columns = [System.Collections.Generic.List[object]]::new()
            $inlinePrimary = [System.Collections.Generic.List[string]]::new()
            foreach ($lineValue in ($match.Groups[2].Value -split '\r?\n')) {
                $line = $lineValue.Trim()
                if (-not $line -or $line -match '^(PRIMARY|UNIQUE|KEY|CONSTRAINT|INDEX|FOREIGN|CHECK)\b') { continue }
                $columnMatch = [regex]::Match($line, '^\x60?([a-zA-Z0-9_]+)\x60?\s+(.+)$')
                if (-not $columnMatch.Success) { continue }
                $rest = $columnMatch.Groups[2].Value.Trim().TrimEnd(',')
                $type = (($rest -split '\s+')[0]).ToLowerInvariant()
                $lengthMatch = [regex]::Match($type, '\((\d+)')
                # 注释是枚举列允许值的唯一权威来源，必须留下来给 Get-EnumValuesFromComment 用。
                $commentMatch = [regex]::Match($rest, "(?i)\bCOMMENT\s+'((?:[^']|'')*)'")
                $columns.Add([pscustomobject]@{
                    Name = $columnMatch.Groups[1].Value.ToLowerInvariant()
                    Type = $type
                    Length = if ($lengthMatch.Success) { [int]$lengthMatch.Groups[1].Value } else { 0 }
                    Auto = $rest -match '(?i)\bAUTO_INCREMENT\b'
                    Nullable = $rest -notmatch '(?i)\bNOT NULL\b'
                    DefaultExpression = if ($rest -match "(?i)\bDEFAULT\s+('[^']*'|[^\s,]+)") { $Matches[1] } else { $null }
                    Comment = if ($commentMatch.Success) { $commentMatch.Groups[1].Value.Replace("''", "'") } else { '' }
                })
                if ($rest -match '(?i)\bPRIMARY\s+KEY\b') { $inlinePrimary.Add($columnMatch.Groups[1].Value.ToLowerInvariant()) }
            }
            $primary = @()
            $primaryMatch = [regex]::Match($match.Groups[2].Value, '(?im)^\s*PRIMARY\s+KEY\s*\(([^)]*)\)')
            if ($primaryMatch.Success) {
                $primary = @(Split-SqlParts $primaryMatch.Groups[1].Value | ForEach-Object { $_.Trim().Trim([char]96).ToLowerInvariant() })
            } elseif ($inlinePrimary.Count -gt 0) {
                $primary = $inlinePrimary.ToArray()
            }
            $columnArray = $columns.ToArray()
            $definitions.Add([pscustomobject]@{
                Table = $match.Groups[1].Value.ToLowerInvariant()
                Columns = $columnArray
                Primary = $primary
                HasTenant = @($columnArray | Where-Object Name -eq 'tenant_id').Count -gt 0
            })
        }
    }
    return $definitions.ToArray()
}

function Quote-Sql([AllowNull()][string]$value) {
    if ($null -eq $value) { return 'NULL' }
    return "'" + $value.Replace('\', '\\').Replace("'", "''") + "'"
}

function Limit-TextExpression([string]$expression, [int]$length) {
    if ($length -gt 0) { return "LEFT($expression, $length)" }
    return $expression
}

function Get-NumericIdExpression([int]$tableIndex, [string]$tenantExpression = 't.n', [string]$rowExpression = 'r.n') {
    return "($idBase + $($tableIndex * $tableStride) + ($tenantExpression * $tenantStride) + $rowExpression + 1)"
}

function Get-StringIdExpression([string]$table, [string]$suffix, [string]$tenantExpression = 't.n', [string]$rowExpression = 'r.n') {
    return "CONCAT('demo50_t', LPAD($tenantExpression, 2, '0'), '_$table`_', LPAD($rowExpression + 1, 3, '0'), '_$suffix')"
}

function Get-TargetTable([string]$column) {
    $map = @{
        dept_id='sys_dept'; role_id='sys_role'; post_id='sys_post'; user_id='sys_user'; employee_id='hr_employee';
        position_id='hr_position'; family_id='hr_position_family'; level_id='hr_job_level'; candidate_id='hr_candidate';
        requisition_id='hr_recruitment_requisition'; interview_id='hr_interview'; offer_id='hr_offer'; shift_id='hr_shift';
        rule_id='hr_attendance_rule'; record_id='hr_attendance_record'; attendance_record_id='hr_attendance_record';
        leave_type_id='hr_leave_type'; request_id='hr_time_request'; component_id='hr_comp_component'; structure_id='hr_comp_structure';
        grade_id='hr_comp_grade'; scheme_id='hr_benefit_scheme'; objective_id='hr_performance_objective';
        assignment_id='hr_performance_assignment'; result_id='hr_performance_result'; review_id='hr_talent_review';
        pool_id='hr_talent_pool'; plan_id='hr_training_plan'; course_id='hr_training_course'; session_id='hr_training_session';
        enrollment_id='hr_training_enrollment'; paper_id='hr_exam_paper'; question_id='hr_exam_question_bank';
        template_id='hr_training_certificate_template'; certificate_id='hr_training_certificate'; injury_id='hr_work_injury';
        dispute_id='hr_labor_dispute'; account_id='hr_point_account'; item_id='hr_mall_item'; order_id='hr_mall_order';
        release_id='sys_legal_release'; document_id='sys_legal_document'; file_id='sys_file'; form_id='wf_form_definition';
        category_id='wf_process_category'; definition_id='wf_process_definition'; process_def_id='wf_process_definition';
        instance_id='wf_process_instance'; process_instance_id='wf_process_instance'; task_id='wf_task'; history_id='wf_task_history';
        attachment_id='wf_task_attachment'; delegation_id='wf_task_delegation'; add_sign_id='wf_task_add_sign';
        countersign_id='wf_countersign_task'; vote_id='wf_countersign_vote'; snapshot_id='wf_process_snapshot';
        message_id='wf_transaction_message'; project_id='oa_project'; contract_id='oa_contract';
        milestone_id='oa_project_task'; budget_id='oa_budget_plan'; subject_id='oa_budget_subject'; invoice_id='oa_invoice';
        seal_id='oa_seal'; license_id='oa_license'; vehicle_id='oa_vehicle'; asset_id='oa_asset'; supplier_id='oa_supplier';
        room_id='oa_meeting_room'; minutes_id='oa_meeting_minutes'; visitor_id='oa_visitor'; lead_id='crm_lead';
        customer_id='crm_customer'; contact_id='crm_contact'; opportunity_id='crm_opportunity'; quote_id='crm_quote';
        quote_line_id='crm_quote_line'; receivable_id='crm_receivable'; renewal_id='crm_renewal'; ticket_id='crm_service_ticket';
        sales_target_id='crm_sales_target'
        menu_id='sys_menu'; announcement_id='oa_announcement'
        calendar_id='sys_holiday_calendar'; holiday_calendar_id='sys_holiday_calendar'
        leave_period_id='hr_leave_period'; payroll_period_id='hr_payroll_period'; policy_id='hr_leave_policy'
        slab_id='hr_tax_slab'; tax_slab_id='hr_tax_slab'; grievance_id='hr_grievance'; ledger_id='hr_leave_ledger'
        batch_id='hr_payroll_batch'; salary_slip_id='hr_salary_slip'; original_slip_id='hr_salary_slip'; correction_slip_id='hr_salary_slip'
    }
    if ($map.ContainsKey($column)) { return $map[$column] }
    if ($column -match '(?i)(assignee|approver|reviewer|manager|interviewer|investigator|operator|driver|owner|applicant|handler|creator|recipient|sender|voter|evaluatee|evaluator|uploaded_by)_id$') { return 'sys_user' }
    if ($column -match '(?i)(predecessor|successor)_id$') { return 'oa_project' }
    return $null
}

function Get-TargetIdExpression([string]$target, [hashtable]$indexes, [hashtable]$definitionMap) {
    if (-not $target -or -not $indexes.ContainsKey($target)) { return $null }
    $targetDefinition = $definitionMap[$target]
    $primaryName = $targetDefinition.Primary[0]
    if ($target -eq 'wf_form_definition') { $primaryName = 'form_id' }
    $primaryColumn = $targetDefinition.Columns | Where-Object Name -eq $primaryName | Select-Object -First 1
    if ($scopedGeneration -and $target -notin $Tables) {
        if ($targetDefinition.HasTenant) {
            return "(SELECT reference_id FROM (SELECT $primaryName AS reference_id,tenant_id,ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY $primaryName)-1 AS row_index FROM cloud_flow_db.$target) AS demo_reference WHERE tenant_id=$tenantBase+t.n AND row_index=r.n)"
        }
        return "(SELECT reference_id FROM (SELECT $primaryName AS reference_id,ROW_NUMBER() OVER (ORDER BY $primaryName)-1 AS row_index FROM cloud_flow_db.$target) AS demo_reference WHERE row_index=r.n)"
    }
    if ($target -eq 'sys_menu') { return '(3000+r.n)' }
    if ($primaryColumn.Type -match 'char|varchar|text') { return Get-StringIdExpression $target $primaryName }
    $expression = Get-NumericIdExpression $indexes[$target]
    if ($target -in @('sys_user','sys_role')) { return "IF(t.n=0 AND r.n=0,1,$expression)" }
    return $expression
}

function Get-EnumValuesFromComment([string]$comment) {
    # 从建表注释里抽出枚举允许值。项目里的注释有两种写法，都要认：
    #   括号内：状态(PENDING待开始/IN_PROGRESS进行中/DONE已完成/OVERDUE已逾期/CANCELLED已取消)
    #   裸写  ：状态 ACTIVE/INACTIVE      维度类型：OWNER/DEPT      DRAFT/PAID/RECONCILED
    # 都抽成 PENDING/IN_PROGRESS/... 这样的清单。
    $values = [System.Collections.Generic.List[string]]::new()
    if (-not $comment) { return $values.ToArray() }
    # 单字符枚举值也要认（{0,29} 而不是 {1,29}）：
    #   hr_performance_result.grade 绩效等级(S/A/B/C/D)
    #   oa_announcement.priority   优先级 (L:低, M:中, H:高)
    #   sys_config.config_type     系统内置（Y是 N否）(Y/N)
    # 实测放宽只多认出这 3 列，已认出的列取值一个都没变，没有误判。
    $tokenPattern = '(?<![A-Za-z0-9_])([A-Z][A-Z0-9_+]{0,29})(?![A-Za-z0-9_+])'

    # 先按括号取。括号内要求既有分隔符（/ | 、 或 ", "）又有两个以上全大写词，
    # 缺一不可——只看"两个大写词"会把「TOTP密钥密文（AES-GCM）」误判成 AES/GCM。
    foreach ($segmentMatch in [regex]::Matches($comment, '[（(]([^）)]*)[）)]')) {
        $segment = $segmentMatch.Groups[1].Value
        if ($segment -notmatch '[/|、]|,\s') { continue }
        $tokens = @([regex]::Matches($segment, $tokenPattern) | ForEach-Object { $_.Groups[1].Value })
        if ($tokens.Count -lt 2) { continue }
        foreach ($token in $tokens) {
            if (-not $values.Contains($token)) { $values.Add($token) }
        }
    }
    if ($values.Count -gt 0) { return $values.ToArray() }

    # 括号里没有再找裸写的。这里必须要求"大写词之间由分隔符直接连接"，
    # 不能退化成"注释里出现两个大写词就算"，否则普通描述会被误判。
    foreach ($runMatch in [regex]::Matches($comment, '[A-Z][A-Z0-9_]*(?:\s*[/|、]\s*[A-Z][A-Z0-9_]*)+')) {
        # 匹配到的斜杠串紧邻前后若还有分隔符，说明这条串里还有非大写词成员，
        # 那是在描述格式而不是列举取值，整条丢掉。
        # 实例：sys_ip_acl.ip_pattern 注释「IP/CIDR/区间表达式」——裸写正则只吃到
        # IP/CIDR 就停在中文前，于是 IP 列被灌成字面量 'IP'/'CIDR'。
        # 实测这条闸只拦掉这一列，另外 238 个按注释取枚举的列取值一个都没变。
        $after = $comment.Substring($runMatch.Index + $runMatch.Length)
        $before = $comment.Substring(0, $runMatch.Index)
        if ($after -match '^\s*[/|、]' -or $before -match '[/|、]\s*$') { continue }
        $tokens = @([regex]::Matches($runMatch.Value, $tokenPattern) | ForEach-Object { $_.Groups[1].Value })
        if ($tokens.Count -lt 2) { continue }
        foreach ($token in $tokens) {
            if (-not $values.Contains($token)) { $values.Add($token) }
        }
    }
    return $values.ToArray()
}

# 抽数字枚举。上面那个 Get-EnumValuesFromComment 只认全大写词元，
# 「状态（1闲置 2在用 3维修 4报废 5丢失）」这种数字+中文的一个都抽不出来。
# 认两种写法：括号内「1闲置 2在用」，以及冒号式「0:草稿, 1:已发布」。
# 要求数字后面紧跟中文，避免把注释里的年份、长度、金额示例误当枚举。
function Get-NumericEnumValuesFromComment([string]$comment) {
    $values = [System.Collections.Generic.List[string]]::new()
    if (-not $comment) { return $values.ToArray() }

    $scan = {
        param([string]$segment)
        foreach ($m in [regex]::Matches($segment, '(?<![0-9A-Za-z_])([0-9])\s*[:：]?\s*[一-龥]{1,6}')) {
            $v = $m.Groups[1].Value
            if (-not $values.Contains($v)) { $values.Add($v) }
        }
    }

    # 先只看括号内，最可靠
    foreach ($segmentMatch in [regex]::Matches($comment, '[（(]([^）)]*)[）)]')) {
        & $scan $segmentMatch.Groups[1].Value
    }
    if ($values.Count -ge 2) { return $values.ToArray() }

    # 括号里没有再扫全串，例如「状态：0正常 1停用」
    $values.Clear()
    & $scan $comment
    return $values.ToArray()
}

function Get-EnumExpression([string[]]$values) {
    if (-not $values -or $values.Count -eq 0) { return $null }
    if ($values.Count -eq 1) { return (Quote-Sql $values[0]) }
    return "ELT(MOD(r.n,$($values.Count))+1,$(Join-SqlLiterals $values))"
}

function Get-StatusExpression([string]$table, [string]$column, [string]$type, [int]$length, [string]$comment = '') {
    if ($type -match '(?i)(tinyint|smallint|mediumint|int|bigint|bit)') { return '1' }
    # 短 CHAR/VARCHAR 默认灌 '0'，但必须先确认 '0' 在建表注释声明的取值域内。
    # 全项目 15 个短 CHAR status 列里有 12 个写了数字枚举：9 个是「0正常 1停用」，'0' 合法；
    # oa_vehicle（1可用…5报废）不含 0，
    # 硬灌 '0' 会让前端枚举映射取到 undefined —— 资产页 meta.className 直接崩（实测）。
    # 这里只在 '0' 越界时改用注释里的枚举，'0' 合法的那 9 张表取值一个都不变
    # （若改成一律按注释轮询，sys_tenant/sys_user/sys_menu 会被刷出一半「停用」）。
    if (($type -match 'char|varchar') -and $length -gt 0 -and $length -le 2) {
        # 必须 @() 包一层：StrictMode 下单元素返回值会被拆成标量，直接取 .Count 会抛
        # "The property 'Count' cannot be found on this object"。
        $numericEnum = @(Get-NumericEnumValuesFromComment $comment)
        if ($numericEnum.Count -ge 2 -and ($numericEnum -notcontains '0')) {
            return Get-EnumExpression $numericEnum
        }
        return "'0'"
    }
    if ($table -in @('sys_tenant','sys_user','sys_role','sys_post','sys_menu','sys_dict_type','sys_dict_data','sys_config')) { return "'0'" }
    if ($table -eq 'sys_legal_release') { return "'PUBLISHED'" }
    if ($table -eq 'sys_legal_document') { return "'0'" }
    if ($table -eq 'wf_task') { return "ELT(MOD(r.n,6)+1,'TODO','COMPLETED','REJECTED','REVOKED','SUSPENDED','DELEGATED')" }
    if ($table -in @('wf_process_instance', 'wf_process_monitor')) { return "ELT(MOD(r.n,14)+1,'DRAFT','RUNNING','PASSED','AUTO_PASSED','REJECTED','TERMINATED','INVALIDATED','CANCELLED','WITHDRAWN','TASK_BACK','PAUSED','RESTARTED','PENDING','FAILED')" }
    if ($table -eq 'hr_employee' -and $column -eq 'employee_status') { return "ELT(MOD(r.n,5)+1,'ACTIVE','ACTIVE','PROBATION','ON_LEAVE','ACTIVE')" }
    if ($table -eq 'crm_lead') { return "ELT(MOD(r.n,5)+1,'NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')" }
    if ($table -eq 'crm_customer') { return "ELT(MOD(r.n,5)+1,'POTENTIAL','NORMAL','VIP','ACTIVE','DORMANT')" }

    # 优先按建表注释取值。下面那些按表名前缀猜的兜底只对了一小半：
    # 同是 hr_*，hr_offer 要 DRAFT/SENT/ACCEPTED，hr_interview 要 SCHEDULED/COMPLETED，
    # 一句 ACTIVE/PENDING/APPROVED/REJECTED/COMPLETED 盖不住，灌出来的值前端枚举映射取不到，
    # 页面直接白屏（实例：oa_contract_payment_schedule 灌 DRAFT/APPROVED/COMPLETED
    # 而前端只认 PENDING/PAID/OVERDUE/CANCELLED，合同页 meta.cls 读 undefined 崩溃）。
    $enumValues = Get-EnumValuesFromComment $comment
    $enumExpression = Get-EnumExpression $enumValues
    if ($enumExpression) { return $enumExpression }

    if ($table -like 'wf_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','SUCCESS','FAILED','COMPLETED')" }
    if ($table -match '^hr_.*(training|exam)') { return "ELT(MOD(r.n,5)+1,'PLANNED','IN_PROGRESS','COMPLETED','APPROVED','CANCELLED')" }
    if ($table -like 'hr_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','APPROVED','REJECTED','COMPLETED')" }
    return "ELT(MOD(r.n,5)+1,'DRAFT','PENDING','APPROVED','REJECTED','COMPLETED')"
}

function Get-TextExpression($definition, $column) {
    $table = $definition.Table
    $name = $column.Name
    if ($name -eq 'tenant_code') { return Get-TenantFieldExpression 'Code' }
    if ($name -eq 'tenant_name') {
        return Get-TenantFieldExpression 'Name'
    }
    if ($name -eq 'allowed_email_domains') { return "CONCAT($(Get-TenantFieldExpression 'Code'),'.cn')" }
    if ($name -eq 'domain') { return "CONCAT('www.',$(Get-TenantFieldExpression 'Code'),'.cn')" }
    if ($name -eq 'dict_type') { return "CONCAT('demo_dict_t',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,2,'0'))" }
    if ($table -eq 'sys_dict_type' -and $name -eq 'dict_name') { return Get-DictNameExpression }
    if ($table -eq 'sys_user' -and $name -eq 'user_name') { return "IF(r.n=0,'admin',CONCAT('demo_u',LPAD(r.n+1,2,'0')))" }
    if ($table -eq 'sys_user_blacklist' -and $name -eq 'user_name') {
        # 与 user_id 一样永远跳过 admin（r.n=0）：1+MOD(r.n,49) => 1..49，对应 demo_u02..demo_u50。
        return "CONCAT('demo_u',LPAD(2+MOD(r.n,49),2,'0'))"
    }
    if ($table -eq 'hr_employee' -and $name -eq 'name') { return Get-PersonExpression }
    if ($table -eq 'sys_role' -and $name -eq 'role_name') { return "IF(r.n=0,'超级管理员',$(Get-PostExpression))" }
    if ($table -eq 'sys_role' -and $name -eq 'role_key') { return "IF(r.n=0,'admin',CONCAT('business_role_',LPAD(r.n+1,2,'0')))" }
    if ($name -eq 'password') { return Quote-Sql $demoPassword }
    if ($name -eq 'pwd_reset_required') { return "'0'" }
    if ($name -match '(?i)(email)$') { return "CONCAT('user',LPAD(r.n+1,2,'0'),'@',$(Get-TenantFieldExpression 'Code'),'.cn')" }
    if ($name -match '(?i)(phone|phonenumber)$') { return "CONCAT('139',LPAD(MOD(t.n*100+r.n,100000000),8,'0'))" }
    if ($name -match '(?i)(nick_name|contact_name|employee_name|evaluatee_name|evaluator_name|interviewer_name|reviewer_name|driver_name|owner_name|approver_name|operator_name|leader|member_name)$') {
        return Get-PersonExpression
    }
    if ($name -match '(?i)(dept_name|department_name)$') { return Get-DepartmentExpression }
    if ($name -eq 'department') { return Get-DepartmentExpression }
    if ($name -eq 'role_name') { return Get-PostExpression }
    if ($name -eq 'post_name') { return Get-PostExpression }
    if ($name -eq 'position_name') { return Get-PositionExpression }
    if ($name -eq 'family_name') { return Get-FamilyExpression }
    if ($name -eq 'level_name') { return Get-LevelExpression }
    if ($name -match '(?i)(customer_name|company_name|counterparty_name|supplier_name|payee_name|seller_name|buyer_name|visitor_company|original_owner_name)$') { return Get-PartnerExpression }
    if ($name -match '(?i)(product_name|item_name|consumable_name)$') { return Get-ProductExpression }
    if ($name -match '(?i)(project_name)$') { return Get-ProjectExpression }
    if ($name -match '(?i)(objective_name|goal_name)$') { return Get-ObjectiveExpression }
    if ($name -match '(?i)(opportunity_name)$') { return Get-OpportunityExpression }
    if ($name -match '(?i)(quote_name|receivable_name|renewal_name)$') { return Get-ContractNameExpression }
    if ($name -eq 'ticket_title') { return Get-TicketTitleExpression }
    if ($name -match '(?i)(contract_name|agreement_name)$') { return Get-ContractNameExpression }
    if ($name -match '(?i)(course_name|training_name)$' -or ($table -match '^hr_training_' -and $name -match '(?i)(plan_name|name|template_name)$')) { return Get-CourseExpression }
    if ($table -eq 'wf_process_definition' -and $name -eq 'process_name') { return Get-WorkflowExpression }
    if ($table -eq 'wf_process_category' -and $name -eq 'category_name') { return Get-WorkflowExpression }
    if ($table -eq 'wf_form_definition' -and $name -eq 'form_name') { return Get-WorkflowExpression }
    if ($table -eq 'oa_meeting_room' -and $name -eq 'name') { return Get-RoomExpression }
    if ($table -eq 'oa_asset' -and $name -eq 'name') { return Get-AssetExpression }
    if ($table -eq 'oa_vehicle' -and $name -eq 'name') { return Get-VehicleExpression }
    if ($name -eq 'file_name') { return Get-FileNameExpression }
    if ($name -eq 'rule_name') { return Get-RuleExpression }
    if ($name -eq 'spec') { return Get-SpecExpression }
    if ($name -eq 'unit') { return Get-UnitExpression }
    if ($name -match '(?i)(notice_title|announcement_title|notification_title)$') { return Get-WorkflowExpression }
    if ($table -match '^oa_.*meeting' -and $name -match '(?i)(title|meeting_title)$') { return Get-MeetingTitleExpression }
    if ($table -eq 'wf_process_instance' -and $name -eq 'title') { return Get-WorkflowExpression }
    if ($name -match '(?i)(city|location|address)$') { return Get-CatalogExpression $cities }
    if ($name -eq 'province') { return Get-ProvinceExpression }
    if ($name -eq 'industry') { return Get-IndustryExpression }
    if ($name -eq 'health_level') { return Get-HealthLevelExpression }
    if (($table -in @('wf_task', 'wf_task_history') -and $name -eq 'task_type') -or ($table -eq 'wf_node_record' -and $name -eq 'event_type')) {
        return Get-CatalogExpression @('APPROVAL','CC','MANUAL','COUNTERSIGN','OR_SIGN','PERCENT_SIGN','SEQUENTIAL_SIGN','WEIGHT_SIGN','TRANSFER','DELEGATE','DELEGATE_RETURN','ADD_SIGN','REDUCE_SIGN','REJECT','REJECT_JUMP','AUTO_PASS','AUTO_REJECT','AUTO_SKIP')
    }
    if ($table -eq 'wf_task_candidate' -and $name -eq 'source') { return "'NODE_CONFIG'" }
    if ($name -eq 'source') { return Get-CatalogExpression @('官网咨询','客户转介绍','行业展会','合作伙伴推荐','线上广告','主动拓展','生态联盟','存量客户挖掘') }
    if ($name -eq 'module') { return Get-CatalogExpression @('AUTH','WORKFLOW','HR','OA','CRM','SYSTEM') }
    if ($name -eq 'currency') { return "'CNY'" }
    if ($name -eq 'relationship') { return Get-CatalogExpression @('配偶','父亲','母亲','子女','兄弟姐妹','紧急联系人') }
    if ($name -eq 'risk_level') { return Get-CatalogExpression @('LOW','LOW','MEDIUM','HIGH','CRITICAL') }
    if ($name -eq 'category') {
        if ($table -eq 'crm_product') { return Get-CatalogExpression @('协同办公','客户管理','人力资源','项目交付','数据服务','安全合规') }
        if ($table -eq 'oa_asset') { return Get-CatalogExpression @('IT设备','办公家具','网络设备','会议设备','软件许可','生产设备') }
        if ($table -like 'oa_knowledge_*') { return Get-CatalogExpression @('制度流程','产品知识','客户案例','项目交付','行业研究','培训资料') }
        return Get-DictNameExpression
    }
    if ($name -eq 'employee_type') { return Get-CatalogExpression @('FULL_TIME','FULL_TIME','FULL_TIME','PART_TIME','INTERN','OUTSOURCE') }
    if ($name -eq 'contract_type') { return Get-CatalogExpression @('SERVICE','SALES','PURCHASE','LABOR','CONSULTING','OTHER') }
    if ($name -eq 'customer_type') { return Get-CatalogExpression @('ENTERPRISE','ENTERPRISE','SMB','GOVERNMENT','PARTNER','INDIVIDUAL') }
    if ($name -eq 'transport_type') { return Get-CatalogExpression @('高铁','飞机','自驾','市内交通','出租车') }
    if ($name -eq 'expense_type') { return Get-CatalogExpression @('差旅费','业务招待费','办公费','培训费','交通费','采购费') }
    if ($name -eq 'source_type') { return Get-CatalogExpression @('MANUAL','CRM_OPPORTUNITY','CRM_CUSTOMER','WORKFLOW','IMPORT') }
    if ($name -eq 'scope_type') { return Get-CatalogExpression @('TENANT','DEPARTMENT','PROJECT','PUBLIC') }
    if ($name -eq 'notify_channel') { return Get-CatalogExpression @('INTERNAL','EMAIL','SMS','WEBHOOK') }
    if ($name -eq 'type' -or $name -eq 'event_type') { return Get-CatalogExpression @('CREATE','UPDATE','SUBMIT','APPROVE','REJECT','COMPLETE','REMIND') }
    if ($name -match '(?i)(employee_no|contract_no|candidate_no|request_no|offer_no|injury_no|dispute_no|cert_no|order_no|invoice_no|quote_no|ticket_no|lead_no|renewal_no|target_no|project_no|budget_no|trip_no|claim_no|payment_no|purchase_no|application_no|requisition_no|process_no|approval_no|change_no|txn_no|product_no|price_book_no|standard_no)$') {
        $prefix = switch -Regex ($name) {
            'employee_no' { 'EMP' ; break }
            'contract_no' { 'HT' ; break }
            'candidate_no' { 'CAN' ; break }
            'offer_no' { 'OFR' ; break }
            'invoice_no' { 'INV' ; break }
            'quote_no' { 'QTE' ; break }
            'ticket_no' { 'TKT' ; break }
            'lead_no' { 'LEAD' ; break }
            'renewal_no' { 'REN' ; break }
            'project_no' { 'PRJ' ; break }
            'budget_no' { 'BUD' ; break }
            'trip_no' { 'TRIP' ; break }
            'claim_no' { 'EXP' ; break }
            'payment_no' { 'PAY' ; break }
            'purchase_no' { 'PUR' ; break }
            'application_no' { 'APP' ; break }
            'requisition_no' { 'REQ' ; break }
            'approval_no' { 'APR' ; break }
            'change_no' { 'CHG' ; break }
            'txn_no' { 'TXN' ; break }
            'cert_no' { 'CERT' ; break }
            'injury_no' { 'INJ' ; break }
            'dispute_no' { 'DSP' ; break }
            'product_no' { 'PRD' ; break }
            'price_book_no' { 'PBL' ; break }
            'standard_no' { 'STD' ; break }
            default { 'NO' }
        }
        return "CONCAT('$prefix',DATE_FORMAT(CURDATE(),'%Y'),LPAD(t.n*50+r.n+1,6,'0'))"
    }
    if ($name -match '(?i)_no$' -and $column.Type -match '(?i)char|varchar') {
        return "CONCAT(UPPER(LEFT('$table',4)),'-',DATE_FORMAT(CURDATE(),'%Y'),LPAD(t.n*50+r.n+1,6,'0'))"
    }
    if ($name -match '(?i)(code|key)$') {
        $prefix = switch -Regex ($name) {
            'family_code' { 'FAM' ; break }
            'level_code' { 'LVL' ; break }
            'position_code' { 'POS' ; break }
            'shift_code' { 'SFT' ; break }
            'rule_code' { 'RUL' ; break }
            'component_code' { 'CMP' ; break }
            'structure_code' { 'SAL' ; break }
            'scheme_code' { 'BEN' ; break }
            'course_code' { 'CRS' ; break }
            'template_code' { 'TPL' ; break }
            'asset_code' { 'AST' ; break }
            'seal_code' { 'SEA' ; break }
            'license_code' { 'LIC' ; break }
            'subject_code' { 'SUB' ; break }
            'customer_code' { 'CUS' ; break }
            'product_code' { 'PRD' ; break }
            'dict_type' { 'DICT' ; break }
            default { 'CF' }
        }
        return "CONCAT('$prefix','-T',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))"
    }
    if ($name -match '(?i)(url|path|image|avatar|attachment|receipt)') { return "CONCAT('https://demo.cloudflow.local/$table/t',LPAD(t.n,2,'0'),'/',LPAD(r.n+1,3,'0'))" }
    if ($name -match '(?i)(create_by|update_by|operator|creator)$') { return "IF(r.n=0,'admin','demo_operator')" }
    if ($name -match '(?i)(title|subject|name)$') {
        if ($name -match '(?i)(meeting|announcement|notice|ticket)') { return "CONCAT('季度经营复盘与行动项-',LPAD(r.n+1,2,'0'))" }
        if ($name -match '(?i)(question|paper|exam)') { return "CONCAT('企业管理能力测评-',LPAD(r.n+1,2,'0'))" }
        return "CONCAT($(Get-TenantFieldExpression 'Name'),'年度经营事项-',LPAD(r.n+1,3,'0'))"
    }
    if ($name -match '(?i)(description|summary|remark|reason|content|comment|explanation|feedback|note|message|detail)$') {
        return "CONCAT($(Get-TenantFieldExpression 'Name'),'本期业务已完成核验，责任人和审批材料齐全。')"
    }
    return "CONCAT($(Get-TenantFieldExpression 'Name'),'业务登记-',LPAD(r.n+1,3,'0'))"
}

# 通用兜底：原生 json 类型，或列名带 json、或注释里写了 JSON 的文本列，一律灌演示对象。
# 只认「_json / json_ 结尾开头」和注释里的 JSON 字样，不按语义猜——
# 反例 wf_audit_log.operation_details（注释「操作详情」）是给人看的自由文本，
# 前端 VersionRollbackManagement 直接 {impact.impactDetail} 渲染，灌 JSON 反而露出原始花括号。
function Get-JsonColumnFallbackExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $type = $column.Type
    $comment = $column.Comment
    $looksJson = ($type -match 'json') -or ($name -match '(?i)(^|_)json($|_)') -or ($comment -match 'JSON')
    if (-not $looksJson) { return $null }
    return "JSON_OBJECT('source','demo50','tenantId',$tenantBase+t.n,'table','$table','row',r.n+1,'label','全链路演示数据')"
}

# 建表注释里写了 JSON 的列必须落合法 JSON。原来只有 MySQL 原生 json 类型走 JSON_OBJECT
# （Get-ColumnExpression 末尾的类型兜底），用 TEXT/LONGTEXT/VARCHAR 承载的 JSON 一路落到
# Get-TextExpression，被灌成「佛山联华新材料有限公司业务登记-001」这种中文串。
# 实测后果：抄送我的详情弹窗 JSON.parse(formData) 抛异常，表单快照卡片显示「无法解析表单数据」；
# wf_process_definition.model_json 同病，parseWorkflowGraphDefinition 判不出 nodes+edges 直接返回 null。
# 全库有 24 个这样的列，形状敏感的（图结构 / 字段数组 / 步骤数组）在下面逐列登记，
# 其余按列名或注释里的 JSON 字样走通用对象兜底。
# 返回 $null 表示这一列不是 JSON 列，交回原来的取值链。
function Get-JsonColumnExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $key = "$table.$name"

    # 表单字段 id 与 wf_form_definition.fields_json 用同一套：抄送详情弹窗把 form_data 的 key
    # 直接当行标题渲染（Object.entries），两边对不齐就会出现表里有字段、快照里查不到的假象。
    # 06 手写种子也是这个路子（l1..l5 / c1..c5 对应各自表单定义）。
    $formFieldsExpression = "JSON_ARRAY(JSON_OBJECT('id','f1','type','TEXT','label','申请事项','required',TRUE),JSON_OBJECT('id','f2','type','DATE','label','申请日期','required',TRUE),JSON_OBJECT('id','f3','type','NUMBER','label','申请金额','required',FALSE),JSON_OBJECT('id','f4','type','TEXTAREA','label','申请说明','required',FALSE))"
    $formDataExpression = "JSON_OBJECT('f1',$(Get-WorkflowExpression),'f2',DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL MOD(r.n,30)+1 DAY),'%Y-%m-%d'),'f3',CAST(1000+MOD(t.n*97+r.n*233,90000) AS DECIMAL(18,2)),'f4','演示数据：用于校验抄送、审批与表单快照链路。')"
    # 节点类型只能取 NodeType 里的 START/APPROVAL/END，审批人类型只能取 AssigneeType 的枚举，
    # 边必须是 source/target 成对，否则前端画布判定为非法模型。
    $modelJsonExpression = "JSON_OBJECT('nodes',JSON_ARRAY(JSON_OBJECT('id','root','type','START','title','提交申请'),JSON_OBJECT('id','n1','type','APPROVAL','title','直属上级审批','approverType','DIRECT_LEADER'),JSON_OBJECT('id','n2','type','APPROVAL','title','部门经理审批','approverType','DEPT_MANAGER'),JSON_OBJECT('id','end','type','END','title','流程结束')),'edges',JSON_ARRAY(JSON_OBJECT('id','root->n1','source','root','target','n1'),JSON_OBJECT('id','n1->n2','source','n1','target','n2'),JSON_OBJECT('id','n2->end','source','n2','target','end')))"
    $amountExpression = 'CAST(1000+MOD(t.n*97+r.n*233,90000) AS DECIMAL(18,2))'
    $applyNoExpression = "CONCAT('CF-T',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))"

    switch ($key) {
        'wf_process_copy.form_data' { return $formDataExpression }
        'wf_form_draft.form_data' { return $formDataExpression }
        'wf_form_definition.fields_json' { return $formFieldsExpression }
        'wf_form_definition.form_schema' { return $formFieldsExpression }
        'wf_form_definition.version' { return '1' }
        'wf_form_definition.version_lock' { return '0' }
        'wf_form_definition.is_latest' { return '1' }
        'wf_form_definition.is_rollback' { return '0' }
        'wf_form_definition.rollback_from_version' { return 'NULL' }
        'wf_form_definition.status' { return "'ACTIVE'" }
        'wf_form_definition.change_type' { return "'ADD_FIELD'" }
        'wf_form_definition.change_log' { return "'初始化演示表单'" }
        'wf_form_definition.checksum' { return 'NULL' }
        'wf_process_instance.form_version' { return '1' }
        'wf_process_definition.model_json' { return $modelJsonExpression }
        # 注释只写了「标签」，但 ExportServiceImpl 是 objectMapper.readValue(tags, List.class)，
        # 前端 ProcessManagement 也按数组解析，所以这列是 JSON 数组不是逗号串。
        'wf_process_definition.tags' { return "JSON_ARRAY('演示数据',$(Get-CatalogExpression @('审批','行政','人事','财务','采购') 'r.n'))" }
        'oa_work_task.tags' { return "JSON_ARRAY('演示数据',$(Get-CatalogExpression @('高优','常规','跟进','待评估') 'r.n'))" }
        'oa_meeting_room.equipment' { return "JSON_ARRAY('投影仪','音响','白板','视频会议终端')" }
        'biz_business_trip.companions' { return "JSON_ARRAY($(Get-PersonExpression))" }
        'biz_business_trip.itinerary' { return "JSON_ARRAY(JSON_OBJECT('date','第1天','plan','抵达客户现场并确认调研范围'),JSON_OBJECT('date','第2天','plan','方案评审与流程配置辅导'),JSON_OBJECT('date','第3天','plan','结论确认与返程'))" }
        'wf_process_snapshot.variables' { return "JSON_OBJECT('applyNo',$applyNoExpression,'amount',$amountExpression)" }
        'wf_task_history.variables_changed' { return "JSON_OBJECT('approveNode',ELT(MOD(r.n,3)+1,'n1','n2','n3'))" }
        'wf_node_record.extra_data' { return "JSON_OBJECT('decision',ELT(MOD(r.n,3)+1,'APPROVE','REJECT','TRANSFER'),'amount',$amountExpression)" }
        # 「处理人顺序」是加签会签的顺序数组，06 里就是 [3,6] 这种整型数组。
        'wf_countersign_task.assignee_order' { return "JSON_ARRAY(MOD(r.n,5)+1,MOD(r.n+2,5)+1,MOD(r.n+4,5)+1)" }
        'wf_deploy_approval.approval_config' { return "JSON_OBJECT('steps',JSON_ARRAY(JSON_OBJECT('step',1,'name','流程负责人审批','approverType','USER','approverIds','1'),JSON_OBJECT('step',2,'name','运维总监审批','approverType','ROLE','approverIds','100')))" }
        'sys_audit_log.before_json' { return "JSON_OBJECT('status','draft')" }
        'sys_audit_log.after_json' { return "JSON_OBJECT('status','published')" }
        'sys_audit_log.diff_json' { return "JSON_ARRAY(JSON_OBJECT('op','replace','path','/status','from','draft','value','published'))" }
        'sys_log.params' { return "JSON_OBJECT('page',1,'pageSize',10,'tenantId',$tenantBase+t.n)" }
        'wf_hot_update_record.details_json' {
            $migratedInstance = Get-TargetIdExpression 'wf_process_instance' $indexes $definitionMap
            if (-not $migratedInstance) { $migratedInstance = "CONCAT('demo50_t',LPAD(t.n,2,'0'),'_instance_',LPAD(r.n+1,3,'0'))" }
            return "JSON_ARRAY(JSON_OBJECT('instanceId',$migratedInstance,'currentNodeKey',ELT(MOD(r.n,3)+1,'n1','n2','n3'),'status',ELT(MOD(r.n,2)+1,'MIGRATED','SKIPPED')))"
        }
        'wf_process_snapshot.active_tasks' {
            # 列名含 active，原来被布尔兜底截走灌成 '0'——JSON_VALID('0') 是 1，
            # 所以这条脏数据在「是否合法 JSON」的体检里查不出来，只能靠形状对账发现。
            $snapshotTask = Get-TargetIdExpression 'wf_task' $indexes $definitionMap
            if (-not $snapshotTask) { $snapshotTask = "CONCAT('demo50_t',LPAD(t.n,2,'0'),'_task_',LPAD(r.n+1,3,'0'))" }
            return "JSON_ARRAY(JSON_OBJECT('taskId',$snapshotTask,'assigneeName',$(Get-PersonExpression),'status','TODO','timeout',FALSE))"
        }
        'wf_form_draft.node_assignees' {
            $draftAssignee = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
            if (-not $draftAssignee) { $draftAssignee = 'r.n+1' }
            return "JSON_ARRAY($draftAssignee)"
        }
        'hr_candidate.resume_attachment_urls' { return "JSON_ARRAY(CONCAT('/upload/hr/resume/demo50_t',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,3,'0'),'.pdf'))" }
        'hr_employee_contract.attachment_urls' { return "JSON_ARRAY(CONCAT('/upload/hr/contracts/demo50_t',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,3,'0'),'.pdf'))" }
        'hr_employee_document.attachment_urls' { return "JSON_ARRAY(CONCAT('/upload/hr/documents/demo50_t',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,3,'0'),'.pdf'))" }
    }

    return Get-JsonColumnFallbackExpression $definition $column $indexes $definitionMap
}

function Get-HrRuleDemoExpression([string]$table, [string]$name, [hashtable]$indexes) {
    $ruleTables = @('hr_leave_type','hr_leave_quota','hr_leave_ledger','hr_leave_period','hr_leave_policy','hr_leave_policy_detail',
        'hr_leave_policy_assignment','hr_earned_leave_schedule','hr_shift','hr_attendance_record','hr_attendance_checkin',
        'hr_attendance_monthly','hr_time_request','hr_attendance_appeal','hr_payroll_period','hr_payroll_batch',
        'hr_payroll_batch_employee','hr_payroll_correction','hr_tax_slab','hr_tax_slab_detail','hr_salary_slip',
        'hr_tax_profile','hr_tax_deduction','hr_grievance','hr_grievance_record')
    if ($table -notin $ruleTables) { return $null }
    $yearStart = "DATE_ADD('2026-01-01',INTERVAL r.n YEAR)"
    $yearEnd = "DATE_SUB(DATE_ADD($yearStart,INTERVAL 1 YEAR),INTERVAL 1 DAY)"
    $monthStart = "DATE_ADD('2026-01-01',INTERVAL r.n MONTH)"
    $monthEnd = "LAST_DAY($monthStart)"
    $employeeId = Get-NumericIdExpression $indexes['hr_employee']
    $salarySlipId = Get-NumericIdExpression $indexes['hr_salary_slip']
    if ($name -in @('deleted','version')) { return '0' }
    if ($name -in @('create_time','update_time')) { return "TIMESTAMP('2026-01-01 09:00:00')" }
    if ($name -in @('instance_id','process_instance_id','proof_file_url','attachment_url','photo_file_id','reversal_of_id','error_message')) { return 'NULL' }
    switch ($table) {
        'hr_leave_type' {
            switch ($name) {
                'unit' { return "'DAY'" }
                'need_quota' { return '1' }
                'is_paid' { return '1' }
                'status' { return '1' }
                'max_days_per_year' { return '10.00' }
                'max_continuous_days' { return '10.00' }
                'max_carry_forward_days' { return '0.00' }
                'applicable_after_days' { return '0' }
                'carry_forward_expire_days' { return 'NULL' }
                'earned_leave_frequency' { return "'MONTHLY'" }
                'rounding_mode' { return "'NONE'" }
                'salary_fraction_per_day' { return '1.00' }
                'encashment_component_id' { return 'NULL' }
            }
        }
        'hr_leave_quota' {
            switch ($name) {
                'period_id' { return Get-NumericIdExpression $indexes['hr_leave_period'] }
                { $_ -in @('total_quota','available_quota') } { return '10.00' }
                { $_ -in @('used_quota','frozen_quota') } { return '0.00' }
                'expiry_date' { return $yearEnd }
            }
        }
        'hr_leave_ledger' {
            switch ($name) {
                'transaction_type' { return "'ALLOCATION'" }
                'source_biz_type' { return "'DEMO_INITIAL_ALLOCATION'" }
                'source_biz_id' { return Get-NumericIdExpression $indexes['hr_leave_policy_assignment'] }
                'leave_days' { return '10.00' }
                'quantity_unit' { return "'DAY'" }
                'from_date' { return $yearStart }
                'to_date' { return $yearEnd }
            }
        }
        'hr_leave_period' {
            switch ($name) {
                'start_date' { return $yearStart }
                'end_date' { return $yearEnd }
                'status' { return "'CLOSED'" }
            }
        }
        'hr_leave_policy' { if ($name -eq 'status') { return "'INACTIVE'" } }
        'hr_leave_policy_detail' { if ($name -eq 'annual_days') { return '10.00' } }
        'hr_leave_policy_assignment' {
            switch ($name) {
                'assignment_basis' { return "'PERIOD'" }
                'effective_from' { return $yearStart }
                'effective_to' { return $yearEnd }
                'allocated_flag' { return '1' }
                'status' { return "'INACTIVE'" }
            }
        }
        'hr_earned_leave_schedule' {
            switch ($name) {
                'schedule_date' { return $yearStart }
                'earned_days' { return '10.00' }
                'executed_flag' { return '1' }
            }
        }
        'hr_shift' {
            switch ($name) {
                'start_time' { return "'09:00:00'" }
                'end_time' { return "'18:00:00'" }
                'break_minutes' { return '60' }
                'work_minutes' { return '480' }
                { $_ -in @('checkin_window_before_minutes','checkout_window_after_minutes') } { return '120' }
                { $_ -in @('late_grace_minutes','early_exit_grace_minutes','overtime_threshold_minutes') } { return '0' }
                'half_day_hours_threshold' { return '4.00' }
                'absent_hours_threshold' { return '2.00' }
                'working_hours_calc_mode' { return "'FIRST_LAST'" }
                'checkin_determine_mode' { return "'EARLIEST_LATEST'" }
                'process_attendance_after' { return 'NULL' }
                'status' { return '1' }
            }
        }
        'hr_attendance_record' {
            switch ($name) {
                'attendance_date' { return "DATE('2026-01-05')" }
                'expected_minutes' { return '480' }
                { $_ -in @('work_minutes','late_minutes','early_exit_minutes','overtime_minutes') } { return '0' }
                'first_checkin_time' { return "TIMESTAMP('2026-01-05 09:00:00')" }
                'last_checkout_time' { return 'NULL' }
                'checkin_count' { return '1' }
                'date_type' { return "'WORKDAY'" }
                'status' { return "'PENDING'" }
                'appeal_id' { return 'NULL' }
            }
        }
        'hr_attendance_checkin' {
            switch ($name) {
                'log_type' { return "'IN'" }
                'check_time' { return "TIMESTAMP('2026-01-05 09:00:00')" }
                'attendance_date' { return "DATE('2026-01-05')" }
                'check_method' { return "'MANUAL'" }
                'latitude' { return '31.230400' }
                'longitude' { return '121.473700' }
                'overtime_type_id' { return 'NULL' }
            }
        }
        'hr_attendance_monthly' {
            switch ($name) {
                'year' { return '2026' }
                'month' { return '1' }
                { $_ -in @('work_days','actual_days','late_times','early_times','absent_days','leave_days','overtime_hours','attendance_rate') } { return '0' }
                'status' { return "'DRAFT'" }
            }
        }
        'hr_time_request' {
            switch ($name) {
                'request_type' { return "'LEAVE'" }
                'start_time' { return "DATE_ADD($yearStart,INTERVAL 9 HOUR)" }
                'end_time' { return "DATE_ADD($yearStart,INTERVAL 18 HOUR)" }
                'duration' { return '1.00' }
                'unit' { return "'DAY'" }
                'status' { return "'CANCELLED'" }
            }
        }
        'hr_payroll_period' {
            switch ($name) {
                'start_date' { return $monthStart }
                'end_date' { return $monthEnd }
                'pay_date' { return "DATE_ADD($monthEnd,INTERVAL 5 DAY)" }
                'frequency' { return "'MONTHLY'" }
                'status' { return "'OPEN'" }
            }
        }
        'hr_payroll_batch' {
            switch ($name) {
                'posting_date' { return "DATE_ADD($monthEnd,INTERVAL 5 DAY)" }
                'filter_employee_ids' { return "JSON_ARRAY($employeeId)" }
                { $_ -in @('filter_dept_ids','filter_position_ids','filter_job_level_ids') } { return 'JSON_ARRAY()' }
                'filter_employee_type' { return 'NULL' }
                'employee_count' { return '1' }
                'status' { return "'DRAFT'" }
                { $_ -in @('total_gross','total_deduction','total_tax','total_net') } { return '0.00' }
                { $_ -in @('calc_start_time','calc_end_time') } { return 'NULL' }
            }
        }
        'hr_payroll_batch_employee' {
            switch ($name) {
                'salary_slip_id' { return 'NULL' }
                'calc_status' { return "'PENDING'" }
                { $_ -in @('gross_total','net_total') } { return '0.00' }
            }
        }
        'hr_salary_slip' {
            switch ($name) {
                'batch_id' { return 'NULL' }
                'reserved_settlement_id' { return 'NULL' }
                'period_month' { return "DATE_FORMAT($monthStart,'%Y-%m')" }
                { $_ -in @('gross_total','net_total') } { return '10000.00' }
                { $_ -in @('deduction_total','tax_amount','benefit_amount','cumulative_taxable_income','cumulative_deduction','cumulative_tax_payable','cumulative_tax_paid','current_tax') } { return '0.00' }
                'components' { return "JSON_ARRAY(JSON_OBJECT('name','待核算演示工资','type','EARNING','amount',10000.00))" }
                'status' { return "'DRAFT'" }
                'employee_confirmed' { return '0' }
                { $_ -in @('confirmed_time','pay_date') } { return 'NULL' }
            }
        }
        'hr_payroll_correction' {
            switch ($name) {
                'original_slip_id' { return $salarySlipId }
                { $_ -in @('correction_slip_id','corrected_by','correction_time') } { return 'NULL' }
                'status' { return "'DRAFT'" }
                'reason' { return "'演示补正草稿，原工资单尚未发放且未生成补正工资单'" }
                'diff_amount' { return '0.00' }
            }
        }
        'hr_tax_slab' {
            switch ($name) {
                'region' { return "'DEMO'" }
                'effective_from' { return $yearStart }
                'effective_to' { return $yearEnd }
                'threshold_amount' { return '0.00' }
                'status' { return "'DRAFT'" }
                'remark' { return "'演示占位草稿不参与算薪；正式居民工资税表由管理员或财务启用'" }
            }
        }
        'hr_tax_slab_detail' {
            switch ($name) {
                'level_no' { return '1' }
                { $_ -in @('from_amount','tax_rate','quick_deduction') } { return '0.00' }
                'to_amount' { return 'NULL' }
            }
        }
        'hr_tax_profile' {
            switch ($name) {
                'status' { return "'INACTIVE'" }
                'threshold' { return '0.00' }
                'tax_config' { return 'JSON_OBJECT()' }
            }
        }
        'hr_tax_deduction' {
            switch ($name) {
                'start_date' { return $yearStart }
                'end_date' { return $yearEnd }
                'amount' { return '1000.00' }
                'declare_status' { return "'DECLARED'" }
                'status' { return "'ACTIVE'" }
                { $_ -in @('verify_by','verify_time','reject_reason') } { return 'NULL' }
            }
        }
        'hr_grievance' {
            switch ($name) {
                'grievance_type' { return "ELT(MOD(r.n,6)+1,'SALARY','PERFORMANCE','MANAGEMENT','WORKPLACE','POLICY','OTHER')" }
                'against_type' { return "'NONE'" }
                'priority' { return "'NORMAL'" }
                'status' { return "'WITHDRAWN'" }
                { $_ -in @('against_id','against_name','related_biz_type','related_biz_id','handler_id','handler_name','accept_time','resolution_detail','resolution_date','satisfied_flag','escalated_dispute_id') } { return 'NULL' }
            }
        }
        'hr_grievance_record' {
            switch ($name) {
                'record_type' { return "'STATUS_CHANGE'" }
                'operator_role' { return "'EMPLOYEE'" }
                'content' { return "'演示申诉已撤回，不进入受理提醒'" }
                'visible_to_employee_flag' { return '1' }
            }
        }
    }
    if ($name -match '_flag$') { return '0' }
    return $null
}

function Get-CrmOperationsDemoExpression($definition, [string]$name, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $operationsTables = @('crm_activity','crm_activity_participant','crm_activity_reminder','crm_sla_policy','crm_sla_priority',
        'crm_sla_status_rule','crm_lost_reason','crm_competitor','crm_opportunity_lost_detail','crm_customer_credit','crm_territory',
        'crm_lead_score_rule','crm_campaign','crm_target_list','crm_target_list_member','crm_campaign_target_list','crm_mass_email','crm_campaign_log')
    if ($table -notin $operationsTables -and $table -notin @('crm_lead','crm_customer','crm_opportunity','crm_service_ticket')) { return $null }
    if ($name -in $definition.Primary) { return $null }
    if ($name -in @('deleted','version')) { return '0' }
    $links = @{ activity_id='crm_activity'; campaign_id='crm_campaign'; list_id='crm_target_list'; territory_id='crm_territory';
        competitor_id='crm_competitor'; lost_reason_id='crm_lost_reason'; mass_email_id='crm_mass_email' }
    if ($links.ContainsKey($name)) { return Get-TargetIdExpression $links[$name] $indexes $definitionMap }
    if ($name -in @('message_record_id','instance_id','join_url','attachment_url','follow_up_id','bypass_by','bypass_time','bypass_expire_date')) { return 'NULL' }
    if ($name -in @('market_segment','employee_scale')) {
        if ($name -eq 'market_segment') { return "ELT(MOD(r.n,4)+1,'SMB','MID_MARKET','ENTERPRISE','GOVERNMENT')" }
        return "ELT(MOD(r.n,6)+1,'1-10','11-50','51-200','201-500','501-1000','1000+')"
    }
    switch ($table) {
        'crm_lead' {
            if ($name -in @('converted_customer_id','converted_time','qualified_by','qualified_by_name','qualified_time','disqualify_reason','unsubscribe_time')) { return 'NULL' }
            if ($name -eq 'qualification_status') { return "'UNQUALIFIED'" }
            if ($name -eq 'lead_score') { return '0' }
            if ($name -eq 'status') { return "'NEW'" }
        }
        'crm_customer' { if ($name -eq 'status') { return "'ACTIVE'" } }
        'crm_opportunity' {
            switch ($name) {
                'stage' { return "ELT(MOD(r.n,6)+1,'LEAD','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST')" }
                'status' { return "IF(MOD(r.n,6) IN (4,5),'CLOSED','OPEN')" }
                'win_rate' { return 'ELT(MOD(r.n,6)+1,10,30,50,70,100,0)' }
                'weighted_amount' { return 'ROUND((1000+MOD(t.n*97+r.n*233,90000))*ELT(MOD(r.n,6)+1,10,30,50,70,100,0)/100,2)' }
                'last_stage' { return 'NULL' }
                'team_version' { return '0' }
                'stage_changed_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL MOD(r.n,15) DAY)' }
                'stage_duration_days' { return 'MOD(r.n,15)' }
            }
        }
        'crm_activity' {
            switch ($name) {
                'status' { return "'CANCELLED'" }
                'activity_type' { return "ELT(MOD(r.n,3)+1,'MEETING','CALL','TASK')" }
                'priority' { return "'MEDIUM'" }
                'direction' { return "IF(MOD(r.n,3)=1,'OUTBOUND',NULL)" }
                'biz_type' { return "'CUSTOMER'" }
                'biz_id' { return Get-TargetIdExpression 'crm_customer' $indexes $definitionMap }
                'start_time' { return "TIMESTAMP('2026-01-05 09:00:00')" }
                'end_time' { return "TIMESTAMP('2026-01-05 10:00:00')" }
                'duration_minutes' { return '60' }
                'complete_time' { return 'NULL' }
            }
        }
        'crm_activity_participant' {
            switch ($name) {
                'participant_type' { return "'USER'" }
                'participant_ref_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
                'participant_name' { return Get-PersonExpression }
                'acceptance_status' { return "'NONE'" }
                'response_time' { return 'NULL' }
            }
        }
        'crm_activity_reminder' {
            switch ($name) {
                'remind_minutes_before' { return '15' }
                'channel_type' { return "'INTERNAL'" }
                'send_time' { return 'NULL' }
            }
        }
        'crm_sla_policy' {
            switch ($name) {
                'entity_type' { return "'GLOBAL'" }
                'entity_id' { return 'NULL' }
                'status' { return "'DISABLED'" }
                'apply_for_resolution' { return '1' }
                'effective_start' { return "DATE('2026-01-01')" }
                'effective_end' { return 'NULL' }
            }
        }
        'crm_sla_priority' {
            switch ($name) {
                'policy_id' { return Get-TargetIdExpression 'crm_sla_policy' $indexes $definitionMap }
                'priority_code' { return "'P4'" }
                'priority_name' { return "'P4 低'" }
                'first_response_minutes' { return '1440' }
                'resolution_minutes' { return '4320' }
            }
        }
        'crm_sla_status_rule' {
            switch ($name) {
                'policy_id' { return Get-TargetIdExpression 'crm_sla_policy' $indexes $definitionMap }
                'rule_type' { return "'FULFILL'" }
                'ticket_status' { return "'CLOSED'" }
            }
        }
        'crm_service_ticket' {
            if ($name -in @('sla_policy_id','first_response_due','resolution_due','first_response_time','first_response_minutes','resolution_minutes','pause_start_time','due_time')) { return 'NULL' }
            if ($name -eq 'sla_status') { return "'NOT_APPLICABLE'" }
            if ($name -eq 'sla_paused_minutes') { return '0' }
            if ($name -eq 'severity') { return "CONCAT('P',1+MOD(r.n,4))" }
        }
        'crm_lost_reason' { if ($name -eq 'status') { return "'ACTIVE'" } }
        'crm_competitor' { if ($name -eq 'status') { return "'ACTIVE'" } }
        'crm_opportunity_lost_detail' { if ($name -eq 'is_primary_flag') { return '1' } }
        'crm_customer_credit' {
            if ($name -in @('credit_limit','overdue_threshold')) { return '0.00' }
            if ($name -eq 'status') { return "'DISABLED'" }
            if ($name -eq 'currency') { return "'CNY'" }
            if ($name -in @('effective_start','effective_end')) { return 'NULL' }
        }
        'crm_territory' {
            switch ($name) {
                'parent_id' { return '0' }
                'level_path' { return "CONCAT('/',$(Get-NumericIdExpression $indexes['crm_territory']),'/')" }
                'status' { return "'ACTIVE'" }
            }
        }
        'crm_lead_score_rule' {
            switch ($name) {
                'field_name' { return "'annual_revenue'" }
                'operator' { return "'>='" }
                'field_value' { return "'1000000'" }
                'score' { return '10' }
            }
        }
        'crm_campaign' {
            if ($name -match '_count$|_rate$' -or $name -in @('actual_cost','revenue')) { return '0' }
            switch ($name) {
                'campaign_type' { return "'EVENT'" }
                'status' { return "'CANCELLED'" }
                'start_date' { return "DATE('2026-01-01')" }
                'end_date' { return "DATE('2026-01-31')" }
                'roi' { return 'NULL' }
            }
        }
        'crm_target_list' {
            switch ($name) {
                'status' { return "'INACTIVE'" }
                'source_type' { return "'MANUAL'" }
                'query_condition' { return 'NULL' }
                'member_count' { return '1' }
                'opted_out_count' { return '0' }
            }
        }
        'crm_target_list_member' {
            switch ($name) {
                'member_type' { return "'CUSTOMER'" }
                'member_ref_id' { return Get-TargetIdExpression 'crm_customer' $indexes $definitionMap }
            }
        }
        'crm_mass_email' {
            if ($name -match '_count$') { return '0' }
            if ($name -in @('start_time','end_time','scheduled_time','recipient_snapshot_time','delivery_summary')) { return 'NULL' }
            if ($name -eq 'status') { return "'DRAFT'" }
        }
        'crm_campaign_log' {
            if ($name -in @('archive_payload','archive_checksum','archived_time','archive_checked_time')) { return 'NULL' }
            switch ($name) {
                'test_flag' { return '1' }
                'action' { return "'LEAD_CREATED'" }
                'target_type' { return "'LEAD'" }
                'target_id' { return Get-TargetIdExpression 'crm_lead' $indexes $definitionMap }
                'click_url' { return 'NULL' }
                'source_event_key' { return 'NULL' }
            }
        }
    }
    if ($name -match '_flag$') { return '0' }
    return $null
}

function Get-PlatformFoundationDemoExpression($definition, [string]$name, [hashtable]$indexes) {
    $table = $definition.Table
    if ($definition.Primary -contains $name) { return $null }
    if ($table -in @('sys_file_config','sys_import_task','sys_import_error','sys_print_template','sys_print_record','sys_api_error_log') -and $name -in @('version','deleted')) { return '0' }
    if ($table -in @('sys_log','sys_api_error_log','oa_frontend_error_log') -and $name -eq 'trace_id') { return "SHA2(CONCAT('demo-trace-',t.n,'-',r.n),256)" }
    if ($table -in @('sys_log','sys_api_error_log')) {
        switch ($name) {
            'service_name' { return "CONCAT('cloudflow-',$(Get-DemoServiceExpression))" }
            'request_method' { return "'GET'" }
            'request_url' { return "'/demo/example'" }
            'duration_ms' { return '20+r.n*10' }
            'result_code' { return '200' }
            'client_ip' { return "'192.0.2.10'" }
            'slow_flag' { return '0' }
        }
    }
    switch ($table) {
        'sys_file_config' {
            switch ($name) {
                'config_code' { return "CONCAT('DEMO_LOCAL_',LPAD(r.n+1,3,'0'))" }
                'config_name' { return "CONCAT('演示本地存储 ',LPAD(r.n+1,3,'0'))" }
                'storage_type' { return "'LOCAL'" }
                'master_flag' { return '0' }
                'status' { return "'DISABLED'" }
                'base_path' { return "'upload'" }
                'max_file_size' { return '52428800' }
                'signed_url_expire_seconds' { return '300' }
                'access_policy' { return "'0'" }
                { $_ -in @('endpoint','region','bucket','access_key','secret_key_cipher','domain','allowed_extensions') } { return 'NULL' }
            }
        }
        'sys_file' {
            switch ($name) {
                'storage_type' { return "'LOCAL'" }
                { $_ -in @('config_id','file_hash','bucket','object_key','biz_type','biz_id') } { return 'NULL' }
                'access_type' { return "'PRIVATE'" }
                'ref_count' { return '1' }
            }
        }
        'sys_import_task' {
            switch ($name) {
                'task_no' { return "CONCAT('DEMO-IMPORT-',t.n,'-',r.n+1)" }
                'biz_type' { return "'ASSET'" }
                'biz_name' { return "'资产导入演示'" }
                'status' { return "'CANCELLED'" }
                'file_url' { return "CONCAT('/api/auth/system/file/',$(Get-NumericIdExpression $indexes['sys_file']),'/content')" }
                { $_ -in @('total_rows','invalid_rows') } { return '1' }
                { $_ -in @('valid_rows','success_rows','fail_rows') } { return '0' }
                { $_ -in @('error_file_url','job_log_id','duration_ms','error_message','start_time','end_time') } { return 'NULL' }
                'operator_id' { return Get-NumericIdExpression $indexes['sys_user'] }
            }
        }
        'sys_import_error' {
            switch ($name) {
                'task_id' { return Get-NumericIdExpression $indexes['sys_import_task'] }
                'row_no' { return '2' }
                'column_name' { return "'资产名称'" }
                'cell_value' { return 'NULL' }
                'error_type' { return "'REQUIRED'" }
                'error_message' { return "'演示校验：资产名称不能为空'" }
            }
        }
        'sys_print_template' {
            switch ($name) {
                'template_code' { return "CONCAT('DEMO_PRINT_',LPAD(r.n+1,3,'0'))" }
                'template_name' { return "CONCAT('演示资产标签 ',LPAD(r.n+1,3,'0'))" }
                'biz_type' { return "'ASSET_LABEL'" }
                'template_format' { return "'HTML'" }
                'output_format' { return "'PDF'" }
                'template_content' { return Quote-Sql '<html><body><h1>${title}</h1></body></html>' }
                { $_ -in @('template_file_url','paper_width_mm','paper_height_mm') } { return 'NULL' }
                'paper_size' { return "'A4'" }
                'orientation' { return "'PORTRAIT'" }
                { $_ -in @('margin_top','margin_bottom','margin_left','margin_right') } { return '10.00' }
                'variables_declare' { return "JSON_OBJECT('title','资产名称')" }
                'default_flag' { return '0' }
                'status' { return "'DISABLED'" }
            }
        }
        'sys_print_record' {
            switch ($name) {
                'template_id' { return Get-NumericIdExpression $indexes['sys_print_template'] }
                'template_code' { return "CONCAT('DEMO_PRINT_',LPAD(r.n+1,3,'0'))" }
                'biz_type' { return "'ASSET_LABEL'" }
                'biz_id' { return "CAST($(Get-NumericIdExpression $indexes['oa_asset']) AS CHAR)" }
                'output_format' { return "'PDF'" }
                'file_url' { return 'NULL' }
                'operator_id' { return Get-NumericIdExpression $indexes['sys_user'] }
                'ip_address' { return "'2001:db8::10'" }
            }
        }
        'sys_api_error_log' {
            switch ($name) {
                'process_status' { return "'TODO'" }
                { $_ -in @('request_params','exception_stack','process_by','process_time','process_remark') } { return 'NULL' }
                'exception_message' { return "'演示错误记录，不代表真实服务故障'" }
                'exception_class' { return "'DemoException'" }
            }
        }
    }
    return $null
}

function Get-ColumnExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $type = $column.Type
    # 停用释放来源只由真实停用事件建立，演示待办不得虚构可接续来源。
    if ($table -eq 'wf_task' -and $name -in @('disabled_from_user_id','disabled_from_user_name','disabled_release_version','disabled_release_event_id')) { return 'NULL' }
    # 普通演示付款没有经过人事业务确认，来源只允许由真实业务建立。
    if ($table -in @('crm_receivable','oa_invoice') -and $name -in @('portal_public_version','portal_published_by','portal_published_time','portal_file_ids')) { return 'NULL' }
    if ($table -eq 'biz_payment_request' -and $name -in @('source_biz_type','source_biz_id')) { return 'NULL' }
    if ($table -eq 'sys_tenant' -and $name -in @('package_id','package_version','package_override','effective_menu_ids')) { return 'NULL' }
    if ($table -eq 'oa_knowledge_document') {
        if ($name -eq 'external_visible_flag') { return '0' }
        if ($name -in @('external_version_id', 'external_attachment_file_ids')) { return 'NULL' }
    }
    $hExpression = Get-HEnhancementDemoExpression $definition $column $indexes $definitionMap
    if ($null -ne $hExpression) { return $hExpression }
    if (-not $scopedGeneration -and $connectedExpressions.ContainsKey("$table.$name")) {
        return $connectedExpressions["$table.$name"]
    }
    $platformExpression = Get-PlatformFoundationDemoExpression $definition $name $indexes
    if ($null -ne $platformExpression) { return $platformExpression }
    $oaOperationsExpression = Get-OaOperationsDemoExpression $definition $column $indexes $definitionMap
    if ($null -ne $oaOperationsExpression) { return $oaOperationsExpression }
    $crmOperationsExpression = Get-CrmOperationsDemoExpression $definition $name $indexes $definitionMap
    if ($null -ne $crmOperationsExpression) { return $crmOperationsExpression }
    $hrRuleExpression = Get-HrRuleDemoExpression $table $name $indexes
    if ($null -ne $hrRuleExpression) { return $hrRuleExpression }
    if ($table -eq 'sys_ip_acl' -and $name -eq 'rule_type') {
        # ip_pattern 统一生成 /32 CIDR，匹配类型必须与值的格式保持一致。
        return "'CIDR'"
    }
    if ($table -eq 'sys_ip_acl' -and $name -eq 'ip_pattern') {
        # IP/CIDR/区间表达式是格式说明，不是枚举；不能回落到通用文本模板，
        # 否则会灌入公司名称并让网关在每个请求中尝试 DNS 解析。
        # 使用 RFC 5737 的 TEST-NET 保留地址，既是合法 IPv4/CIDR，又不会命中真实网络。
        return "CONCAT('198.51.',100+MOD(t.n,50),'.',MOD(r.n,250)+1,'/32')"
    }
    if ($name -eq 'tenant_id') {
        # 所有带租户列的表都必须跟 sys_tenant.tenant_id 同一套编号。
        # 不能落到整数兜底 r.n+1：那会把 50 个租户的业务行（含用户、黑名单）写到 1–50，
        # 而真正的租户是 100000–100049。登录按租户查用户时对不上，
        # 黑名单却按裸 user_id 拦截，默认 admin(user_id=1) 会被误伤。
        return "($tenantBase+t.n)"
    }

    # 批次 A 基础设施表包含大量强语义枚举、布尔标志和跨表引用，不能使用
    # 通用“列名猜值”兜底；否则会生成 r.n+1 布尔值、非法状态和孤儿引用。
    switch ($table) {
        'oa_expense_standard' {
            switch ($name) {
                'position_level' { return "IF(MOD(r.n,5)=0,NULL,CONCAT('P',1+MOD(r.n,9)))" }
                'city' { return "IF(MOD(r.n,5)=0,NULL,$(Get-TenantFieldExpression 'City'))" }
                'limit_amount' { return 'CAST(200+MOD(r.n,10)*100 AS DECIMAL(12,2))' }
                'status' { return "IF(MOD(r.n,10)=9,'INACTIVE','ACTIVE')" }
                'deleted' { return '0' }
                'version' { return '0' }
            }
        }
        'wf_task_attachment' {
            $uploaderExpression = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
            switch ($name) {
                'upload_user_id' { return $uploaderExpression }
                'uploader_name' { return "(SELECT nick_name FROM cloud_flow_db.sys_user WHERE user_id=$uploaderExpression AND tenant_id=$tenantBase+t.n LIMIT 1)" }
                'file_name' { return "CONCAT('审批材料-',LPAD(r.n+1,3,'0'),'.pdf')" }
                'file_type' { return "'pdf'" }
                'file_size' { return '1024*(16+r.n)' }
                'upload_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY)' }
            }
        }
        'wf_task_delegation' {
            $fromUserExpression = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
            $toUserExpression = $fromUserExpression -replace 'r\.n', "MOD(r.n+1,$RowsPerTenant)"
            $delegationTypeExpression = "ELT(MOD(r.n,4)+1,'DELEGATE','DELEGATE_RETURN','PROXY','TRANSFER')"
            switch ($name) {
                'from_user_id' { return $fromUserExpression }
                'to_user_id' { return $toUserExpression }
                'from_user_name' { return "(SELECT nick_name FROM cloud_flow_db.sys_user WHERE user_id=$fromUserExpression AND tenant_id=$tenantBase+t.n LIMIT 1)" }
                'to_user_name' { return "(SELECT nick_name FROM cloud_flow_db.sys_user WHERE user_id=$toUserExpression AND tenant_id=$tenantBase+t.n LIMIT 1)" }
                'task_id' { return "IF(MOD(r.n,4)=2,NULL,$(Get-TargetIdExpression 'wf_task' $indexes $definitionMap))" }
                'instance_id' { return "IF(MOD(r.n,4)=2,NULL,$(Get-TargetIdExpression 'wf_process_instance' $indexes $definitionMap))" }
                'delegation_type' { return $delegationTypeExpression }
                'status' { return "IF(MOD(r.n,4) IN (0,3),'COMPLETED','ACTIVE')" }
                'start_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY)' }
                'end_time' { return 'CASE MOD(r.n,4) WHEN 2 THEN DATE_ADD(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY) WHEN 1 THEN NULL ELSE DATE_ADD(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY), INTERVAL 1 HOUR) END' }
                'create_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY)' }
                'version' { return '0' }
            }
        }
        'wf_urge_effect' {
            switch ($name) {
                'urge_id' { return Get-StringIdExpression $table $name }
                'before_duration' { return '3600*(1+MOD(r.n,12))' }
                'after_duration' { return '1800*(1+MOD(r.n,12))' }
                'effectiveness' { return '5' }
                'urge_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY)' }
                'complete_time' { return 'DATE_ADD(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY), INTERVAL 1800*(1+MOD(r.n,12)) SECOND)' }
            }
        }
        'wf_deploy_impact' {
            switch ($name) {
                'deploy_id' { return Get-TargetIdExpression 'wf_deploy_record' $indexes $definitionMap }
                # 影响详情是给人看的自由文本：前端 VersionRollbackManagement 直接
                # {impact.impactDetail} 渲染，灌 JSON_OBJECT 会把花括号和 source/demo50 原样显示到页面上。
                # 06 手写种子那 7 行也是中文句子，这里跟它保持一致。
                'impact_detail' { return Get-CatalogExpression @('影响进行中的审批实例，需等待当前节点处理完成','待办任务需重新分派到新版本对应节点','历史实例保留原版本轨迹，不参与本次迁移','表单字段有增减，需核对后再执行发布') 'r.n' }
                'mitigation_plan' { return Get-CatalogExpression @('待运行中实例结束后发布','保留现有待办并通知处理人','核对表单字段后执行发布','先验证节点变更再安排发布') 'r.n' }
                'create_time' { return 'DATE_SUB(CURRENT_TIMESTAMP, INTERVAL r.n+1 DAY)' }
            }
        }
        'sys_dept' {
            if ($name -eq 'holiday_calendar_id') {
                $generatedDefault = Get-NumericIdExpression $indexes['sys_holiday_calendar'] 't.n' '0'
                # 默认租户已由 06 提供 calendar_id=100 的正式日历，避免再造第二个默认日历。
                return "IF(t.n=0,100,$generatedDefault)"
            }
        }
        'sys_codegen_table' {
            switch ($name) {
                'table_name' { return "CONCAT('demo_codegen_',LPAD(r.n+1,3,'0'))" }
                'table_comment' { return "CONCAT('演示代码生成配置 ',LPAD(r.n+1,3,'0'))" }
                'module_name' { return Get-DemoModuleExpression }
                'business_name' { return "CONCAT('demo_resource_',LPAD(r.n+1,3,'0'))" }
                'class_name' { return "CONCAT('DemoResource',LPAD(r.n+1,3,'0'))" }
                'function_name' { return "CONCAT('演示资源',LPAD(r.n+1,3,'0'))" }
                'package_name' { return "CONCAT('com.cloudflow.demo.t',LPAD(t.n,2,'0'))" }
                'author' { return "'CloudFlow Demo'" }
                'tpl_category' { return "ELT(MOD(r.n,5)+1,'CRUD','TREE','SUB','INNER','HR_TYPED')" }
                'parent_menu_id' { return 'IF(MOD(r.n,5)=3,NULL,6)' }
                'sub_table_name' { return "IF(MOD(r.n,5)=2,CONCAT('demo_child_',LPAD(r.n+1,3,'0')),NULL)" }
                'sub_table_fk' { return "IF(MOD(r.n,5)=2,'parent_id',NULL)" }
                'tree_parent_code' { return "IF(MOD(r.n,5)=1,'parent_id',NULL)" }
                'tree_name_code' { return "IF(MOD(r.n,5)=1,'name',NULL)" }
                'tenant_field_flag' { return '1' }
                'logic_delete_flag' { return '1' }
                'version_field_flag' { return '1' }
                'version' { return '0' }
            }
        }
        'sys_codegen_column' {
            switch ($name) {
                'table_id' { return Get-NumericIdExpression $indexes['sys_codegen_table'] }
                'column_name' { return "'id'" }
                'column_comment' { return "'主键ID'" }
                'column_type' { return "'bigint'" }
                'java_type' { return "'Long'" }
                'java_field' { return "'id'" }
                'pk_flag' { return '1' }
                'increment_flag' { return '1' }
                'required_flag' { return '1' }
                'insert_flag' { return '0' }
                'edit_flag' { return '0' }
                'list_flag' { return '1' }
                'query_flag' { return '1' }
                'query_type' { return "'EQ'" }
                'html_type' { return "'input'" }
                'dict_type' { return 'NULL' }
                'audit_field_flag' { return '0' }
                'sort_no' { return '1' }
            }
        }
        'sys_message_channel' {
            switch ($name) {
                'channel_type' { return Get-DemoMessageChannelExpression }
                'channel_code' { return "CONCAT('demo-channel-t',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))" }
                'channel_name' { return "CONCAT('演示消息渠道 ',LPAD(r.n+1,3,'0'))" }
                'provider' { return "IF(MOD(r.n,7)=0,'cloudflow','demo-placeholder')" }
                'signature' { return 'NULL' }
                'api_key' { return 'NULL' }
                'api_secret_cipher' { return 'NULL' }
                'endpoint' { return 'NULL' }
                'smtp_host' { return 'NULL' }
                'smtp_port' { return 'IF(MOD(r.n,7)=1,465,NULL)' }
                'smtp_ssl_flag' { return '1' }
                'smtp_username' { return 'NULL' }
                'smtp_pwd_cipher' { return 'NULL' }
                'from_address' { return "IF(MOD(r.n,7)=1,CONCAT('demo',r.n+1,'@example.invalid'),NULL)" }
                'from_name' { return "'CloudFlow Demo'" }
                'callback_url' { return 'NULL' }
                'priority' { return '10+r.n' }
                'rate_limit_minute' { return '60' }
                'daily_limit' { return '1000' }
                'retry_count' { return '3' }
                'retry_interval_sec' { return '60' }
                'implemented_flag' { return 'IF(MOD(r.n,7)=0,1,0)' }
                'status' { return "IF(MOD(r.n,7)=0,'ENABLED','DISABLED')" }
                'version' { return '0' }
            }
        }
        'sys_message_template' {
            switch ($name) {
                'template_code' { return "CONCAT('DEMO_TPL_T',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,3,'0'))" }
                'template_name' { return "CONCAT('演示消息模板 ',LPAD(r.n+1,3,'0'))" }
                'channel_type' { return Get-DemoMessageChannelExpression }
                'biz_module' { return Get-DemoModuleExpression }
                'message_category' { return Get-DemoMessageCategoryExpression }
                'title_template' { return "CONCAT('演示消息 ',LPAD(r.n+1,3,'0'))" }
                'content_template' { return "CONCAT('这是租户 ',100000+t.n,' 的演示消息内容。')" }
                'params_declare' { return "'[]'" }
                'force_send_flag' { return '0' }
                'dedupe_window_sec' { return '300' }
                'link_url_template' { return "CONCAT('/message/demo/',LPAD(r.n+1,3,'0'))" }
                'status' { return "IF(MOD(r.n,7)=0,'ENABLED','DISABLED')" }
                'version' { return '0' }
            }
        }
        'sys_message_record' {
            switch ($name) {
                'trace_id' { return "CONCAT('demo-trace-t',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))" }
                'template_code' { return "CONCAT('DEMO_TPL_T',LPAD(t.n,2,'0'),'_',LPAD(r.n+1,3,'0'))" }
                'channel_type' { return Get-DemoMessageChannelExpression }
                'channel_id' { return Get-NumericIdExpression $indexes['sys_message_channel'] }
                'receiver_type' { return "'USER'" }
                'receiver_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
                'receiver_addr_mask' { return 'NULL' }
                'receiver_addr_cipher' { return 'NULL' }
                'receiver_name' { return Get-PersonExpression }
                'title' { return "CONCAT('演示消息 ',LPAD(r.n+1,3,'0'))" }
                'content' { return "CONCAT('租户 ',100000+t.n,' 的演示消息记录。')" }
                'message_category' { return Get-DemoMessageCategoryExpression }
                'biz_type' { return "'DEMO'" }
                'biz_id' { return "CONCAT('DEMO-',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))" }
                'link_url' { return "CONCAT('/message/demo/',LPAD(r.n+1,3,'0'))" }
                'send_status' { return Get-DemoMessageStatusExpression }
                'skip_reason' { return "IF(MOD(r.n,6)=5,'NOT_IMPLEMENTED',NULL)" }
                'retry_count' { return 'IF(MOD(r.n,6)=3,1,0)' }
                'error_msg' { return "IF(MOD(r.n,6)=3,'演示发送失败',NULL)" }
                'send_time' { return 'IF(MOD(r.n,6)>=2,DATE_SUB(CURRENT_TIMESTAMP,INTERVAL r.n MINUTE),NULL)' }
                'read_flag' { return 'MOD(r.n,2)' }
                'read_time' { return 'IF(MOD(r.n,2)=1,DATE_SUB(CURRENT_TIMESTAMP,INTERVAL r.n MINUTE),NULL)' }
                'resend_from_id' { return 'NULL' }
                'outbox_event_id' { return 'NULL' }
            }
        }
        'sys_message_subscribe' {
            switch ($name) {
                'user_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
                'message_category' { return Get-DemoMessageCategoryExpression }
                'channel_type' { return Get-DemoMessageChannelExpression }
                'enabled_flag' { return 'MOD(r.n,2)' }
                'quiet_start' { return "'22:00:00'" }
                'quiet_end' { return "'07:00:00'" }
            }
        }
        'sys_sms_code' {
            switch ($name) {
                'code_hash' { return "SHA2(CONCAT('demo-sms-',t.n,'-',r.n),256)" }
                'biz_scene' { return "'DEMO_LOGIN'" }
                'expire_time' { return 'DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 5 MINUTE)' }
                'used_flag' { return 'MOD(r.n,2)' }
                'used_time' { return 'IF(MOD(r.n,2)=1,CURRENT_TIMESTAMP,NULL)' }
                'send_ip' { return "CONCAT('198.51.100.',MOD(r.n,250)+1)" }
                'verify_fail_count' { return 'MOD(r.n,3)' }
            }
        }
        'sys_job' {
            switch ($name) {
                'job_name' { return "CONCAT('演示定时任务 ',LPAD(r.n+1,3,'0'))" }
                'job_group' { return "'DEMO'" }
                'service_name' { return Get-DemoServiceExpression }
                'handler_name' { return Get-DemoHandlerExpression }
                'handler_param' { return 'NULL' }
                'trigger_type' { return Get-DemoJobTriggerExpression }
                'cron_expression' { return "IF(MOD(r.n,3)=0,'0 0 2 * * ?',NULL)" }
                'interval_ms' { return 'IF(MOD(r.n,3)=0,NULL,300000)' }
                'status' { return "'PAUSED'" }
                'concurrent_flag' { return '0' }
                'misfire_strategy' { return "ELT(MOD(r.n,3)+1,'IGNORE','FIRE_ONCE','FIRE_ALL')" }
                'retry_count' { return '1' }
                'retry_interval_sec' { return '60' }
                'dispatch_retry_count' { return '3' }
                'dispatch_retry_interval_sec' { return '10' }
                'timeout_seconds' { return '1800' }
                'lock_time_seconds' { return '300' }
                'critical_flag' { return '0' }
                'log_success_flag' { return '1' }
                'alarm_on_fail_flag' { return '0' }
                'alarm_receiver' { return 'NULL' }
                'consecutive_fail_count' { return '0' }
                'last_fire_time' { return 'NULL' }
                'next_fire_time' { return 'NULL' }
                'version' { return '0' }
            }
        }
        'sys_job_handler' {
            switch ($name) {
                'service_name' { return Get-DemoServiceExpression }
                'handler_name' { return Get-DemoHandlerExpression }
                'handler_desc' { return "CONCAT('演示任务处理器 ',LPAD(r.n+1,3,'0'))" }
                'status' { return "'OFFLINE'" }
                'last_report_time' { return 'NULL' }
            }
        }
        'sys_job_log' {
            switch ($name) {
                'job_id' { return Get-NumericIdExpression $indexes['sys_job'] }
                'job_name' { return "CONCAT('演示定时任务 ',LPAD(r.n+1,3,'0'))" }
                'handler_name' { return Get-DemoHandlerExpression }
                'execute_no' { return "CONCAT('DEMO-JOB-T',LPAD(t.n,2,'0'),'-',LPAD(r.n+1,3,'0'))" }
                'trigger_type' { return Get-DemoJobLogTriggerExpression }
                'trigger_by' { return "IF(MOD(r.n,3)=1,'demo_operator',NULL)" }
                'start_time' { return 'DATE_SUB(CURRENT_TIMESTAMP,INTERVAL r.n+1 MINUTE)' }
                'end_time' { return 'IF(MOD(r.n,6)=0,NULL,DATE_SUB(CURRENT_TIMESTAMP,INTERVAL r.n MINUTE))' }
                'duration_ms' { return 'IF(MOD(r.n,6)=0,NULL,60000)' }
                'execute_status' { return Get-DemoJobLogStatusExpression }
                'affected_rows' { return 'IF(MOD(r.n,6)=1,r.n+1,NULL)' }
                'result_msg' { return "CONCAT('演示执行结果 ',LPAD(r.n+1,3,'0'))" }
                'exception_stack' { return "IF(MOD(r.n,6)=2,'演示异常堆栈',NULL)" }
                'executor_ip' { return "CONCAT('10.10.',t.n+1,'.',r.n+1)" }
                'dispatcher_ip' { return "CONCAT('10.20.',t.n+1,'.1')" }
                'dispatch_retry_index' { return 'MOD(r.n,3)' }
                'retry_index' { return 'MOD(r.n,2)' }
                'report_time' { return 'IF(MOD(r.n,6)=0,NULL,CURRENT_TIMESTAMP)' }
            }
        }
        'sys_holiday_calendar' {
            switch ($name) {
                'calendar_code' { return "CONCAT('CN-DEMO-',LPAD(r.n+1,3,'0'))" }
                'calendar_name' { return "CONCAT('中国大陆演示日历 ',LPAD(r.n+1,3,'0'))" }
                'region' { return "'中国大陆'" }
                'default_flag' { return 'IF(t.n>0 AND r.n=0,1,0)' }
                'weekly_rest_days' { return "'6,7'" }
                'work_start_time' { return "'09:00:00'" }
                'work_end_time' { return "'18:00:00'" }
                'lunch_start_time' { return "'12:00:00'" }
                'lunch_end_time' { return "'13:00:00'" }
                'status' { return "'ENABLED'" }
                'version' { return '0' }
            }
        }
        'sys_holiday_date' {
            switch ($name) {
                'calendar_id' { return Get-NumericIdExpression $indexes['sys_holiday_calendar'] 't.n' '0' }
                'holiday_date' { return Get-DemoHolidayDateExpression }
                'date_type' { return Get-DemoHolidayTypeExpression }
                'holiday_name' { return "ELT(MOD(r.n,3)+1,'演示调休上班','演示法定节假日','演示休息日')" }
                'triple_pay_flag' { return 'IF(MOD(r.n,3)=1,1,0)' }
                'year_no' { return '2026' }
                'version' { return '0' }
            }
        }
    }

    if ($table -eq 'sys_tenant' -and $name -eq 'user_limit') { return '100' }
    if ($table -eq 'sys_tenant' -and $name -eq 'storage_limit') { return '10240' }
    # 租户到期时间必须显式给 1 年，与 06.cloudflow-business-seed.sql 的默认租户一致。
    # 不能落到下面按列名猜的 expire 兜底（MOD(r.n,90)+1 DAY）：sys_tenant 每租户只出一行，
    # r.n 恒为 0 => MOD(0,90)+1 = 1 天，50 个租户全部只活 24 小时。
    # 而 /auth/tenant/options 带 expire_time > NOW() 过滤，
    # 灌数据当天能登录、次日登录页租户下拉全空。
    if ($table -eq 'sys_tenant' -and $name -eq 'expire_time') { return 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR)' }
    if ($table -eq 'sys_role' -and $name -eq 'data_scope') { return "IF(r.n=0,'1','3')" }
    if ($table -eq 'sys_role' -and $name -eq 'ds_type') { return 'IF(r.n=0,0,3)' }
    if ($table -eq 'sys_menu' -and $name -eq 'status') { return "'1'" }
    if ($table -eq 'sys_menu' -and $name -eq 'perms') { return "CONCAT('system:demo-menu:view-',LPAD(r.n+1,3,'0'))" }
    if ($table -eq 'oa_meeting_room' -and $name -eq 'status') { return "'1'" }
    if ($table -eq 'sys_user_totp' -and $name -eq 'secret_ciphertext') { return "'DEMO_DISABLED'" }
    if ($table -eq 'sys_user_totp' -and $name -eq 'enabled') { return '0' }
    if ($table -eq 'sys_user_totp' -and $name -in @('enabled_at','last_used_step')) { return 'NULL' }
    if ($name -eq 'deleted') { return '0' }
    if ($name -match '(?i)^(enabled|is_enabled|required|active)$') { return '1' }

    if ($table -eq 'oa_announcement') {
        switch ($name) {
            'title' { return "ELT(MOD(r.n,10)+1,'关于季度经营复盘与行动项的通知','产品版本迭代发布公告','客户交付质量专项提醒','中秋节办公安排通知','信息安全合规检查公告','年度培训计划发布通知','供应商准入规范更新','员工福利政策调整说明','系统升级维护公告','本月优秀团队表彰通报')" }
            'content' { return "CONCAT('请各部门结合本租户经营安排及时查看并落实。',$(Get-TenantFieldExpression 'Name'),'将持续跟进执行情况，相关问题请联系行政管理部。')" }
            'type' { return "ELT(MOD(r.n,3)+1,'1','2','3')" }
            'scope_type' { return "'ALL'" }
            'scope_value' { return 'NULL' }
            'status' { return "'1'" }
            'priority' { return "ELT(MOD(r.n,3)+1,'L','M','H')" }
            'publish_time' { return 'CURRENT_TIMESTAMP' }
            'expire_time' { return 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 90 DAY)' }
            'create_time' { return 'CURRENT_TIMESTAMP' }
            'update_time' { return 'CURRENT_TIMESTAMP' }
        }
    }

    if ($table -eq 'oa_knowledge_document') {
        switch ($name) {
            'title' { return "ELT(MOD(r.n,10)+1,'产品版本发布说明','客户实施交付指南','财务报销制度','人事入职手册','项目风险管理规范','信息安全操作手册','供应商准入流程','数据报表使用指南','培训课程资料','年度经营复盘报告')" }
            'category' { return "ELT(MOD(r.n,6)+1,'制度流程','产品知识','客户案例','项目交付','行业研究','培训资料')" }
            'scope_type' { return "'ALL'" }
            'scope_value' { return 'NULL' }
            'status' { return "ELT(MOD(r.n,4)+1,'DRAFT','PENDING','PUBLISHED','REJECTED')" }
            'submitter_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
            'submitter_name' { return Get-PersonExpression }
            'submit_time' { return 'CURRENT_TIMESTAMP' }
            'publish_time' { return 'CURRENT_TIMESTAMP' }
            'create_time' { return 'CURRENT_TIMESTAMP' }
            'update_time' { return 'CURRENT_TIMESTAMP' }
        }
    }

    if ($table -eq 'oa_meeting_room') {
        switch ($name) {
            'equipment_tags' { return "JSON_ARRAY('投影仪','白板')" }
            { $_ -in @('open_time','close_time','bookable_weekdays','holiday_calendar_id','max_booking_minutes','advance_booking_days','approver_id','photo_file_id') } { return 'NULL' }
            { $_ -in @('holiday_bookable_flag','min_booking_minutes') } { return '1' }
            { $_ -in @('need_approval_flag','buffer_minutes') } { return '0' }
        }
    }

    if ($table -eq 'oa_meeting_attendance') {
        switch ($name) {
            { $_ -in @('schedule_event_id','response_time') } { return 'NULL' }
            'acceptance_status' { return "'NONE'" }
            'invitation_version' { return '0' }
        }
    }

    if ($table -eq 'oa_meeting_minutes') {
        # 纪要只关联会议类型日程，避免把工作/个人事项误标为会议纪要。
        $minutesEventRow = '(MOD(3-MOD(t.n,3),3)+3*MOD(r.n,16))'
        $minutesToday = "(MOD(t.n+$minutesEventRow,10)=0)"
        $minutesDayOffset = "IF($minutesToday,0,1+MOD(t.n*7+$minutesEventRow,45))"
        $minutesDate = "DATE_ADD(CURDATE(), INTERVAL ($minutesDayOffset) DAY)"
        $minutesStart = "IF($minutesToday,DATE_ADD(CURRENT_TIMESTAMP, INTERVAL (1+MOD($minutesEventRow,4)) HOUR),DATE_ADD($minutesDate, INTERVAL (8+MOD($minutesEventRow,9)) HOUR))"
        switch ($name) {
            'meeting_id' { return Get-NumericIdExpression $indexes['oa_schedule_event'] 't.n' $minutesEventRow }
            'meeting_time' { return $minutesStart }
            'room_id' { return Get-NumericIdExpression $indexes['oa_meeting_room'] 't.n' $minutesEventRow }
            'location' { return Get-CatalogExpression $roomNames $minutesEventRow }
            'organizer_id' { return Get-TargetIdExpression 'sys_user' $indexes $definitionMap }
            'organizer_name' { return Get-PersonExpression }
            'schedule_event_id' { return Get-NumericIdExpression $indexes['oa_schedule_event'] 't.n' $minutesEventRow }
            'decisions' {
                $ownerId = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
                return "JSON_ARRAY(JSON_OBJECT('title','确认会议行动项与交付节点','ownerId',$ownerId,'ownerName',$(Get-PersonExpression),'dueDate',DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 30 DAY),'%Y-%m-%d'),'status','PENDING'))"
            }
            'status' { return "IF(MOD(r.n,4)=0,'CONFIRMED','DRAFT')" }
            'confirmed_time' { return "IF(MOD(r.n,4)=0,CURRENT_TIMESTAMP,NULL)" }
        }
    }

    if ($table -eq 'oa_schedule_event') {
        $scheduleTypeOffset = 'MOD(t.n+r.n,3)'
        # 每个租户保留 5 条导入日安排，其中会议记录会在会议室页显示为今日预订。
        $scheduleIsToday = '(MOD(t.n+r.n,10)=0)'
        $scheduleDayOffset = "IF($scheduleIsToday,0,1+MOD(t.n*7+r.n,45))"
        $scheduleDate = "DATE_ADD(CURDATE(), INTERVAL ($scheduleDayOffset) DAY)"
        $scheduleStart = "IF($scheduleIsToday,DATE_ADD(CURRENT_TIMESTAMP, INTERVAL (1+MOD(r.n,4)) HOUR),DATE_ADD($scheduleDate, INTERVAL (8+MOD(r.n,9)) HOUR))"
        $scheduleAllDay = "($scheduleTypeOffset=2 AND MOD(r.n,5)=0 AND NOT $scheduleIsToday)"
        switch ($name) {
            'title' {
                return "CASE $scheduleTypeOffset WHEN 0 THEN $(Get-CatalogExpression @('周经营例会','项目进度评审会','客户方案沟通会','产品需求评审会','交付风险协调会','月度预算复盘会','供应商服务评审会','信息安全专题会','人才发展评审会','季度目标复盘会') 'r.n') WHEN 1 THEN $(Get-CatalogExpression @('整理项目交付清单','编制客户解决方案','复核月度经营数据','完成产品迭代验收','更新合同履约台账','准备管理层汇报材料','跟进客户上线事项','核对采购到货进度','完成系统巡检','提交项目周报') 'r.n') ELSE $(Get-CatalogExpression @('年度健康体检','驾驶证到期提醒','家庭事务安排','个人学习计划','出行行程提醒','证件办理预约','培训课程学习','个人资料整理','生日纪念提醒','健身训练安排') 'r.n') END"
            }
            'description' {
                return "CASE $scheduleTypeOffset WHEN 0 THEN '请参会人员提前准备议题材料，并在会议结束后确认责任人与完成时间。' WHEN 1 THEN '按计划完成当前工作事项，及时更新进度、交付物和风险记录。' ELSE '个人日程提醒，请根据实际安排确认时间并按时完成。' END"
            }
            'start_time' { return "IF($scheduleAllDay,$scheduleDate,$scheduleStart)" }
            'end_time' { return "IF($scheduleAllDay,DATE_ADD($scheduleDate, INTERVAL 1 DAY),DATE_ADD($scheduleStart, INTERVAL (1+MOD(r.n,3)) HOUR))" }
            'is_all_day' { return "IF($scheduleAllDay,1,0)" }
            'type' { return "ELT($scheduleTypeOffset+1,'MEETING','WORK','PERSONAL')" }
            'status' { return "'PLANNED'" }
            'approval_status' { return "'NOT_REQUIRED'" }
            'recurrence_role' { return "'SINGLE'" }
            'timezone_id' { return "'Asia/Shanghai'" }
            'reminders' { return 'JSON_ARRAY()' }
            'expected_attendees' { return '3' }
            { $_ -in @('buffer_minutes_snapshot','schedule_version','recurrence_exception_flag') } { return '0' }
            { $_ -in @('join_url','meeting_platform','recurrence_rule','recurrence_end_date','parent_event_id','original_start_time','source_series_version','instance_id') } { return 'NULL' }
            'room_id' {
                $roomExpression = Get-TargetIdExpression 'oa_meeting_room' $indexes $definitionMap
                return "IF($scheduleTypeOffset=0,$roomExpression,NULL)"
            }
            'attendees' {
                $adminExpression = Get-NumericIdExpression $indexes['sys_user'] 't.n' '0'
                $creatorExpression = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
                $nextAttendeeExpression = Get-NumericIdExpression $indexes['sys_user'] 't.n' 'MOD(r.n+1,50)'
                return "JSON_ARRAY($adminExpression,$creatorExpression,$nextAttendeeExpression)"
            }
        }
    }

    if ($table -eq 'sys_user_blacklist' -and $name -eq 'user_id') {
        # 每租户 r.n=0 是 admin。Get-TargetIdExpression 还会把默认租户第一行映射成
        # user_id=1（06 手写的真实 admin）。登录 isBanned 只看 user_id、不看 tenant_id，
        # 演示黑名单一旦指向 1，xinyuan/admin 当天就会被拦，表现为“账户过期”。
        # 指向下一行演示用户，既保留黑名单列表，又不锁死租户管理员。
        return Get-NumericIdExpression $indexes['sys_user'] 't.n' '1+MOD(r.n,49)'
    }
    $target = Get-TargetTable $name
    if ($table -like 'oa_knowledge_*' -and $name -eq 'document_id') { $target = 'oa_knowledge_document' }
    if ($target -and $definition.Primary.Count -gt 1) {
        $targetExpression = Get-TargetIdExpression $target $indexes $definitionMap
        if ($targetExpression) { return $targetExpression }
    }
    if ($definition.Primary -contains $name) {
        if ($type -match 'char|varchar|text') { return Get-StringIdExpression $table $name }
        return Get-NumericIdExpression $indexes[$table]
    }
    if ($target) {
        $targetExpression = Get-TargetIdExpression $target $indexes $definitionMap
        if ($targetExpression) { return $targetExpression }
    }

    if ($table -eq 'sys_menu' -and $name -eq 'parent_id') { return 'IF(r.n=0,0,3000)' }
    # 演示部门必须是扇形三层，不能连成链。原来 parent 指向 r.n-1，50 行串成 50 层深，
    # 前端 OrgStructure 每层缩进 18px，第 50 层是 900px，远超 320px 的面板宽度，
    # 树会斜向下坠出可视区、部门名被压成「战略投...」。按 06 手写种子的形状来：
    # r.n=0 是根公司；r.n=1..10 是 10 个一级部门，挂在根下；r.n>=11 是二级组，
    # 轮流挂到那 10 个一级部门上（MOD 取模均摊，39 个二级组分成 4/4/4/4/4/4/4/4/4/3）。
    if ($table -eq 'sys_dept' -and $name -eq 'parent_id') {
        $rootId = Get-NumericIdExpression $indexes[$table] 't.n' '0'
        $firstLevelId = Get-NumericIdExpression $indexes[$table] 't.n' '1+MOD(r.n-11,10)'
        return "CASE WHEN r.n=0 THEN 0 WHEN r.n<11 THEN $rootId ELSE $firstLevelId END"
    }
    # ancestors 是逗号分隔的祖先路径（不含自己），必须和上面的 parent_id 严格对应，
    # 否则前端按 ancestors 算层级、后端按 ancestors 做数据权限过滤都会错。
    if ($table -eq 'sys_dept' -and $name -eq 'ancestors') {
        $rootId = Get-NumericIdExpression $indexes[$table] 't.n' '0'
        $firstLevelId = Get-NumericIdExpression $indexes[$table] 't.n' '1+MOD(r.n-11,10)'
        return "CASE WHEN r.n=0 THEN '0' WHEN r.n<11 THEN CONCAT('0,',$rootId) ELSE CONCAT('0,',$rootId,',',$firstLevelId) END"
    }
    if ($table -eq 'sys_menu' -and $name -eq 'menu_type') { return "IF(r.n=0,'M',IF(r.n<25,'C','F'))" }
    if ($name -match '(?i)(status|_status)$') { return Get-StatusExpression $table $name $type $column.Length $column.Comment }
    if ($name -eq 'direction') { return "IF(MOD(r.n,2)=0,'IN','OUT')" }
    if ($name -eq 'mode') {
        if ($table -eq 'sys_ip_acl') { return "IF(MOD(r.n,2)=0,'BLACK','WHITE')" }
        return "IF(MOD(r.n,2)=0,'ONLINE','OFFLINE')"
    }
    if ($name -eq 'gender') { return "IF(MOD(r.n,2)=0,'MALE','FEMALE')" }
    if ($name -eq 'sex') { return "IF(MOD(r.n,2)=0,'0','1')" }

    # 注释里列了枚举值的字符串列，一律按注释灌。
    # 放在类型兜底之前：*_type / result / category / use_scene / final_decision 这类列
    # 原来一路落到 Get-TextExpression 的名称模板，被灌成
    # 「上海云杉数字科技有限公司业务登记-001」这种中文串（实例：
    # oa_contract_milestone.milestone_type 本该是 DELIVERY/PAYMENT/ACCEPTANCE/OTHER）。
    # 放在 status / direction / mode / gender 之后：那几个有手工调过的分布或历史取值，不能被覆盖。
    if ($type -match 'char|varchar') {
        $columnEnumExpression = Get-EnumExpression (Get-EnumValuesFromComment $column.Comment)
        if ($columnEnumExpression) {
            if ($column.Length -gt 0) { return "LEFT($columnEnumExpression, $($column.Length))" }
            return $columnEnumExpression
        }
    }

    # 原生 json 类型和 TEXT/VARCHAR 承载的 JSON 走同一条路。放在类型兜底这里而不是更早：
    # 更早会盖掉上面各表手工调过的取值（如 oa_schedule_event.attendees 已经是 JSON_ARRAY 用户 ID、
    # sys_message_template.params_declare 已经是 '[]'），那些都比通用形状更贴合业务。
    $jsonExpression = Get-JsonColumnExpression $definition $column $indexes $definitionMap
    if ($jsonExpression) { return $jsonExpression }
    if ($type -match '(datetime|timestamp)') {
        if ($name -match '(?i)(end|expire|expiry|deadline|due|renew|next|effective|return)') { return 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL MOD(r.n,90)+1 DAY)' }
        return 'DATE_ADD(CURRENT_TIMESTAMP, INTERVAL MOD(t.n*50+r.n,365)+1 DAY)'
    }
    if ($type -match '^date') {
        if ($name -match '(?i)(end|expire|expiry|deadline|due|renew|next|effective|return)') { return 'DATE_ADD(CURDATE(), INTERVAL MOD(r.n,90)+1 DAY)' }
        return 'DATE_ADD(CURDATE(), INTERVAL MOD(t.n*50+r.n,365)+1 DAY)'
    }
    if ($type -match '^time') { return "MAKETIME(9+MOD(r.n,8),MOD(r.n*7,60),0)" }
    if ($type -match '(decimal|numeric|double|float)') {
        if ($name -eq 'confidence') { return 'CAST(0.800+MOD(t.n+r.n,190)/1000 AS DECIMAL(4,3))' }
        if ($name -match '(?i)(rate|ratio|percent|percentage|weight|score)') { return 'CAST(60+MOD(t.n+r.n,40) AS DECIMAL(10,2))' }
        if ($name -match '(?i)(progress|days|hours|minutes|duration)') { return 'CAST(1+MOD(r.n,30) AS DECIMAL(10,2))' }
        return 'CAST(1000+MOD(t.n*97+r.n*233,90000) AS DECIMAL(18,2))'
    }
    if ($type -match '(bigint|int|smallint|tinyint|mediumint|bit)') {
        if ($name -match '(?i)(deleted|enabled|is_|required|visible|read_flag|primary|confirmed|locked|active|frame|cache|urgent)') { return 'MOD(r.n,2)' }
        if ($name -match '(?i)year') { return 'YEAR(CURDATE())' }
        if ($name -match '(?i)month') { return 'MOD(r.n,12)+1' }
        if ($name -match '(?i)(days|hours|minutes|duration|progress)') { return 'MOD(r.n,30)+1' }
        return 'r.n+1'
    }
    if ($name -match '(?i)(deleted|enabled|is_|required|visible|read_flag|primary|confirmed|locked|active|frame|cache|urgent)') { return "'0'" }
    return Limit-TextExpression (Get-TextExpression $definition $column) $column.Length
}

function Get-DeletePredicate($definition, [hashtable]$indexes) {
    $table = $definition.Table
    # 系统审计和日志表由数据库触发器保护为不可删除，只追加新的 Demo 留痕记录。
    if ($table -in @('sys_log','sys_audit_log','wf_audit_log')) { return '1=0' }
    if ($table -eq 'sys_tenant') { return "tenant_id BETWEEN $($tenantBase + 1) AND $tenantLast" }
    if ($table -eq 'sys_menu') { return 'menu_id BETWEEN 3000 AND 3049' }
    if ($table -eq 'sys_audit_archive_policy') { return "biz_module LIKE 'demo50-%'" }
    if (-not $definition.HasTenant) { return '1=0' }
    $tenantPredicate = "tenant_id BETWEEN $($tenantBase + 1) AND $tenantLast"
    # 旧生成器把 tenant_id 写成 r.n+1，脏数据落在 1–50；重灌必须清掉，否则黑名单等行会留下。
    $legacyMiskeyedPredicate = "tenant_id BETWEEN 1 AND $TenantCount"
    $primaryPredicates = @()
    foreach ($primaryName in $definition.Primary) {
        if ($primaryName -eq 'tenant_id') { continue }
        $primaryColumn = $definition.Columns | Where-Object Name -eq $primaryName | Select-Object -First 1
        if ($primaryColumn.Type -match 'char|varchar|text') { $primaryPredicates += "$primaryName LIKE 'demo50_%'" }
        else {
            $minimum = $idBase + $indexes[$table] * $tableStride + 1
            $maximum = $minimum + $RowsPerTenant - 1
            $primaryPredicates += "$primaryName BETWEEN $minimum AND $maximum"
        }
    }
    if ($primaryPredicates.Count -eq 0) { return "($tenantPredicate) OR ($legacyMiskeyedPredicate)" }
    $predicate = "($tenantPredicate) OR ($legacyMiskeyedPredicate) OR (tenant_id=$tenantBase AND (" + ($primaryPredicates -join ' OR ') + '))'
    if ($table -eq 'hr_comp_component') { return "($predicate) AND component_code <> 'OVERTIME'" }
    return $predicate
}

$definitions = @(Read-Schema $SchemaPath)
if ($definitions.Count -ne 374) { throw "Expected 374 tables including the six approved settlement tables, found $($definitions.Count)." }
$definitionMap = @{}
$indexes = @{}
$tableIndex = 1
foreach ($definition in ($definitions | Sort-Object Table)) {
    $definitionMap[$definition.Table] = $definition
    $indexes[$definition.Table] = $tableIndex
    $tableIndex++
}
$emailTables = @('crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression')
$approvedEmailTables = @(Read-Schema (Join-Path $PSScriptRoot '../docs/design/外部接入与可靠投递提案DDL.sql') | Where-Object Table -In $emailTables)
if ($approvedEmailTables.Count -ne 3) { throw 'The approved CRM email proposal must contain exactly three CRM email tables.' }
foreach ($approved in $approvedEmailTables) {
    $actual = $definitionMap[$approved.Table]
    if ($null -eq $actual) { throw "Missing approved email table: $($approved.Table)" }
    $expectedColumns = @($approved.Columns | Select-Object Name,Type,Length,Auto,Nullable,DefaultExpression) | ConvertTo-Json -Depth 8 -Compress
    $actualColumns = @($actual.Columns | Select-Object Name,Type,Length,Auto,Nullable,DefaultExpression) | ConvertTo-Json -Depth 8 -Compress
    if ($expectedColumns -cne $actualColumns -or ($approved.Primary -join ',') -cne ($actual.Primary -join ',')) {
        throw "CRM email table differs from the approved proposal: $($approved.Table)"
    }
}
$Tables = @($Tables | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ } | Sort-Object -Unique)
foreach ($tableName in $Tables) {
    if (-not $definitionMap.ContainsKey($tableName)) { throw "Unknown table: $tableName" }
}
$scopedGeneration = $Tables.Count -gt 0
$connectedExpressions = @{}
if (-not $scopedGeneration) {
    $env:PYTHONIOENCODING = 'utf-8'
    $linkJson = & python (Join-Path $PSScriptRoot 'demo_seed_completion.py') --json
    if ($LASTEXITCODE -ne 0) { throw 'Connected demo relationship generation failed.' }
    $linkObject = ($linkJson -join "`n") | ConvertFrom-Json
    foreach ($property in $linkObject.PSObject.Properties) { $connectedExpressions[$property.Name] = $property.Value }
}
$selectedDefinitions = @($definitions | Where-Object { -not $scopedGeneration -or $_.Table -in $Tables })
if ($scopedGeneration -and -not $ValidateOnly) {
    $fullSeedPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\cloudflow-backend\DB\07.cloudflow-demo-seed.sql'))
    if (-not $PSBoundParameters.ContainsKey('OutputPath') -or [IO.Path]::GetFullPath($OutputPath) -eq $fullSeedPath) {
        throw 'Scoped generation requires a separate -OutputPath; the full 07 seed must not be overwritten.'
    }
}
if ($ValidateOnly) {
    $selectedDefinitions | Sort-Object Table | ForEach-Object { "{0}`t{1}`t{2}" -f $_.Table,$_.Columns.Count,$_.HasTenant }
    exit 0
}

$serviceGeneratedTables = @('sys_data_source_config','sys_data_source_registration','hr_employee_referral','hr_recruitment_identity','hr_employee_advance','hr_advance_repayment','hr_appraisal_cycle','hr_appraisal_kra','hr_appraisal_result','hr_skill','hr_position_skill','hr_employee_skill','sys_portal_user','sys_message_delivery','crm_mass_email_recipient','crm_email_tracking_link','crm_email_suppression','crm_email_record','crm_sales_stage','crm_opportunity_item','crm_opportunity_stage_history','crm_deal_team','crm_deal_event','crm_deal_allocation','oa_meeting_reminder','wf_form_draft','wf_agent_setting','wf_gateway_activation','wf_parallel_join','hr_overtime_type','hr_overtime_request','hr_shift_request',
    'oa_consumable_ledger','oa_consumable_request','oa_consumable_request_item','biz_purchase_receipt')
$serviceGeneratedTables += @('sys_oauth2_client','sys_oauth2_code','sys_oauth2_access_token','sys_oauth2_refresh_token','sys_oauth2_approve')
$serviceGeneratedTables += @('sys_report_dataset','sys_report_chart','sys_report_dashboard','sys_report_dashboard_item')
$serviceGeneratedTables += @('sys_tenant_package','sys_tenant_package_sync','sys_tenant_package_sync_item')
$serviceGeneratedTables += @('sys_im_config','sys_im_user_mapping','sys_im_dept_mapping','sys_im_todo_mapping','sys_im_sync_run','sys_im_callback_event')
$serviceGeneratedTables += @('hr_severance_rule','hr_severance_rule_slab','hr_final_settlement','hr_final_settlement_item','hr_training_recovery','hr_exit_interview')
if ($scopedGeneration -and @($Tables | Where-Object { $_ -in $serviceGeneratedTables }).Count -gt 0) {
    throw 'Application, draft, delivery, tracking, inventory and data source tables require canonical foundations or real service operations.'
}
$selectedDefinitions = @($selectedDefinitions | Where-Object { $_.Table -notin $serviceGeneratedTables })
$deleteOrder = @($selectedDefinitions | Sort-Object Table -Descending)
$insertOrderNames = @('sys_tenant','sys_dept','sys_user','sys_role','sys_post','sys_menu','sys_user_role','sys_role_menu','sys_user_post','sys_file','sys_legal_release','sys_legal_document','sys_legal_consent')
$insertOrder = [System.Collections.Generic.List[object]]::new()
foreach ($name in $insertOrderNames) { if ($definitionMap.ContainsKey($name) -and (-not $scopedGeneration -or $name -in $Tables)) { $insertOrder.Add($definitionMap[$name]) } }
foreach ($definition in ($selectedDefinitions | Sort-Object Table)) { if (-not $insertOrderNames.Contains($definition.Table)) { $insertOrder.Add($definition) } }

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$writer = [System.IO.StreamWriter]::new($OutputPath, $false, [System.Text.UTF8Encoding]::new($false))
try {
    $writer.WriteLine("-- CloudFlow Pro - 50-tenant $(if ($scopedGeneration) { 'scoped' } else { 'full' }) Demo seed")
    $writer.WriteLine('-- Generated by scripts/generate-demo-seed.ps1. Do not hand-edit this file.')
    $tenantTableCount = @($selectedDefinitions | Where-Object HasTenant).Count
    $globalTableCount = $selectedDefinitions.Count - $tenantTableCount
    $writer.WriteLine("-- Generic seeds: $tenantTableCount tenant tables receive $RowsPerTenant rows per tenant; $globalTableCount global tables receive $RowsPerTenant rows total.")
    if (-not $scopedGeneration) {
        $writer.WriteLine('-- Fresh development database only: run once after 01-06; never rerun on live business data.')
        $writer.WriteLine('-- Connected fixtures cover operational tables; external integrations and generated jobs stay disabled.')
    }
    $writer.WriteLine('-- H foundations add three disabled overtime types per active tenant; fixture rows do not prove real service operations.')
    $writer.WriteLine('SET NAMES utf8mb4;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=0;')
    $writer.WriteLine('SET UNIQUE_CHECKS=1;')
    $writer.WriteLine('USE cloud_flow_db;')
    if (-not $scopedGeneration -or 'oa_meeting_minutes' -in $Tables) {
        $writer.WriteLine("SET @cloudflow_schema_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='oa_meeting_minutes' AND column_name='room_id'), 'SELECT 1', 'ALTER TABLE oa_meeting_minutes ADD COLUMN room_id VARCHAR(64) DEFAULT NULL AFTER meeting_time');")
        $writer.WriteLine('PREPARE cloudflow_schema_stmt FROM @cloudflow_schema_sql;')
        $writer.WriteLine('EXECUTE cloudflow_schema_stmt;')
        $writer.WriteLine('DEALLOCATE PREPARE cloudflow_schema_stmt;')
        $writer.WriteLine("SET @cloudflow_schema_sql = IF(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='oa_meeting_minutes' AND column_name='schedule_event_id'), 'SELECT 1', 'ALTER TABLE oa_meeting_minutes ADD COLUMN schedule_event_id BIGINT(20) DEFAULT NULL AFTER organizer_name');")
        $writer.WriteLine('PREPARE cloudflow_schema_stmt FROM @cloudflow_schema_sql;')
        $writer.WriteLine('EXECUTE cloudflow_schema_stmt;')
        $writer.WriteLine('DEALLOCATE PREPARE cloudflow_schema_stmt;')
    }
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_rows;')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_tenants (n INT NOT NULL PRIMARY KEY);')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_rows (n INT NOT NULL PRIMARY KEY);')
    $numberValues = 0..($RowsPerTenant - 1) | ForEach-Object { "($_)" }
    $writer.WriteLine('INSERT INTO demo_seed_tenants (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('INSERT INTO demo_seed_rows (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('')
    if (-not $scopedGeneration) { Write-HEnhancementGuard $writer }
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE oauth2_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO oauth2_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_oauth2_client)
 AND NOT EXISTS(SELECT 1 FROM sys_oauth2_code)
 AND NOT EXISTS(SELECT 1 FROM sys_oauth2_access_token)
 AND NOT EXISTS(SELECT 1 FROM sys_oauth2_refresh_token)
 AND NOT EXISTS(SELECT 1 FROM sys_oauth2_approve);
DROP TEMPORARY TABLE oauth2_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE report_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO report_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_report_dataset)
 AND NOT EXISTS(SELECT 1 FROM sys_report_chart)
 AND NOT EXISTS(SELECT 1 FROM sys_report_dashboard)
 AND NOT EXISTS(SELECT 1 FROM sys_report_dashboard_item);
DROP TEMPORARY TABLE report_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE data_source_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO data_source_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_data_source_config)
 AND NOT EXISTS(SELECT 1 FROM sys_data_source_registration);
DROP TEMPORARY TABLE data_source_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE tenant_package_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO tenant_package_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_tenant_package)
 AND NOT EXISTS(SELECT 1 FROM sys_tenant_package_sync)
 AND NOT EXISTS(SELECT 1 FROM sys_tenant_package_sync_item)
 AND NOT EXISTS(SELECT 1 FROM sys_tenant WHERE package_id IS NOT NULL OR package_version IS NOT NULL OR package_override IS NOT NULL OR effective_menu_ids IS NOT NULL);
DROP TEMPORARY TABLE tenant_package_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE im_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO im_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_im_config)
 AND NOT EXISTS(SELECT 1 FROM sys_im_user_mapping)
 AND NOT EXISTS(SELECT 1 FROM sys_im_dept_mapping)
 AND NOT EXISTS(SELECT 1 FROM sys_im_todo_mapping)
 AND NOT EXISTS(SELECT 1 FROM sys_im_sync_run)
 AND NOT EXISTS(SELECT 1 FROM sys_im_callback_event);
DROP TEMPORARY TABLE im_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE hr_skill_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO hr_skill_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM hr_skill WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM hr_position_skill WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM hr_employee_skill WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);
DROP TEMPORARY TABLE hr_skill_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE hr_advance_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO hr_advance_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM hr_employee_advance WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM hr_advance_repayment WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);
DROP TEMPORARY TABLE hr_advance_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE portal_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO portal_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM sys_portal_user WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM oa_knowledge_document WHERE (tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
  AND (external_visible_flag <> 0 OR external_version_id IS NOT NULL OR external_attachment_file_ids IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM oa_contract WHERE (tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
  AND (portal_term_ids IS NOT NULL OR portal_milestone_ids IS NOT NULL OR portal_payment_schedule_ids IS NOT NULL));
DROP TEMPORARY TABLE portal_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE crm_email_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO crm_email_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM crm_mass_email_recipient WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_email_tracking_link WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_email_suppression WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_email_record WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);
DROP TEMPORARY TABLE crm_email_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE crm_opportunity_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO crm_opportunity_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM crm_opportunity_stage_history WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_opportunity_item WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);
DROP TEMPORARY TABLE crm_opportunity_demo_seed_guard;
'@)
    $writer.WriteLine(@'
CREATE TEMPORARY TABLE crm_deal_demo_seed_guard (passed TINYINT NOT NULL CHECK (passed = 1));
INSERT INTO crm_deal_demo_seed_guard
SELECT NOT EXISTS(SELECT 1 FROM crm_deal_team WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_deal_event WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50)
 AND NOT EXISTS(SELECT 1 FROM crm_deal_allocation WHERE tenant_id BETWEEN 100000 AND 100049 OR tenant_id BETWEEN 1 AND 50);
DROP TEMPORARY TABLE crm_deal_demo_seed_guard;
'@)
    foreach ($definition in $deleteOrder) {
        $writer.WriteLine("DELETE FROM cloud_flow_db.$($definition.Table) WHERE $(Get-DeletePredicate $definition $indexes);")
    }
    $writer.WriteLine('')
    foreach ($definition in $insertOrder) {
        $table = $definition.Table
        # Every calendar receives the official template at the completion stage.
        if (-not $scopedGeneration -and $table -eq 'sys_holiday_date') { continue }
        if ($table -eq 'sys_tenant') {
            $columns = @($definition.Columns | Where-Object { -not $_.Auto -or $definition.Primary -contains $_.Name })
            $expressions = @()
            foreach ($column in $columns) {
                if ($column.Name -eq 'tenant_id') { $expressions += "($tenantBase+t.n)" }
                elseif ($column.Name -eq 'tenant_code') { $expressions += Get-TextExpression $definition $column }
                elseif ($column.Name -eq 'tenant_name') { $expressions += Get-TextExpression $definition $column }
                else { $expressions += Get-ColumnExpression $definition $column $indexes $definitionMap }
            }
            $writer.WriteLine("INSERT INTO cloud_flow_db.$table (" + (($columns | ForEach-Object Name) -join ',') + ')')
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_tenants t, (SELECT 0 AS n) r')
            $writer.WriteLine('ON DUPLICATE KEY UPDATE tenant_name=VALUES(tenant_name), contact_name=VALUES(contact_name), contact_email=VALUES(contact_email), status=VALUES(status), expire_time=VALUES(expire_time), deleted=VALUES(deleted), remark=VALUES(remark);')
            continue
        }
        $columns = @($definition.Columns | Where-Object { -not $_.Auto -or $definition.Primary -contains $_.Name })
        $expressions = @($columns | ForEach-Object { Get-ColumnExpression $definition $_ $indexes $definitionMap })
        $writer.WriteLine("INSERT IGNORE INTO cloud_flow_db.$table (" + (($columns | ForEach-Object Name) -join ',') + ')')
        if ($table -eq 'sys_menu') {
            $expressions = @($expressions | ForEach-Object { $_ -replace 't\.n', '0' })
            $expressions[$columns.Name.IndexOf('menu_id')] = '(3000+r.n)'
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_rows r;')
        } elseif ($table -eq 'sys_audit_archive_policy') {
            $expressions = @($expressions | ForEach-Object { $_ -replace 't\.n', '0' })
            $idIndex = $columns.Name.IndexOf('id')
            if ($idIndex -ge 0) { $expressions[$idIndex] = '(3500+r.n)' }
            $moduleIndex = $columns.Name.IndexOf('biz_module')
            if ($moduleIndex -ge 0) { $expressions[$moduleIndex] = "CONCAT('demo50-',LPAD(r.n+1,3,'0'))" }
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_rows r;')
        } else {
            $writer.WriteLine('SELECT ' + ($expressions -join ',') + ' FROM demo_seed_tenants t CROSS JOIN demo_seed_rows r;')
        }
    }
    if (-not $scopedGeneration -or 'sys_role_menu' -in $Tables) {
        $writer.WriteLine('INSERT IGNORE INTO cloud_flow_db.sys_role_menu (role_id,menu_id,tenant_id)')
        $writer.WriteLine("SELECT r.role_id,m.menu_id,r.tenant_id FROM cloud_flow_db.sys_role r CROSS JOIN cloud_flow_db.sys_menu m WHERE r.tenant_id BETWEEN $tenantBase AND $tenantLast AND r.role_key='admin' AND r.status='0' AND r.deleted=0 AND m.status='0' AND m.menu_id NOT BETWEEN 3000 AND 3049 AND m.menu_id NOT BETWEEN 1970 AND 1976 AND m.menu_id NOT BETWEEN 1780 AND 1799 AND m.menu_id NOT IN (1987,1988);")
        $writer.WriteLine('INSERT IGNORE INTO cloud_flow_db.sys_role_menu (role_id,menu_id,tenant_id)')
        $writer.WriteLine("SELECT r.role_id,m.menu_id,r.tenant_id FROM cloud_flow_db.sys_role r CROSS JOIN cloud_flow_db.sys_menu m WHERE r.tenant_id BETWEEN $tenantBase AND $tenantLast AND r.role_key='hr' AND r.status='0' AND r.deleted=0 AND m.status='0' AND (m.menu_id IN (6,1756,1757) OR m.menu_id BETWEEN 1320 AND 1324);")
        $writer.WriteLine('INSERT IGNORE INTO cloud_flow_db.sys_role_menu (role_id,menu_id,tenant_id)')
        $writer.WriteLine("SELECT r.role_id,m.menu_id,r.tenant_id FROM cloud_flow_db.sys_role r CROSS JOIN cloud_flow_db.sys_menu m WHERE r.tenant_id BETWEEN $tenantBase AND $tenantLast AND r.status='0' AND r.deleted=0 AND m.menu_id IN (1325,1336,1337,1338,1339);")
    }
    if (-not $scopedGeneration) { Write-OaOperationsDefaults $writer $SchemaPath }
    if (-not $scopedGeneration) { Write-HEnhancementDefaults $writer $SchemaPath }
    if (-not $scopedGeneration) {
        $messageSource = Get-Content -LiteralPath (Join-Path $SchemaPath '06.cloudflow-business-seed.sql') -Raw -Encoding utf8
        $messageDefaults = [regex]::Match($messageSource, '(?s)-- external-message-delivery:start.*?-- external-message-delivery:end')
        if (-not $messageDefaults.Success) { throw 'Missing approved external message job seed' }
        $writer.WriteLine($messageDefaults.Value)
        $marketingDefaults = [regex]::Match($messageSource, '(?s)-- crm-marketing-email-defaults:start.*?-- crm-marketing-email-defaults:end')
        if (-not $marketingDefaults.Success) { throw 'Missing approved CRM marketing defaults' }
        $writer.WriteLine($marketingDefaults.Value)
        $opportunityDefaults = [regex]::Match($messageSource, '(?s)-- crm-opportunity-stage-defaults:start.*?-- crm-opportunity-stage-defaults:end')
        if (-not $opportunityDefaults.Success) { throw 'Missing approved opportunity stage defaults' }
        $writer.WriteLine($opportunityDefaults.Value)
    }
    if (-not $scopedGeneration -or 'hr_candidate' -in $Tables) {
        $writer.WriteLine('INSERT INTO cloud_flow_db.hr_recruitment_identity (tenant_id, identity_type, identity_hash, candidate_id, create_by, update_by)')
        $writer.WriteLine("SELECT candidate.tenant_id, 'EMAIL', SHA2(CONCAT(candidate.tenant_id, ':EMAIL:', LOWER(TRIM(candidate.email))), 256), candidate.id, 'seed', 'seed' FROM cloud_flow_db.hr_candidate candidate WHERE candidate.tenant_id BETWEEN $tenantBase AND $tenantLast AND candidate.email IS NOT NULL AND TRIM(candidate.email) <> '' AND NOT EXISTS (SELECT 1 FROM cloud_flow_db.hr_recruitment_identity identity_row WHERE identity_row.tenant_id = candidate.tenant_id AND identity_row.identity_type = 'EMAIL' AND identity_row.identity_hash = SHA2(CONCAT(candidate.tenant_id, ':EMAIL:', LOWER(TRIM(candidate.email))), 256));")
    }
    if (-not $scopedGeneration) {
        $completion = & python (Join-Path $PSScriptRoot 'demo_seed_completion.py')
        if ($LASTEXITCODE -ne 0) { throw 'Connected operational fixture generation failed.' }
        $writer.WriteLine(($completion -join "`n"))
    }
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_rows;')
    $writer.WriteLine('SET UNIQUE_CHECKS=1;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=1;')
} finally {
    $writer.Dispose()
}

Write-Host ("Generated {0:N0} bytes for {1} tables." -f (Get-Item -LiteralPath $OutputPath).Length, $selectedDefinitions.Count)
