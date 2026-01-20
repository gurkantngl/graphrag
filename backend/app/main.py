from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.config import settings
from app.services.llm import check_gemini, get_llm_config
from app.services.meta import get_filters
from app.services.neo4j import create_driver
from app.services.query import run_query
from app.services.seed import load_seed

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    app.state.neo4j_driver = create_driver()


@app.on_event("shutdown")
def on_shutdown() -> None:
    driver = app.state.neo4j_driver
    driver.close()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/neo4j/ping")
def neo4j_ping() -> dict:
    driver = app.state.neo4j_driver
    with driver.session() as session:
        result = session.run("RETURN 1 AS ok").single()
    return {"ok": result["ok"]}


@app.post("/seed/load")
def seed_load(reset: bool = False) -> dict:
    return load_seed(app.state.neo4j_driver, reset=reset)


@app.get("/meta/filters")
def meta_filters() -> dict:
    return get_filters(app.state.neo4j_driver)


@app.get("/llm/check")
def llm_check() -> dict:
    return check_gemini()


@app.get("/llm/config")
def llm_config() -> dict:
    return get_llm_config()


class QueryRequest(BaseModel):
    query: str
    limit: int = 5
    role: str | None = None
    policy: str | None = None
    tag: str | None = None
    use_llm: bool = False


@app.post("/query")
def query_graphrag(payload: QueryRequest) -> dict:
    return run_query(
        app.state.neo4j_driver,
        payload.query,
        limit=payload.limit,
        role=payload.role,
        policy=payload.policy,
        tag=payload.tag,
        use_llm=payload.use_llm,
    )
