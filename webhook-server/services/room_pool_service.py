"""Pre-created Daily room pool for dial-out / dial-in."""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import aiohttp
from loguru import logger

from schemas import DailyRoomConfig, DailyRoomProperties, DailyRoomSipParams
from services.daily_room import (
    ROOM_EXPIRY_HOURS,
    ROOM_EXPIRY_SECONDS,
    configure,
    default_expiration_timestamp,
)

_room_pool_singleton: Optional["RoomPool"] = None


class RoomPool:
    """List-backed pool of Daily rooms (FIFO get / append return)."""

    def __init__(self, pool_size: int) -> None:
        self.pool_size = pool_size
        self.available_rooms: list[DailyRoomConfig] = []
        self.room_pool_origin: dict[str, Any] = {}
        self.pool_created_at: float | None = None
        self.initialized = False

    async def initialize(
        self, session: aiohttp.ClientSession, for_dialout: bool = False
    ) -> None:
        """Pre-create rooms and populate the pool."""
        if self.initialized:
            logger.debug(
                "RoomPool.initialize skipped (already initialized, {} rooms available)",
                len(self.available_rooms),
            )
            return

        await self._create_new_pool(session, for_dialout=for_dialout)
        self.initialized = True

    async def _create_new_pool(
        self, session: aiohttp.ClientSession, for_dialout: bool = False
    ) -> None:
        """Create a fresh pool of rooms."""
        self.available_rooms.clear()
        self.room_pool_origin.clear()
        self.pool_created_at = time.time()
        expiration_time = self.pool_created_at + ROOM_EXPIRY_SECONDS

        room_type = "dial-out" if for_dialout else "dial-in"
        logger.info(
            "Creating new {} room pool (size={} expiry_ts={} expiry_window={}h)",
            room_type,
            self.pool_size,
            int(expiration_time),
            ROOM_EXPIRY_HOURS,
        )

        for i in range(self.pool_size):
            try:
                logger.debug(
                    "RoomPool creating slot {}/{} ({})",
                    i + 1,
                    self.pool_size,
                    room_type,
                )
                room = await self._create_room(
                    session, expiration_time, caller_phone=None, for_dialout=for_dialout
                )
                self.available_rooms.append(room)
                self.room_pool_origin[room.room_url] = {
                    "slot": i,
                    "for_dialout": for_dialout,
                    "pool_created_at": self.pool_created_at,
                }
                logger.debug(
                    "RoomPool slot {} ready url={}",
                    i + 1,
                    room.room_url,
                )
            except Exception as e:
                logger.error("Failed to create room {}: {}", i + 1, e)

        logger.info(
            f"{room_type.replace('-', ' ').title()} pool created with {len(self.available_rooms)} rooms"
        )

    async def _create_room(
        self,
        session: aiohttp.ClientSession,
        expiration_time: float,
        caller_phone: str | None = None,
        for_dialout: bool = False,
    ) -> DailyRoomConfig:
        """Create a Daily room for PSTN dial-in or dial-out."""
        exp_int = int(expiration_time)
        logger.debug(
            "_create_room for_dialout={} exp_int={} caller_phone={}",
            for_dialout,
            exp_int,
            caller_phone or "(none)",
        )

        if for_dialout:
            room_properties = DailyRoomProperties(
                exp=exp_int,
                eject_at_room_exp=True,
                enable_dialout=True,
                start_video_off=True,
                enable_chat=False,
                enable_emoji_reactions=False,
                enable_prejoin_ui=False,
                dialout_config={"allow_room_start": True},
            )
        else:
            room_properties = DailyRoomProperties(
                exp=exp_int,
                eject_at_room_exp=True,
                enable_dialout=False,
                start_video_off=True,
                enable_chat=False,
                enable_emoji_reactions=False,
                enable_prejoin_ui=False,
                sip=DailyRoomSipParams(
                    display_name=caller_phone or "Pool Room",
                    video=False,
                    sip_mode="dial-in",
                    num_endpoints=1,
                ),
            )

        return await configure(
            session,
            sip_caller_phone=caller_phone,
            room_properties=room_properties,
            token_exp_duration=float(ROOM_EXPIRY_HOURS),
        )

    async def get_room(
        self, session: aiohttp.ClientSession, for_dialout: bool = True
    ) -> DailyRoomConfig:
        """Take one room from the pool (non-blocking; raises if empty)."""
        _ = session
        _ = for_dialout
        if not self.available_rooms:
            logger.warning("RoomPool.get_room: pool empty (size={})", self.pool_size)
            raise RuntimeError("No rooms available in pool")
        room = self.available_rooms.pop(0)
        logger.info(
            "RoomPool.get_room: taken (remaining={}/{}) url={}",
            len(self.available_rooms),
            self.pool_size,
            room.room_url,
        )
        return room

    async def return_room(self, room: DailyRoomConfig) -> None:
        """Return a room to the pool after a call ends."""
        self.available_rooms.append(room)
        logger.debug(
            "RoomPool.return_room: returned (available={}/{}) url={}",
            len(self.available_rooms),
            self.pool_size,
            room.room_url,
        )

    def get_stats(self) -> dict:
        available = len(self.available_rooms)
        total = self.pool_size
        health = (available / total * 100.0) if total else 0.0
        return {
            "available_rooms": available,
            "total_rooms": total,
            "health_percentage": round(health, 1),
        }


async def create_ephemeral_daily_room(session: aiohttp.ClientSession) -> DailyRoomConfig:
    """Create a new Daily room and token (not from the pool)."""
    logger.info("Creating ephemeral Daily room (dial-out, outside pool)")
    exp = default_expiration_timestamp()
    room_properties = DailyRoomProperties(
        exp=int(exp),
        eject_at_room_exp=True,
        enable_dialout=True,
        start_video_off=True,
        enable_chat=False,
        enable_emoji_reactions=False,
        enable_prejoin_ui=False,
        dialout_config={"allow_room_start": True},
    )
    cfg = await configure(
        session,
        sip_caller_phone=None,
        room_properties=room_properties,
        token_exp_duration=float(ROOM_EXPIRY_HOURS),
    )
    logger.info("Ephemeral Daily room ready url={}", cfg.room_url)
    return cfg


def get_room_pool(pool_size: int | None = None) -> RoomPool:
    """Singleton ``RoomPool``; ``pool_size`` applies only on first call."""
    global _room_pool_singleton
    if _room_pool_singleton is None:
        size = pool_size if pool_size is not None else int(os.getenv("ROOM_POOL_SIZE", "3"))
        logger.debug("get_room_pool: creating singleton with pool_size={}", size)
        _room_pool_singleton = RoomPool(pool_size=size)
    return _room_pool_singleton
