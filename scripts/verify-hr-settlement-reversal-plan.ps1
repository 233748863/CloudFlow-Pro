$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Builds = @(Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains('org.codehaus.plexus.classworlds.launcher.Launcher') -and $_.CommandLine.Contains($Root)
})
if ($Builds.Count -gt 0) { throw 'Wait for workspace Maven before using compiled dependencies' }
$Module = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$Run = Join-Path $Root ('.cloudflow-runtime/hr-settlement-reversal-plan/' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Run) | Out-Null
function JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\','/') + '"'
}
$Sources = @((Join-Path $Module 'src/main/java/com/cloudflow/hr/service/HrSettlementReversalPlan.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/hr/service/HrAdvanceSalaryReservationChain.java'),
    (Join-Path $PSScriptRoot 'hr-checks/HrSettlementReversalPlanChecks.java'),
    (Join-Path $PSScriptRoot 'hr-checks/HrAdvanceSalaryReservationChainChecks.java'))
$Hashes = @($Sources | ForEach-Object { [PSCustomObject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash} })
$Compile = Join-Path $Run 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',(JavaArgument $ClassPath),'-d',(JavaArgument $Run)) + @($Sources | ForEach-Object { JavaArgument $_ }), [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'Reversal plan compilation failed' }
$Arguments = Join-Path $Run 'run.args'
[IO.File]::WriteAllLines($Arguments, @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai','-cp',(JavaArgument ($Run + [IO.Path]::PathSeparator + $ClassPath)),
    'com.cloudflow.hr.checks.HrSettlementReversalPlanChecks'), [Text.UTF8Encoding]::new($false))
& java "@$Arguments"
if ($LASTEXITCODE -ne 0) { throw 'Reversal plan checks failed' }
$ChainArguments = Join-Path $Run 'chain.args'
[IO.File]::WriteAllLines($ChainArguments, @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai','-cp',(JavaArgument ($Run + [IO.Path]::PathSeparator + $ClassPath)),
    'com.cloudflow.hr.service.HrAdvanceSalaryReservationChainChecks'), [Text.UTF8Encoding]::new($false))
& java "@$ChainArguments"
if ($LASTEXITCODE -ne 0) { throw 'Salary reservation chain checks failed' }
if (@($Hashes | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count) { throw 'Plan inputs changed during validation' }
"REVERSAL_PLAN_INPUTS: unchanged=true; files=$($Sources.Count)"
