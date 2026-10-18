$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDirectory = Join-Path $root '.cloudflow-runtime/full-prd-20260915/remaining-design/dependencies'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Read-SafeXml([string] $file) {
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($file, $settings)
    try {
        $document = [Xml.XmlDocument]::new()
        $document.XmlResolver = $null
        $document.Load($reader)
        return $document
    } finally {
        $reader.Dispose()
    }
}

function Read-ArtifactLicense([string] $group, [string] $artifact, [string] $version, [int] $depth = 0) {
    if ($depth -gt 4) { throw 'POM parent depth exceeded' }
    $url = "https://repo.maven.apache.org/maven2/$($group.Replace('.', '/'))/$artifact/$version/$artifact-$version.pom"
    $file = Join-Path $outputDirectory "$artifact-$version.pom"
    Invoke-WebRequest -Uri $url -OutFile $file -TimeoutSec 60
    $document = Read-SafeXml $file
    $licenses = @($document.SelectNodes('/*[local-name()="project"]/*[local-name()="licenses"]/*[local-name()="license"]'))
    if ($licenses.Count -gt 0) {
        foreach ($license in $licenses) {
            $licenseName = $license.SelectSingleNode('*[local-name()="name"]').InnerText
            $licenseUrlNode = $license.SelectSingleNode('*[local-name()="url"]')
            Write-Output "MAVEN_LICENSE $($artifact): name=$licenseName; url=$($licenseUrlNode.InnerText); source=$url"
        }
        return
    }
    $parent = $document.SelectSingleNode('/*[local-name()="project"]/*[local-name()="parent"]')
    if ($null -eq $parent) { throw "License missing: $artifact" }
    Read-ArtifactLicense $parent.groupId $parent.artifactId $parent.version ($depth + 1)
}

