from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.scan import router as scan_router

app = FastAPI(title="Data Vantage API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Adjust for your frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Data Vantage API"}