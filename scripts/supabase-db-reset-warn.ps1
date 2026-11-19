# 로컬 Supabase DB 전체 초기화 — 기존 저장 데이터가 모두 삭제됩니다.
Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "  WARNING: supabase db reset" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "Deletes ALL data in local Postgres, including:" -ForegroundColor Yellow
Write-Host "  - laws, law_versions, law_articles, law_chunks (general law inquiry)"
Write-Host "  - admrul_*, law_search_*"
Write-Host "  - hs_chunks (HS explanatory embeddings — re-ingest/embed required)"
Write-Host ""
Write-Host "SQLite files (HS manual, tariff, etc.) are NOT affected." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Safer for new migrations only: npx supabase migration up" -ForegroundColor Cyan
Write-Host ""
$confirm = Read-Host "Type YES to continue db reset"
if ($confirm -ne "YES") {
  Write-Host "Cancelled." -ForegroundColor Green
  exit 0
}
Set-Location $PSScriptRoot\..
npx supabase db reset
exit $LASTEXITCODE
