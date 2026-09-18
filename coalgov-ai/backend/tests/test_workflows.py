from datetime import datetime,timedelta,timezone
from uuid import uuid4
import io
from sqlalchemy import select,text,func
from sqlalchemy.exc import DatabaseError
import pytest
from app.db import SessionLocal
from app.models import Case,AuditLog,AuditHead,Notification,Evidence
from app.services.audit import verify
from app.tasks import scan_deadlines


def timestamp(days=0):
    return (datetime.now(timezone.utc)+timedelta(days=days)).isoformat()


def observation(mine="mine-1",**overrides):
    return {"mine_id":mine,"title":"Test ventilation observation "+str(uuid4())[:8],"description":"Damaged duct observed during a test inspection.",
            "category":"Ventilation","severity":4,"likelihood":4,"captured_at":timestamp(),**overrides}


def create(client,**kwargs):
    r=client.post('/api/cases',json=observation(**kwargs));assert r.status_code==201,r.text;return r.json()


def change(client,case,action,expected=200,**kwargs):
    r=client.post('/api/cases/'+case['id']+'/transition',json={"version":case['version'],"action":action,**kwargs})
    assert r.status_code==expected,r.text
    return r.json()


def evidence(client,mine="mine-1",case=None,purpose="compliance",**extra):
    data={"mine_id":mine,"purpose":purpose,**extra}
    if case:data['case_id']=case['id']
    r=client.post('/api/documents',data=data,files={"file":("record.txt",b"Ventilation duct maintenance completed on 2026-09-14. Airflow inspection evidence.","text/plain")})
    assert r.status_code==201,r.text
    return r.json()


def test_observation_to_independent_verified_closure(clients):
    officer,official,contractor=clients('officer'),clients('official'),clients('contractor')
    c=create(officer)
    assert c['risk_score']>=48 and c['status']=='open'
    change(official,c,'close',409)
    c=change(official,c,'assign',assigned_to='user-contractor')
    change(officer,c,'start',403)
    c=change(contractor,c,'start')
    change(contractor,c,'submit_action',422,note='Work completed and documented.')
    doc=evidence(contractor,case=c,purpose='corrective_action')
    c=change(contractor,c,'submit_action',note='Damaged ventilation duct repaired and secured.')
    change(contractor,c,'verify',403,note='Self verification must be rejected.')
    c=change(official,c,'verify',note='Independently inspected repair and attached evidence.')
    c=change(official,c,'close')
    assert c['status']=='closed' and c['verified_by']=='user-official' and c['closed_at']
    detail=official.get('/api/cases/'+c['id']).json()
    assert len(detail['evidence'])==1 and len(detail['timeline'])>=6
    assert official.get('/api/documents/'+doc['id']+'/download').status_code==200


def test_officer_cannot_verify_own_action(clients):
    official,officer=clients('official'),clients('officer')
    c=change(official,create(official),'assign',assigned_to='user-officer')
    evidence(officer,case=c,purpose='corrective_action')
    c=change(officer,c,'submit_action',note='Corrective work with evidence attached.')
    change(officer,c,'verify',403,note='Attempt to verify my own work.')


def test_mine_scope_and_read_only_roles(clients):
    admin,officer,management=clients('admin'),clients('officer'),clients('management')
    other=create(admin,mine='mine-2')
    assert officer.get('/api/cases/'+other['id']).status_code==403
    assert all(c['mine_id']=='mine-1' for c in officer.get('/api/cases').json())
    assert officer.post('/api/cases',json=observation('mine-2')).status_code==403
    assert management.post('/api/cases',json=observation()).status_code==403
    doc=evidence(admin,mine='mine-2')
    assert officer.get('/api/documents/'+doc['id']+'/download').status_code==403
    gis=officer.get('/api/gis').json()
    assert all(f['properties']['mine_id']=='mine-1' for f in gis['features'])


def test_contractor_only_sees_their_cases(clients):
    official,contractor=clients('official'),clients('contractor')
    c=create(official)
    assert contractor.get('/api/cases/'+c['id']).status_code==403
    assert contractor.get('/api/compliance').status_code==403
    assert contractor.get('/api/inspections').status_code==403


def test_sync_retries_are_idempotent_and_changed_content_conflicts(clients):
    client=clients('officer')
    op={"operation_id":str(uuid4()),"kind":"create_case","payload":observation()}
    first=client.post('/api/sync',json={"operations":[op]}).json()['results'][0]
    second=client.post('/api/sync',json={"operations":[op]}).json()['results'][0]
    assert first['status']=='synced' and second['replayed'] and first['entity']['id']==second['entity']['id']
    op['payload']['title']='Different content using the same operation ID'
    conflict=client.post('/api/sync',json={"operations":[op]}).json()['results'][0]
    assert conflict['status']=='conflict' and conflict['code']==409
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(Case).where(Case.id==first['entity']['id']))==1


