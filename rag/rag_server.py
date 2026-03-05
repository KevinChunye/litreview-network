"""
LitReview RAG Microservice
==========================
POST /ingest  { paper_id, text }           → chunk + embed + store
POST /ask     { paper_id, question, top_k } → { answer, citations }
GET  /health                               → { ok, db, chunks }

Hybrid retrieval: BM25 (FTS5) + cosine similarity (sqlite-vec).
Weights: 30 % keyword / 70 % semantic — same defaults as workshop notebook.
All embeddings are local (all-MiniLM-L6-v2, 384 dim, no API key needed).
"""

import os
import re
import struct
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import sqlite_vec
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────

RAG_DB_PATH = Path(os.environ.get("RAG_DB_PATH", "rag.db"))

# Lazy-load the model so the import itself stays fast
_embedding_model = None

# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="LitReview RAG", version="1.0.0")

# ── Embedding helpers ─────────────────────────────────────────────────────────


def get_model():
    global _embedding_model
    if _embedding_model is None:
        from fastembed import TextEmbedding  # noqa: PLC0415
        _embedding_model = TextEmbedding(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
    return _embedding_model


def embed(texts: List[str]) -> List[List[float]]:
    return [v.tolist() for v in get_model().embed(texts)]


def pack_vec(v: List[float]) -> bytes:
    return struct.pack(f"{len(v)}f", *v)


# ── Database ──────────────────────────────────────────────────────────────────


def open_db() -> sqlite3.Connection:
    conn = sqlite3.connect(RAG_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db() -> None:
    conn = open_db()
    cur = conn.cursor()

    # Chunk metadata
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS chunks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_id    TEXT    NOT NULL,
            chunk_index INTEGER NOT NULL,
            content     TEXT    NOT NULL
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_chunks_paper ON chunks(paper_id)"
    )

    # FTS5 — BM25 keyword search
    # paper_id and chunk_id are UNINDEXED (stored but not tokenized)
    cur.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            content,
            paper_id   UNINDEXED,
            chunk_id   UNINDEXED,
            tokenize = 'porter ascii'
        )
        """
    )

    # vec0 — cosine similarity (384 dims for all-MiniLM-L6-v2)
    cur.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
            chunk_id  INTEGER PRIMARY KEY,
            embedding FLOAT[384] distance_metric=cosine
        )
        """
    )

    conn.commit()
    conn.close()


init_db()

# ── Chunking ──────────────────────────────────────────────────────────────────

_WS = re.compile(r"\s+")


def chunk_text(
    text: str, max_chars: int = 1200, overlap: int = 150
) -> List[str]:
    text = _WS.sub(" ", text).strip()
    if not text:
        return []
    chunks: List[str] = []
    i = 0
    while i < len(text):
        j = min(len(text), i + max_chars)
        chunks.append(text[i:j])
        i = max(i + max_chars - overlap, j)
    return chunks


# ── Retrieval helpers ─────────────────────────────────────────────────────────

_STOP = frozenset(
    "a an the is are was were be been being do does did have has had "
    "will would shall should may might can could of in on at to for with "
    "and or not no by from as it its this that these those i we you he she "
    "they what which who how why when where there here".split()
)


def fts_query(q: str) -> str:
    toks = [t.lower() for t in re.findall(r"[A-Za-z0-9]+", q)]
    toks = [t for t in toks if t not in _STOP and len(t) > 1]
    return " OR ".join(toks) if toks else q


def norm_scores(
    scores: Dict[int, float], higher_is_better: bool
) -> Dict[int, float]:
    if not scores:
        return {}
    vals = list(scores.values())
    lo, hi = min(vals), max(vals)
    if lo == hi:
        return {k: 1.0 for k in scores}
    if higher_is_better:
        return {k: (v - lo) / (hi - lo) for k, v in scores.items()}
    return {k: (hi - v) / (hi - lo) for k, v in scores.items()}


