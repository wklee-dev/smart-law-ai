-- Law Latest Crawler V1.0 schema reference.
-- Runtime ownership checks are implemented in lawcrawler/storage.py.
-- Do not execute this file manually against an existing database.

CREATE TABLE llc_v1_meta (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
    );

CREATE TABLE llc_v1_runs (
        run_id INTEGER PRIMARY KEY,
        stage TEXT NOT NULL,
        options_json TEXT NOT NULL,
        status TEXT NOT NULL,
        stats_json TEXT NOT NULL,
        error TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL
    );

CREATE TABLE llc_v1_list (
        key TEXT NOT NULL PRIMARY KEY,
        category TEXT NOT NULL,
        source_id TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        title TEXT NOT NULL,
        gubun TEXT NOT NULL,
        source_url TEXT NOT NULL,
        announce_date TEXT NOT NULL,
        expire_date TEXT NOT NULL,
        law_type TEXT NOT NULL,
        announce_no TEXT NOT NULL,
        revision_type TEXT NOT NULL,
        ministry TEXT NOT NULL,
        article_label TEXT NOT NULL,
        page INTEGER NOT NULL,
        match_status TEXT NOT NULL,
        matched_keywords TEXT NOT NULL,
        data_json TEXT NOT NULL,
        collected_at TEXT NOT NULL
    );

CREATE TABLE llc_v1_raw_articles (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    );

CREATE TABLE llc_v1_raw_addendum (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    );

CREATE TABLE llc_v1_raw_annex (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    );

CREATE TABLE llc_v1_raw_attachment (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        annex_id TEXT NOT NULL,
        url TEXT NOT NULL,
        display_name TEXT NOT NULL,
        local_path TEXT NOT NULL,
        size INTEGER,
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    );

CREATE INDEX llc_v1_list_category_idx ON llc_v1_list(category);

CREATE INDEX llc_v1_list_source_effective_idx ON llc_v1_list(source_id, effective_date);

CREATE INDEX llc_v1_raw_articles_gubun_idx ON llc_v1_raw_articles(gubun);

CREATE INDEX llc_v1_raw_addendum_gubun_idx ON llc_v1_raw_addendum(gubun);

CREATE INDEX llc_v1_raw_annex_gubun_idx ON llc_v1_raw_annex(gubun);

CREATE INDEX llc_v1_raw_attachment_gubun_idx ON llc_v1_raw_attachment(gubun);
