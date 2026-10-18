param(
    [Parameter(Mandatory)][string]$IndependentDirectory,
    [Parameter(Mandatory)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=[IO.Path]::GetFullPath($IndependentDirectory,$Root)
$Output=Join-Path $Evidence "a1-codegen-artifacts-20261016-$Round"
if([IO.Path]::GetDirectoryName($Source) -ne $Evidence -or (Split-Path -Leaf $Source) -notmatch '^a1-codegen-independent-20261016-r[1-9][0-9]*$'){throw 'An owned A1 enabled execution is required'}
if(Test-Path -LiteralPath $Output){throw 'Retain previous A1 artifact evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@{}
$CompileOnlyDependencies=@{}
$Compiled=[Collections.Generic.List[object]]::new()
$InnerProducts=[Collections.Generic.List[object]]::new()
$InnerHttpPassed=$false
$MavenPassed=$false
$JavacPassed=$false
$StaticPassed=$false
$ExplicitPassed=$false
$InputsUnchanged=$false
$Passed=$false
$Failure=$null
function Track([string]$File,[string]$Expected=''){
    $FullPath=[IO.Path]::GetFullPath($File,$Root)
    if(-not ($FullPath.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $FullPath.StartsWith('D:\CloudFlowProCache\h3-core-artifacts\',[StringComparison]::OrdinalIgnoreCase) -or $CompileOnlyDependencies.ContainsKey($FullPath))){throw 'Artifact input outside workspace or verified immutable cache'}
    if((Get-Item -LiteralPath $FullPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected artifact input'}
    $Hash=(Get-FileHash -LiteralPath $FullPath).Hash
    if($Expected -and $Hash -ne $Expected){throw 'Artifact input no longer matches its original hash'}
    if($Inputs.ContainsKey($FullPath) -and $Inputs[$FullPath] -ne $Hash){throw 'Artifact input changed during execution'}
    $Inputs[$FullPath]=$Hash
    return $FullPath
}
function Json([string]$File){Get-Content -LiteralPath (Track $File) -Raw|ConvertFrom-Json -Depth 100}
function Run([string]$Executable,[string[]]$Arguments,[string]$Name){
    & $Executable @Arguments *> (Join-Path $Output ($Name+'.log'))
    $OriginalExit=$LASTEXITCODE
    if($OriginalExit -ne 0){throw "Actual artifact command failed: $Name; exit=$OriginalExit"}
    return $OriginalExit
}
try{
    $Launcher=Json (Join-Path $Source 'launcher-result.json')
    $Business=Json (Join-Path $Source 'result.json')
    $Original=Json (Join-Path $Source 'original-business-result.json')
    if(-not $Launcher.passed -or -not $Launcher.processesStopped -or -not $Launcher.inputsUnchanged -or -not $Launcher.referenceKept -or $Launcher.scenario -ne 'Codegen' -or -not $Business.passed -or -not $Original.passed){throw 'Completed original A1 HTTP execution required'}
    $RunRoot=[IO.Path]::GetFullPath($Launcher.run)
    if([IO.Path]::GetDirectoryName($RunRoot) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $RunRoot) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $RunRoot) -eq '9799534e1a3a47b5958330f14ae16dc7'){throw 'Independent generated product ownership differs'}
    $State=Json (Join-Path $RunRoot 'state.json')
    $Products=Json (Join-Path $RunRoot ('a1-generated-products-'+$Original.caseTag+'.json'))
    if(-not $Products.originalPreviewsPreserved -or $Products.compilationExecuted -or $Products.caseTag -ne $Original.caseTag -or $Products.products.Count -eq 0){throw 'Original uncompiled preview receipts required'}
    $FrozenRuntime=@{}
    foreach($Entry in @(Json (Join-Path $Source 'runtime-inputs.json'))){
        $RuntimePath=Track $Entry.Path $Entry.Hash
        $FrozenRuntime[$RuntimePath]=$Entry.Hash
    }
    $Hr=@($State.services|Where-Object name -EQ 'hr')
    if($Hr.Count -ne 1){throw 'One actual HR package required'}
    $HrArgumentsPath=Track (Join-Path $RunRoot 'hr/service.args')
    if(-not $FrozenRuntime.ContainsKey($HrArgumentsPath)){throw 'Actual HR launch arguments were not frozen'}
    $HrArguments=@(Get-Content -LiteralPath $HrArgumentsPath)
    $ClasspathIndex=[Array]::IndexOf($HrArguments,'-cp')
    if($ClasspathIndex -lt 0 -or $ClasspathIndex+2 -ge $HrArguments.Count -or $HrArguments[$ClasspathIndex+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Original actual HR layered launch required'}
    $Layer=[IO.Path]::GetFullPath($HrArguments[$ClasspathIndex+1].Trim('"'))
    if((Split-Path -Leaf $Layer) -notmatch '^([a-f0-9]{64})-layered$'){throw 'HR immutable layer name differs'}
    $LayerHash=$Matches[1]
    $LayerJar=Track (Join-Path (Split-Path -Parent $Layer) ($LayerHash+'.jar')) $LayerHash
    if(-not $FrozenRuntime.ContainsKey($LayerJar)){throw 'Actual HR package was not frozen'}
    if((Get-Item -LiteralPath $Layer).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected HR layer'}
    $Libraries=@(Get-ChildItem -LiteralPath (Join-Path $Layer 'BOOT-INF/lib') -File -Filter '*.jar'|Sort-Object Name|ForEach-Object FullName)
    if($Libraries.Count -eq 0){throw 'Actual HR dependency library set is empty'}
    foreach($Library in $Libraries){
        $LibraryPath=Track $Library
        if(-not $FrozenRuntime.ContainsKey($LibraryPath)){throw 'Actual HR dependency was not frozen'}
    }
    $HrClasses=Join-Path $Layer 'BOOT-INF/classes'
    $HrTypedClass=Track (Join-Path $HrClasses 'com/cloudflow/hr/service/HrTypedCrudService.class')
    if(-not $FrozenRuntime.ContainsKey($HrTypedClass)){throw 'Actual HR service class was not frozen'}
    $BackendPom=Track (Join-Path $Root 'cloudflow-backend/pom.xml')
    [xml]$BackendConfiguration=[IO.File]::ReadAllText($BackendPom)
    $CompilerPlugin=@($BackendConfiguration.project.build.plugins.plugin|Where-Object artifactId -EQ 'maven-compiler-plugin')
    $ResourcesPlugin=@($BackendConfiguration.project.build.plugins.plugin|Where-Object artifactId -EQ 'maven-resources-plugin')
    if($CompilerPlugin.Count -ne 1 -or $ResourcesPlugin.Count -ne 1){throw 'One declared compiler and resources plugin required'}
    $CompilerPluginVersion=[string]$CompilerPlugin[0].version
    $ResourcesPluginVersion=[string]$ResourcesPlugin[0].version
    if($CompilerPluginVersion -notmatch '^\d+\.\d+\.\d+$' -or $ResourcesPluginVersion -notmatch '^\d+\.\d+\.\d+$'){throw 'Explicit repository Maven plugin versions required'}
    $LombokVersion=[string]$BackendConfiguration.project.properties.'lombok.version'
    if($LombokVersion -notmatch '^1\.18\.[0-9]+$'){throw 'An explicit repository Lombok version is required'}
    $Lombok=Join-Path 'D:\CloudFlowProCache\m2\repository\org\projectlombok\lombok' ($LombokVersion+'/lombok-'+$LombokVersion+'.jar')
    $Lombok=[IO.Path]::GetFullPath($Lombok)
    for($Ancestor=Get-Item -LiteralPath (Split-Path -Parent $Lombok);$null -ne $Ancestor;$Ancestor=$Ancestor.Parent){
        if($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected compile-only dependency rejected'}
    }
    $CompileOnlyDependencies[$Lombok]=$true
    $null=Track $Lombok
    $Classpath=(@($HrClasses)+$Libraries+@($Lombok))-join [IO.Path]::PathSeparator
    $Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
    $Javac=Join-Path $env:JAVA_HOME 'bin/javac.exe'
    $ProductCopies=Join-Path $Output 'products'
    [IO.Directory]::CreateDirectory($ProductCopies)|Out-Null
    $MavenModules=[Collections.Generic.List[string]]::new()
    foreach($Product in $Products.products){
        if($Product.label -notmatch '^[a-z0-9_-]+$' -or -not $Product.actualPreview){throw 'Original actual preview product required'}
        $null=Track $Product.configuration $Product.configurationHash
        $Configuration=Json $Product.configuration
        $ProductRoot=Join-Path $ProductCopies $Product.label
        [IO.Directory]::CreateDirectory($ProductRoot)|Out-Null
        $JavaSources=[Collections.Generic.List[string]]::new()
        foreach($File in $Product.files){
            $SourceFile=Track $File.path $File.hash
            if(-not $SourceFile.StartsWith([IO.Path]::GetFullPath($Product.root)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Preview file ownership differs'}
            if(-not $File.java){continue}
            $Target=[IO.Path]::GetFullPath($File.name,$ProductRoot)
            if(-not $Target.StartsWith($ProductRoot+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $Target.EndsWith('.java',[StringComparison]::Ordinal)){throw 'Unsafe product source name'}
            [IO.Directory]::CreateDirectory((Split-Path -Parent $Target))|Out-Null
            [IO.File]::Copy($SourceFile,$Target,$false)
            $null=Track $Target $File.hash
            $JavaSources.Add($Target)
        }
        $Wrapper=$null
        if($Product.template -eq 'HR_TYPED'){
            $Snippet=@($Product.files|Where-Object name -EQ ('snippets/'+$Configuration.table.className+'ResourceController.java.txt'))
            if($Snippet.Count -ne 1 -or $JavaSources.Count -ne 1){throw 'HR template must retain one entity and one integration snippet'}
            $SnippetPath=Track $Snippet[0].path $Snippet[0].hash
            $SnippetText=[IO.File]::ReadAllText($SnippetPath)
            $Package=$Configuration.table.packageName
            $Entity=$Configuration.table.className
            $Wrapper=Join-Path $ProductRoot ('src/main/java/'+$Package.Replace('.','/')+'/controller/'+$Entity+'ResourceController.java')
            [IO.Directory]::CreateDirectory((Split-Path -Parent $Wrapper))|Out-Null
            $WrapperText=@"
package $Package.controller;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.service.HrTypedCrudService;
import $Package.domain.entity.$Entity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/hr/a1acceptance")
public class $($Entity)ResourceController {
    private final HrTypedCrudService crudService;
    public $($Entity)ResourceController(HrTypedCrudService crudService) {
        this.crudService = crudService;
    }
$SnippetText
}
"@
            [IO.File]::WriteAllText($Wrapper,$WrapperText,[Text.UTF8Encoding]::new($false))
            $null=Track $Wrapper
            $JavaSources.Add($Wrapper)
        }
        if($JavaSources.Count -eq 0){throw 'Every generated product must compile actual Java sources'}
        $Classes=Join-Path $ProductRoot 'target/classes'
        [IO.Directory]::CreateDirectory($Classes)|Out-Null
        $Arguments=Join-Path $ProductRoot 'compile.args'
        $Values=@('-encoding','UTF-8','--release','17','-parameters','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Classes.Replace('\','/')+'"'))+@($JavaSources|ForEach-Object{'"'+$_.Replace('\','/')+'"'})
        [IO.File]::WriteAllLines($Arguments,$Values,[Text.UTF8Encoding]::new($false))
        $CompileExit=Run $Javac @('@'+$Arguments) ('compile-'+$Product.label)
        $ModulePom=@"
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>com.cloudflow.acceptance</groupId><artifactId>a1-generated-products</artifactId><version>1.0.0</version></parent>
  <artifactId>$($Product.label)</artifactId>
  <build><directory>maven-target</directory></build>
</project>
"@
        [IO.File]::WriteAllText((Join-Path $ProductRoot 'pom.xml'),$ModulePom,[Text.UTF8Encoding]::new($false))
        $null=Track (Join-Path $ProductRoot 'pom.xml')
        $MavenModules.Add('<module>'+[Security.SecurityElement]::Escape($Product.label)+'</module>')
        $ClassFiles=@(Get-ChildItem -LiteralPath $Classes -Recurse -File -Filter '*.class'|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash}})
        if($ClassFiles.Count -lt $JavaSources.Count){throw 'Compiled top-level Java products are incomplete'}
        $Compiled.Add([pscustomobject]@{Label=$Product.label;Template=$Product.template;OriginalJavaFiles=@($Product.files|Where-Object java).Count;IntegrationWrapper=$Wrapper;OriginalPreviewRoot=$Product.root;CopiedSources=@($JavaSources);CompilationExit=$CompileExit;Classes=$ClassFiles})
        if($Product.template -eq 'INNER'){
            $InnerProducts.Add([pscustomobject]@{label=$Product.label;classes=$Classes;controller=($Configuration.table.packageName+'.controller.'+$Configuration.table.className+'Controller')})
        }
        "A1_ARTIFACT_PRODUCT: label=$($Product.label); template=$($Product.template); java=$($JavaSources.Count); exit=$CompileExit"
    }
    $JavacPassed=$Compiled.Count -eq $Products.products.Count
    if(-not $JavacPassed){throw 'Every actual preview must compile'}
    $MavenClasspath=[Security.SecurityElement]::Escape($Classpath)
    $MavenPom=@"
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.cloudflow.acceptance</groupId><artifactId>a1-generated-products</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules>$($MavenModules -join '')</modules>
  <build><plugins>
    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-resources-plugin</artifactId><version>$ResourcesPluginVersion</version></plugin>
    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>$CompilerPluginVersion</version>
      <configuration><release>17</release><encoding>UTF-8</encoding><parameters>true</parameters>
        <compilerArgs><arg>-classpath</arg><arg>$MavenClasspath</arg></compilerArgs>
      </configuration>
    </plugin>
  </plugins></build>
</project>
"@
    $MavenPomPath=Join-Path $ProductCopies 'pom.xml'
    [IO.File]::WriteAllText($MavenPomPath,$MavenPom,[Text.UTF8Encoding]::new($false))
    $null=Track $MavenPomPath
    $MavenExit=Run (Get-Command mvn.cmd).Source @('-o','-B','-f',$MavenPomPath,'-DskipTests','compile') 'actual-maven-compile'
    foreach($Product in $Compiled){
        $MavenClasses=Join-Path $ProductCopies ($Product.Label+'/maven-target/classes')
        $MavenClassFiles=@(Get-ChildItem -LiteralPath $MavenClasses -Recurse -File -Filter '*.class')
        if($MavenClassFiles.Count -lt $Product.CopiedSources.Count){throw 'Maven compilation did not produce every generated top-level class'}
        $Product|Add-Member -NotePropertyName MavenCompilationExit -NotePropertyValue $MavenExit
        $Product|Add-Member -NotePropertyName MavenClassCount -NotePropertyValue $MavenClassFiles.Count
    }
    $MavenPassed=$true
    if($InnerProducts.Count -eq 0){throw 'Actually generated INNER products required'}
    $InnerChecker=Track (Join-Path $Root 'scripts/codegen-checks/GeneratedInnerHttpChecks.java')
    $InnerClasses=Join-Path $Output 'inner-check-classes'
    $InnerEvidence=Join-Path $Output 'inner-http'
    foreach($Directory in @($InnerClasses,$InnerEvidence)){[IO.Directory]::CreateDirectory($Directory)|Out-Null}
    $InnerManifest=Join-Path $Output 'inner-products.json'
    ConvertTo-Json -InputObject @($InnerProducts.ToArray()) -Depth 5|Set-Content -LiteralPath $InnerManifest -Encoding utf8NoBOM
    $null=Track $InnerManifest
    $InnerCompileArgs=Join-Path $Output 'inner-compile.args'
    [IO.File]::WriteAllLines($InnerCompileArgs,@('-encoding','UTF-8','--release','17','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$InnerClasses.Replace('\','/')+'"'),('"'+$InnerChecker.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    $null=Track $InnerCompileArgs
    $null=Run $Javac @('@'+$InnerCompileArgs) 'inner-check-compile'
    $InnerRunArgs=Join-Path $Output 'inner-run.args'
    [IO.File]::WriteAllLines($InnerRunArgs,@('-Dfile.encoding=UTF-8','-cp',('"'+($InnerClasses+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'GeneratedInnerHttpChecks',('"'+$InnerManifest.Replace('\','/')+'"'),('"'+$InnerEvidence.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
    $null=Track $InnerRunArgs
    $null=Run $Java @('@'+$InnerRunArgs) 'actual-generated-inner-http'
    $InnerResult=Json (Join-Path $InnerEvidence 'result.json')
    if(-not $InnerResult.passed -or -not $InnerResult.actualGeneratedControllers -or -not $InnerResult.actualInnerAspect -or -not $InnerResult.processesStopped -or $InnerResult.unusedServiceFixtureCalls -ne 0 -or $InnerResult.products.Count -ne $InnerProducts.Count -or $InnerResult.requests -ne 6*$InnerProducts.Count){throw 'Generated INNER HTTP identity verification incomplete'}
    $InnerHttpPassed=$true
    $ScannerClasses=Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-static-rules/target/classes'
    foreach($File in Get-ChildItem -LiteralPath $ScannerClasses -Recurse -File){$null=Track $File.FullName}
    $StaticExit=Run $Java @('-Dfile.encoding=UTF-8',('-Dcloudflow.staticRules.root='+$ProductCopies),'-cp',$ScannerClasses,'com.cloudflow.common.staticrules.StaticRuleScannerApplication') 'actual-static-rules'
    $StaticPassed=$true
    $ExplicitChecker=Track (Join-Path $Root 'scripts/java-style-checks/JavaExplicitTypeChecks.java')
    $ExplicitExit=Run $Java @($ExplicitChecker,'--source-root',$ProductCopies) 'explicit-types'
    $ExpectedJavaCount=[int](($Compiled|ForEach-Object {$_.CopiedSources.Count}|Measure-Object -Sum).Sum)
    $ExplicitLog=[IO.File]::ReadAllText((Join-Path $Output 'explicit-types.log'))
    if($ExplicitLog -notmatch ('JAVA_EXPLICIT_TYPES: files='+$ExpectedJavaCount+'; inferred_declarations=0;')){throw 'Explicit-type coverage must match every copied Java source'}
    $ExplicitPassed=$true
    foreach($File in $Inputs.Keys){if((Get-FileHash -LiteralPath $File).Hash -ne $Inputs[$File]){throw 'Artifact input changed'}}
    $InputsUnchanged=$true
    $Passed=$true
}catch{
    $Failure=$_.Exception.Message
}finally{
    @($Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}})|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
    [pscustomobject]@{Passed=$Passed;Failure=$Failure;Source=$Source;Products=@($Compiled);ProductCount=$Compiled.Count;ActualPreviewCompilation=$JavacPassed;ActualMavenCompilation=$MavenPassed;ActualGeneratedInnerHttp=$InnerHttpPassed;InnerProductCount=$InnerProducts.Count;ServiceWhitelistVerified=$false;ActualStaticScanner=$StaticPassed;ExplicitTypeCheck=$ExplicitPassed;ExplicitTypeSourceCount=$ExpectedJavaCount;InputsUnchanged=$InputsUnchanged;HrRealServiceDependency=$JavacPassed;CompileOnlyLombokVersion=$LombokVersion;CompileOnlyDependencies=@($CompileOnlyDependencies.Keys);IndependentProductsIsolated=$true;OriginalPreviewsChanged=$false;ReferenceRuntimeWritten=$false;ProductionModified=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 40|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
}
if(-not $Passed){throw $Failure}
"A1_ARTIFACTS: passed=true; products=$($Compiled.Count); static_rules=0; originals_changed=false"
