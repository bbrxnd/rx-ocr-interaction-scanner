"""Exact ingredient matching gates evidence; TF-IDF ranks eligible passages."""
import json
import math
import re
from collections import Counter
from itertools import combinations
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent / 'data' / 'evidence.json'
COVERAGE_NOTICE = 'Outside prototype coverage. Missing evidence does not establish safety.'


def load_data():
    return json.loads(DATA_PATH.read_text())


def parse_names(text):
    names = list(dict.fromkeys(line.strip().casefold() for line in text.splitlines() if line.strip()))
    if not 2 <= len(names) <= 6:
        raise ValueError('Enter 2–6 different ingredient names, one per line.')
    if any(len(name) > 80 for name in names):
        raise ValueError('Use short ingredient names only; omit personal information.')
    return names


def normalize(names, data):
    catalog = {item['name']: item for item in data['medications']}
    return [catalog[n] for n in names if n in catalog], [n for n in names if n not in catalog]


def tfidf_scores(query, documents):
    """Smoothed TF-IDF cosine similarity, fit on the document collection."""
    tokenize = lambda text: re.findall(r'[a-z0-9]+', text.casefold())
    counts = [Counter(tokenize(doc)) for doc in documents]
    vocab = set().union(*(set(c) for c in counts))
    idf = {t: math.log((1 + len(counts)) / (1 + sum(t in c for c in counts))) + 1 for t in vocab}

    def vector(counter):
        return {t: (1 + math.log(n)) * idf[t] for t, n in counter.items() if t in idf}

    q = vector(Counter(tokenize(query)))
    qnorm = math.sqrt(sum(v * v for v in q.values()))
    scores = []
    for count in counts:
        d = vector(count)
        denom = qnorm * math.sqrt(sum(v * v for v in d.values()))
        scores.append(sum(v * d.get(t, 0) for t, v in q.items()) / denom if denom else 0.0)
    return scores


def retrieve(medications, data):
    ids = {m['rxcui'] for m in medications}
    eligible = [dict(r, source=data['sources'][r['source_id']]) for r in data['records'] if set(r['ingredients']) <= ids]
    docs = [' '.join(r['names']) + ' ' + r['finding'] + ' ' + r['source']['quote'] for r in eligible]
    scores = tfidf_scores(' '.join(m['name'] for m in medications), docs)
    for record, score in zip(eligible, scores):
        record['retrieval_score'] = round(score, 4)
    eligible.sort(key=lambda r: (-r['retrieval_score'], r['id']))
    covered = {frozenset(r['ingredients']) for r in eligible}
    uncovered = [f"{a['name']} + {b['name']}" for a, b in combinations(medications, 2) if frozenset((a['rxcui'], b['rxcui'])) not in covered]
    return eligible, uncovered
