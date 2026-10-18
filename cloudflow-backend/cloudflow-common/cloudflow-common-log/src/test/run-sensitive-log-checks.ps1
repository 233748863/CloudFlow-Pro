$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../..'))
$Backend = Join-Path $Root 'cloudflow-backend'
$Core = Join-Path $Backend 'cloudflow-common/cloudflow-common-core'
$Logs = Join-Path $Backend 'cloudflow-common/cloudflow-common-log'
$Security = Join-Path $Backend 'cloudflow-common/cloudflow-common-security'
$Workflow = Join-Path $Backend 'cloudflow-service-workflow'
$Output = Join-Path $Logs 'target/h-sensitive-log-checks'
$Dependencies = (Get-Content -LiteralPath (Join-Path $Logs 'target/batch-g-classpath.txt') -Raw).Trim()
$WorkflowDependencies = (Get-Content -LiteralPath (Join-Path $Workflow 'target/batch-g-classpath.txt') -Raw).Trim()
$SaToken = $WorkflowDependencies -split ';' | Where-Object { $_ -match 'sa-token-core' } | Select-Object -First 1
$Lombok = $Dependencies -split ';' | Where-Object { $_ -match 'lombok-[^;]+\.jar$' } | Select-Object -First 1
if (-not $SaToken -or -not $Lombok) { throw 'Cached dependency classpaths must include Sa-Token and Lombok' }
$Classes = @($Output, (Join-Path $Core 'target/classes'), (Join-Path $Logs 'target/classes'),
    (Join-Path $Security 'target/classes'), (Join-Path $Workflow 'target/classes'),
    (Join-Path $Backend 'cloudflow-common/cloudflow-common-sensitive/target/classes'),
    (Join-Path $Backend 'cloudflow-common/cloudflow-common-ratelimiter/target/classes'))
$ClassPath = ($Classes -join ';') + ';' + $SaToken + ';' + $Dependencies
$Sources = @(
    (Join-Path $Core 'src/main/java/com/cloudflow/common/core/utils/SensitiveLogPolicy.java'),
    (Join-Path $Core 'src/main/java/com/cloudflow/common/core/aspect/RequestLogAspect.java'),
    (Join-Path $Core 'src/main/java/com/cloudflow/common/core/exception/GlobalExceptionHandler.java'),
    (Join-Path $Core 'src/test/java/com/cloudflow/common/core/utils/SensitiveLogPolicyChecks.java'),
    (Join-Path $Security 'src/main/java/com/cloudflow/common/security/handler/SaTokenExceptionHandler.java'),
    (Join-Path $Logs 'src/test/java/com/cloudflow/common/log/SensitiveLogPipelineChecks.java'))
$Sources += @('util/SysLogUtils.java', 'aspect/SysLogAspect.java', 'web/ApiAccessLogInterceptor.java',
    'web/ApiErrorLogResolver.java', 'domain/SysLogEntity.java', 'domain/SysApiErrorLog.java',
    'event/SysLogEvent.java', 'event/ApiErrorLogEvent.java', 'event/SysLogListener.java',
    'event/ApiErrorLogListener.java', 'mapper/SysLogMapper.java', 'mapper/SysApiErrorLogMapper.java') |
    ForEach-Object { Join-Path $Logs ('src/main/java/com/cloudflow/common/log/' + $_) }
$Sources += @('WorkflowExceptionHandler.java', 'WorkflowException.java', 'ValidationException.java',
    'BusinessException.java', 'NotFoundException.java', 'PermissionDeniedException.java', 'RateLimitException.java') |
    ForEach-Object { Join-Path $Workflow ('src/main/java/com/cloudflow/workflow/exception/' + $_) }
$Sources += Join-Path $Workflow 'src/main/java/com/cloudflow/workflow/domain/dto/ErrorResponse.java'
& javac '-J-Dfile.encoding=UTF-8' -encoding UTF-8 --release 17 -parameters -cp $ClassPath -processorpath $Lombok `
    -processor 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor' -d $Output @Sources
if ($LASTEXITCODE -ne 0) { throw 'Sensitive log checks compilation failed' }
& java '-Dfile.encoding=UTF-8' -cp $ClassPath com.cloudflow.common.log.SensitiveLogPipelineChecks
if ($LASTEXITCODE -ne 0) { throw 'Sensitive log asynchronous pipeline checks failed' }
& java '-Dfile.encoding=UTF-8' -cp $ClassPath com.cloudflow.common.core.utils.SensitiveLogPolicyChecks $Root --workflow
if ($LASTEXITCODE -ne 0) { throw 'Sensitive request and exception checks failed' }
