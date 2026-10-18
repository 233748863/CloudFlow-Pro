param([switch]$SkipBuild, [switch]$BoundariesOnly)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Auth = Join-Path $Backend 'cloudflow-auth'
$StaticClasses = Join-Path $Backend 'cloudflow-common/cloudflow-common-static-rules/target/classes'

if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl 'cloudflow-auth,cloudflow-common/cloudflow-common-static-rules' -am '-DskipTests' install dependency:build-classpath '-Dmdep.outputFile=target/codegen-checks-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw '代码生成器及校验器构建失败' }
    } finally {
        Pop-Location
    }
}

$Dependencies = (Get-Content -LiteralPath (Join-Path $Auth 'target/codegen-checks-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Auth 'target/classes') + [IO.Path]::PathSeparator + $StaticClasses + [IO.Path]::PathSeparator + $Dependencies
$RunRoot = [IO.Path]::GetFullPath((Join-Path $Root ('.cloudflow-runtime/codegen-checks/' + [Guid]::NewGuid().ToString('N'))))
$WorkspacePrefix = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $RunRoot.StartsWith($WorkspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '生成验证目录越过工作区边界' }
$CheckClasses = Join-Path $RunRoot 'check-classes'
$GeneratedRoot = Join-Path $RunRoot 'generated'
[IO.Directory]::CreateDirectory($CheckClasses) | Out-Null
[IO.Directory]::CreateDirectory($GeneratedRoot) | Out-Null
Write-Output "CODEGEN_EVIDENCE_ROOT=$RunRoot"

$CheckSources = @('CodegenTemplateChecks.java', 'CodegenBoundaryChecks.java') |
    ForEach-Object { Join-Path (Join-Path $PSScriptRoot 'platform-checks') $_ }
& javac '-J-Dfile.encoding=UTF-8' -encoding UTF-8 -cp $ClassPath -d $CheckClasses $CheckSources
if ($LASTEXITCODE -ne 0) { throw '代码生成验证程序编译失败' }
$RunnerClassPath = $CheckClasses + [IO.Path]::PathSeparator + $ClassPath
if ($BoundariesOnly) {
    & java '-Dfile.encoding=UTF-8' -cp $RunnerClassPath CodegenBoundaryChecks $RunRoot
    if ($LASTEXITCODE -ne 0) { throw '代码生成器接口或写盘边界检查失败' }
    Write-Output 'CODEGEN_BOUNDARY_SUITE_PASS=true; DATABASE_WRITES=0; RUNNING_SERVICE_RESTARTS=0'
    return
}
& java '-Dfile.encoding=UTF-8' -cp $RunnerClassPath CodegenTemplateChecks $GeneratedRoot
if ($LASTEXITCODE -ne 0) { throw '代码生成或源码契约检查失败' }

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
  <artifactId>codegen-generated-acceptance</artifactId>
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
[IO.File]::WriteAllText((Join-Path $GeneratedRoot 'pom.xml'), $Pom, [Text.UTF8Encoding]::new($false))
Push-Location $GeneratedRoot
try {
    & mvn '-DskipTests' compile
    if ($LASTEXITCODE -ne 0) { throw '生成代码的独立Maven编译失败' }
} finally {
    Pop-Location
}
& java '-Dfile.encoding=UTF-8' -cp $RunnerClassPath CodegenTemplateChecks $GeneratedRoot --compiled
if ($LASTEXITCODE -ne 0) { throw '生成代码编译产物契约检查失败' }
& java '-Dfile.encoding=UTF-8' -cp $RunnerClassPath CodegenBoundaryChecks $RunRoot
if ($LASTEXITCODE -ne 0) { throw '代码生成器接口或写盘边界检查失败' }
Write-Output 'CODEGEN_SUITE_PASS=true; CATEGORIES=CRUD,TREE,SUB,INNER; VARIANTS=8; GENERATED_JAVA_FILES=40; DATABASE_WRITES=0; SERVICE_RESTARTS=0'