def test_sync_partial_failure_preserves_successful_work(clients):
    client=clients('officer')
    operations=[{"operation_id":str(uuid4()),"kind":"create_case","payload":observation(mine)} for mine in ['mine-1','mine-2','mine-1']]
    results=client.post('/api/sync',json={"operations":operations}).json()['results']
    assert [r['status'] for r in results]==['synced','error','synced']
    assert results[1]['code']==403


def test_stale_version_rejected_without_losing_current_state(clients):
    official=clients('official')
    c=create(official)
    changed=change(official,c,'assign',assigned_to='user-officer')
    result=change(official,c,'assign',409,assigned_to='user-contractor')
    assert result['detail']['current']['assigned_to']=='user-officer'
    assert official.get('/api/cases/'+c['id']).json()['version']==changed['version']


def test_evidence_retry_and_invalid_file_rejection(clients):
    client=clients('officer');upload_id=str(uuid4())
    first=evidence(client,upload_id=upload_id);second=evidence(client,upload_id=upload_id)
    assert first['id']==second['id']
    result=client.post('/api/documents',data={'mine_id':'mine-1'},files={'file':('fake.pdf',b'not a pdf','application/pdf')})
    assert result.status_code==422
    result=client.post('/api/documents',data={'mine_id':'mine-1'},files={'file':('script.html',b'<script/>','text/html')})
    assert result.status_code==422


def test_compliance_requires_evidence_and_independent_review(clients):
    official,officer=clients('official'),clients('officer')
    c=official.post('/api/compliance',json={'mine_id':'mine-1','title':'Independent compliance evidence test','owner_id':'user-officer','due_at':timestamp(2)}).json()
    result=officer.put('/api/compliance/'+c['id'],json={'version':c['version'],'status':'submitted'})
    assert result.status_code==404
    doc=evidence(officer)
    result=officer.put('/api/compliance/'+c['id'],json={'version':c['version'],'status':'submitted','evidence_id':doc['id']})
    assert result.status_code==200,result.text
    c=result.json()
    assert officer.put('/api/compliance/'+c['id'],json={'version':c['version'],'status':'compliant','notes':'Own evidence should not be self-approved.'}).status_code==403
    result=official.put('/api/compliance/'+c['id'],json={'version':c['version'],'status':'compliant','notes':'Original evidence reviewed independently.'})
    assert result.status_code==200 and result.json()['status']=='compliant'


def test_inspection_checklist_cannot_be_rewritten_or_skipped(clients):
    official,officer=clients('official'),clients('officer')
    result=official.post('/api/inspections',json={'mine_id':'mine-1','title':'Test field inspection','officer_id':'user-officer','scheduled_at':timestamp(1),'checklist':[{'label':'Verify emergency access'}]})
    assert result.status_code==201,result.text
    c=result.json();url='/api/inspections/'+c['id']
    assert officer.put(url,json={'version':1,'status':'completed','checklist':c['checklist']}).status_code==422
    assert officer.put(url,json={'version':1,'status':'completed','checklist':[{'label':'Skip scheduled check','result':'pass'}]}).status_code==422
    result=officer.put(url,json={'version':1,'status':'completed','checklist':[{'label':'Verify emergency access','result':'pass'}]})
    assert result.status_code==200 and result.json()['status']=='completed'


def test_offline_inspection_updates_are_versioned_and_replayable(clients):
    official,officer=clients('official'),clients('officer')
    record=official.post('/api/inspections',json={'mine_id':'mine-1','title':'Offline checklist test','officer_id':'user-officer','scheduled_at':timestamp(1),'checklist':[{'label':'Review the safety register'}]}).json()
    op={'operation_id':str(uuid4()),'kind':'update_inspection','entity_id':record['id'],'payload':{'version':1,'status':'completed','checklist':[{'label':'Review the safety register','result':'pass'}],'notes':'Completed while disconnected.'}}
    first=officer.post('/api/sync',json={'operations':[op]}).json()['results'][0]
    second=officer.post('/api/sync',json={'operations':[op]}).json()['results'][0]
    assert first['status']=='synced' and first['entity']['status']=='completed'
    assert second['replayed'] and second['entity']['id']==record['id']
    op['operation_id']=str(uuid4())
    assert officer.post('/api/sync',json={'operations':[op]}).json()['results'][0]['status']=='conflict'


def test_nearby_assets_respect_distance_and_mine_scope(clients):
    officer=clients('officer')
    result=officer.get('/api/gis/nearby',params={'latitude':22.31,'longitude':82.59,'radius_m':100})
    assert result.status_code==200,result.text
    assert [a['id'] for a in result.json()['assets']]==['asset-1-1']


