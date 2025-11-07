#!/usr/bin/env python3
import os
import sys
import uvicorn

if getattr(sys, 'frozen', False):
    basedir = sys._MEIPASS
    os.chdir(basedir)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=True,
    )
