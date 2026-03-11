@echo off
REM ═══════════════════════════════════════════════════════
REM  United Rubber — Sales Analytics  /  Backup Script
REM  Usage:  backup.bat [version-label]
REM  Example: backup.bat v2_feature-map
REM  If no label given, uses today's date automatically.
REM ═══════════════════════════════════════════════════════

SET PROJECT=c:\UR html\United_Rubber_html
SET BACKUPS=%PROJECT%\_backups

REM Build timestamp: YYYY-MM-DD
FOR /F "tokens=1-3 delims=/" %%a IN ("%DATE%") DO (
    SET MM=%%a
    SET DD=%%b
    SET YYYY=%%c
)
SET TODAY=%YYYY:~0,4%-%MM%-%DD%

REM Use custom label if provided, else use date
IF "%~1"=="" (
    SET LABEL=%TODAY%
) ELSE (
    SET LABEL=%TODAY%_%~1
)

SET DEST=%BACKUPS%\%LABEL%

REM Create directory structure
MKDIR "%DEST%\db"       2>NUL
MKDIR "%DEST%\services" 2>NUL
MKDIR "%DEST%\routes"   2>NUL
MKDIR "%DEST%\public"   2>NUL

REM Copy all source files (excludes node_modules and _backups)
COPY "%PROJECT%\server.js"                          "%DEST%\" >NUL
COPY "%PROJECT%\package.json"                       "%DEST%\" >NUL
COPY "%PROJECT%\.env.example"                       "%DEST%\" >NUL
COPY "%PROJECT%\db\connection.js"                   "%DEST%\db\" >NUL
COPY "%PROJECT%\services\dbConfig.js"               "%DEST%\services\" >NUL
COPY "%PROJECT%\services\queryBuilder.js"           "%DEST%\services\" >NUL
COPY "%PROJECT%\routes\filters.js"                  "%DEST%\routes\" >NUL
COPY "%PROJECT%\routes\salesDashboard.js"           "%DEST%\routes\" >NUL
COPY "%PROJECT%\routes\salesDistributionMap.js"     "%DEST%\routes\" >NUL
COPY "%PROJECT%\routes\salesInvoiceSummary.js"      "%DEST%\routes\" >NUL
COPY "%PROJECT%\routes\salesSummaryAnalysis.js"     "%DEST%\routes\" >NUL
COPY "%PROJECT%\routes\export.js"                   "%DEST%\routes\" >NUL
COPY "%PROJECT%\public\index.html"                  "%DEST%\public\" >NUL
COPY "%PROJECT%\public\style.css"                   "%DEST%\public\" >NUL
COPY "%PROJECT%\public\script.js"                   "%DEST%\public\" >NUL

ECHO.
ECHO  Backup saved to:
ECHO  %DEST%
ECHO.
ECHO  Files backed up:
DIR "%DEST%" /S /B
ECHO.
PAUSE
