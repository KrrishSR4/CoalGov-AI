"""Explain a trusted local model artifact with SHAP. Never load untrusted pickle/joblib files."""
import argparse
import json
import joblib
import pandas as pd
import shap

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',required=True)
    parser.add_argument('--severity',type=int,required=True)
    parser.add_argument('--likelihood',type=int,required=True)
    parser.add_argument('--repeat-count',type=int,default=0)
    parser.add_argument('--overdue-hours',type=float,default=0)
    args=parser.parse_args()
    bundle=joblib.load(args.model)
    row=pd.DataFrame([[args.severity,args.likelihood,args.repeat_count,args.overdue_hours]],columns=bundle['features'])
    explanation=shap.TreeExplainer(bundle['model'])(row)
    print(json.dumps({'experimental_probability':float(bundle['model'].predict_proba(row)[0,1]),
        'shap_log_odds':dict(zip(bundle['features'],[float(v) for v in explanation.values[0]])),
        'base_log_odds':float(explanation.base_values[0]),'deployment_approved':False},indent=2))
