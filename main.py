"""
Trip Planner – FastAPI backend with SQLite3 storage
"""

import sqlite3
import uuid
import os
from contextlib import contextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(title="Trip Planner API")

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

DB_PATH = os.path.join(os.path.dirname(__file__), "trips.db")


@contextmanager
def get_db():
    """Yield a SQLite connection and guarantee it is closed afterwards."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


# Sentinel used to sort activities without a time after all timed activities.
EMPTY_TIME_SORT_VALUE = "99:99"


def init_db() -> None:
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS trips (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            destination TEXT NOT NULL DEFAULT '',
            start_date  TEXT NOT NULL DEFAULT '',
            end_date    TEXT NOT NULL DEFAULT '',
            notes       TEXT NOT NULL DEFAULT '',
            created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS days (
            id         TEXT PRIMARY KEY,
            trip_id    TEXT NOT NULL,
            label      TEXT NOT NULL,
            date       TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activities (
            id         TEXT PRIMARY KEY,
            day_id     TEXT NOT NULL,
            title      TEXT NOT NULL,
            time       TEXT NOT NULL DEFAULT '',
            note       TEXT NOT NULL DEFAULT '',
            done       INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (day_id) REFERENCES days(id) ON DELETE CASCADE
        );
    """)
        conn.commit()


init_db()

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class TripCreate(BaseModel):
    name: str
    destination: Optional[str] = ""
    startDate: Optional[str] = ""
    endDate: Optional[str] = ""
    notes: Optional[str] = ""


class TripUpdate(BaseModel):
    name: str
    destination: Optional[str] = ""
    startDate: Optional[str] = ""
    endDate: Optional[str] = ""
    notes: Optional[str] = ""


class DayCreate(BaseModel):
    label: str
    date: Optional[str] = ""


class DayUpdate(BaseModel):
    label: str
    date: Optional[str] = ""


class ActivityCreate(BaseModel):
    title: str
    time: Optional[str] = ""
    note: Optional[str] = ""


class ActivityUpdate(BaseModel):
    title: str
    time: Optional[str] = ""
    note: Optional[str] = ""


# ---------------------------------------------------------------------------
# Data-assembly helper
# ---------------------------------------------------------------------------


def _build_trip(conn: sqlite3.Connection, trip_id: str) -> Optional[dict]:
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        return None

    trip = {
        "id":          row["id"],
        "name":        row["name"],
        "destination": row["destination"],
        "startDate":   row["start_date"],
        "endDate":     row["end_date"],
        "notes":       row["notes"],
        "days":        [],
    }

    day_rows = conn.execute(
        "SELECT * FROM days WHERE trip_id = ? ORDER BY sort_order",
        (trip_id,),
    ).fetchall()

    for day_row in day_rows:
        day = {
            "id":    day_row["id"],
            "label": day_row["label"],
            "date":  day_row["date"],
            "activities": [],
        }

        act_rows = conn.execute(
            """SELECT * FROM activities WHERE day_id = ?
               ORDER BY
                 CASE WHEN time = '' OR time IS NULL THEN ? ELSE time END,
                 sort_order""",
            (day_row["id"], EMPTY_TIME_SORT_VALUE),
        ).fetchall()

        for act_row in act_rows:
            day["activities"].append({
                "id":    act_row["id"],
                "title": act_row["title"],
                "time":  act_row["time"],
                "note":  act_row["note"],
                "done":  bool(act_row["done"]),
            })

        trip["days"].append(day)

    return trip


# ---------------------------------------------------------------------------
# Trip endpoints
# ---------------------------------------------------------------------------


@app.get("/api/trips")
def list_trips():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id FROM trips ORDER BY created_at DESC"
        ).fetchall()
        return [_build_trip(conn, r["id"]) for r in rows]


@app.post("/api/trips", status_code=201)
def create_trip(body: TripCreate):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    with get_db() as conn:
        trip_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO trips (id, name, destination, start_date, end_date, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (trip_id, body.name.strip(), body.destination or "",
             body.startDate or "", body.endDate or "", body.notes or ""),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: str):
    with get_db() as conn:
        trip = _build_trip(conn, trip_id)
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
        return trip


