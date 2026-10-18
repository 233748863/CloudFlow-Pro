param([switch]$SkipBuild, [switch]$Browser, [switch]$Menus)

$ErrorActionPreference = 'Stop'
if ($Browser -and $Menus) { throw 'Browser和Menus模式不能同时启用' }
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
$Source = Join-Path $PSScriptRoot 'platform-checks/CodegenDatabaseChecks.java'
$BrowserSource = Join-Path $PSScriptRoot 'platform-checks/CodegenBrowserServer.java'
$MenuSource = Join-Path $PSScriptRoot 'platform-checks/CodegenMenuChecks.java'
$EnvironmentBefore = @{}
Get-ChildItem Env: | ForEach-Object { $EnvironmentBefore[$_.Name] = $_.Value }

try {
    if (-not $SkipBuild) {
        Push-Location $Backend
        try {
            & mvn -q -pl 'cloudflow-auth,cloudflow-service-oa,cloudflow-common/cloudflow-common-static-rules' -am '-DskipTests' install dependency:build-classpath '-Dmdep.outputFile=target/codegen-checks-classpath.txt'
            if ($LASTEXITCODE -ne 0) { throw '代码生成器数据库验证依赖构建失败' }
        } finally { Pop-Location }
    }
    $RunRoot = [IO.Path]::GetFullPath((Join-Path $Root ('.cloudflow-runtime/codegen-db-checks/' + [Guid]::NewGuid().ToString('N'))))
    if (-not $RunRoot.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '验证路径越过工作区' }
    $Classes = Join-Path $RunRoot 'classes'
    $Generated = Join-Path $RunRoot 'generated'
    [IO.Directory]::CreateDirectory($Classes) | Out-Null
    [IO.Directory]::CreateDirectory($Generated) | Out-Null
    Write-Output "CODEGEN_DB_EVIDENCE_ROOT=$RunRoot"
    $Dependencies = (Get-Content -LiteralPath (Join-Path $Auth 'target/codegen-checks-classpath.txt') -Raw).Trim()
    $ClassPath = @($Classes, (Join-Path $Auth 'target/classes'), (Join-Path $Backend 'cloudflow-service-oa/target/classes'), (Join-Path $Backend 'cloudflow-common/cloudflow-common-static-rules/target/classes'), $Dependencies) -join [IO.Path]::PathSeparator
    $CompileArguments = Join-Path $RunRoot 'compile.args'
    [IO.File]::WriteAllLines($CompileArguments, @('-encoding', 'UTF-8', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), '-d', ('"' + $Classes.Replace('\', '/') + '"'), ('"' + $Source.Replace('\', '/') + '"'), ('"' + $BrowserSource.Replace('\', '/') + '"'), ('"' + $MenuSource.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
    & javac '-J-Dfile.encoding=UTF-8' "@$CompileArguments"
    if ($LASTEXITCODE -ne 0) { throw '代码生成器数据库验证程序编译失败' }
    $LogConfiguration = Join-Path $RunRoot 'logback.xml'
    [IO.File]::WriteAllText($LogConfiguration, '<configuration><root level="OFF"/></configuration>', [Text.UTF8Encoding]::new($false))
    [xml]$Parent = Get-Content -LiteralPath (Join-Path $Backend 'pom.xml') -Raw
    $ParentPath = [Security.SecurityElement]::Escape((Join-Path $Backend 'pom.xml'))
    $Pom = @"
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>$($Parent.project.groupId)</groupId>
    <artifactId>$($Parent.project.artifactId)</artifactId>
    <version>$($Parent.project.version)</version>
    <relativePath>$ParentPath</relativePath>
  </parent>
  <artifactId>codegen-database-acceptance</artifactId>
  <dependencies>
    <dependency><groupId>com.cloudflow</groupId><artifactId>cloudflow-common-core</artifactId></dependency>
    <dependency><groupId>com.cloudflow</groupId><artifactId>cloudflow-common-security</artifactId></dependency>
    <dependency><groupId>com.cloudflow</groupId><artifactId>cloudflow-common-log</artifactId></dependency>
    <dependency><groupId>com.cloudflow</groupId><artifactId>cloudflow-common-idempotent</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>com.baomidou</groupId><artifactId>mybatis-plus-spring-boot3-starter</artifactId></dependency>
    <dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><scope>provided</scope></dependency>
  </dependencies>
</project>
"@
    [IO.File]::WriteAllText((Join-Path $Generated 'pom.xml'), $Pom, [Text.UTF8Encoding]::new($false))
    . (Join-Path $Root '.cloudflow-runtime/batch-e-runtime/connection.ps1')
    if ($env:DB_URL -notmatch '^jdbc:mysql://(?<host>192\.168\.1\.173):(?<port>3306)/(?<database>cloud_flow_db)(?:\?.*)?$') { throw '验证 JDBC 目标不符合预期' }
    $DatabaseServer = $Matches.host
    $DatabasePort = [int]$Matches.port
    $DatabaseName = $Matches.database
    if ($DatabaseServer -ne '192.168.1.173' -or $DatabasePort -ne 3306 -or $DatabaseName -ne 'cloud_flow_db' -or -not $env:DB_USERNAME -or -not $env:DB_PASSWORD) { throw '验证连接来源不符合预期' }
    $env:A1_CODEGEN_WORKSPACE = $Root
    $RunArguments = Join-Path $RunRoot 'run.args'
    [IO.File]::WriteAllLines($RunArguments, @('-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', ('"-Dlogback.configurationFile=' + $LogConfiguration.Replace('\', '/') + '"'), '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'), 'CodegenDatabaseChecks', ('"' + $RunRoot.Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
    if ($Menus) {
        & node (Join-Path $PSScriptRoot 'verify-codegen-menu-ui.mjs') $RunRoot
        if ($LASTEXITCODE -ne 0) { throw '代码生成器菜单真实链路验证失败' }
        Write-Output 'CODEGEN_MENU_SUITE_PASS=true; RUNTIME_WRITES=0; RUNNING_SERVICE_RESTARTS=0'
        return
    }
    if ($Browser) {
        & node (Join-Path $PSScriptRoot 'verify-codegen-ui.mjs') $RunRoot
        if ($LASTEXITCODE -ne 0) { throw '代码生成器页面真实接口验证失败' }
        Write-Output 'CODEGEN_BROWSER_SUITE_PASS=true; RUNTIME_WRITES=0; RUNNING_SERVICE_RESTARTS=0'
        return
    }
    & java "@$RunArguments" render
    if ($LASTEXITCODE -ne 0) { throw '真实结构导入或同步验证失败' }
    Push-Location $Generated
    try {
        & mvn '-DskipTests' compile
        if ($LASTEXITCODE -ne 0) { throw '真实结构生成代码编译失败' }
    } finally { Pop-Location }
    & java "@$RunArguments" compiled
    if ($LASTEXITCODE -ne 0) { throw '真实结构生成代码数据库验证失败' }
    Write-Output 'CODEGEN_DATABASE_SUITE_PASS=true; RUNTIME_WRITES=0; RUNNING_SERVICE_RESTARTS=0'
} finally {
    foreach ($Name in @(Get-ChildItem Env: | Select-Object -ExpandProperty Name)) {
        if (-not $EnvironmentBefore.ContainsKey($Name)) { [Environment]::SetEnvironmentVariable($Name, $null, 'Process') }
    }
    foreach ($Name in $EnvironmentBefore.Keys) { [Environment]::SetEnvironmentVariable($Name, $EnvironmentBefore[$Name], 'Process') }
}
