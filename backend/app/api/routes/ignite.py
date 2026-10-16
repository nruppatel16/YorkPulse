"""AI Ignite club task tracker API.

Only the AI Ignite sandbox account (and admins) can use these routes. The club
shares one login, so members are a name roster and `actor` is the
self-selected name of whoever is making a change.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.passwords import verify_pbkdf2
from app.core.dependencies import CurrentUser, is_sandbox_user
from app.models.ignite import (
    IgniteMember,
    IgniteProject,
    IgniteTask,
    ignite_task_assignees,
    ignite_task_dependencies,
)
from app.models.user import User
from app.services.redis import redis_service
from app.schemas.ignite import (
    MemberCreate,
    MemberResponse,
    MemberUpdate,
    PasscodeRequest,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    Priority,
    Status,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
    Team,
)

router = APIRouter(prefix="/ignite", tags=["AI Ignite"])


async def get_ignite_user(user: CurrentUser) -> User:
    if not (is_sandbox_user(user) or user.is_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not available for this account")
    return user


IgniteUser = Annotated[User, Depends(get_ignite_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def _member_out(m: IgniteMember) -> MemberResponse:
    return MemberResponse(id=str(m.id), name=m.name, role=m.role, teams=m.teams, is_active=m.is_active)


def _task_out(t: IgniteTask) -> TaskResponse:
    return TaskResponse(
        id=str(t.id),
        title=t.title,
        description=t.description,
        team=t.team,
        status=t.status,
        progress=t.progress,
        priority=t.priority,
        due_date=t.due_date,
        project_id=str(t.project_id),
        assignees=[_member_out(m) for m in t.assignees],
        depends_on_ids=[str(d.id) for d in t.depends_on],
        created_by=t.created_by,
        updated_by=t.updated_by,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


def _parse_uuid(value: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


async def _load_members(db: AsyncSession, ids: list[str]) -> list[IgniteMember]:
    uuids = list({_parse_uuid(i, "Member") for i in ids})
    if not uuids:
        return []
    members = (await db.execute(select(IgniteMember).where(IgniteMember.id.in_(uuids)))).scalars().all()
    if len(members) != len(uuids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown assignee")
    return list(members)


def _project_out(p: IgniteProject) -> ProjectResponse:
    return ProjectResponse(
        id=str(p.id),
        name=p.name,
        description=p.description,
        status=p.status,
        created_by=p.created_by,
        created_at=p.created_at,
    )


async def _load_project(db: AsyncSession, project_id: str, *, require_active: bool) -> IgniteProject:
    project = await db.get(IgniteProject, _parse_uuid(project_id, "Project"))
    if not project:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown project")
    if require_active and project.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That project is archived")
    return project


async def _load_dependencies(db: AsyncSession, ids: list[str], task_id: uuid.UUID | None) -> list[IgniteTask]:
    """Resolve "waiting on" task ids, rejecting self-links and cycles
    (A waits on B while B, directly or through others, waits on A)."""
    uuids = list({_parse_uuid(i, "Task") for i in ids})
    if not uuids:
        return []
    if task_id is not None and task_id in uuids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A task can't wait on itself")
    deps = (await db.execute(select(IgniteTask).where(IgniteTask.id.in_(uuids)))).scalars().all()
    if len(deps) != len(uuids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown task in 'waiting on'")

    if task_id is not None:
        # A brand-new task has nothing waiting on it yet, so only edits can close a loop
        edges: dict[uuid.UUID, list[uuid.UUID]] = {}
        for row in (await db.execute(select(ignite_task_dependencies))).all():
            edges.setdefault(row.task_id, []).append(row.depends_on_id)
        stack, seen = list(uuids), set()
        while stack:
            current = stack.pop()
            if current == task_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="That would create a loop: one of those tasks is already waiting on this one",
                )
            if current in seen:
                continue
            seen.add(current)
            stack.extend(edges.get(current, []))
    return list(deps)


def _sync_status_progress(task: IgniteTask, status_set: bool, progress_set: bool) -> None:
    """Keep the status and the progress bar consistent with each other.

    An explicit status wins: done fills the bar, not_started empties it, and
    reopening a finished task drops a full bar back to 90%. A progress change
    on its own moves the status to match.
    """
    if status_set:
        if task.status == "done":
            task.progress = 100
        elif task.status == "not_started":
            task.progress = 0
        elif task.progress == 100:
            task.progress = 90
    elif progress_set:
        if task.progress == 100:
            task.status = "done"
        elif task.status == "done" or (task.status == "not_started" and task.progress > 0):
            task.status = "in_progress"


PASSCODE_FAILURES_KEY = "ignite_passcode:failures"
PASSCODE_WINDOW_SECONDS = 15 * 60


async def _check_members_passcode(passcode: str) -> None:
    """Editing the roster needs the members passcode. Wrong guesses are
    capped per 15-minute window; Redis being down fails open, like the rest
    of the rate limiting."""
    try:
        failures = await redis_service.get(PASSCODE_FAILURES_KEY)
    except Exception:
        failures = None
    if failures and int(failures) >= settings.ignite_passcode_max_failed_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many wrong passcodes. Try again in 15 minutes.",
        )
    if not verify_pbkdf2(passcode, settings.ignite_members_passcode_hash):
        try:
            count = await redis_service.incr(PASSCODE_FAILURES_KEY)
            if count == 1:
                await redis_service.expire(PASSCODE_FAILURES_KEY, PASSCODE_WINDOW_SECONDS)
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Wrong passcode")


async def _get_task(db: AsyncSession, task_id: str) -> IgniteTask:
    task = await db.get(IgniteTask, _parse_uuid(task_id, "Task"))
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


# ---- Members ----------------------------------------------------------------


@router.get("/members", response_model=list[MemberResponse])
async def list_members(_: IgniteUser, db: DB, include_inactive: bool = False):
    q = select(IgniteMember).order_by(IgniteMember.name)
    if not include_inactive:
        q = q.where(IgniteMember.is_active.is_(True))
    return [_member_out(m) for m in (await db.execute(q)).scalars().all()]


@router.post("/members/unlock", status_code=status.HTTP_204_NO_CONTENT)
async def unlock_members(body: PasscodeRequest, _: IgniteUser):
    """Check the passcode so the Members page can switch to edit mode."""
    await _check_members_passcode(body.passcode)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(body: MemberCreate, _: IgniteUser, db: DB):
    await _check_members_passcode(body.passcode)
    member = IgniteMember(name=body.name, role=body.role, teams=body.teams)
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return _member_out(member)


@router.patch("/members/{member_id}", response_model=MemberResponse)
async def update_member(member_id: str, body: MemberUpdate, _: IgniteUser, db: DB):
    await _check_members_passcode(body.passcode)
    member = await db.get(IgniteMember, _parse_uuid(member_id, "Member"))
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    for field, value in body.model_dump(exclude_unset=True, exclude={"passcode"}).items():
        # role can be cleared; name, teams and is_active can't be null
        if value is not None or field == "role":
            setattr(member, field, value)
    await db.commit()
    await db.refresh(member)
    return _member_out(member)


# ---- Projects ---------------------------------------------------------------


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(_: IgniteUser, db: DB):
    q = select(IgniteProject).order_by(IgniteProject.status, IgniteProject.created_at)
    return [_project_out(p) for p in (await db.execute(q)).scalars().all()]


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, _: IgniteUser, db: DB):
    project = IgniteProject(name=body.name, description=body.description, created_by=body.actor)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return _project_out(project)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, body: ProjectUpdate, _: IgniteUser, db: DB):
    project = await db.get(IgniteProject, _parse_uuid(project_id, "Project"))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        # description can be cleared; name and status can't be null
        if value is not None or field == "description":
            setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return _project_out(project)


# ---- Tasks ------------------------------------------------------------------


@router.get("/tasks", response_model=list[TaskResponse])
async def list_tasks(
    _: IgniteUser,
    db: DB,
    team: Team | None = None,
    status_: Annotated[Status | None, Query(alias="status")] = None,
    priority: Priority | None = None,
    assignee_id: str | None = None,
    project_id: str | None = None,
):
    q = select(IgniteTask).order_by(IgniteTask.due_date.asc().nulls_last(), IgniteTask.created_at.desc())
    if team:
        q = q.where(IgniteTask.team == team)
    if status_:
        q = q.where(IgniteTask.status == status_)
    if priority:
        q = q.where(IgniteTask.priority == priority)
    if project_id:
        q = q.where(IgniteTask.project_id == _parse_uuid(project_id, "Project"))
    if assignee_id:
        q = q.join(ignite_task_assignees).where(
            ignite_task_assignees.c.member_id == _parse_uuid(assignee_id, "Member")
        )
    return [_task_out(t) for t in (await db.execute(q)).scalars().all()]


@router.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(body: TaskCreate, _: IgniteUser, db: DB):
    project = await _load_project(db, body.project_id, require_active=True)
    task = IgniteTask(
        project_id=project.id,
        title=body.title,
        description=body.description,
        team=body.team,
        status=body.status,
        progress=body.progress,
        priority=body.priority,
        due_date=body.due_date,
        created_by=body.actor,
        updated_by=body.actor,
    )
    task.assignees = await _load_members(db, body.assignee_ids)
    task.depends_on = await _load_dependencies(db, body.depends_on_ids, task_id=None)
    # the form always sends both; an explicit Finished/Not started wins
    _sync_status_progress(task, status_set=body.status in ("done", "not_started"), progress_set=True)
    db.add(task)
    await db.commit()
    return _task_out(await _get_task(db, str(task.id)))


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, body: TaskUpdate, _: IgniteUser, db: DB):
    task = await _get_task(db, task_id)
    data = body.model_dump(exclude_unset=True)
    actor = data.pop("actor", None)
    assignee_ids = data.pop("assignee_ids", None)
    depends_on_ids = data.pop("depends_on_ids", None)
    project_id = data.pop("project_id", None)

    for field, value in data.items():
        setattr(task, field, value)
    if assignee_ids is not None:
        task.assignees = await _load_members(db, assignee_ids)
    if depends_on_ids is not None:
        task.depends_on = await _load_dependencies(db, depends_on_ids, task_id=task.id)
    if project_id is not None and _parse_uuid(project_id, "Project") != task.project_id:
        # moving a task needs an active project; keeping it where it is doesn't
        task.project_id = (await _load_project(db, project_id, require_active=True)).id

    _sync_status_progress(
        task,
        status_set=data.get("status") is not None,
        progress_set=data.get("progress") is not None,
    )
    task.updated_by = actor
    await db.commit()
    db.expire(task)
    return _task_out(await _get_task(db, task_id))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, _: IgniteUser, db: DB):
    task = await _get_task(db, task_id)
    await db.delete(task)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
