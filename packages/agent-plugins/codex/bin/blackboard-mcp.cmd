@echo off
setlocal DisableDelayedExpansion
rem Codex runs this on Windows in place of the extensionless blackboard-mcp.
rem Leave the plugin directory so an update can replace it while the server runs.
cd /d "%SystemRoot%"
if exist "%USERPROFILE%\.local\bin\blackboard.cmd" (
  call "%USERPROFILE%\.local\bin\blackboard.cmd" mcp %*
) else (
  call blackboard.cmd mcp %*
)
exit /b %errorlevel%
