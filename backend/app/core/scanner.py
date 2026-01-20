import os
from typing import List, Tuple

def scan_directory(root_path: str) -> List[Tuple[str, int, float]]:
    file_list = []
    for root, dirs, files in os.walk(root_path):
        # Skip hidden folders
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for f in files:
            fp = os.path.join(root, f)
            try:
                stat = os.stat(fp)
                size = stat.st_size
                mtime = stat.st_mtime
                file_list.append((fp, size, mtime))
            except OSError:
                continue  # Skip inaccessible files
    return file_list