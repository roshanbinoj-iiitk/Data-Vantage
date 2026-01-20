import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from ..services.scan_service import ScanService
from ..db.queries import get_task_status
from ..db.models import FileEntry

router = APIRouter()
scan_service = ScanService()

@router.post("/scan")
def start_scan(root_path: str, db: Session = Depends(get_db)):
    if not os.path.exists(root_path):
        raise HTTPException(status_code=400, detail="Path does not exist")
    task_id = scan_service.start_scan(root_path, db)
    return {"task_id": task_id}

@router.get("/status/{task_id}")
def get_status(task_id: str, db: Session = Depends(get_db)):
    task = get_task_status(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    percentage = (task.processed_bytes / task.total_bytes * 100) if task.total_bytes > 0 else 0
    return {
        "status": task.status,
        "percentage": percentage,
        "current_file": task.current_file
    }

@router.get("/files")
def get_files(db: Session = Depends(get_db)):
    files = db.query(FileEntry).all()
    return [{"path": f.path, "size": f.size, "category": f.category} for f in files]