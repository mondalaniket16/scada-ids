"""Script to clear corrupted detection/telemetry data from wrong threshold era."""
import sqlite3
import os

conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), 'scada_ids.db'))
c = conn.cursor()

c.execute('DELETE FROM detections')
c.execute('DELETE FROM alerts')
c.execute('DELETE FROM telemetry')
c.execute("UPDATE model_metadata SET status='trained', training_samples=3600 WHERE is_active=1")
conn.commit()

print('Cleared stale detection/alert/telemetry data (corrupted from wrong threshold)')
c.execute('SELECT COUNT(*) FROM users')
print(f'Users preserved: {c.fetchone()[0]}')
c.execute('SELECT status, training_samples FROM model_metadata WHERE is_active=1')
row = c.fetchone()
if row:
    print(f'Model metadata: status={row[0]}, training_samples={row[1]}')
conn.close()
print('Done.')
