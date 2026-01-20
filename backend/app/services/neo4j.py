from neo4j import GraphDatabase, Driver

from app.core.config import settings


def create_driver() -> Driver:
    return GraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
    )
