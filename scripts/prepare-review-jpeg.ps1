param(
    [Parameter(Mandatory)][string]$EvidenceDirectory,
    [Parameter(Mandatory)][string]$ReviewDirectory,
    [ValidateRange(1,100)][int]$Quality=82
)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$EvidenceRoot=[IO.Path]::GetFullPath('D:\CloudFlowPro\.cloudflow-runtime\full-prd-20260915\approved-runtime')
$SourceDirectory=[IO.Path]::GetFullPath($EvidenceDirectory,'D:\CloudFlowPro')
$TargetDirectory=[IO.Path]::GetFullPath($ReviewDirectory,'D:\CloudFlowPro')
foreach($Directory in @($SourceDirectory,$TargetDirectory)){
    if(-not $Directory.StartsWith($EvidenceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){
        throw 'Screenshot conversion must stay within the approved evidence directory'
    }
}
if(Test-Path -LiteralPath $TargetDirectory){throw 'Retain existing screenshot review evidence'}
if((Get-Item -LiteralPath $SourceDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected source directory rejected'}
$ResultPath=Join-Path $SourceDirectory 'result.json'
$ResultHash=(Get-FileHash -LiteralPath $ResultPath -Algorithm SHA256).Hash
$Business=Get-Content -LiteralPath $ResultPath -Raw|ConvertFrom-Json -Depth 50
if(@($Business.images).Count -eq 0){throw 'The business result contains no screenshots'}
Add-Type -AssemblyName System.Drawing
$Codec=[Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|Where-Object MimeType -EQ 'image/jpeg'
if(@($Codec).Count -ne 1){throw 'Exactly one JPEG encoder is required'}
[IO.Directory]::CreateDirectory($TargetDirectory)|Out-Null
$ImageDirectory=Join-Path $TargetDirectory 'images'
[IO.Directory]::CreateDirectory($ImageDirectory)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $TargetDirectory 'conversion-original.ps1'),$false)
$Converted=[Collections.Generic.List[object]]::new()
foreach($Entry in $Business.images){
    $SourcePath=[IO.Path]::GetFullPath([string]$Entry.name,$SourceDirectory)
    if([IO.Path]::GetDirectoryName($SourcePath) -ne $SourceDirectory -or [IO.Path]::GetExtension($SourcePath) -ne '.png'){
        throw 'Expected a directly contained PNG screenshot'
    }
    if((Get-Item -LiteralPath $SourcePath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected screenshot rejected'}
    $SourceHash=(Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash
    if($SourceHash -ne $Entry.hash){throw 'Screenshot no longer matches the original business result'}
    $TargetPath=Join-Path $ImageDirectory ([IO.Path]::GetFileNameWithoutExtension($SourcePath)+'.jpg')
    if(Test-Path -LiteralPath $TargetPath){throw 'Duplicate screenshot filename'}
    $SourceImage=[Drawing.Image]::FromFile($SourcePath)
    $Bitmap=$null
    $Graphics=$null
    $Parameters=$null
    try{
        if($SourceImage.Width -ne $Entry.width -or $SourceImage.Height -ne $Entry.height){throw 'Screenshot dimensions changed'}
        $Bitmap=[Drawing.Bitmap]::new($SourceImage.Width,$SourceImage.Height,[Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $Graphics=[Drawing.Graphics]::FromImage($Bitmap)
        $Graphics.Clear([Drawing.Color]::White)
        $Graphics.DrawImageUnscaled($SourceImage,0,0)
        $Parameters=[Drawing.Imaging.EncoderParameters]::new(1)
        $Parameters.Param[0]=[Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality,[long]$Quality)
        $Bitmap.Save($TargetPath,$Codec,$Parameters)
    }finally{
        if($null -ne $Parameters){$Parameters.Dispose()}
        if($null -ne $Graphics){$Graphics.Dispose()}
        if($null -ne $Bitmap){$Bitmap.Dispose()}
        $SourceImage.Dispose()
    }
    $Decoded=[Drawing.Image]::FromFile($TargetPath)
    try{
        if($Decoded.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Jpeg.Guid -or $Decoded.Width -ne $Entry.width -or $Decoded.Height -ne $Entry.height){
            throw 'JPEG encoding or dimensions differ'
        }
    }finally{$Decoded.Dispose()}
    if((Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash -ne $SourceHash){throw 'Original screenshot changed'}
    $Converted.Add([pscustomobject]@{
        Name=$Entry.name;SourcePath=$SourcePath;SourceHash=$SourceHash;SourceBytes=(Get-Item -LiteralPath $SourcePath).Length
        ReviewPath=$TargetPath;ReviewHash=(Get-FileHash -LiteralPath $TargetPath -Algorithm SHA256).Hash;ReviewBytes=(Get-Item -LiteralPath $TargetPath).Length
        Width=$Entry.width;Height=$Entry.height;ActuallyViewed=$false;VisualAccepted=$false
    })
}
if((Get-FileHash -LiteralPath $ResultPath -Algorithm SHA256).Hash -ne $ResultHash){throw 'Original business result changed'}
$Manifest=[ordered]@{
    SourceResult=$ResultPath;SourceResultHash=$ResultHash;Scenario=$Business.scenario;BusinessPassed=$Business.passed
    Format='JPEG';Quality=$Quality;Resized=$false;OriginalsPreserved=$true;ConvertedCount=$Converted.Count
    CreatedUtc=[DateTime]::UtcNow.ToString('o');Images=$Converted.ToArray();ActuallyViewed=$false;VisualAccepted=$false
}
$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $TargetDirectory 'conversion-manifest.json') -Encoding utf8NoBOM
"SCREENSHOT_JPEG: count=$($Converted.Count); quality=$Quality; dimensions_preserved=true; originals_preserved=true; viewed=false"
