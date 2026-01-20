import hashlib
import imagehash
from PIL import Image
import os

def calculate_sha256(file_path: str) -> str:
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

def calculate_phash(file_path: str) -> str:
    try:
        with Image.open(file_path) as img:
            return str(imagehash.phash(img))
    except Exception:
        return None

def get_file_category(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in ['.jpg', '.jpeg', '.png', '.gif', '.bmp']:
        return 'image'
    elif ext in ['.mp4', '.avi', '.mkv']:
        return 'video'
    elif ext in ['.mp3', '.wav']:
        return 'audio'
    elif ext in ['.pdf', '.doc', '.txt']:
        return 'document'
    else:
        return 'other'