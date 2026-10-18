param()

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/portal-classpath.txt') -Raw).Trim()
$Classpath = (@($Classes) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = Join-Path $Backend 'cloudflow-auth/target/tenant-package-auth-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @('AuthInfoTenantIdentityChecks.java','AuthLoginTenantCacheChecks.java','LoginDomainIsolationChecks.java') | ForEach-Object { Join-Path $PSScriptRoot "platform-checks/$_" }
$Sources += Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java'
$Sources += Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/service/LoginCompletionService.java'
$Sources += @('CloudFlowStpInterface.java','CurrentPermissionService.java') | ForEach-Object { Join-Path $Backend "cloudflow-common/cloudflow-common-security/src/main/java/com/cloudflow/common/security/service/$_" }
$Sources += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/permission') -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Inputs = @($Sources | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } })
$Compile = @('-encoding','UTF-8','-parameters','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"')) + @($Sources | ForEach-Object { '"' + $_.Replace('\','/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Tenant package authentication checks compilation failed' }
foreach ($Check in @('com.cloudflow.auth.controller.AuthInfoTenantIdentityChecks','com.cloudflow.auth.controller.AuthLoginTenantCacheChecks','com.cloudflow.common.security.service.LoginDomainIsolationChecks')) {
    $RunFile = Join-Path $Output 'run.args'
    [IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'), $Check), [Text.UTF8Encoding]::new($false))
    & java "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw "Tenant package authentication check failed: $Check" }
}
$Changed = @($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
if ($Changed.Count -ne 0) { throw 'Tenant package authentication inputs changed during validation' }
Write-Output "TENANT_PACKAGE_AUTH_INPUTS: files=$($Inputs.Count); changed=0; compiled_from_current_source=true"
