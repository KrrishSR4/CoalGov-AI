"""Offline XGBoost experiment. Train only on authorized, reviewed incident labels.

python train_risk.py --csv history.csv --output models/risk.joblib
Expected columns: captured_at, mine_id, severity, likelihood, repeat_count,
overdue_hours, incident_next_7d. Labels must be recorded after the forecast window.
"""
import argparse
import json
from pathlib import Path
import joblib
import pandas as pd
import numpy as np
from sklearn.metrics import average_precision_score,roc_auc_score,brier_score_loss,confusion_matrix
from xgboost import XGBClassifier

FEATURES=['severity','likelihood','repeat_count','overdue_hours']

def train(csv_path,output):
    data=pd.read_csv(csv_path)
    required=set(FEATURES+['captured_at','mine_id','incident_next_7d'])
    if not required<=set(data.columns):
        raise ValueError('Missing columns: '+str(required-set(data.columns)))
    data['captured_at']=pd.to_datetime(data['captured_at'],utc=True)
    data=data.sort_values('captured_at')
    if len(data)<100 or data[FEATURES+['incident_next_7d']].isna().any().any():
        raise ValueError('Provide at least 100 complete, reviewed examples')
    if not set(data.incident_next_7d.unique())<=set([0,1]):
        raise ValueError('incident_next_7d must be a reviewed binary label')
    cutoff=data.iloc[int(len(data)*.8)].captured_at
    # Purge overlapping outcome windows to prevent seven-day label leakage.
    training=data[data.captured_at<cutoff-pd.Timedelta(days=7)]
    testing=data[data.captured_at>=cutoff]
    if len(training)<50 or min(training.incident_next_7d.nunique(),testing.incident_next_7d.nunique())<2:
        raise ValueError('Both temporal partitions require both classes; collect more history')
    model=XGBClassifier(n_estimators=150,max_depth=3,learning_rate=.05,subsample=.8,colsample_bytree=.9,
        random_state=42,n_jobs=2,eval_metric='logloss',tree_method='hist')
    model.fit(training[FEATURES],training.incident_next_7d)
    probability=model.predict_proba(testing[FEATURES])[:,1]
    metrics={'training_rows':len(training),'test_rows':len(testing),'test_start':str(cutoff),
        'auroc':float(roc_auc_score(testing.incident_next_7d,probability)),
        'average_precision':float(average_precision_score(testing.incident_next_7d,probability)),
        'brier_score':float(brier_score_loss(testing.incident_next_7d,probability)),
        'confusion_at_0_5':confusion_matrix(testing.incident_next_7d,probability>=.5).tolist(),
        'deployment_approved':False,'note':'Temporal experiment only. Validate held-out mines, calibration, subgroup performance, and operational consequences before deployment.'}
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    joblib.dump({'model':model,'features':FEATURES,'metrics':metrics},output)
    output.with_suffix('.metrics.json').write_text(json.dumps(metrics,indent=2))
    print(json.dumps(metrics,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--csv',required=True);parser.add_argument('--output',default='models/risk.joblib');args=parser.parse_args();train(args.csv,args.output)
