param([switch]$SkipBuild, [switch]$SkipFrontend)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-service-workflow'
$ClasspathFile = Join-Path $Module 'target/batch-c-classpath.txt'

if (-not $SkipBuild) {
    Push-Location -LiteralPath $Backend
    try {
        & mvn -q -pl cloudflow-service-workflow -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/batch-c-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'C批依赖编译失败' }
    } finally { Pop-Location }
}

if ($SkipBuild -and -not (Test-Path -LiteralPath $ClasspathFile)) {
    $ClasspathFile = Join-Path $Module 'target/batch-h-classpath.txt'
}
if (-not (Test-Path -LiteralPath $ClasspathFile)) { throw '缺少工作流依赖清单，请去掉SkipBuild后执行' }
$Dependencies = (Get-Content -LiteralPath $ClasspathFile -Raw).Trim()
$Classpath = (Join-Path $Module 'src/main/resources') + [IO.Path]::PathSeparator + (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$Output = Join-Path $Root '.cloudflow-runtime/full-prd-20260915/form-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Sources = @(
    (Join-Path $Backend 'cloudflow-common/cloudflow-common-core/src/main/java/com/cloudflow/common/core/utils/RestrictedExpression.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/exception/WorkflowFormValidationException.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/mapper/WorkflowFormReferenceMapper.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormInputService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/FormDataPermissionFilter.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormAccessService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowImSummaryPolicy.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowImSummaryService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/domain/WfFormDefinition.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/domain/WfProcessInstance.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/mapper/WfFormDefinitionMapper.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormVersionDiff.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormVersionService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormFileService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/controller/WorkflowController.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/controller/WorkflowFormFileController.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/mapper/WorkflowFormFileMapper.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/remote/RemoteWorkflowFormFileService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFieldPermissionCache.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowFormSecurityAudit.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/security/WorkflowFormResponseAdvice.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/config/CacheConfig.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowDraftReferenceService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/service/WorkflowTaskReferenceService.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/controller/WorkflowTaskReferenceController.java'),
    (Join-Path $PSScriptRoot 'workflow-checks/WorkflowDraftChecks.java'),
    (Join-Path $Module 'src/main/java/com/cloudflow/workflow/validator/JsonSchemaValidator.java')
) + @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'form-checks') -File -Filter '*.java' | Select-Object -ExpandProperty FullName)
$CompileArguments = @('-encoding', 'UTF-8', '-cp', ('"' + $Classpath.Replace('\', '/') + '"'), '-d', ('"' + $Output.Replace('\', '/') + '"'))
$CompileArguments += @($Sources | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, $CompileArguments, [Text.UTF8Encoding]::new($false))
& javac '-J-Duser.language=en' '-J-Duser.country=US' "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'C批当前源码检查编译失败' }
foreach ($Class in @('RestrictedExpressionChecks', 'FormSchemaValidationChecks', 'FormInputValidationChecks', 'FormPermissionChecks', 'FormImSummaryChecks', 'FormResponseChecks', 'FormVersionChecks', 'WorkflowDraftChecks')) {
    $RunFile = Join-Path $Output ($Class + '.args')
    [IO.File]::WriteAllLines($RunFile, @('-cp', ('"' + ($Output + [IO.Path]::PathSeparator + $Classpath).Replace('\', '/') + '"'), $Class), [Text.UTF8Encoding]::new($false))
    & java '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' '-Dstderr.encoding=UTF-8' "@$RunFile"
    if ($LASTEXITCODE -ne 0) { throw "C批检查失败：$Class" }
}

if (-not $SkipFrontend) {
    Push-Location -LiteralPath (Join-Path $Root 'cloudflow-frontend')
    try {
        & npx tsx scripts/check-form-capabilities.ts
        if ($LASTEXITCODE -ne 0) { throw 'C批前端行为检查失败' }
        & npm run type-check
        if ($LASTEXITCODE -ne 0) { throw '前端类型检查失败' }
    } finally { Pop-Location }
}

Write-Output 'PASS C current-source form checks; runtime database writes=0; service restarts=0'
