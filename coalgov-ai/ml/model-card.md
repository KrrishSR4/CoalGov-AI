# Predictive model status

No trained accident prediction model is bundled. Real labeled mine history was not supplied with the deck. The application's operational score uses documented rules, and its sensor detector uses a robust median / median absolute deviation baseline. Neither output is an accident probability or a statutory determination.

`train_risk.py` implements an optional XGBoost experiment with a chronological split, a seven-day exclusion gap, and held-out metrics. `explain_risk.py` produces SHAP contributions in log-odds space. These tools require the optional dependencies in `ml/requirements.txt` and reviewed data. Their output does not silently replace the live rule score.

Only use features available at prediction time. Establish the incident definition and reporting window before assembling labels. Evaluate new mines separately, examine calibration and false negatives, and document operating thresholds. Have qualified mine safety staff review the model and its consequences before integrating it into operational decisions.

Example input schema:

```csv
captured_at,mine_id,severity,likelihood,repeat_count,overdue_hours,incident_next_7d
2025-01-01T10:00:00Z,mine-a,3,2,1,0,0
```

One illustrative row is a schema example, not a training dataset or evidence of predictive accuracy.