def test_attendance_duplicate_and_ownership(clients):
    officer,contractor=clients('officer'),clients('contractor')
    record=officer.post('/api/attendance/check-in',json={'mine_id':'mine-1'})
    assert record.status_code==200,record.text
    assert officer.post('/api/attendance/check-in',json={'mine_id':'mine-1'}).status_code==409
    url='/api/attendance/'+record.json()['id']+'/check-out'
    assert contractor.post(url).status_code==403
    assert officer.post(url).status_code==200
    assert officer.post(url).status_code==409


def test_permit_approval_rules(clients):
    contractor,official=clients('contractor'),clients('official')
    payload={'mine_id':'mine-1','title':'Test permitted work','contractor_id':'user-contractor','work_type':'Maintenance','starts_at':timestamp(1),'expires_at':timestamp(2),'precautions':'Isolate and verify before maintenance work.'}
    result=contractor.post('/api/permits',json=payload);assert result.status_code==201,result.text
    p=result.json();url='/api/permits/'+p['id']
    assert contractor.put(url,json={'version':1,'status':'approved'}).status_code==403
    result=official.put(url,json={'version':1,'status':'approved'})
    assert result.status_code==200 and result.json()['approved_by']=='user-official'
    payload['expires_at']=timestamp()
    assert contractor.post('/api/permits',json=payload).status_code==422


def test_cookie_csrf_origin_and_logout_revocation(clients):
    client=clients('officer')
    token=client.headers.pop('Authorization')
    assert client.post('/api/cases',json=observation()).status_code==403
    client.headers['X-CoalGov-Client']='web'
    assert client.post('/api/cases',json=observation(),headers={'Origin':'https://untrusted.example'}).status_code==403
    assert client.post('/api/auth/logout').status_code==200
    assert client.get('/api/auth/me',headers={'Authorization':token}).status_code==401


def test_telemetry_deduplication_and_units(clients):
    official,officer=clients('official'),clients('officer')
    payload={'mine_id':'mine-1','asset_id':'asset-1-1','source':'test-sensor','event_id':str(uuid4()),'metric':'temperature','unit':'C','value':95,'observed_at':timestamp()}
    assert officer.post('/api/telemetry',json=payload).status_code==403
    first=official.post('/api/telemetry',json=payload);assert first.status_code==201,first.text
    assert first.json()['anomaly'] is True
    second=official.post('/api/telemetry',json=payload)
    assert first.json()['id']==second.json()['id']
    payload['value']=5
    assert official.post('/api/telemetry',json=payload).status_code==409
    payload['event_id']=str(uuid4());payload['unit']='F'
    assert official.post('/api/telemetry',json=payload).status_code==422


def test_evidence_search_returns_citations_within_mine_scope(clients):
    officer=clients('officer')
    doc=evidence(officer)
    result=officer.post('/api/assistant',json={'mine_id':'mine-1','question':'What ventilation duct maintenance was completed?'})
    assert result.status_code==200,result.text
    assert result.json()['mode']=='retrieval' and result.json()['citations']
    assert officer.post('/api/assistant',json={'mine_id':'mine-2','question':'Find maintenance evidence'}).status_code==403


def test_escalations_do_not_duplicate_on_repeated_scans(clients):
    c=create(clients('officer'))
    with SessionLocal() as db:
        db.get(Case,c['id']).due_at=datetime.now(timezone.utc).replace(tzinfo=None)-timedelta(hours=1)
        db.commit()
    first=scan_deadlines();second=scan_deadlines()
    assert first['notifications_created']>0 and second['notifications_created']==0


def test_csv_escapes_spreadsheet_formulas(clients):
    admin=clients('admin');create(admin,title='=HYPERLINK("test")')
    result=admin.get('/api/reports/cases.csv')
    assert result.status_code==200 and "'=HYPERLINK" in result.text


def test_vision_adapter_links_one_case_per_event(clients):
    official=clients('official')
    payload={'event_id':str(uuid4()),'mine_id':'mine-1','asset_id':'asset-1-1','detection':'missing_ppe','confidence':.9,'observed_at':timestamp(),'description':'External detector reported missing PPE near the workshop.'}
    first=official.post('/api/integrations/vision-events',json=payload)
    assert first.status_code==201,first.text
    second=official.post('/api/integrations/vision-events',json=payload)
    assert first.json()['id']==second.json()['id']


def test_audit_chain_verifies_and_updates_are_blocked(clients):
    admin=clients('admin')
    result=admin.get('/api/audit/verify')
    assert result.status_code==200 and result.json()['valid'] is True,result.text
    with SessionLocal() as db:
        with pytest.raises(DatabaseError):
            db.execute(text("UPDATE audit_logs SET action='forged' WHERE sequence=1"))
        db.rollback()
        assert verify(db)['valid'] is True
        head=db.get(AuditHead,1)
        head.digest='f'*64
        db.flush()
        assert verify(db)['valid'] is False
        db.rollback()
