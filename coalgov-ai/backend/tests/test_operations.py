from datetime import date, datetime, timedelta, timezone
from uuid import uuid4
import itertools
import pytest
from sqlalchemy import select, func
from app.db import SessionLocal
from app.models import ProductionReport, Grievance, GrievanceEvent, Notification, AuditLog, now
from app.services.audit import verify
from app.tasks import scan_deadlines

dates = itertools.count(1)


def production(**extra):
    return {"mine_id": "mine-1", "work_date": (date(2020, 1, 1) + timedelta(days=next(dates))).isoformat(),
            "shift": "A", "coal_tonnes": "1250.25", "dispatch_tonnes": "1300.50", "target_tonnes": "1500.00",
            "downtime_minutes": 35, "notes": "Fictional shift reporting test.", "captured_at": datetime.now(timezone.utc).isoformat(), **extra}


def grievance(**extra):
    return {"mine_id": "mine-1", "title": "Facilities request " + str(uuid4())[:8],
            "description": "Private grievance description " + str(uuid4()), "category": "Facilities", "priority": "normal",
            "captured_at": datetime.now(timezone.utc).isoformat(), **extra}


def post(client, path, body, expected=201):
    result = client.post('/api' + path, json=body)
    assert result.status_code == expected, result.text
    return result.json()


def transition(client, row, action, expected=200, **extra):
    return post(client, '/grievances/' + row['id'] + '/transition',
                {"version": row['version'], "action": action, "note": "Recorded workflow explanation.", **extra}, expected)


def test_production_independent_review_correction_totals_and_export(clients):
    officer, official = clients('officer'), clients('official')
    body = production(notes='=HYPERLINK("malicious", "formula test")')
    row = post(officer, '/production', body)
    post(officer, '/production', body, 409)
    query = '?mine_id=mine-1&date_from=' + body['work_date'] + '&date_to=' + body['work_date']
    assert officer.get('/api/production/summary' + query).json()['coal_tonnes'] == 0
    reviewed = post(official, '/production/' + row['id'] + '/review',
                    {"version": row['version'], "action": "return", "note": "Please correct the dispatch figure."}, 200)
    update = {**body, 'dispatch_tonnes': '1200.10', 'version': reviewed['version']}
    assert official.put('/api/production/' + row['id'], json=update).status_code == 403
    assert officer.put('/api/production/' + row['id'], json={**update, 'shift': 'B'}).status_code == 422
    corrected = officer.put('/api/production/' + row['id'], json=update)
    assert corrected.status_code == 200, corrected.text
    post(official, '/production/' + row['id'] + '/review',
         {"version": row['version'], "action": "approve", "note": "Reviewed production records."}, 409)
    approved = post(official, '/production/' + row['id'] + '/review',
                    {"version": corrected.json()['version'], "action": "approve", "note": "Reviewed production records."}, 200)
    assert approved['status'] == 'approved'
    assert officer.put('/api/production/' + row['id'], json={**update, 'version': approved['version']}).status_code == 409
    totals = officer.get('/api/production/summary' + query).json()
    assert (totals['coal_tonnes'], totals['dispatch_tonnes'], totals['achievement_percent']) == (1250.25, 1200.1, 83.35)
    exported = officer.get('/api/reports/production.csv' + query)
    assert exported.status_code == 200 and "'=HYPERLINK" in exported.text
    assert len(officer.get('/api/production/' + row['id']).json()['timeline']) == 4


def test_production_roles_mine_scope_and_self_review(clients):
    official, officer, contractor, management = [clients(r) for r in ('official', 'officer', 'contractor', 'management')]
    body = production(mine_id='mine-2')
    row = post(official, '/production', body)
    post(official, '/production/' + row['id'] + '/review', {"version": 1, "action": "approve", "note": "Attempted self approval."}, 403)
    post(officer, '/production', production(mine_id='mine-2'), 403)
    post(contractor, '/production', production(), 403)
    post(management, '/production', production(), 403)
    assert officer.get('/api/production/' + row['id']).status_code == 403
    assert officer.get('/api/production?mine_id=mine-2').json() == []
    assert management.get('/api/production/' + row['id']).status_code == 200
    assert contractor.get('/api/production').status_code == 403


@pytest.mark.parametrize('changes', [
    {'coal_tonnes': '-1'}, {'coal_tonnes': 'NaN'}, {'coal_tonnes': '1.001'},
    {'work_date': '2999-01-01'}, {'downtime_minutes': 481}, {'shift': 'D'}, {'latitude': 22.3},
])
def test_invalid_production_input_is_rejected(clients, changes):
    post(clients('officer'), '/production', production(**changes), 422)


