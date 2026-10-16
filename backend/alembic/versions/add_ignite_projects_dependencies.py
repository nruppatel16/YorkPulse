"""AI Ignite projects and task dependencies

Adds ignite_projects, a required project on every task (existing tasks go
into a seeded "General" project), and ignite_task_dependencies for tasks
that wait on other tasks.

Revision ID: add_ignite_projects_deps
Revises: seed_ignite_members_2
Create Date: 2026-10-16
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'add_ignite_projects_deps'
down_revision = 'seed_ignite_members_2'
branch_labels = None
depends_on = None

GENERAL_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def upgrade() -> None:
    op.create_table(
        'ignite_projects',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('created_by', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        sa.text(
            "INSERT INTO ignite_projects (id, name, description) VALUES "
            "(:id, 'General', 'Tasks that are not part of a specific project or workshop')"
        ).bindparams(id=GENERAL_ID)
    )

    op.add_column('ignite_tasks', sa.Column('project_id', UUID(as_uuid=True), nullable=True))
    op.execute(sa.text("UPDATE ignite_tasks SET project_id = :id").bindparams(id=GENERAL_ID))
    op.alter_column('ignite_tasks', 'project_id', nullable=False)
    op.create_foreign_key(
        'fk_ignite_tasks_project_id', 'ignite_tasks', 'ignite_projects', ['project_id'], ['id'], ondelete='RESTRICT'
    )
    op.create_index('ix_ignite_tasks_project_id', 'ignite_tasks', ['project_id'])

    op.create_table(
        'ignite_task_dependencies',
        sa.Column('task_id', UUID(as_uuid=True), sa.ForeignKey('ignite_tasks.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('depends_on_id', UUID(as_uuid=True), sa.ForeignKey('ignite_tasks.id', ondelete='CASCADE'), primary_key=True),
        sa.CheckConstraint('task_id <> depends_on_id', name='ck_ignite_task_dependencies_not_self'),
    )
    op.create_index('ix_ignite_task_dependencies_depends_on_id', 'ignite_task_dependencies', ['depends_on_id'])


def downgrade() -> None:
    op.drop_table('ignite_task_dependencies')
    op.drop_index('ix_ignite_tasks_project_id', table_name='ignite_tasks')
    op.drop_constraint('fk_ignite_tasks_project_id', 'ignite_tasks', type_='foreignkey')
    op.drop_column('ignite_tasks', 'project_id')
    op.drop_table('ignite_projects')
