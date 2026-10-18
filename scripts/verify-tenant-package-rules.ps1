param()

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Tenant package checks require a data drive' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Output = Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/tenant-package-checks'
& node (Join-Path $PSScriptRoot 'tenant-package-checks/export-catalog.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Formal menu replay failed' }
$Sources = @(
    (Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/permission/PermissionIntersection.java'),
    (Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/permission/TenantFeatureRegistry.java'),
    (Join-Path $Root 'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/tenantpackage/TenantPackageRules.java'),
    (Join-Path $Root 'cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/tenantpackage/TenantPackageSyncRules.java'),
    (Join-Path $PSScriptRoot 'tenant-package-checks/TenantPackageRulesChecks.java'),
    (Join-Path $PSScriptRoot 'tenant-package-checks/TenantPackageSyncChecks.java')
)
& javac -encoding UTF-8 -d $Output $Sources
if ($LASTEXITCODE -ne 0) { throw 'Tenant package rules compilation failed' }
& java '-Dfile.encoding=UTF-8' -cp $Output com.cloudflow.auth.tenantpackage.TenantPackageRulesChecks (Join-Path $Output 'catalog.tsv') (Join-Path $Output 'employee.txt')
if ($LASTEXITCODE -ne 0) { throw 'Tenant package rules checks failed' }
& java '-Dfile.encoding=UTF-8' -cp $Output com.cloudflow.auth.tenantpackage.TenantPackageSyncChecks
if ($LASTEXITCODE -ne 0) { throw 'Tenant package sync rules checks failed' }
