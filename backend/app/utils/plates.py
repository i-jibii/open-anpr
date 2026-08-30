"""Shared license plate normalization."""

from typing import Optional


def normalize_plate_key(plate: Optional[str]) -> str:
    """Uppercase, remove all whitespace — stable key for DB comparison."""
    if not plate:
        return ""
    return "".join(plate.upper().split())


def format_plate_display(plate: Optional[str]) -> str:
    """Human-friendly: single spaces between tokens."""
    if not plate:
        return ""
    return " ".join(plate.upper().split())
