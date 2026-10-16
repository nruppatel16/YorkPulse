"""AI Ignite club task tracker models.

Used only by the AI Ignite sandbox section (/ignite). Members are a plain
name roster (the club shares one login), not YorkPulse users.
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, CheckConstraint, Column, Date, ForeignKey, Integer, String, Table, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

IGNITE_TEAMS = ("marketing", "spark", "forge", "support", "finance")
# Members can also be executives, who belong to no single team
IGNITE_MEMBER_GROUPS = ("exec", *IGNITE_TEAMS)
IGNITE_STATUSES = ("not_started", "in_progress", "blocked", "done")
IGNITE_PRIORITIES = ("low", "medium", "high")
IGNITE_PROJECT_STATUSES = ("active", "archived")

ignite_task_assignees = Table(
    "ignite_task_assignees",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("ignite_tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", UUID(as_uuid=True), ForeignKey("ignite_members.id", ondelete="CASCADE"), primary_key=True),
)


# "task_id waits on depends_on_id": a task can't really finish until the
# tasks it depends on are done, often owned by other people or teams
ignite_task_dependencies = Table(
    "ignite_task_dependencies",
    Base.metadata,
    Column("task_id", UUID(as_uuid=True), ForeignKey("ignite_tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("depends_on_id", UUID(as_uuid=True), ForeignKey("ignite_tasks.id", ondelete="CASCADE"), primary_key=True),
    CheckConstraint("task_id <> depends_on_id", name="ck_ignite_task_dependencies_not_self"),
)


class IgniteProject(Base, UUIDMixin, TimestampMixin):
    """A project or workshop that groups tasks across teams."""

    __tablename__ = "ignite_projects"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)


class IgniteMember(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ignite_members"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str | None] = mapped_column(String(100), nullable=True)
    teams: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class IgniteTask(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ignite_tasks"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ignite_projects.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    team: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="not_started", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="medium", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(100), nullable=True)

    assignees: Mapped[list[IgniteMember]] = relationship(
        IgniteMember,
        secondary=ignite_task_assignees,
        lazy="selectin",
        order_by=IgniteMember.name,
    )

    depends_on: Mapped[list["IgniteTask"]] = relationship(
        "IgniteTask",
        secondary=ignite_task_dependencies,
        primaryjoin=lambda: IgniteTask.id == ignite_task_dependencies.c.task_id,
        secondaryjoin=lambda: IgniteTask.id == ignite_task_dependencies.c.depends_on_id,
        lazy="selectin",
        # self-referential eager loads need an explicit depth; one level is all
        # the API returns (ids of the tasks this one waits on)
        join_depth=1,
    )
