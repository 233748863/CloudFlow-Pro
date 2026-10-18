function Get-OwnedLayeredArtifact([string]$JarPath,[string]$ArtifactDirectory,[string]$ExpectedHash) {
    if($ExpectedHash -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $JarPath).Hash -ne $ExpectedHash){throw 'Verified source package required'}
    $ArtifactRoot=[IO.Path]::GetFullPath($ArtifactDirectory)
    if((Get-Item -LiteralPath $ArtifactRoot).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected artifact directory rejected'}
    $Output=Join-Path $ArtifactRoot ($ExpectedHash.ToLowerInvariant()+'-layered')
    $Create=-not (Test-Path -LiteralPath $Output)
    if($Create){[IO.Directory]::CreateDirectory($Output)|Out-Null}
    if((Get-Item -LiteralPath $Output).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected layered directory rejected'}
    $Prefix=$Output+[IO.Path]::DirectorySeparatorChar
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Archive=[IO.Compression.ZipFile]::OpenRead($JarPath)
    $Files=[Collections.Generic.List[object]]::new()
    $Seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    try{
        foreach($Entry in $Archive.Entries){
            if($Entry.FullName.EndsWith('/')){continue}
            $Target=[IO.Path]::GetFullPath((Join-Path $Output $Entry.FullName))
            if(-not $Target.StartsWith($Prefix,[StringComparison]::OrdinalIgnoreCase) -or -not $Seen.Add($Target)){throw 'Unsafe or duplicate package entry'}
            if($Create){
                [IO.Directory]::CreateDirectory((Split-Path -Parent $Target))|Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry,$Target,$false)
            }
            if(-not (Test-Path -LiteralPath $Target -PathType Leaf) -or (Get-Item -LiteralPath $Target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Layered artifact is incomplete or redirected'}
            $EntryStream=$Entry.Open()
            try{$Hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($EntryStream))}finally{$EntryStream.Dispose()}
            if((Get-FileHash -LiteralPath $Target).Hash -ne $Hash){throw 'Layered artifact differs from original package entry'}
            $Files.Add([pscustomobject]@{Path=$Entry.FullName;Hash=$Hash})
        }
    }finally{$Archive.Dispose()}
    $Actual=@(Get-ChildItem -LiteralPath $Output -Recurse -Force)
    if(@($Actual|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -or @($Actual|Where-Object{-not $_.PSIsContainer}).Count -ne $Files.Count){throw 'Layered artifact contains unexpected files or redirects'}
    if((Get-FileHash -LiteralPath $JarPath).Hash -ne $ExpectedHash){throw 'Original package changed during extraction verification'}
    [pscustomobject]@{Path=$Output;PackageHash=$ExpectedHash;Files=@($Files)}
}
