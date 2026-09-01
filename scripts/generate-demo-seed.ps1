[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB\07.cloudflow-demo-seed.sql'),
    [string]$SchemaPath = (Join-Path $PSScriptRoot '..\cloudflow-backend\DB'),
    [ValidateRange(50, 50)][int]$RowsPerTenant = 50,
    [ValidateRange(50, 50)][int]$TenantCount = 50,
    [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    $files = Get-ChildItem -LiteralPath $root -Filter '*.sql' |
        Where-Object Name -Match '^0[1-5]\.' |
        Sort-Object Name
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
                $columns.Add([pscustomobject]@{
                    Name = $columnMatch.Groups[1].Value.ToLowerInvariant()
                    Type = $type
                    Length = if ($lengthMatch.Success) { [int]$lengthMatch.Groups[1].Value } else { 0 }
                    Auto = $rest -match '(?i)\bAUTO_INCREMENT\b'
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
        message_id='wf_transaction_message'; notice_id='wf_notice'; project_id='oa_project'; contract_id='oa_contract';
        milestone_id='oa_project_milestone'; budget_id='oa_budget_plan'; subject_id='oa_budget_subject'; invoice_id='oa_invoice';
        seal_id='oa_seal'; license_id='oa_license'; vehicle_id='oa_vehicle'; asset_id='oa_asset'; supplier_id='oa_supplier';
        room_id='oa_meeting_room'; minutes_id='oa_meeting_minutes'; visitor_id='oa_visitor'; lead_id='crm_lead';
        customer_id='crm_customer'; contact_id='crm_contact'; opportunity_id='crm_opportunity'; quote_id='crm_quote';
        quote_line_id='crm_quote_line'; receivable_id='crm_receivable'; renewal_id='crm_renewal'; ticket_id='crm_service_ticket';
        sales_target_id='crm_sales_target'
        menu_id='sys_menu'; announcement_id='oa_announcement'
    }
    if ($map.ContainsKey($column)) { return $map[$column] }
    if ($column -match '(?i)(assignee|approver|reviewer|manager|interviewer|investigator|operator|driver|owner|applicant|handler|creator|recipient|sender|voter|evaluatee|evaluator|uploaded_by)_id$') { return 'sys_user' }
    if ($column -match '(?i)(predecessor|successor)_id$') { return 'oa_project' }
    return $null
}

function Get-TargetIdExpression([string]$target, [hashtable]$indexes, [hashtable]$definitionMap) {
    if (-not $target -or -not $indexes.ContainsKey($target)) { return $null }
    if ($target -eq 'sys_menu') { return '(3000+r.n)' }
    $targetDefinition = $definitionMap[$target]
    $primaryName = $targetDefinition.Primary[0]
    $primaryColumn = $targetDefinition.Columns | Where-Object Name -eq $primaryName | Select-Object -First 1
    if ($primaryColumn.Type -match 'char|varchar|text') { return Get-StringIdExpression $target $primaryName }
    $expression = Get-NumericIdExpression $indexes[$target]
    if ($target -eq 'sys_user') { return "IF(t.n=0 AND r.n=0,1,$expression)" }
    return $expression
}

function Get-StatusExpression([string]$table, [string]$column, [string]$type, [int]$length) {
    if ($type -match '(?i)(tinyint|smallint|mediumint|int|bigint|bit)') { return '1' }
    if (($type -match 'char|varchar') -and $length -gt 0 -and $length -le 2) { return "'0'" }
    if ($table -in @('sys_tenant','sys_user','sys_role','sys_post','sys_menu','sys_dict_type','sys_dict_data','sys_config')) { return "'0'" }
    if ($table -eq 'sys_legal_release') { return "'PUBLISHED'" }
    if ($table -eq 'sys_legal_document') { return "'0'" }
    if ($table -eq 'wf_task') { return "ELT(MOD(r.n,5)+1,'TODO','DONE','CANCELLED','TRANSFERRED','DONE')" }
    if ($table -eq 'wf_process_instance') { return "ELT(MOD(r.n,5)+1,'RUNNING','COMPLETED','CANCELLED','REJECTED','SUSPENDED')" }
    if ($table -like 'wf_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','SUCCESS','FAILED','COMPLETED')" }
    if ($table -eq 'hr_employee' -and $column -eq 'employee_status') { return "ELT(MOD(r.n,5)+1,'ACTIVE','ACTIVE','PROBATION','ON_LEAVE','ACTIVE')" }
    if ($table -match '^hr_.*(training|exam)') { return "ELT(MOD(r.n,5)+1,'PLANNED','IN_PROGRESS','COMPLETED','APPROVED','CANCELLED')" }
    if ($table -like 'hr_*') { return "ELT(MOD(r.n,5)+1,'ACTIVE','PENDING','APPROVED','REJECTED','COMPLETED')" }
    if ($table -eq 'crm_lead') { return "ELT(MOD(r.n,5)+1,'NEW','CONTACTED','QUALIFIED','CONVERTED','CLOSED')" }
    if ($table -eq 'crm_customer') { return "ELT(MOD(r.n,5)+1,'POTENTIAL','NORMAL','VIP','ACTIVE','DORMANT')" }
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

function Get-ColumnExpression($definition, $column, [hashtable]$indexes, [hashtable]$definitionMap) {
    $table = $definition.Table
    $name = $column.Name
    $type = $column.Type
    if ($name -eq 'tenant_id') { return "($tenantBase + t.n)" }
    if ($table -eq 'sys_tenant' -and $name -eq 'user_limit') { return '100' }
    if ($table -eq 'sys_tenant' -and $name -eq 'storage_limit') { return '10240' }
    if ($table -eq 'sys_role' -and $name -eq 'data_scope') { return "IF(r.n=0,'1','3')" }
    if ($table -eq 'sys_role' -and $name -eq 'ds_type') { return 'IF(r.n=0,0,3)' }
    if ($table -eq 'sys_menu' -and $name -eq 'status') { return "'1'" }
    if ($table -eq 'sys_user_totp' -and $name -eq 'secret_ciphertext') { return "'DEMO_DISABLED'" }
    if ($table -eq 'sys_user_totp' -and $name -eq 'enabled') { return '0' }
    if ($table -eq 'sys_user_totp' -and $name -in @('enabled_at','last_used_step')) { return 'NULL' }
    if ($name -eq 'deleted') { return '0' }
    if ($name -match '(?i)^(enabled|is_enabled|required|active)$') { return '1' }

    if ($table -eq 'oa_schedule_event') {
        $scheduleTypeOffset = 'MOD(t.n+r.n,3)'
        # 日程必须从导入日之后开始，保证首次打开当前月份时能看到 Demo 安排。
        $scheduleDayOffset = '1+MOD(t.n*7+r.n,45)'
        $scheduleDate = "DATE_ADD(CURDATE(), INTERVAL ($scheduleDayOffset) DAY)"
        $scheduleStart = "DATE_ADD($scheduleDate, INTERVAL (8+MOD(r.n,9)) HOUR)"
        $scheduleAllDay = "($scheduleTypeOffset=2 AND MOD(r.n,5)=0)"
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
            'room_id' {
                $roomExpression = Get-TargetIdExpression 'oa_meeting_room' $indexes $definitionMap
                return "IF($scheduleTypeOffset=0,$roomExpression,NULL)"
            }
            'attendees' {
                $creatorExpression = Get-TargetIdExpression 'sys_user' $indexes $definitionMap
                $nextAttendeeExpression = Get-NumericIdExpression $indexes['sys_user'] 't.n' 'MOD(r.n+1,50)'
                return "JSON_ARRAY($creatorExpression,$nextAttendeeExpression)"
            }
        }
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
    if ($table -eq 'sys_dept' -and $name -eq 'parent_id') { return 'IF(r.n=0,0,' + (Get-NumericIdExpression $indexes[$table] 't.n' 'r.n-1') + ')' }
    if ($table -eq 'sys_menu' -and $name -eq 'menu_type') { return "IF(r.n=0,'M',IF(r.n<25,'C','F'))" }
    if ($name -match '(?i)(status|_status)$') { return Get-StatusExpression $table $name $type $column.Length }
    if ($name -eq 'direction') { return "IF(MOD(r.n,2)=0,'IN','OUT')" }
    if ($name -eq 'mode') {
        if ($table -eq 'sys_ip_acl') { return "IF(MOD(r.n,2)=0,'BLACK','WHITE')" }
        return "IF(MOD(r.n,2)=0,'ONLINE','OFFLINE')"
    }
    if ($name -eq 'gender') { return "IF(MOD(r.n,2)=0,'MALE','FEMALE')" }
    if ($name -eq 'sex') { return "IF(MOD(r.n,2)=0,'0','1')" }

    if ($type -match 'json') { return "JSON_OBJECT('source','demo50','tenantId',$tenantBase+t.n,'table','$table','row',r.n+1,'label','全链路演示数据')" }
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
    if ($primaryPredicates.Count -eq 0) { return $tenantPredicate }
    return "($tenantPredicate) OR (tenant_id=$tenantBase AND (" + ($primaryPredicates -join ' OR ') + '))'
}

$definitions = @(Read-Schema $SchemaPath)
if ($definitions.Count -ne 244) { throw "Expected 244 tables, found $($definitions.Count)." }
$definitionMap = @{}
$indexes = @{}
$tableIndex = 1
foreach ($definition in ($definitions | Sort-Object Table)) {
    $definitionMap[$definition.Table] = $definition
    $indexes[$definition.Table] = $tableIndex
    $tableIndex++
}
if ($ValidateOnly) {
    $definitions | Sort-Object Table | ForEach-Object { "{0}`t{1}`t{2}" -f $_.Table,$_.Columns.Count,$_.HasTenant }
    exit 0
}

$deleteOrder = @($definitions | Sort-Object Table -Descending)
$insertOrderNames = @('sys_tenant','sys_dept','sys_user','sys_role','sys_post','sys_menu','sys_user_role','sys_role_menu','sys_user_post','sys_file','sys_legal_release','sys_legal_document','sys_legal_consent')
$insertOrder = [System.Collections.Generic.List[object]]::new()
foreach ($name in $insertOrderNames) { if ($definitionMap.ContainsKey($name)) { $insertOrder.Add($definitionMap[$name]) } }
foreach ($definition in ($definitions | Sort-Object Table)) { if (-not $insertOrderNames.Contains($definition.Table)) { $insertOrder.Add($definition) } }

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
$writer = [System.IO.StreamWriter]::new($OutputPath, $false, [System.Text.UTF8Encoding]::new($false))
try {
    $writer.WriteLine('-- CloudFlow Pro - 50-tenant full Demo seed')
    $writer.WriteLine('-- Generated by scripts/generate-demo-seed.ps1. Do not hand-edit this file.')
    $writer.WriteLine('-- 242 tenant tables receive 50 rows per tenant; 2 global tables receive 50 rows total.')
    $writer.WriteLine('SET NAMES utf8mb4;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=0;')
    $writer.WriteLine('SET UNIQUE_CHECKS=0;')
    $writer.WriteLine('USE cloud_flow_db;')
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE IF EXISTS demo_seed_rows;')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_tenants (n INT NOT NULL PRIMARY KEY);')
    $writer.WriteLine('CREATE TEMPORARY TABLE demo_seed_rows (n INT NOT NULL PRIMARY KEY);')
    $numberValues = 0..($RowsPerTenant - 1) | ForEach-Object { "($_)" }
    $writer.WriteLine('INSERT INTO demo_seed_tenants (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('INSERT INTO demo_seed_rows (n) VALUES ' + ($numberValues -join ',') + ';')
    $writer.WriteLine('')
    foreach ($definition in $deleteOrder) {
        $writer.WriteLine("DELETE FROM cloud_flow_db.$($definition.Table) WHERE $(Get-DeletePredicate $definition $indexes);")
    }
    $writer.WriteLine('')
    foreach ($definition in $insertOrder) {
        $table = $definition.Table
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
    $adminRoleExpression = Get-NumericIdExpression $indexes['sys_role'] 't.n' '0'
    $writer.WriteLine('INSERT IGNORE INTO cloud_flow_db.sys_role_menu (role_id,menu_id,tenant_id)')
    $writer.WriteLine("SELECT $adminRoleExpression,m.menu_id,$tenantBase+t.n FROM demo_seed_tenants t CROSS JOIN cloud_flow_db.sys_menu m WHERE m.status='0' AND m.menu_id NOT BETWEEN 3000 AND 3049;")
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_tenants;')
    $writer.WriteLine('DROP TEMPORARY TABLE demo_seed_rows;')
    $writer.WriteLine('SET UNIQUE_CHECKS=1;')
    $writer.WriteLine('SET FOREIGN_KEY_CHECKS=1;')
} finally {
    $writer.Dispose()
}

Write-Host ("Generated {0:N0} bytes for {1} tables." -f (Get-Item -LiteralPath $OutputPath).Length, $definitions.Count)
