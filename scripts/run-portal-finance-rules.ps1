param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Backend=Join-Path $Root 'cloudflow-backend'
$Output=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/h3-portal-finance-rules-20261002-$Round"
if (Test-Path -LiteralPath $Output) { throw 'Retain existing evidence; use a new round' }
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Dependencies=(Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/portal-classpath.txt') -Raw).Trim()
$Modules=@('cloudflow-auth','cloudflow-service-crm','cloudflow-service-oa') | ForEach-Object { Join-Path $Backend $_ }
$Modules+=@(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes=@($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Classpath=(@($Classes)+@($Dependencies)) -join [IO.Path]::PathSeparator
$Source=Join-Path $Root 'scripts/portal-checks/PortalFinanceRulesChecks.java'
$Paths=@($Source,$PSCommandPath)+@(rg --files --hidden --no-ignore $Backend -g '*Finance*.java' -g '*Finance*.xml' -g '!**/target/**')
$Before=@($Paths | ForEach-Object { [pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash} })
$Before | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Compile=Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-parameters','-proc:none','-classpath',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile" *> (Join-Path $Output 'compile.log')
if ($LASTEXITCODE -ne 0) { throw 'Finance rules compilation failed; retained log' }
$Run=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($Run,@('-classpath',('"'+($Output+';'+$Classpath).Replace('\','/')+'"'),'com.cloudflow.finance.checks.PortalFinanceRulesChecks'),[Text.UTF8Encoding]::new($false))
& java "@$Run" *> (Join-Path $Output 'checks.log')
if ($LASTEXITCODE -ne 0) { throw 'Finance rules failed; retained log' }
if (@($Before | Where-Object { (Get-FileHash -LiteralPath $_.Path -Algorithm SHA256).Hash -ne $_.Hash }).Count) { throw 'Verification inputs changed' }
Get-Content -LiteralPath (Join-Path $Output 'checks.log') | Where-Object { $_ -match '^PORTAL_FINANCE_RULE_CHECKS:' }
