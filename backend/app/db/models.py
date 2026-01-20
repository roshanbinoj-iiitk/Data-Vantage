from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class FileEntry(Base):
    __tablename__ = "files"
    id = Column(Integer, primary_key=True)
    path = Column(String, unique=True)
    size = Column(Integer)
    hash = Column(String, nullable=True)
    phash = Column(String, nullable=True)
    mtime = Column(Float)
    category = Column(String)

class ScanTask(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True)  # UUID
    status = Column(String)  # "pending", "scanning", "completed"
    total_bytes = Column(Integer, default=0)
    processed_bytes = Column(Integer, default=0)
    current_file = Column(String, nullable=True)