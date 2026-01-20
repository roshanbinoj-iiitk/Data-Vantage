import os
import uuid
from typing import List, Tuple
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.orm import Session
from ..db.models import ScanTask, FileEntry
from ..db.queries import update_task_progress, add_file_entry
from ..core.scanner import scan_directory
from ..core.hasher import calculate_sha256, calculate_phash, get_file_category

class ScanService:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=4)

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
        self.executor.submit(self.process_files, task_id, file_list, db)
        return task_id

    def process_files(self, task_id: str, file_list: List[Tuple[str, int, float]], db: Session):
        processed_bytes = 0
        for fp, size, mtime in file_list:
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
        
        # Mark as completed
        task = db.query(ScanTask).filter(ScanTask.id == task_id).first()
        if task:
            task.status = "completed"
            db.commit()