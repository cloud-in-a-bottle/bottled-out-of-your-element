import requests
from openhost_test_harness import OpenhostStack


def test_health(stack: OpenhostStack) -> None:
    response = requests.get(f"{stack.app_url}/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "state": "unconfigured"}


def test_owner_gets_setup_form(stack: OpenhostStack) -> None:
    response = stack.owner_session.get(f"{stack.url}/")
    assert response.status_code == 200
    assert "Set up Out Of Your Element" in response.text
    # The OAuth redirect shown to the owner is built from the public origin the router forwarded.
    assert f"{stack.url}/oauth" in response.text


def test_setup_pages_need_login(stack: OpenhostStack) -> None:
    response = requests.get(f"{stack.url}/_bottle/", allow_redirects=False)
    assert response.status_code != 200
    assert "Set up Out Of Your Element" not in response.text


def test_setup_rejects_bad_input(stack: OpenhostStack) -> None:
    response = stack.owner_session.post(
        f"{stack.url}/_bottle/setup",
        data={
            "server_name": "example.invalid",
            "server_origin": "not a url",
            "admin_contact": "<b>me</b>",
            "discord_token": "",
            "discord_client_secret": "",
        },
    )
    assert response.status_code == 200
    assert "Fix these and submit again" in response.text
    assert "Your Matrix ID should look like @you:example.com" in response.text
    assert requests.get(f"{stack.app_url}/health").json()["state"] == "unconfigured"


def test_admin_contact_needs_setup_first(stack: OpenhostStack) -> None:
    response = stack.owner_session.post(
        f"{stack.url}/_bottle/admin-contact", data={"admin_contact": "@me:example.com"}, allow_redirects=False
    )
    assert response.status_code == 303
    assert requests.get(f"{stack.app_url}/health").json()["state"] == "unconfigured"


def test_appservice_path_is_public(stack: OpenhostStack) -> None:
    # Reaches the app without a login; the bridge itself isn't running until setup is done.
    response = requests.post(f"{stack.url}/_matrix/app/v1/ping", json={}, allow_redirects=False)
    assert response.status_code == 503
    assert "Bridge not running" in response.text


def test_bridge_ui_is_private(stack: OpenhostStack) -> None:
    for path in ["/guild", "/api/link", "/oauth"]:
        response = requests.get(f"{stack.url}{path}", allow_redirects=False)
        assert "Bridge not running" not in response.text, path
