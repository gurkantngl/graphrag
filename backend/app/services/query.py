from __future__ import annotations

from typing import Any
import re

from neo4j import Driver
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.services.llm import summarize_with_llm


def run_query(
    driver: Driver,
    query_text: str,
    limit: int = 5,
    role: str | None = None,
    policy: str | None = None,
    tag: str | None = None,
    use_llm: bool = False,
) -> dict[str, Any]:
    keywords = [word for word in query_text.split() if len(word) > 2]
    params = {
        "query": query_text,
        "keywords": keywords,
        "limit": limit,
        "role": role,
        "policy": policy,
        "tag": tag,
    }

    cypher = """
    MATCH (d:Document)
    WHERE (
        d.text CONTAINS $query OR d.title CONTAINS $query
        OR ANY(k IN $keywords WHERE d.text CONTAINS k OR d.title CONTAINS k)
    )
      AND (
        $role IS NULL OR $role = '' OR
        EXISTS { MATCH (d)-[:MENTIONS]->(:Role {name: $role}) }
      )
      AND (
        $policy IS NULL OR $policy = '' OR
        EXISTS { MATCH (d)-[:MENTIONS]->(:Policy {name: $policy}) }
      )
      AND (
        $tag IS NULL OR $tag = '' OR
        EXISTS { MATCH (d)-[:MENTIONS]->(:Tag {name: $tag}) }
      )
    WITH d
    ORDER BY size(d.text) DESC
    LIMIT $limit
    OPTIONAL MATCH (d)-[r:MENTIONS]->(x)
    RETURN d, collect(DISTINCT r) AS rels, collect(DISTINCT x) AS nodes
    """

    records: list[dict[str, Any]] = []
    with driver.session() as session:
        for record in session.run(cypher, params):
            doc = record["d"]
            rels = record["rels"]
            nodes = record["nodes"]
            records.append({"doc": doc, "rels": rels, "nodes": nodes})

    sources = []
    graph_nodes = {}
    graph_edges = []
    snippets = []
    rationale_items = {"Policy": set(), "Exception": set(), "Role": set(), "Tag": set()}
    doc_texts: list[str] = []
    doc_ids: list[str] = []

    for item in records:
        doc = item["doc"]
        doc_id = doc.get("id")
        graph_nodes[doc_id] = {"id": doc_id, "label": doc.get("title"), "type": "Document"}
        sources.append(
            {
                "id": doc_id,
                "title": doc.get("title"),
                "source": doc.get("source"),
                "score": None,
            }
        )
        if doc.get("text"):
            snippets.append(doc.get("text"))
        doc_texts.append(f"{doc.get('title', '')} {doc.get('text', '')}".strip())
        doc_ids.append(doc_id)

        for node in item["nodes"]:
            node_id = f"{list(node.labels)[0]}:{node.get('name')}"
            node_type = list(node.labels)[0]
            node_label = node.get("name")
            graph_nodes[node_id] = {
                "id": node_id,
                "label": node_label,
                "type": node_type,
            }
            if node_type in rationale_items and node_label:
                rationale_items[node_type].add(node_label)

        for rel in item["rels"]:
            graph_edges.append(
                {
                    "from": rel.start_node.get("id"),
                    "to": f"{list(rel.end_node.labels)[0]}:{rel.end_node.get('name')}",
                    "type": rel.type,
                }
            )

    answer = " ".join(snippets) if snippets else "Bu soru icin yeterli dokuman bulunamadi."

    top_docs: list[str] = []
    if doc_texts:
        vectorizer = TfidfVectorizer()
        tfidf_matrix = vectorizer.fit_transform(doc_texts + [query_text])
        doc_vectors = tfidf_matrix[:-1]
        query_vector = tfidf_matrix[-1]
        similarities = cosine_similarity(doc_vectors, query_vector).reshape(-1)
        score_map = {doc_ids[i]: float(similarities[i]) for i in range(len(doc_ids))}
        sources.sort(key=lambda item: score_map.get(item["id"], 0.0), reverse=True)
        for source in sources:
            source["score"] = round(score_map.get(source["id"], 0.0), 4)
        top_docs = [doc_ids[i] for i in similarities.argsort()[::-1][:2]]
    rationale = {
        "policies": sorted(rationale_items["Policy"]),
        "exceptions": sorted(rationale_items["Exception"]),
        "roles": sorted(rationale_items["Role"]),
        "tags": sorted(rationale_items["Tag"]),
    }
    rationale_parts = []
    if rationale["policies"]:
        rationale_parts.append(
            "Policy: " + ", ".join(rationale["policies"])
        )
    if rationale["exceptions"]:
        rationale_parts.append(
            "Exception: " + ", ".join(rationale["exceptions"])
        )
    if rationale["roles"]:
        rationale_parts.append("Role: " + ", ".join(rationale["roles"]))
    if rationale["tags"]:
        rationale_parts.append("Tag: " + ", ".join(rationale["tags"]))
    rationale_text = (
        "Bu cevap su iliskilere dayanir: " + " | ".join(rationale_parts)
        if rationale_parts
        else "Bu cevap icin spesifik bir iliski bulunamadi."
    )
    summary = ""
    summary_source = "extractive"
    if top_docs:
        summary_docs = [doc for doc in records if doc["doc"].get("id") in top_docs]
        summary_parts = []
        llm_context_parts = []
        for item in summary_docs:
            doc = item["doc"]
            title = doc.get("title")
            text = doc.get("text", "")
            snippet = text[:200].strip()
            if snippet:
                summary_parts.append(f"{title}: {snippet}...")
            if title and text:
                llm_context_parts.append(f"{title}\n{text}")
        summary = " ".join(summary_parts)
        if use_llm and llm_context_parts:
            llm_context = "\n\n".join(llm_context_parts)
            llm_summary = summarize_with_llm(query_text, llm_context)
            if llm_summary:
                summary = llm_summary
                summary_source = "llm"

    alerts: list[str] = []
    if rationale["policies"]:
        exception_flags = ["emergency", "bypass", "temporary", "legal", "low risk"]
        with driver.session() as session:
            for policy_name in rationale["policies"]:
                exceptions = session.run(
                    """
                    MATCH (p:Policy {name: $policy})-[:HAS_EXCEPTION]->(e:Exception)
                    RETURN collect(DISTINCT e.name) AS exceptions
                    """,
                    {"policy": policy_name},
                ).single()["exceptions"]
                exceptions = [item for item in exceptions if item]
                if exceptions:
                    alerts.append(
                        f"{policy_name} politikasinda {len(exceptions)} istisna bulundu: "
                        + ", ".join(exceptions)
                    )
                    risky = [
                        name
                        for name in exceptions
                        if any(flag in name.lower() for flag in exception_flags)
                    ]
                    if risky:
                        alerts.append(
                            f"Dikkat: {policy_name} icin yuksek riskli istisnalar var: "
                            + ", ".join(risky)
                        )

    conflicts: list[str] = []
    policy_docs: dict[str, list[dict[str, str]]] = {}
    for item in records:
        doc = item["doc"]
        doc_title = doc.get("title") or "Bilinmeyen Dokuman"
        doc_text = doc.get("text") or ""
        policies = [
            node.get("name")
            for node in item["nodes"]
            if "Policy" in node.labels and node.get("name")
        ]
        for policy_name in policies:
            policy_docs.setdefault(policy_name, []).append(
                {"title": doc_title, "text": doc_text}
            )

    time_pattern = re.compile(r"(\d+)\s*(hours?|hour|days?|day|months?|month)", re.I)
    for policy_name, docs in policy_docs.items():
        unit_map: dict[str, dict[int, list[str]]] = {}
        for doc in docs:
            for match in time_pattern.finditer(doc["text"]):
                value = int(match.group(1))
                unit = match.group(2).lower()
                unit_map.setdefault(unit, {}).setdefault(value, []).append(doc["title"])

        for unit, values in unit_map.items():
            if len(values.keys()) > 1:
                parts = [
                    f"{value} {unit} ({', '.join(sorted(set(titles)))})"
                    for value, titles in values.items()
                ]
                conflicts.append(
                    f"{policy_name} politikasinda sure tutarsizligi var: "
                    + " vs ".join(parts)
                )

    return {
        "answer": answer,
        "rationale": rationale,
        "rationale_text": rationale_text,
        "summary": summary or "Ozet icin yeterli veri bulunamadi.",
        "summary_source": summary_source,
        "alerts": alerts,
        "conflicts": conflicts,
        "sources": sources,
        "graph": {
            "nodes": list(graph_nodes.values()),
            "edges": graph_edges,
        },
    }
