param([Parameter(Mandatory = $true)][string]$StatePath)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$StateFile = (Resolve-Path -LiteralPath $StatePath).Path
$Run = Split-Path -Parent $StateFile
if ((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $StateFile) -ne 'state.json') { throw 'Owned isolated state required' }
$State = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
if ($State.run -ne $Run -or $State.status -ne 'RUNNING' -or $State.mysqlPort -lt 1025 -or $State.mysqlPort -gt 65535) { throw 'Owned isolated database required' }
foreach ($Candidate in @($Root, $Run, $StateFile, (Join-Path $Run 'mysql-data'))) {
    if ((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Redirected test path rejected' }
}
$Owned = @($State.processes | Where-Object name -EQ 'mysql')
if ($Owned.Count -ne 1 -or $Owned[0].marker -ne (Join-Path $Run 'mysql-data')) { throw 'Unique owned database required' }
$Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Owned[0].id)"
if (-not $Process -or $Process.Name -ne 'mysqld.exe' -or -not $Process.CommandLine.Contains($Owned[0].marker)) { throw 'Owned database process mismatch' }
$Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $State.mysqlPort)
if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
$Listener = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)"
if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Owned[0].marker) -or ($Listener.ProcessId -ne $Owned[0].id -and $Listener.ParentProcessId -ne $Owned[0].id)) { throw 'Database listener ownership mismatch' }
Write-Output "TENANT_PACKAGE_DATABASE_OWNER: loopback=127.0.0.1; port=$($State.mysqlPort); started=$($Process.CreationDate.ToString('O')); marker_verified=true"
$Backend = Join-Path $Root 'cloudflow-backend'
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Modules += @('cloudflow-service-hr', 'cloudflow-service-oa', 'cloudflow-service-crm') | ForEach-Object { Join-Path $Backend $_ }
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$Dependencies = (Get-Content -LiteralPath (Join-Path $Backend 'cloudflow-auth/target/portal-classpath.txt') -Raw).Trim()
$Classpath = (@($Classes) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = Join-Path $Backend 'cloudflow-auth/target/tenant-package-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = @('TenantPackageDatabaseChecks.java', 'TenantEntitlementChecks.java', 'TenantPackageManagementChecks.java', 'TenantAssignmentChecks.java', 'TenantQuotaDatabaseChecks.java') | ForEach-Object { Join-Path $PSScriptRoot "tenant-package-checks/$_" }
$Source += Join-Path $PSScriptRoot 'tenant-package-checks/TenantNavigationDatabaseChecks.java'
$Production = @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/tenantpackage') -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Production += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/domain') -Filter 'SysTenant*.java' | Select-Object -ExpandProperty FullName)
$Production += (Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/mapper/TenantPackageMapper.java')
$Production += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/permission') -Filter '*.java' | Select-Object -ExpandProperty FullName)
$Production += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/tenant/entitlement') -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName)
$Production += @('service/CurrentPermissionService.java','service/CloudFlowStpInterface.java','interceptor/UserContextInterceptor.java') | ForEach-Object { Join-Path $Backend "cloudflow-common/cloudflow-common-security/src/main/java/com/cloudflow/common/security/$_" }
$Production += @('SysMenuServiceImpl.java','SysRoleServiceImpl.java') | ForEach-Object { Join-Path $Backend "cloudflow-auth/src/main/java/com/cloudflow/auth/service/impl/$_" }
$Production += Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/oauth2/OAuthActors.java'
$Production += @('platform/PlatformAccessService.java', 'platform/PlatformControlPermissionService.java', 'controller/system/TenantPackageController.java', 'controller/SysTenantController.java') | ForEach-Object { Join-Path $Backend "cloudflow-auth/src/main/java/com/cloudflow/auth/$_" }
$Production += @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common/cloudflow-common-data/src/main/java/com/cloudflow/common/tenant/quota') -Filter '*.java' -Recurse | Select-Object -ExpandProperty FullName)
$Production += @('service/impl/SysUserServiceImpl.java', 'service/impl/SysFileServiceImpl.java', 'mapper/SysFileMapper.java') | ForEach-Object { Join-Path $Backend "cloudflow-auth/src/main/java/com/cloudflow/auth/$_" }
$Production += Join-Path $Backend 'cloudflow-auth/src/main/java/com/cloudflow/auth/controller/AuthController.java'
$Production += Join-Path $Backend 'cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrFileStorage.java'
$Production += Join-Path $Backend 'cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaPrivateFileStorageService.java'
$Production += Join-Path $Backend 'cloudflow-service-crm/src/main/java/com/cloudflow/crm/service/email/archive/CrmEmailArchiveFiles.java'
$Inputs = @($Production + $Source + @((Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/auth/TenantPackageMapper.xml'), (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/auth/SysMenuMapper.xml'), (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/auth/OAuthMapper.xml'), (Join-Path $Backend 'cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantEntitlementMapper.xml'), (Join-Path $Backend 'DB/01.cloudflow-common.sql'))) | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } }
$Inputs += @('cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantQuotaMapper.xml', 'cloudflow-auth/src/main/resources/mapper/SysFileMapper.xml', 'cloudflow-auth/src/main/resources/mapper/SysFileConfigMapper.xml', 'cloudflow-service-hr/src/main/resources/mapper/HrFileStorageMapper.xml') | ForEach-Object { $Path = Join-Path $Backend $_; [PSCustomObject]@{ Path = $Path; Hash = (Get-FileHash -LiteralPath $Path).Hash } }
$AutoConfigurationPath = Join-Path $Backend 'cloudflow-common/cloudflow-common-data/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports'
$Inputs += [PSCustomObject]@{ Path = $AutoConfigurationPath; Hash = (Get-FileHash -LiteralPath $AutoConfigurationPath).Hash }
if (@(Get-Content -LiteralPath $AutoConfigurationPath | Where-Object { $_ -eq 'com.cloudflow.common.tenant.quota.TenantQuotaConfiguration' }).Count -ne 1) { throw 'Quota auto-configuration must be registered exactly once' }
$Compile = @('-encoding','UTF-8','-parameters','-cp',('"' + $Classpath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"')) + @($Production + @($Source) | ForEach-Object { '"' + $_.Replace('\','/') + '"' })
$CompileFile = Join-Path $Output 'database-compile.args'
[IO.File]::WriteAllLines($CompileFile, $Compile, [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Tenant package database checks compilation failed' }
$Database = "jdbc:mysql://127.0.0.1:$($State.mysqlPort)/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
$RunFile = Join-Path $Output 'database-run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\','/') + '"'),'com.cloudflow.auth.tenantpackage.TenantPackageDatabaseChecks',('"' + $Database + '"'),('"' + (Join-Path $Run 'mysql-data').Replace('\','/') + '"'),('"' + $Root.Replace('\','/') + '"')), [Text.UTF8Encoding]::new($false))
& java "@$RunFile"
if ($LASTEXITCODE -ne 0) { throw 'Tenant package database checks failed' }
$Changed = @($Inputs | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash })
if ($Changed.Count -ne 0) { throw 'Tenant package test inputs changed during validation' }
Write-Output "TENANT_PACKAGE_DATABASE_INPUTS: files=$($Inputs.Count); changed=0; compiled_from_current_source=true"