@app.put("/api/trips/{trip_id}")
def update_trip(trip_id: str, body: TripUpdate):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    with get_db() as conn:
        if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Trip not found")
        conn.execute(
            """UPDATE trips
               SET name = ?, destination = ?, start_date = ?, end_date = ?, notes = ?
               WHERE id = ?""",
            (body.name.strip(), body.destination or "",
             body.startDate or "", body.endDate or "", body.notes or "", trip_id),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.delete("/api/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: str):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Trip not found")
        conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
        conn.commit()


# ---------------------------------------------------------------------------
# Day endpoints
# ---------------------------------------------------------------------------


@app.post("/api/trips/{trip_id}/days", status_code=201)
def add_day(trip_id: str, body: DayCreate):
    if not body.label.strip():
        raise HTTPException(status_code=422, detail="label is required")
    with get_db() as conn:
        if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Trip not found")
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) FROM days WHERE trip_id = ?", (trip_id,)
        ).fetchone()[0]
        day_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO days (id, trip_id, label, date, sort_order) VALUES (?, ?, ?, ?, ?)",
            (day_id, trip_id, body.label.strip(), body.date or "", max_order + 1),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.put("/api/trips/{trip_id}/days/{day_id}")
def update_day(trip_id: str, day_id: str, body: DayUpdate):
    if not body.label.strip():
        raise HTTPException(status_code=422, detail="label is required")
    with get_db() as conn:
        if not conn.execute(
            "SELECT id FROM days WHERE id = ? AND trip_id = ?", (day_id, trip_id)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Day not found")
        conn.execute(
            "UPDATE days SET label = ?, date = ? WHERE id = ?",
            (body.label.strip(), body.date or "", day_id),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.delete("/api/trips/{trip_id}/days/{day_id}", status_code=204)
def delete_day(trip_id: str, day_id: str):
    with get_db() as conn:
        if not conn.execute(
            "SELECT id FROM days WHERE id = ? AND trip_id = ?", (day_id, trip_id)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Day not found")
        conn.execute("DELETE FROM days WHERE id = ?", (day_id,))
        conn.commit()


# ---------------------------------------------------------------------------
# Activity endpoints
# ---------------------------------------------------------------------------


@app.post("/api/trips/{trip_id}/days/{day_id}/activities", status_code=201)
def add_activity(trip_id: str, day_id: str, body: ActivityCreate):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    with get_db() as conn:
        if not conn.execute(
            "SELECT id FROM days WHERE id = ? AND trip_id = ?", (day_id, trip_id)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Day not found")
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) FROM activities WHERE day_id = ?", (day_id,)
        ).fetchone()[0]
        act_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO activities (id, day_id, title, time, note, done, sort_order)
               VALUES (?, ?, ?, ?, ?, 0, ?)""",
            (act_id, day_id, body.title.strip(), body.time or "", body.note or "", max_order + 1),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.put("/api/trips/{trip_id}/days/{day_id}/activities/{act_id}")
def update_activity(trip_id: str, day_id: str, act_id: str, body: ActivityUpdate):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    with get_db() as conn:
        if not conn.execute(
            "SELECT id FROM activities WHERE id = ? AND day_id = ?", (act_id, day_id)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Activity not found")
        conn.execute(
            "UPDATE activities SET title = ?, time = ?, note = ? WHERE id = ?",
            (body.title.strip(), body.time or "", body.note or "", act_id),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


@app.delete("/api/trips/{trip_id}/days/{day_id}/activities/{act_id}", status_code=204)
def delete_activity(trip_id: str, day_id: str, act_id: str):
    with get_db() as conn:
        if not conn.execute(
            "SELECT id FROM activities WHERE id = ? AND day_id = ?", (act_id, day_id)
        ).fetchone():
            raise HTTPException(status_code=404, detail="Activity not found")
        conn.execute("DELETE FROM activities WHERE id = ?", (act_id,))
        conn.commit()


@app.patch("/api/trips/{trip_id}/days/{day_id}/activities/{act_id}/toggle")
def toggle_activity(trip_id: str, day_id: str, act_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, done FROM activities WHERE id = ? AND day_id = ?", (act_id, day_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Activity not found")
        conn.execute(
            "UPDATE activities SET done = ? WHERE id = ?",
            (0 if row["done"] else 1, act_id),
        )
        conn.commit()
        return _build_trip(conn, trip_id)


# ---------------------------------------------------------------------------
# Static file serving  (must come after all /api routes)
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(__file__)
app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "css")), name="css")
app.mount("/js",  StaticFiles(directory=os.path.join(BASE_DIR, "js")),  name="js")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))