function Test-Artifact([string] $group, [string] $artifact, [string] $version, [string] $expectedClass) {
    Read-ArtifactLicense $group $artifact $version
    $url = "https://repo.maven.apache.org/maven2/$($group.Replace('.', '/'))/$artifact/$version/$artifact-$version.jar"
    $file = Join-Path $outputDirectory "$artifact-$version.jar"
    Invoke-WebRequest -Uri $url -OutFile $file -TimeoutSec 90
    $archive = [IO.Compression.ZipFile]::OpenRead($file)
    try {
        if ($null -eq $archive.GetEntry($expectedClass)) { throw "Expected API class missing: $expectedClass" }
        $maximumMajor = 0
        $classCount = 0
        foreach ($entry in $archive.Entries) {
            if (-not $entry.FullName.EndsWith('.class') -or $entry.FullName.StartsWith('META-INF/versions/')) { continue }
            $stream = $entry.Open()
            try {
                $header = [byte[]]::new(8)
                $offset = 0
                while ($offset -lt $header.Length) {
                    $readCount = $stream.Read($header, $offset, $header.Length - $offset)
                    if ($readCount -eq 0) { throw "Incomplete class header: $($entry.FullName)" }
                    $offset += $readCount
                }
                if ($header[0] -ne 202 -or $header[1] -ne 254 -or $header[2] -ne 186 -or $header[3] -ne 190) { throw "Invalid class header: $($entry.FullName)" }
                $major = [int]$header[6] * 256 + [int]$header[7]
                $maximumMajor = [Math]::Max($maximumMajor, $major)
                $classCount += 1
            } finally {
                $stream.Dispose()
            }
        }
        if ($maximumMajor -gt 61) { throw "Java17 bytecode mismatch: $artifact major=$maximumMajor" }
        $licenseEntries = @($archive.Entries | Where-Object { $_.FullName -match '(?i)(^|/)(license|notice)(\.[^/]*)?$' })
        foreach ($entry in $licenseEntries) {
            $reader = [IO.StreamReader]::new($entry.Open())
            try {
                $safeName = $entry.FullName.Replace('/', '_').Replace('\', '_')
                [IO.File]::WriteAllText((Join-Path $outputDirectory "$artifact-$safeName.txt"), $reader.ReadToEnd())
            } finally {
                $reader.Dispose()
            }
        }
        $digest = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Output "MAVEN_ARTIFACT $($group):$($artifact):$($version): HTTP=200; base_classes=$classCount; max_major=$maximumMajor; Java17_max_major=61; compatible_bytecode=true; bundled_license_files=$($licenseEntries.Count); sha256=$digest"
    } finally {
        $archive.Dispose()
    }
}

$nodeVersionText = (& node --version).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Node version query failed' }
$nodeVersion = [version]($nodeVersionText.TrimStart('v'))
$javaVersionLines = @(& java --version)
$javaVersionText = $javaVersionLines[0]
if ($LASTEXITCODE -ne 0 -or $javaVersionText -notmatch '\b17(?:\.|\s)') { throw "Java17 required: $javaVersionText" }
Write-Output "RUNTIME: node=$nodeVersionText; java=$javaVersionText"
Test-Artifact 'org.mnode.ical4j' 'ical4j' '4.3.0' 'net/fortuna/ical4j/model/Recur.class'
$icalSourceUrl = 'https://repo.maven.apache.org/maven2/org/mnode/ical4j/ical4j/4.3.0/ical4j-4.3.0-sources.jar'
$icalSourceFile = Join-Path $outputDirectory 'ical4j-4.3.0-sources.jar'
Invoke-WebRequest -Uri $icalSourceUrl -OutFile $icalSourceFile -TimeoutSec 60
$icalArchive = [IO.Compression.ZipFile]::OpenRead($icalSourceFile)
try {
    $icalReader = [IO.StreamReader]::new($icalArchive.GetEntry('net/fortuna/ical4j/model/Recur.java').Open())
    try {
        $icalSource = $icalReader.ReadToEnd()
        $licenseText = [regex]::Match($icalSource, '(?s)^/\*\*.*?\*/').Value
        if ($licenseText -notmatch 'Redistributions of source code' -or $licenseText -notmatch 'Redistributions in binary form' -or $licenseText -notmatch 'Neither the name') { throw 'Release-specific iCal4j license requires review' }
        $licenseFile = Join-Path $outputDirectory 'ical4j-4.3.0-source-license.txt'
        [IO.File]::WriteAllText($licenseFile, $licenseText)
        $licenseDigest = (Get-FileHash -LiteralPath $licenseFile -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Output "RELEASE_LICENSE ical4j@4.3.0: BSD-3-Clause_conditions=verified; source=$icalSourceUrl!/net/fortuna/ical4j/model/Recur.java; sha256=$licenseDigest; stale_POM_master_link_not_used=true"
    } finally {
        $icalReader.Dispose()
    }
} finally {
    $icalArchive.Dispose()
}
Test-Artifact 'com.github.binarywang' 'weixin-java-cp' '4.8.6.B' 'me/chanjar/weixin/cp/api/WxCpService.class'

$pdfMetadata = Invoke-RestMethod -Uri 'https://registry.npmjs.org/pdfjs-dist/6.3.289' -TimeoutSec 60
if ($pdfMetadata.version -ne '6.3.289' -or $pdfMetadata.license -ne 'Apache-2.0') { throw 'Unexpected PDF.js package metadata' }
if ($nodeVersion -lt [version]'22.13.0') { throw 'PDF.js requires Node >=22.13.0' }
$record = [ordered]@{ name = $pdfMetadata.name; version = $pdfMetadata.version; license = $pdfMetadata.license; engines = $pdfMetadata.engines; integrity = $pdfMetadata.dist.integrity; tarball = $pdfMetadata.dist.tarball }
$record | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputDirectory 'pdfjs-dist-metadata.json') -Encoding utf8
Write-Output "NPM_ARTIFACT $($pdfMetadata.name)@$($pdfMetadata.version): HTTP=200; license=$($pdfMetadata.license); node_required=$($pdfMetadata.engines.node); current=$nodeVersionText; engine_compatible=true"
Write-Output 'PROPOSAL_DEPENDENCY_METADATA=PASS; PROJECT_DEPENDENCIES_CHANGED=false; TRANSITIVE_DEPENDENCY_AND_PROJECT_BUILD=NOT_RUN_PENDING_APPROVAL'
Write-Output 'EXIT_CODE=0'
