import pytest
import json
import requests
import app as main_app

@pytest.mark.unit
def test_index_page(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"<!DOCTYPE html>" in res.data or b"html" in res.data.lower()

@pytest.mark.unit
def test_get_version(client):
    res = client.get("/api/version")
    assert res.status_code == 200
    assert "version" in res.get_json()

@pytest.mark.unit
def test_settings_get_post(client):
    # GET settings initial (should be empty/default)
    res_get = client.get("/api/settings")
    assert res_get.status_code == 200
    
    # POST settings
    payload = {"theme": "dark", "zoom": 1.2}
    res_post = client.post("/api/settings", json=payload)
    assert res_post.status_code == 200
    assert res_post.get_json()["success"] is True
    
    # GET settings should now contain theme and zoom inside settings key
    res_get2 = client.get("/api/settings")
    data = res_get2.get_json()
    assert data["success"] is True
    assert data["settings"]["theme"] == "dark"
    assert data["settings"]["zoom"] == 1.2

@pytest.mark.unit
def test_disclaimer_accept(client):
    # Initially not accepted
    res_get = client.get("/api/disclaimer")
    assert res_get.status_code == 200
    assert res_get.get_json()["accepted"] is False
    
    # Accept it
    res_post = client.post("/api/disclaimer/accept")
    assert res_post.status_code == 200
    assert res_post.get_json()["success"] is True
    
    # Check accepted
    res_get2 = client.get("/api/disclaimer")
    assert res_get2.get_json()["accepted"] is True

@pytest.mark.unit
def test_fifo_agreement_accept(client):
    # Initially not accepted
    res_get = client.get("/api/fifo-agreement")
    assert res_get.status_code == 200
    assert res_get.get_json()["accepted"] is False
    
    # Accept it
    res_post = client.post("/api/fifo-agreement/accept")
    assert res_post.status_code == 200
    assert res_post.get_json()["success"] is True
    
    # Check accepted
    res_get2 = client.get("/api/fifo-agreement")
    assert res_get2.get_json()["accepted"] is True

@pytest.mark.unit
def test_heartbeat(client):
    res = client.post("/api/heartbeat")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

@pytest.mark.unit
def test_focus(client, monkeypatch):
    class MockWindow:
        def show(self):
            pass
        def restore(self):
            pass
            
    # Mock webview_window on main_app.state
    monkeypatch.setattr(main_app.state, "webview_window", MockWindow())
    
    res = client.post("/api/focus")
    assert res.status_code == 200
    assert res.get_json()["success"] is True

@pytest.mark.unit
def test_check_update(client, monkeypatch):
    class MockResponse:
        def raise_for_status(self):
            pass
        def json(self):
            return {
                "tag_name": "v2.0.0",
                "html_url": "http://github.com",
                "name": "v2.0.0 Release",
                "published_at": "2026-01-01T00:00:00Z"
            }
            
    monkeypatch.setattr(requests, "get", lambda url, headers=None, timeout=None: MockResponse())
    res = client.get("/api/check-update")
    assert res.status_code == 200
    assert "update_available" in res.get_json()