def test_offline_production_partial_batch_receipts_and_correction(clients):
    officer, official = clients('officer'), clients('official')
    body = production()
    op = {'operation_id': str(uuid4()), 'kind': 'create_production', 'payload': body}
    invalid = {'operation_id': str(uuid4()), 'kind': 'create_production', 'payload': production(coal_tonnes=-2)}
    batch = post(officer, '/sync', {'operations': [op, invalid]}, 200)['results']
    assert [x['status'] for x in batch] == ['synced', 'error']
    replay = post(officer, '/sync', {'operations': [op]}, 200)['results'][0]
    assert replay['replayed'] is True and replay['entity']['id'] == batch[0]['entity']['id']
    row = replay['entity']
    returned = post(official, '/production/' + row['id'] + '/review', {'version': 1, 'action': 'return', 'note': 'Revise the submitted tonnage.'}, 200)
    update = {'operation_id': str(uuid4()), 'kind': 'update_production', 'entity_id': row['id'], 'payload': {**body, 'version': returned['version'], 'coal_tonnes': '20.50'}}
    assert post(officer, '/sync', {'operations': [update]}, 200)['results'][0]['status'] == 'synced'
    assert post(officer, '/sync', {'operations': [update]}, 200)['results'][0]['replayed'] is True
    assert officer.get('/api/production/' + row['id']).json()['coal_tonnes'] == 20.5


def test_grievance_private_lifecycle_and_reporter_acceptance(clients):
    contractor, official, officer, agency, management, regulator = [clients(r) for r in ('contractor', 'official', 'officer', 'agency', 'management', 'regulator')]
    body = grievance()
    row = post(contractor, '/grievances', body)
    for actor in (officer, agency, management, regulator):
        assert actor.get('/api/grievances/' + row['id']).status_code == 403
        assert row['id'] not in [x['id'] for x in actor.get('/api/grievances').json()]
    summary = management.get('/api/grievances/summary').json()
    assert summary['total'] >= 1 and body['description'] not in str(summary)
    transition(official, row, 'close', 403)
    transition(official, row, 'assign', 422, assigned_to='user-contractor')
    row = transition(official, row, 'assign', assigned_to='user-officer')
    assert officer.get('/api/grievances/' + row['id']).status_code == 200
    transition(official, row, 'resolve', 403)
    row = transition(officer, row, 'start')
    row = transition(officer, row, 'resolve', note='The requested facility repair is complete.')
    transition(officer, row, 'close', 403)
    row = transition(contractor, row, 'close', note='I checked and accept this resolution.')
    assert row['closed_at'] and row['status'] == 'closed'
    transition(contractor, row, 'comment', 409)
    row = transition(contractor, row, 'reopen', note='The same problem occurred again today.')
    assert row['status'] == 'assigned' and row['closed_at'] is None
    detail = contractor.get('/api/grievances/' + row['id']).json()
    assert len(detail['timeline']) == 6 and all(x['integrity_verified'] for x in detail['timeline'])
    with SessionLocal() as db:
        logs = db.scalars(select(AuditLog).where(AuditLog.entity_id == row['id'])).all()
        assert body['description'] not in str([x.payload for x in logs])
        assert verify(db)['valid']


def test_grievance_mine_scope_and_handler_reassignment(clients):
    official, officer, agency = clients('official'), clients('officer'), clients('agency')
    foreign = post(official, '/grievances', grievance(mine_id='mine-2'))
    assert officer.get('/api/grievances/' + foreign['id']).status_code == 403
    post(officer, '/grievances', grievance(mine_id='mine-2'), 403)
    row = post(agency, '/grievances', grievance())
    row = transition(official, row, 'assign', assigned_to='user-officer')
    row = transition(official, row, 'assign', assigned_to='user-official')
    assert officer.get('/api/grievances/' + row['id']).status_code == 403
    assert row['id'] not in officer.get('/api/reports/grievances.csv').text


def test_offline_grievance_retries_conflicts_and_no_duplicate_events(clients):
    contractor, official = clients('contractor'), clients('official')
    operation = {'operation_id': str(uuid4()), 'kind': 'create_grievance', 'payload': grievance()}
    first = post(contractor, '/sync', {'operations': [operation]}, 200)['results'][0]
    second = post(contractor, '/sync', {'operations': [operation]}, 200)['results'][0]
    assert second['replayed'] and second['entity']['id'] == first['entity']['id']
    row = first['entity']
    changed = {**operation, 'payload': {**operation['payload'], 'title': 'A different grievance payload'}}
    assert post(contractor, '/sync', {'operations': [changed]}, 200)['results'][0]['status'] == 'conflict'
    comment = {'operation_id': str(uuid4()), 'kind': 'transition_grievance', 'entity_id': row['id'], 'payload': {'version': 1, 'action': 'comment', 'note': 'Additional information from the reporter.'}}
    one = post(contractor, '/sync', {'operations': [comment]}, 200)['results'][0]
    assert one['status'] == 'synced'
    assert post(contractor, '/sync', {'operations': [comment]}, 200)['results'][0]['replayed']
    transition(official, row, 'assign', 409, assigned_to='user-officer')
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(GrievanceEvent).where(GrievanceEvent.grievance_id == row['id'])) == 2


def test_overdue_grievance_escalation_is_private_and_deduplicated(clients):
    contractor = clients('contractor')
    row = post(contractor, '/grievances', grievance(priority='urgent'))
    with SessionLocal() as db:
        db.get(Grievance, row['id']).due_at = now() - timedelta(hours=1)
        db.commit()
    scan_deadlines()
    scan_deadlines()
    with SessionLocal() as db:
        notifications = db.scalars(select(Notification).where(Notification.entity_id == row['id'], Notification.dedupe_key.like('grievance:%'))).all()
        assert {n.user_id for n in notifications} == {'user-contractor', 'user-official', 'user-admin'}
        assert len(notifications) == 3
        assert all(row['description'] not in n.body for n in notifications)
