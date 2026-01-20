# GraphRAG Policy Copilot

GraphRAG tabanli, kurum politikalarini kaynak ve iliski grafi ile aciklayabilen bir RAG demo uygulamasi.  
Backend: FastAPI + Neo4j, Frontend: Vite + TypeScript.

## Ozellikler

- Dokuman seed yukleme
- GraphRAG sorgu: cevap + kaynak + graph
- Gerekce (policy/exception/role/tag)
- Uyari ve celiski tespiti (sure tutarsizliklari)
- LLM ile ozet (Gemini, opsiyonel)
- Graph gorsellestirme + export (JSON/PNG)
- Dark mode

## Kurulum

### 1) Neo4j (Docker)

```
docker compose up -d
```

Neo4j Browser: http://localhost:7474  
Kullanici/sifre: `neo4j` / `neo4jpass`

### 2) Backend

```
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --env-file backend\.env
```

Saglik kontrolu:
- http://localhost:8000/health
- http://localhost:8000/neo4j/ping

### 3) Frontend

```
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

## Ortam Degiskenleri

`backend/.env` icine:
```
APP_NAME=GraphRAG Policy Copilot
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jpass
GEMINI_API_KEY=YOUR_KEY
GEMINI_MODEL=gemini-1.5-flash
```

## API Uzerinden Kisa Test

Seed yukle:
```
POST http://localhost:8000/seed/load
```

Query:
```
POST http://localhost:8000/query
{
  "query": "emergency access ne zaman kullanilir?",
  "limit": 5,
  "use_llm": true
}
```

## Notlar

- `use_llm: true` icin Gemini quota aktif olmali.
- Cakisma tespiti, ayni policy icin farkli sureleri yakalar.
