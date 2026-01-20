from __future__ import annotations

from typing import Any

from neo4j import Driver


def get_filters(driver: Driver) -> dict[str, Any]:
    with driver.session() as session:
        roles = session.run("MATCH (r:Role) RETURN collect(DISTINCT r.name) AS items").single()[
            "items"
        ]
        policies = session.run(
            "MATCH (p:Policy) RETURN collect(DISTINCT p.name) AS items"
        ).single()["items"]
        tags = session.run("MATCH (t:Tag) RETURN collect(DISTINCT t.name) AS items").single()[
            "items"
        ]

    return {
        "roles": sorted([item for item in roles if item]),
        "policies": sorted([item for item in policies if item]),
        "tags": sorted([item for item in tags if item]),
    }
