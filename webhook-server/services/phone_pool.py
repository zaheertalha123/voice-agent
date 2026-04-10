"""Phone number pool management (inbound/outbound by organization)."""

from typing import Dict, List, Optional, Set

from loguru import logger

from .supabase_client import fetch_all_organization_ids, fetch_phone_numbers_for_org


class PhonePool:
    """Inbound and outbound phone lists keyed by org_id."""

    def __init__(self) -> None:
        self.inbound_pool: Dict[str, List[str]] = {}
        self.outbound_pool: Dict[str, List[str]] = {}
        # Same E.164 may be both inbound and outbound; track all directions per number
        self.phone_directions: Dict[str, Set[str]] = {}

    async def initialize(self) -> bool:
        """Load organizations, then phone numbers per org, into per-org pools."""
        logger.info("Initializing phone pools from Supabase...")

        try:
            self.inbound_pool.clear()
            self.outbound_pool.clear()
            self.phone_directions.clear()

            org_ids = await fetch_all_organization_ids()
            if not org_ids:
                logger.info("No organizations found in database")
                return True

            for org_id in org_ids:
                self.inbound_pool[org_id] = []
                self.outbound_pool[org_id] = []

                phone_records = await fetch_phone_numbers_for_org(org_id)
                for phone_record in phone_records:
                    phone_number = phone_record["phone_number"]
                    direction = phone_record.get("direction", "inbound")
                    if hasattr(direction, "value"):
                        direction = direction.value
                    direction = str(direction).lower()

                    if phone_number not in self.phone_directions:
                        self.phone_directions[phone_number] = set()
                    self.phone_directions[phone_number].add(direction)

                    if direction == "inbound":
                        self.inbound_pool[org_id].append(phone_number)
                    elif direction == "outbound":
                        self.outbound_pool[org_id].append(phone_number)

            total_inbound = sum(len(numbers) for numbers in self.inbound_pool.values())
            total_outbound = sum(len(numbers) for numbers in self.outbound_pool.values())
            total_orgs = len(org_ids)

            logger.info(
                f"Phone pools initialized: {total_inbound} inbound, "
                f"{total_outbound} outbound across {total_orgs} organizations"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to initialize phone pools: {e}")
            return False

    async def refresh(self) -> bool:
        """Re-fetch from the database."""
        logger.info("Refreshing phone pools...")
        return await self.initialize()

    def get_inbound_numbers(self, org_id: str) -> List[str]:
        return self.inbound_pool.get(org_id, [])

    def get_outbound_numbers(self, org_id: str) -> List[str]:
        return self.outbound_pool.get(org_id, [])

    def get_phone_direction(self, phone_number: str) -> Optional[str]:
        """Return 'both' if the number is used for inbound and outbound; else inbound or outbound."""
        dirs = self.phone_directions.get(phone_number)
        if not dirs:
            return None
        if len(dirs) >= 2:
            return "both"
        return next(iter(dirs))

    def get_stats(self) -> dict:
        total_inbound = sum(len(numbers) for numbers in self.inbound_pool.values())
        total_outbound = sum(len(numbers) for numbers in self.outbound_pool.values())
        total_orgs = len(set(self.inbound_pool.keys()) | set(self.outbound_pool.keys()))

        return {
            "total_inbound": total_inbound,
            "total_outbound": total_outbound,
            "total_organizations": total_orgs,
            "inbound_pool": self.inbound_pool,
            "outbound_pool": self.outbound_pool,
        }


async def refresh_phone_pools(phone_pool: PhonePool) -> dict:
    """Refresh pools and return summary stats."""
    logger.info("Refreshing phone pools from Supabase...")

    success = await phone_pool.refresh()
    if not success:
        raise RuntimeError("Failed to refresh phone pools")

    stats = phone_pool.get_stats()
    logger.info(
        f"Phone pools refreshed: {stats['total_inbound']} inbound, "
        f"{stats['total_outbound']} outbound"
    )

    return {
        "status": "success",
        "message": "Phone pools refreshed successfully",
        "stats": {
            "total_inbound": stats["total_inbound"],
            "total_outbound": stats["total_outbound"],
            "total_organizations": stats["total_organizations"],
        },
    }


async def get_pool_statistics(phone_pool: PhonePool, room_pool) -> dict:
    """Combine phone and Daily room pool stats."""
    phone_stats = phone_pool.get_stats()
    room_stats = room_pool.get_stats()

    return {
        "status": "success",
        "stats": {
            "rooms": {
                "available": room_stats["available_rooms"],
                "total": room_stats["total_rooms"],
                "health": room_stats["health_percentage"],
            },
            "phone": {
                "total_inbound": phone_stats["total_inbound"],
                "total_outbound": phone_stats["total_outbound"],
            },
        },
    }
