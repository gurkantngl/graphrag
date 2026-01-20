# Backend

## Neo4j (Docker)

Repo kok dizininde:

```
docker compose up -d
```

Neo4j Browser: http://localhost:7474

Varsayilan kullanici/sifre: `neo4j` / `neo4jpass`

## Uygulama

```
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --app-dir backend
```

## LLM ozet (opsiyonel)

- `GEMINI_API_KEY` ayarla
- `GEMINI_MODEL` degistir (varsayilan: `gemini-1.5-flash`)

Saglik kontrolu:

- http://localhost:8000/health
- http://localhost:8000/neo4j/ping

## Seed veri

```
POST http://localhost:8000/seed/load
POST http://localhost:8000/seed/load?reset=true
```

## Filtre listeleri

```
GET http://localhost:8000/meta/filters
```

## LLM kontrol

```
GET http://localhost:8000/llm/check
```

## LLM config

```
GET http://localhost:8000/llm/config
```

## Query

```
POST http://localhost:8000/query
{
  "query": "emergency access ne zaman kullanilir?",
  "limit": 5,
  "role": "IT Admin",
  "policy": "Least Privilege Access",
  "tag": "security",
  "use_llm": true
}
```

Response alanlari:

- `answer`
- `rationale` (policies, exceptions, roles, tags)
- `rationale_text`
- `summary`
- `summary_source` (llm/extractive)
- `alerts`
- `conflicts`
- `sources` (score dahil)
- `graph`
