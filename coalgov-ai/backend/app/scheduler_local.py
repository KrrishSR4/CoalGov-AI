"""A local alternative to Celery + Redis for Windows / SQLite development."""
import logging
import time
from .tasks import scan_deadlines,deliver_notifications

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Local deadline scheduler running. Press Ctrl+C to stop.")
    try:
        while True:
            try:
                print(scan_deadlines())
                deliver_notifications()
            except Exception:
                logging.exception("Scheduler iteration failed; retrying in one minute")
            time.sleep(60)
    except KeyboardInterrupt:
        print("Scheduler stopped")
