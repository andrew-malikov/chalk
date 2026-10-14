@echo off
setlocal DisableDelayedExpansion
rem Codex runs this on Windows in place of the extensionless chalk-mcp.
rem Leave the plugin directory so an update can replace it while the server runs.
cd /d "%SystemRoot%"
if exist "%USERPROFILE%\.local\bin\chalk.cmd" (
  call "%USERPROFILE%\.local\bin\chalk.cmd" mcp %*
) else (
  call chalk.cmd mcp %*
)
exit /b %errorlevel%
