"""Shared helpers for direct-mode tests."""

from datetime import datetime, timezone


def to_hex(addr_bytes):
    """Return the checksummed address string used by GenLayer views."""
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex


def deadline_from(vm, seconds=3600):
    """Build a deadline for the fixed timestamp used by these tests."""
    return int(datetime(2024, 6, 1, 12, 0, tzinfo=timezone.utc).timestamp()) + seconds
