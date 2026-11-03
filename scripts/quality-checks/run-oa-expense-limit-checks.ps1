param([Parameter(Mandatory=$true)][string]$ClasspathFile)
$ErrorActionPreference = 'Stop'
$TaskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$TaskOutput = Join-Path $TaskRoot '.cloudflow-runtime\quality-refactor-20261103\expense'
[IO.Directory]::CreateDirectory($TaskOutput) | Out-Null
$TaskJars = @((Get-Content -LiteralPath $ClasspathFile -Raw).Trim().Split(';') | Where-Object {
    $_ -match '(lombok|mybatis-plus-annotation|jackson-annotations|swagger-annotations[^\\/]*|spring-core|spring-jcl)-[0-9][^\\/]*\.jar$'
} | ForEach-Object { $_.Replace('C:\Users\Administrator\.m2\repository', 'D:\CloudFlowProCache\m2\repository') })
if ($TaskJars.Count -lt 6) { throw '缺少校验所需依赖，请传入当前 OA 模块 dependency:build-classpath 输出文件' }
foreach ($TaskJar in $TaskJars) { if (-not (Test-Path -LiteralPath $TaskJar)) { throw "依赖不存在: $TaskJar" } }
$TaskSource = Join-Path $TaskRoot 'cloudflow-backend\cloudflow-service-oa\src\main\java\com\cloudflow\oa'
$TaskFiles = @('domain/BizExpenseItem.java', 'domain/OaExpenseStandard.java', 'domain/vo/OaExpenseExceedDetailVO.java', 'domain/vo/OaExpenseExceedResultVO.java', 'service/impl/OaExpenseLimitCalculator.java') | ForEach-Object { Join-Path $TaskSource $_ }
$TaskClasspath = $TaskJars -join ';'
& javac -encoding UTF-8 -cp $TaskClasspath -d $TaskOutput @TaskFiles (Join-Path $PSScriptRoot 'OaExpenseLimitChecks.java')
if ($LASTEXITCODE) { throw '费用规则局部编译失败' }
& java -cp "$TaskOutput;$TaskClasspath" com.cloudflow.oa.service.impl.OaExpenseLimitChecks
if ($LASTEXITCODE) { throw '费用规则行为检查失败' }
