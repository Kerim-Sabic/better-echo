@echo off
rem Wrapper for PowerShell version with better Ctrl+C handling
rem PowerShell's try/finally ensures cleanup runs on first Ctrl+C

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-start-with-llm.ps1"
