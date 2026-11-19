# 하위 호환 — scripts/hs-chunks-wco.ps1 로 위임
param([switch]$EmbedOnly)
$args = @("-Year", "2022")
if ($EmbedOnly) { $args += "-EmbedOnly" }
& "$PSScriptRoot\hs-chunks-wco.ps1" @args
