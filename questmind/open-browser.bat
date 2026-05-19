@echo off
:: 等待 localhost:5173 就绪，然后打开浏览器
set count=0
:wait
timeout /t 2 /nobreak >nul
set /a count+=1
netstat -ano | findstr ":5173" >nul 2>&1
if %errorlevel%==0 goto open
if %count%==20 goto open
goto wait

:open
start http://localhost:5173
exit
