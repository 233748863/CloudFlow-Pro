param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',[switch]$Apply)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-immutable-artifact-sharing-20261011-$Round"
$PlanFile=Join-Path $Output 'plan.json'
if((Get-Volume -DriveLetter D).FileSystemType -ne 'NTFS'){throw 'NTFS hard links required'}

function Assert-PackagePath([string]$Path){
    $Full=[IO.Path]::GetFullPath($Path)
    if(-not $Full.StartsWith($Evidence+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Artifact path escapes approved evidence'}
    $Relative=[IO.Path]::GetRelativePath($Evidence,$Full).Replace('\','/')
    if($Relative -notmatch '^backend-executable-verification-20261006-r(1[89]|2[0-9]|3[0-7])/.+\.jar$'){throw 'Only immutable verified package JAR files may be shared'}
    $Entry=Get-Item -LiteralPath $Full -Force
    if($Entry.PSIsContainer -or ($Entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Regular JAR required'}
    $Ancestor=$Entry.Directory
    while($Ancestor.FullName -ne $Root){
        if($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected package ancestor rejected'}
        $Ancestor=$Ancestor.Parent
        if(-not $Ancestor){throw 'Package ancestor escaped workspace'}
    }
    return $Full
}
function Hash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
function Assert-IdlePackages([object[]]$Packages){
    $Processes=@(Get-CimInstance Win32_Process)
    foreach($Package in $Packages){
        $Normalized=$Package.Directory.Replace('\','/')
        if(@($Processes|Where-Object{$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Replace('\','/').Contains($Normalized,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'Verified package has an active consumer'}
    }
}

if(-not $Apply){
    if(Test-Path -LiteralPath $Output){throw 'Retain previous sharing plan'}
    [IO.Directory]::CreateDirectory($Output)|Out-Null
    [IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
    $Packages=[Collections.Generic.List[object]]::new()
    $Inputs=[Collections.Generic.List[object]]::new()
    $Links=[Collections.Generic.List[object]]::new()
    $Canonical=@{}
    foreach($Number in 37..18){
        $Directory=Join-Path $Evidence "backend-executable-verification-20261006-r$Number"
        $ProofFile=Join-Path $Directory 'result.json'
        if(-not (Test-Path -LiteralPath $ProofFile)){continue}
        $Proof=Get-Content -LiteralPath $ProofFile -Raw|ConvertFrom-Json
        if(-not $Proof.Passed){continue}
        if($Proof.BackendRound -notmatch '^r[1-9][0-9]*$' -or $Proof.Services.Count -ne 6){throw 'Complete six-service package proof required'}
        $Package=[pscustomobject]@{Directory=$Directory;Proof=$ProofFile;Hash=(Hash $ProofFile);Backend=$Proof.BackendRound}
        $Packages.Add($Package)
        Assert-IdlePackages @($Package)
        $Entries=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
        if(@($Entries|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Redirected archive entries rejected'}
        foreach($File in @($Entries|Where-Object{-not $_.PSIsContainer -and $_.Extension -eq '.jar'}|Sort-Object FullName)){
            $Path=Assert-PackagePath $File.FullName
            $Digest=Hash $Path
            $Inputs.Add([pscustomobject]@{Path=$Path;Hash=$Digest;Bytes=$File.Length})
            if(-not $Canonical.ContainsKey($Digest)){$Canonical[$Digest]=$Path;continue}
            if($File.LinkType -eq 'HardLink'){continue}
            $Source=$Canonical[$Digest]
            if((Get-Acl -LiteralPath $Path).Sddl -ne (Get-Acl -LiteralPath $Source).Sddl){throw 'Different artifact access rules cannot be merged'}
            $Links.Add([pscustomobject]@{Path=$Path;Canonical=$Source;Hash=$Digest;Bytes=$File.Length})
        }
        "ARTIFACT_SHARE_PLAN: package=r$Number; files=$($Inputs.Count); duplicate_files=$($Links.Count)"
    }
    if($Packages.Count -eq 0){throw 'No verified packages found'}
    [ordered]@{ScriptHash=(Hash $PSCommandPath);Packages=$Packages.ToArray();Inputs=$Inputs.ToArray();Links=$Links.ToArray();ShareableBytes=($Links|Measure-Object Bytes -Sum).Sum;SourceFilesChanged=$false;PathsRetained=$true}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $PlanFile -Encoding utf8NoBOM
    'ARTIFACT_SHARE_PLANNED: all_paths_retained=true; same_bytes_only=true; source_and_database_files_excluded=true'
    exit 0
}

if(Test-Path -LiteralPath (Join-Path $Output 'result.json')){throw 'Retain completed sharing result'}
$Plan=Get-Content -LiteralPath $PlanFile -Raw|ConvertFrom-Json
if((Hash $PSCommandPath) -ne $Plan.ScriptHash -or (Hash (Join-Path $Output 'original.ps1')) -ne $Plan.ScriptHash){throw 'Sharing script changed after planning'}
Assert-IdlePackages @($Plan.Packages)
foreach($Package in $Plan.Packages){if((Hash $Package.Proof) -ne $Package.Hash){throw 'Package proof changed'}}
foreach($InputFile in $Plan.Inputs){
    $null=Assert-PackagePath $InputFile.Path
    if((Hash $InputFile.Path) -ne $InputFile.Hash -or (Get-Item -LiteralPath $InputFile.Path).Length -ne $InputFile.Bytes){throw 'Planned artifact changed'}
}
$FreeBefore=(Get-Volume -DriveLetter D).SizeRemaining
$Completed=[Collections.Generic.List[object]]::new()
$Failure=$null
try{
    foreach($Link in $Plan.Links){
        $Target=Assert-PackagePath $Link.Path
        $Source=Assert-PackagePath $Link.Canonical
        if($Target -eq $Source -or (Hash $Target) -ne $Link.Hash -or (Hash $Source) -ne $Link.Hash){throw 'Artifact content or identity changed'}
        if((Get-Item -LiteralPath $Target).LinkType -eq 'HardLink'){continue}
        $Temporary=$Target+'.share-link-'+[Guid]::NewGuid().ToString('N')
        $Backup=$Target+'.share-original-'+[Guid]::NewGuid().ToString('N')
        if((Split-Path -Parent $Temporary) -ne (Split-Path -Parent $Target) -or (Split-Path -Parent $Backup) -ne (Split-Path -Parent $Target)){throw 'Temporary artifact paths escape verified package'}
        $Moved=$false;$Installed=$false
        try{
            New-Item -ItemType HardLink -Path $Temporary -Value $Source|Out-Null
            if((Hash $Temporary) -ne $Link.Hash){throw 'New hard link differs from original bytes'}
            Move-Item -LiteralPath $Target -Destination $Backup
            $Moved=$true
            Move-Item -LiteralPath $Temporary -Destination $Target
            $Installed=$true
            if((Hash $Target) -ne $Link.Hash -or (Get-Item -LiteralPath $Target).Length -ne $Link.Bytes){throw 'Shared file verification failed'}
            Remove-Item -LiteralPath $Backup -Force
            $Moved=$false
            $Completed.Add($Link)
            if($Completed.Count % 250 -eq 0){"ARTIFACT_SHARED: files=$($Completed.Count); original_paths_and_bytes_preserved=true"}
        }catch{
            if($Moved){if($Installed -and (Test-Path -LiteralPath $Target)){Remove-Item -LiteralPath $Target -Force};Move-Item -LiteralPath $Backup -Destination $Target}
            throw
        }finally{
            if(Test-Path -LiteralPath $Temporary){Remove-Item -LiteralPath $Temporary -Force}
        }
    }
    foreach($Package in $Plan.Packages){if((Hash $Package.Proof) -ne $Package.Hash){throw 'Final package proof changed'}}
}catch{$Failure=$_.Exception.Message}
$Missing=[Collections.Generic.List[string]]::new()
$Changed=[Collections.Generic.List[string]]::new()
foreach($InputFile in $Plan.Inputs){
    if(-not (Test-Path -LiteralPath $InputFile.Path)){$Missing.Add($InputFile.Path);continue}
    if((Hash $InputFile.Path) -ne $InputFile.Hash){$Changed.Add($InputFile.Path)}
}
if($Missing.Count -or $Changed.Count){$Failure='Final original path or content verification failed'}
$FreeAfter=(Get-Volume -DriveLetter D).SizeRemaining
$Result=[ordered]@{Passed=($null -eq $Failure);FilesShared=$Completed.Count;LogicalDuplicateBytes=($Completed|Measure-Object Bytes -Sum).Sum;FreeBefore=$FreeBefore;FreeAfter=$FreeAfter;Inputs=$Plan.Inputs.Count;PackageProofs=$Plan.Packages.Count;AllOriginalPathsRetained=($Missing.Count -eq 0);AllOriginalContentsKept=($Changed.Count -eq 0 -and $Missing.Count -eq 0);SourceFilesChanged=$false;DatabaseFilesChanged=$false;Failure=$Failure;Missing=$Missing.ToArray();Changed=$Changed.ToArray();Completed=$Completed.ToArray()}
$Result|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"ARTIFACT_SHARE_RESULT: passed=$($Result.Passed); files=$($Completed.Count); bytes_shared=$($Result.LogicalDuplicateBytes); free_bytes=$FreeAfter; original_paths_retained=$($Result.AllOriginalPathsRetained); original_contents_kept=$($Result.AllOriginalContentsKept)"
if($Failure){throw $Failure}
