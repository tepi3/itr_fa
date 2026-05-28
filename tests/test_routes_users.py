import pytest
import json

@pytest.mark.unit
def test_create_and_list_users(client):
    # Create user
    res_create = client.post("/api/users", json={"username": "Alice"})
    assert res_create.status_code == 200
    assert res_create.get_json()["username"] == "Alice"
    
    # List users
    res_list = client.get("/api/users")
    assert res_list.status_code == 200
    users = res_list.get_json()["users"]
    assert "Alice" in users

@pytest.mark.unit
def test_create_user_missing_username(client):
    res = client.post("/api/users", json={})
    assert res.status_code == 400

@pytest.mark.unit
def test_rename_user(client):
    # Create user
    client.post("/api/users", json={"username": "Bob"})
    
    # Rename
    res_rename = client.put("/api/users/Bob", json={"new_username": "Bobby"})
    assert res_rename.status_code == 200
    assert res_rename.get_json()["username"] == "Bobby"
    
    # Check that Bobby exists and Bob is gone
    res_list = client.get("/api/users")
    users = res_list.get_json()["users"]
    assert "Bobby" in users
    assert "Bob" not in users

@pytest.mark.unit
def test_rename_user_not_found(client):
    res = client.put("/api/users/NonExistent", json={"new_username": "NewName"})
    assert res.status_code == 404

@pytest.mark.unit
def test_delete_user(client):
    # Create
    client.post("/api/users", json={"username": "Charlie"})
    
    # Delete
    res_delete = client.delete("/api/users/Charlie")
    assert res_delete.status_code == 200
    
    # Check gone
    res_list = client.get("/api/users")
    users = res_list.get_json()["users"]
    assert "Charlie" not in users

@pytest.mark.unit
def test_delete_user_not_found(client):
    res = client.delete("/api/users/NonExistent")
    assert res.status_code == 404

@pytest.mark.unit
def test_setup_demo(client):
    res = client.post("/api/users/setup-demo")
    assert res.status_code == 200
    assert res.get_json()["username"] == "DemoUser"
    
    # Verify the saved portfolio exists for DemoUser
    res_load = client.get("/api/load?year=2025&username=DemoUser")
    assert res_load.status_code == 200
    assert res_load.get_json()["portfolio"]["calendar_year"] == 2025
