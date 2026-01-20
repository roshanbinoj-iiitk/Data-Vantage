import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db.database import get_db
from ..services.scan_service import ScanService
from ..db.queries import get_task_status, get_all_tasks
from ..db.models import FileEntry

router = APIRouter()
scan_service = ScanService()

@router.post("")
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

@router.post("/cancel/{task_id}")
def cancel_scan(task_id: str, db: Session = Depends(get_db)):
    task = get_task_status(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in ["scanning", "pending"]:
        raise HTTPException(status_code=400, detail="Task is not running")
    success = scan_service.cancel_scan(task_id, db)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to cancel task")
    return {"message": "Task cancelled successfully"}

@router.post("/cancel-all")
def cancel_all_scans(db: Session = Depends(get_db)):
    cancelled_count = scan_service.cancel_all_scans(db)
    return {"message": f"Cancelled {cancelled_count} tasks"}

@router.get("/history")
def get_scan_history(db: Session = Depends(get_db)):
    tasks = get_all_tasks(db)
    return [
        {
            "id": task.id,
            "status": task.status,
            "total_bytes": task.total_bytes,
            "processed_bytes": task.processed_bytes,
            "current_file": task.current_file,
            "percentage": (task.processed_bytes / task.total_bytes * 100) if task.total_bytes > 0 else 0
        }
        for task in tasks
    ]

@router.get("/files")
def get_files(db: Session = Depends(get_db)):
    files = db.query(FileEntry).all()
    return [{"path": f.path, "size": f.size, "category": f.category} for f in files]