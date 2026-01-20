from sqlalchemy.orm import Session
from .models import ScanTask, FileEntry

def update_task_progress(db: Session, task_id: str, processed_bytes: int, current_file: str = None):
    task = db.query(ScanTask).filter(ScanTask.id == task_id).first()
    if task:
        task.processed_bytes = processed_bytes
        if current_file:
            task.current_file = current_file
        db.commit()
def update_task_status(db: Session, task_id: str, status: str):
    task = db.query(ScanTask).filter(ScanTask.id == task_id).first()
    if task:
        task.status = status
        db.commit()
def get_task_status(db: Session, task_id: str):
    return db.query(ScanTask).filter(ScanTask.id == task_id).first()

def get_all_tasks(db: Session):
    return db.query(ScanTask).all()

def add_file_entry(db: Session, path: str, size: int, mtime: float, category: str, hash_val: str = None, phash_val: str = None):
    entry = FileEntry(path=path, size=size, mtime=mtime, category=category, hash=hash_val, phash=phash_val)
    db.add(entry)
    db.commit()