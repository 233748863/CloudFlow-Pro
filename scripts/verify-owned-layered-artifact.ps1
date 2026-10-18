param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
. (Join-Path $PSScriptRoot 'owned-layered-artifact.ps1')
$Output=Join-Path (Split-Path -Parent $PSScriptRoot) ".cloudflow-runtime/full-prd-20260915/approved-runtime/d2-layered-artifact-checks-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original artifact verification'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Source=Join-Path $PSScriptRoot 'owned-layered-artifact.ps1'
$Hash=(Get-FileHash -LiteralPath $Source).Hash
Copy-Item -LiteralPath $Source -Destination (Join-Path $Output 'original-owned-layered-artifact.ps1')
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Output 'original-verifier.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Checks=[Collections.Generic.List[string]]::new()
function Require-Rejection([string]$Name,[scriptblock]$Action){
    $Rejected=$false
    try{& $Action|Out-Null}catch{$Rejected=$true}
    if(-not $Rejected){throw "Artifact boundary accepted: $Name"}
    $Checks.Add($Name)
}
function New-Fixture([string]$Name,[string[]]$Entries){
    $Path=Join-Path $Output ($Name+'.jar')
    $Zip=[IO.Compression.ZipFile]::Open($Path,[IO.Compression.ZipArchiveMode]::Create)
    try{foreach($Entry in $Entries){$Writer=[IO.StreamWriter]::new($Zip.CreateEntry($Entry).Open());try{$Writer.Write('controlled fixture bytes')}finally{$Writer.Dispose()}}}finally{$Zip.Dispose()}
    $Path
}
$Jar=New-Fixture 'valid' @('BOOT-INF/classes/sample.txt','BOOT-INF/lib/library.bin')
$JarHash=(Get-FileHash -LiteralPath $Jar).Hash
$Valid=Get-OwnedLayeredArtifact $Jar $Output $JarHash
if($Valid.Files.Count -ne 2){throw 'Expected both package files'}
$Checks.Add('complete byte-identical extraction')
$Repeated=Get-OwnedLayeredArtifact $Jar $Output $JarHash
if($Repeated.Path -ne $Valid.Path -or ($Repeated.Files.Hash -join ',') -ne ($Valid.Files.Hash -join ',')){throw 'Existing artifact revalidation differs'}
$Checks.Add('immutable existing directory revalidated')
Require-Rejection 'source hash mismatch before extraction' {Get-OwnedLayeredArtifact $Jar $Output ('0'*64)}
$Tampered=Join-Path $Valid.Path 'BOOT-INF/classes/sample.txt'
[IO.File]::WriteAllText($Tampered,'modified fixture bytes')
Require-Rejection 'modified extracted bytes rejected without overwrite' {Get-OwnedLayeredArtifact $Jar $Output $JarHash}
if([IO.File]::ReadAllText($Tampered) -ne 'modified fixture bytes'){throw 'Unexpected overwrite of existing artifact'}
$Checks.Add('failed artifact remains available for review')
$Duplicate=New-Fixture 'duplicate' @('same.txt','same.txt')
Require-Rejection 'duplicate archive path rejected' {Get-OwnedLayeredArtifact $Duplicate $Output (Get-FileHash -LiteralPath $Duplicate).Hash}
$Escape=New-Fixture 'escape' @('../outside-controlled.txt')
Require-Rejection 'entry outside owned extraction rejected' {Get-OwnedLayeredArtifact $Escape $Output (Get-FileHash -LiteralPath $Escape).Hash}
if(Test-Path -LiteralPath (Join-Path $Output 'outside-controlled.txt')){throw 'Archive escaped destination'}
$Checks.Add('no file written outside extraction destination')
$UnexpectedJar=New-Fixture 'unexpected' @('one.txt')
$UnexpectedHash=(Get-FileHash -LiteralPath $UnexpectedJar).Hash
$Unexpected=Get-OwnedLayeredArtifact $UnexpectedJar $Output $UnexpectedHash
[IO.File]::WriteAllText((Join-Path $Unexpected.Path 'extra.txt'),'unexpected fixture')
Require-Rejection 'extra extracted file rejected' {Get-OwnedLayeredArtifact $UnexpectedJar $Output $UnexpectedHash}
if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash -or (Get-FileHash -LiteralPath $Jar).Hash -ne $JarHash){throw 'Verification source or source archive changed'}
[pscustomobject]@{Passed=$true;Checks=@($Checks);HelperHash=$Hash;ServiceRestarted=$false;BusinessRequests=0;ProductModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"D2_LAYERED_ARTIFACT_CHECKS: passed=$($Checks.Count); original_package_unchanged=true; product_modified=false; service_restarted=false"