def hybrid_search(
    paper_id: str,
    question: str,
    k: int = 8,
    kw_weight: float = 0.3,
    sem_weight: float = 0.7,
) -> List[Dict[str, Any]]:
    conn = open_db()
    cur = conn.cursor()
    content_map: Dict[int, str] = {}

    # ── BM25 via FTS5 ────────────────────────────────────────────────────────
    bm25_raw: Dict[int, float] = {}
    try:
        rows = cur.execute(
            """
            SELECT chunk_id, bm25(chunks_fts) AS score
            FROM chunks_fts
            WHERE chunks_fts MATCH ? AND paper_id = ?
            ORDER BY score
            LIMIT 50
            """,
            (fts_query(question), paper_id),
        ).fetchall()
        bm25_raw = {int(r["chunk_id"]): float(r["score"]) for r in rows}
    except sqlite3.OperationalError:
        pass  # FTS5 match failure (empty query, etc.) — degrade gracefully

    # ── Semantic via sqlite-vec ───────────────────────────────────────────────
    # Strategy: fetch global top-500 from vec0, then filter by paper_id
    # via a regular chunks lookup.  Works correctly even for large corpora.
    sem_raw: Dict[int, float] = {}
    try:
        q_emb = embed([question])[0]
        q_bytes = pack_vec(q_emb)
        knn_rows = cur.execute(
            """
            SELECT chunk_id, distance
            FROM chunks_vec
            WHERE embedding MATCH ? AND k = 500
            ORDER BY distance
            """,
            (q_bytes,),
        ).fetchall()
        knn_dict = {int(r["chunk_id"]): float(r["distance"]) for r in knn_rows}

        if knn_dict:
            ph = ",".join("?" * len(knn_dict))
            paper_rows = cur.execute(
                f"SELECT id, content FROM chunks WHERE id IN ({ph}) AND paper_id = ?",
                [*knn_dict.keys(), paper_id],
            ).fetchall()
            for r in paper_rows:
                cid = int(r["id"])
                sem_raw[cid] = knn_dict[cid]  # cosine distance (lower=better)
                content_map[cid] = r["content"]
    except Exception:
        pass  # sqlite-vec unavailable or extension not loaded

    # Fetch content for BM25-only hits
    bm25_only_ids = [cid for cid in bm25_raw if cid not in content_map]
    if bm25_only_ids:
        ph = ",".join("?" * len(bm25_only_ids))
        rows = cur.execute(
            f"SELECT id, content FROM chunks WHERE id IN ({ph})",
            bm25_only_ids,
        ).fetchall()
        for r in rows:
            content_map[int(r["id"])] = r["content"]

    conn.close()

    # ── Fuse scores ───────────────────────────────────────────────────────────
    # BM25 returns negative numbers (lower magnitude = better) → normalize as lower_is_better
    # Semantic distance: lower = better → normalize as lower_is_better
    bm25_norm = norm_scores(bm25_raw, higher_is_better=False)
    sem_norm = norm_scores(sem_raw, higher_is_better=False)

    all_ids = set(bm25_norm) | set(sem_norm)
    results: List[Dict[str, Any]] = []
    for cid in all_ids:
        b = bm25_norm.get(cid, 0.0)
        s = sem_norm.get(cid, 0.0)
        # Convert distance → similarity for the citation field (1 - norm_distance)
        raw_dist = sem_raw.get(cid)
        score_vec = (1.0 - sem_norm[cid]) if cid in sem_norm else None
        results.append(
            {
                "chunk_id": cid,
                "content": content_map.get(cid, ""),
                "score_bm25": bm25_raw.get(cid),
                "score_vec": score_vec,
                "final_score": kw_weight * b + sem_weight * s,
            }
        )

    results.sort(key=lambda x: x["final_score"], reverse=True)
    return results[:k]


# ── API models ────────────────────────────────────────────────────────────────


class IngestReq(BaseModel):
    paper_id: str
    text: str


class AskReq(BaseModel):
    paper_id: str
    question: str
    top_k: int = 8


# ── Routes ────────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    conn = open_db()
    count = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    conn.close()
    return {"ok": True, "db": str(RAG_DB_PATH), "chunks": count}


@app.post("/ingest")
def ingest(req: IngestReq):
    """Chunk, embed, and store paper text. Idempotent — re-ingesting the same
    paper_id adds additional chunks (call once per paper)."""
    chunks = chunk_text(req.text)
    if not chunks:
        return {"ok": True, "paper_id": req.paper_id, "stored": 0}

    embs = embed(chunks)
    conn = open_db()
    cur = conn.cursor()
    stored = 0

    for idx, (content, emb) in enumerate(zip(chunks, embs)):
        cur.execute(
            "INSERT INTO chunks (paper_id, chunk_index, content) VALUES (?, ?, ?)",
            (req.paper_id, idx, content),
        )
        cid = cur.lastrowid

        # FTS5 row
        cur.execute(
            "INSERT INTO chunks_fts (content, paper_id, chunk_id) VALUES (?, ?, ?)",
            (content, req.paper_id, cid),
        )

        # vec0 row — store as float32 bytes
        cur.execute(
            "INSERT INTO chunks_vec (chunk_id, embedding) VALUES (?, ?)",
            (cid, pack_vec(emb)),
        )
        stored += 1

    conn.commit()
    conn.close()
    return {"ok": True, "paper_id": req.paper_id, "stored": stored}


@app.post("/ask")
def ask(req: AskReq):
    """Hybrid BM25+semantic retrieval over a paper's chunks.

    Returns:
        answer    — concatenated top-k excerpts (swap for LLM call later)
        citations — list of {chunk_id, score_vec, score_bm25, excerpt}
    """
    if req.top_k < 1 or req.top_k > 20:
        raise HTTPException(status_code=400, detail="top_k must be 1–20")

    hits = hybrid_search(req.paper_id, req.question, k=req.top_k)

    if not hits:
        return {
            "ok": True,
            "question": req.question,
            "answer": "No relevant content found for this paper.",
            "citations": [],
        }

    citations = [
        {
            "chunk_id": h["chunk_id"],
            "score_vec": h["score_vec"],
            "score_bm25": h["score_bm25"],
            "excerpt": h["content"][:400],
        }
        for h in hits
    ]

    # Build a readable answer from the top-k chunks.
    # Swap this section for an LLM call (OpenRouter/OpenAI) when you want
    # generated prose instead of extracted passages.
    answer_parts = [
        f"[chunk {h['chunk_id']}]\n{h['content']}" for h in hits
    ]
    answer = "\n\n---\n\n".join(answer_parts)

    return {
        "ok": True,
        "question": req.question,
        "answer": answer,
        "citations": citations,
    }
