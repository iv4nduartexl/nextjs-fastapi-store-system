import pytest
from fastapi import status


class TestPasswordValidation:
    """Password rules (app/users.py validate_password), exercised through /auth/change-password.

    Public registration was removed; accounts are created by owners or the superuser.
    """

    @pytest.mark.parametrize(
        "new_password, expected_reasons",
        [
            ("short", ["Password should be at least 8 characters."]),
            ("test@example.com", ["Password should not contain e-mail."]),
            ("lowercasepassword", ["Password should contain at least one uppercase letter."]),
            ("Nosppecialchar1", ["Password should contain at least one special character."]),
            (
                "shrt",
                [
                    "Password should be at least 8 characters.",
                    "Password should contain at least one uppercase letter.",
                    "Password should contain at least one special character.",
                ],
            ),
        ],
    )
    @pytest.mark.asyncio(loop_scope="function")
    async def test_password_validation(self, test_client, authenticated_user, new_password, expected_reasons):
        response = await test_client.post(
            "/auth/change-password",
            json={"current_password": authenticated_user["user_data"]["password"], "new_password": new_password},
            headers=authenticated_user["headers"],
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        detail = response.json()["detail"]
        assert detail["code"] == "invalid_password"
        # The validator reports every broken rule; the expected ones must be among them
        assert set(expected_reasons) <= set(detail["reasons"])

    @pytest.mark.asyncio(loop_scope="function")
    async def test_change_password_with_valid_password(self, test_client, authenticated_user):
        response = await test_client.post(
            "/auth/change-password",
            json={"current_password": authenticated_user["user_data"]["password"], "new_password": "Sppecialchar1#"},
            headers=authenticated_user["headers"],
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["access_token"]

        login = await test_client.post(
            "/auth/jwt/login", data={"username": "test@example.com", "password": "Sppecialchar1#"}
        )
        assert login.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio(loop_scope="function")
    async def test_public_registration_is_closed(self, test_client):
        response = await test_client.post(
            "/auth/register", json={"email": "user@1.com", "password": "Sppecialchar1#"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
