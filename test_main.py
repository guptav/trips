"""
Basic API tests for the Trip Planner backend.

Run with:  make test
"""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def trip_id():
    """Create a trip and return its id."""
    payload = {"name": "Test Trip", "destination": "Paris", "startDate": "2026-06-01", "endDate": "2026-06-10"}
    resp = client.post("/api/trips", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture
def day_id(trip_id):
    """Add a day to the trip fixture and return (trip_id, day_id)."""
    resp = client.post(f"/api/trips/{trip_id}/days", json={"label": "Day 1", "date": "2026-06-01"})
    assert resp.status_code == 201
    return trip_id, resp.json()["days"][0]["id"]


@pytest.fixture
def activity_id(day_id):
    """Add an activity to the day fixture and return (trip_id, day_id, act_id)."""
    trip_id, d_id = day_id
    resp = client.post(
        f"/api/trips/{trip_id}/days/{d_id}/activities",
        json={"title": "Visit Eiffel Tower", "time": "10:00", "note": "Book tickets in advance"},
    )
    assert resp.status_code == 201
    act_id = resp.json()["days"][0]["activities"][0]["id"]
    return trip_id, d_id, act_id


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------

def test_list_trips_empty():
    response = client.get("/api/trips")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_trip(trip_id):
    assert trip_id is not None
    response = client.get(f"/api/trips/{trip_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Trip"
    assert data["destination"] == "Paris"


def test_create_trip_missing_name():
    response = client.post("/api/trips", json={"name": "  "})
    assert response.status_code == 422


def test_get_trip(trip_id):
    response = client.get(f"/api/trips/{trip_id}")
    assert response.status_code == 200
    assert response.json()["id"] == trip_id


def test_get_trip_not_found():
    response = client.get("/api/trips/nonexistent-id")
    assert response.status_code == 404


def test_update_trip(trip_id):
    response = client.put(f"/api/trips/{trip_id}", json={"name": "Updated Trip", "destination": "Rome"})
    assert response.status_code == 200
    assert response.json()["name"] == "Updated Trip"


def test_delete_trip(trip_id):
    response = client.delete(f"/api/trips/{trip_id}")
    assert response.status_code == 204
    assert client.get(f"/api/trips/{trip_id}").status_code == 404


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------

def test_add_day(day_id):
    trip_id, d_id = day_id
    days = client.get(f"/api/trips/{trip_id}").json()["days"]
    assert len(days) == 1
    assert days[0]["label"] == "Day 1"


def test_update_day(day_id):
    trip_id, d_id = day_id
    response = client.put(f"/api/trips/{trip_id}/days/{d_id}", json={"label": "Day One", "date": "2026-06-01"})
    assert response.status_code == 200
    assert response.json()["days"][0]["label"] == "Day One"


def test_delete_day(day_id):
    trip_id, d_id = day_id
    response = client.delete(f"/api/trips/{trip_id}/days/{d_id}")
    assert response.status_code == 204
    assert client.get(f"/api/trips/{trip_id}").json()["days"] == []


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------

def test_add_activity(activity_id):
    trip_id, d_id, act_id = activity_id
    activities = client.get(f"/api/trips/{trip_id}").json()["days"][0]["activities"]
    assert len(activities) == 1
    assert activities[0]["title"] == "Visit Eiffel Tower"


def test_update_activity(activity_id):
    trip_id, d_id, act_id = activity_id
    response = client.put(
        f"/api/trips/{trip_id}/days/{d_id}/activities/{act_id}",
        json={"title": "Visit Louvre", "time": "14:00"},
    )
    assert response.status_code == 200
    assert response.json()["days"][0]["activities"][0]["title"] == "Visit Louvre"


def test_toggle_activity(activity_id):
    trip_id, d_id, act_id = activity_id
    response = client.patch(f"/api/trips/{trip_id}/days/{d_id}/activities/{act_id}/toggle")
    assert response.status_code == 200
    assert response.json()["days"][0]["activities"][0]["done"] is True


def test_delete_activity(activity_id):
    trip_id, d_id, act_id = activity_id
    response = client.delete(f"/api/trips/{trip_id}/days/{d_id}/activities/{act_id}")
    assert response.status_code == 204
    assert client.get(f"/api/trips/{trip_id}").json()["days"][0]["activities"] == []


# ---------------------------------------------------------------------------
# Static routes
# ---------------------------------------------------------------------------

def test_serve_index():
    response = client.get("/")
    assert response.status_code == 200
