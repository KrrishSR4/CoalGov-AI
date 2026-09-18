"""Back up the Docker database, evidence, and an independent audit checkpoint."""
from pathlib import Path
from datetime import datetime,timezone
import subprocess
import json

root=Path(__file__).resolve().parents[1]
target=root/'backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target.mkdir(parents=True,exist_ok=False)
commands={
    'database.dump':['docker','compose','exec','-T','db','sh','-c','pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],
    'evidence.tar.gz':['docker','compose','exec','-T','backend','tar','-C','/app/data/uploads','-czf','-','.'],
    'audit-checkpoint.json':['docker','compose','exec','-T','backend','python','-c',
        'import json; from app.db import SessionLocal; from app.services.audit import verify; db=SessionLocal(); print(json.dumps(verify(db))); db.close()']}
for name,cmd in commands.items():
    with (target/name).open('wb') as file:
        subprocess.run(cmd,cwd=root,stdout=file,check=True)
checkpoint=json.loads((target/'audit-checkpoint.json').read_text())
if not checkpoint.get('valid'):
    raise SystemExit('Backup created, but audit chain validation failed. Investigate before relying on it.')
print(f'Backup completed: {target}')
print('Copy this directory to protected off-site storage. Quiesce writes for a coordinated recovery point.')
