from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from api.upload import router as upload_router
from pydantic import BaseModel
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)

@app.get("/")
def root():
    return {"message":"Horalix is running"}

if __name__ == "__main__":
    uvicorn.run(app, host = "0.0.0.0", port=8000)