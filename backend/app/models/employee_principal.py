"""Core-derived employee principal for Configurator BFF request context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

EmployeeRole = Literal["SUPERADMIN", "ADMIN", "USER", "VIEWER"]


@dataclass(frozen=True)
class AuthenticatedEmployeePrincipal:
    account_id: str
    username: str
    display_name: str
    role: EmployeeRole
    effective_permissions: frozenset[str]

    def has_permission(self, permission_code: str) -> bool:
        if self.role == "SUPERADMIN":
            return True
        return permission_code in self.effective_permissions

    def to_session_json(self) -> dict[str, object]:
        return {
            "account_id": self.account_id,
            "username": self.username,
            "display_name": self.display_name,
            "role": self.role,
        }
