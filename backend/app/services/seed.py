from __future__ import annotations

from pathlib import Path
from typing import Any

from neo4j import Driver


SEED_DIR = Path(__file__).resolve().parents[2] / "data" / "seed"


def _parse_seed_text(raw: str) -> dict[str, Any]:
    data: dict[str, Any] = {"tags": []}
    lines = [line.strip() for line in raw.splitlines()]
    text_lines: list[str] = []
    in_text = False

    for line in lines:
        if not line:
            continue
        if in_text:
            text_lines.append(line)
            continue
        if line.lower().startswith("text:"):
            in_text = True
            remainder = line[5:].strip()
            if remainder:
                text_lines.append(remainder)
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key == "tags":
                data["tags"] = [tag.strip() for tag in value.split(",") if tag.strip()]
            else:
                data[key] = value

    data["text"] = " ".join(text_lines).strip()
    return data


def load_seed(driver: Driver, reset: bool = False) -> dict[str, Any]:
    if reset:
        with driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    created = 0
    skipped = 0

    for file_path in sorted(SEED_DIR.glob("*.txt")):
        raw = file_path.read_text(encoding="utf-8")
        seed = _parse_seed_text(raw)

        title = seed.get("title")
        policy = seed.get("policy")
        if not title or not policy:
            skipped += 1
            continue

        doc_id = file_path.stem
        params = {
            "doc_id": doc_id,
            "title": title,
            "source": file_path.name,
            "text": seed.get("text", ""),
            "policy": policy,
            "role": seed.get("role"),
            "exception": seed.get("exception"),
        }

        cypher = """
        MERGE (d:Document {id: $doc_id})
        SET d.title = $title, d.source = $source, d.text = $text
        MERGE (p:Policy {name: $policy})
        MERGE (d)-[:MENTIONS]->(p)
        WITH d, p
        FOREACH (_ IN CASE WHEN $role IS NULL OR $role = '' THEN [] ELSE [1] END |
            MERGE (r:Role {name: $role})
            MERGE (d)-[:MENTIONS]->(r)
            MERGE (r)-[:RESPONSIBLE_FOR]->(p)
        )
        WITH d, p
        FOREACH (_ IN CASE WHEN $exception IS NULL OR $exception = '' THEN [] ELSE [1] END |
            MERGE (e:Exception {name: $exception})
            MERGE (d)-[:MENTIONS]->(e)
            MERGE (p)-[:HAS_EXCEPTION]->(e)
        )
        """

        with driver.session() as session:
            session.run(cypher, params)

        tags = seed.get("tags", [])
        if tags:
            with driver.session() as session:
                session.run(
                    """
                    UNWIND $tags AS tag
                    MERGE (t:Tag {name: tag})
                    WITH t
                    MATCH (d:Document {id: $doc_id})
                    MERGE (d)-[:MENTIONS]->(t)
                    """,
                    {"tags": tags, "doc_id": doc_id},
                )

        created += 1

    return {"created": created, "skipped": skipped}
