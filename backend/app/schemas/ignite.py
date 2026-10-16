"""AI Ignite task tracker schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Team = Literal["marketing", "spark", "forge", "support", "finance"]
MemberGroup = Literal["exec", "marketing", "spark", "forge", "support", "finance"]
Status = Literal["not_started", "in_progress", "blocked", "done"]
Priority = Literal["low", "medium", "high"]
ProjectStatus = Literal["active", "archived"]


def _strip(v):
    """Trim strings; blank becomes None so required fields fail validation."""
    if isinstance(v, str):
        v = v.strip()
        return v or None
    return v


def _dedupe(v):
    return list(dict.fromkeys(v)) if isinstance(v, list) else v


class PasscodeRequest(BaseModel):
    passcode: str = Field(min_length=1, max_length=100)


class MemberCreate(BaseModel):
    passcode: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    role: str | None = Field(default=None, max_length=100)
    teams: list[MemberGroup] = Field(min_length=1, max_length=6)

    _dedupe = field_validator("teams", mode="before")(classmethod(lambda cls, v: _dedupe(v)))

    _clean = field_validator("name", "role", mode="before")(classmethod(lambda cls, v: _strip(v)))


class MemberUpdate(BaseModel):
    passcode: str = Field(min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    role: str | None = Field(default=None, max_length=100)
    teams: list[MemberGroup] | None = Field(default=None, min_length=1, max_length=6)
    is_active: bool | None = None

    _clean = field_validator("name", "role", mode="before")(classmethod(lambda cls, v: _strip(v)))
    _dedupe = field_validator("teams", mode="before")(classmethod(lambda cls, v: _dedupe(v)))


class MemberResponse(BaseModel):
    id: str
    name: str
    role: str | None
    teams: list[MemberGroup]
    is_active: bool


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    actor: str = Field(min_length=1, max_length=100)  # "Created by"

    _clean = field_validator("name", "description", "actor", mode="before")(classmethod(lambda cls, v: _strip(v)))


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: ProjectStatus | None = None

    _clean = field_validator("name", "description", mode="before")(classmethod(lambda cls, v: _strip(v)))


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    status: ProjectStatus
    created_by: str | None
    created_at: datetime


class TaskCreate(BaseModel):
    # Every field is required: the club wants complete tasks, not stubs
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    project_id: str
    team: Team
    status: Status
    progress: int = Field(ge=0, le=100)
    priority: Priority
    due_date: date
    assignee_ids: list[str] = Field(min_length=1, max_length=20)
    depends_on_ids: list[str] = Field(default_factory=list, max_length=20)  # optional: tasks this one waits on
    actor: str = Field(min_length=1, max_length=100)  # "Created by"

    _clean = field_validator("title", "description", "actor", mode="before")(classmethod(lambda cls, v: _strip(v)))


class TaskUpdate(BaseModel):
    # Fields are optional to send, but none can be cleared, and the person
    # making the change must say who they are
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    project_id: str | None = None
    team: Team | None = None
    status: Status | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    priority: Priority | None = None
    due_date: date | None = None
    assignee_ids: list[str] | None = Field(default=None, min_length=1, max_length=20)
    depends_on_ids: list[str] | None = Field(default=None, max_length=20)  # [] clears
    actor: str = Field(min_length=1, max_length=100)  # "Updated by"

    _clean = field_validator("title", "description", "actor", mode="before")(classmethod(lambda cls, v: _strip(v)))

    @model_validator(mode="after")
    def no_clearing(self):
        for field in ("title", "description", "project_id", "team", "status", "progress", "priority", "due_date", "assignee_ids", "depends_on_ids"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} is required")
        return self


class TaskResponse(BaseModel):
    id: str
    title: str
    description: str | None
    team: Team
    status: Status
    progress: int
    priority: Priority
    due_date: date | None
    project_id: str
    assignees: list[MemberResponse]
    depends_on_ids: list[str]
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime
