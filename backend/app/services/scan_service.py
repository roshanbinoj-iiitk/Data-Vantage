import os
import uuid
from typing import List, Tuple
from concurrent.futures import ThreadPoolExecutor, Future
from sqlalchemy.orm import Session
from ..db.models import ScanTask, FileEntry
from ..db.queries import update_task_progress, add_file_entry, update_task_status
from ..core.scanner import scan_directory
from ..core.hasher import calculate_sha256, calculate_phash, get_file_category

class ScanService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=16)
        self.active_tasks = {}  # task_id -> Future

    def start_scan(self, root_path: str, db: Session) -> str:
        task_id = str(uuid.uuid4())
        
        # First pass: Calculate total size
        file_list = scan_directory(root_path)
        total_size = sum(size for _, size, _ in file_list)
        
        # Create task in DB
        new_task = ScanTask(id=task_id, status="scanning", total_bytes=total_size)
        db.add(new_task)
        db.commit()
        
        # Offload processing to thread pool
        future = self.executor.submit(self.process_files, task_id, file_list, db)
        self.active_tasks[task_id] = future
        return task_id

    def cancel_scan(self, task_id: str, db: Session) -> bool:
        if task_id in self.active_tasks:
            future = self.active_tasks[task_id]
            future.cancel()
            update_task_status(db, task_id, "cancelled")
            del self.active_tasks[task_id]
            return True
        return False

    def cancel_all_scans(self, db: Session) -> int:
        cancelled_count = 0
        # Cancel active futures
        for task_id in list(self.active_tasks.keys()):
            future = self.active_tasks[task_id]
            future.cancel()
            del self.active_tasks[task_id]
            cancelled_count += 1
        
        # Update status for all scanning/pending tasks in DB
        tasks_to_cancel = db.query(ScanTask).filter(ScanTask.status.in_(["scanning", "pending"])).all()
        for task in tasks_to_cancel:
            update_task_status(db, task.id, "cancelled")
            cancelled_count += 1
        
        return cancelled_count

    def process_files(self, task_id: str, file_list: List[Tuple[str, int, float]], db: Session):
        try:
            processed_bytes = 0
            for fp, size, mtime in file_list:
                # Check if cancelled
                task = db.query(ScanTask).filter(ScanTask.id == task_id).first()
                if task and task.status == "cancelled":
                    break
                
                # Check if file already exists with same mtime
                existing = db.query(FileEntry).filter(FileEntry.path == fp, FileEntry.mtime == mtime).first()
                if existing:
                    # Skip hashing, just update progress
                    pass
                else:
                    # Calculate hashes
                    hash_val = calculate_sha256(fp)
                    phash_val = calculate_phash(fp) if get_file_category(fp) == 'image' else None
                    category = get_file_category(fp)
                    add_file_entry(db, fp, size, mtime, category, hash_val, phash_val)
                
                processed_bytes += size
                update_task_progress(db, task_id, processed_bytes, fp)
            
            # Mark as completed if not cancelled
            task = db.query(ScanTask).filter(ScanTask.id == task_id).first()
            if task and task.status != "cancelled":
                update_task_status(db, task_id, "completed")
        finally:
            # Clean up
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]