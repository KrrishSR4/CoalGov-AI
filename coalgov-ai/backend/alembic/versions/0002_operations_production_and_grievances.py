"""production and grievances"""
from alembic import op
import sqlalchemy as sa

revision = '0002_operations'
down_revision = '0001_initial'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('grievances',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('mine_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=220), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('category', sa.String(length=40), nullable=False),
    sa.Column('priority', sa.String(length=12), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=False),
    sa.Column('assigned_to', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('resolution', sa.Text(), nullable=False),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('captured_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('due_at', sa.DateTime(), nullable=False),
    sa.Column('resolved_at', sa.DateTime(), nullable=True),
    sa.Column('closed_at', sa.DateTime(), nullable=True),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['mine_id'], ['mines.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('grievances', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_grievances_created_by'), ['created_by'], unique=False)
        batch_op.create_index(batch_op.f('ix_grievances_mine_id'), ['mine_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_grievances_status'), ['status'], unique=False)

    op.create_table('production_reports',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('mine_id', sa.String(length=36), nullable=False),
    sa.Column('work_date', sa.String(length=10), nullable=False),
    sa.Column('shift', sa.String(length=1), nullable=False),
    sa.Column('coal_tonnes', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('dispatch_tonnes', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('target_tonnes', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('downtime_minutes', sa.Integer(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('latitude', sa.Float(), nullable=True),
    sa.Column('longitude', sa.Float(), nullable=True),
    sa.Column('captured_at', sa.DateTime(), nullable=False),
    sa.Column('created_by', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('reviewed_by', sa.String(length=36), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.CheckConstraint('coal_tonnes >= 0 AND dispatch_tonnes >= 0 AND target_tonnes >= 0', name='ck_production_nonnegative'),
    sa.CheckConstraint('downtime_minutes >= 0 AND downtime_minutes <= 480', name='ck_production_downtime'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['mine_id'], ['mines.id'], ),
    sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('mine_id', 'work_date', 'shift', name='uq_production_mine_date_shift')
    )
    with op.batch_alter_table('production_reports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_production_reports_mine_id'), ['mine_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_production_reports_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_production_reports_work_date'), ['work_date'], unique=False)

    op.create_table('grievance_events',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('grievance_id', sa.String(length=36), nullable=False),
    sa.Column('actor_id', sa.String(length=36), nullable=False),
    sa.Column('action', sa.String(length=24), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('occurred_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['grievance_id'], ['grievances.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('grievance_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_grievance_events_grievance_id'), ['grievance_id'], unique=False)


def downgrade():
    raise RuntimeError("Production and grievance history must be preserved. Restore a reviewed backup to roll back this migration.")
