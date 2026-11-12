import tempfile
import unittest
from pathlib import Path

from valuehq_workers.crawl.recorder import Recorder, describe, summary_for_app


def make(previous=None, max_pages=3):
    return Recorder("ws1", "acme.com", max_pages, previous or [], set(), Path(tempfile.mkdtemp()))


class RecorderTest(unittest.TestCase):
    def test_limit_and_dedupe(self):
        r = make()
        self.assertTrue(r.reserve("https://acme.com/"))
        self.assertFalse(r.reserve("https://acme.com/"))
        self.assertTrue(r.reserve("https://acme.com/a"))
        self.assertTrue(r.reserve("https://acme.com/b"))
        self.assertFalse(r.reserve("https://acme.com/c"))
        self.assertTrue(r.limit_reached)
        self.assertEqual(r.skipped["page-limit"], 1)

    def test_blobs_are_content_addressed(self):
        r = make()
        common = dict(final_url="u", http_status=200, content_type="text/html", markdown="# Hi", title="Hi", description=None,
                      etag='"abc"', last_modified=None, depth=0, attempts=1)
        r.page("https://acme.com/", body=b"<html>same</html>", **common)
        r.page("https://acme.com/index.html", body=b"<html>same</html>", **common)
        self.assertEqual(len(r.new_blobs), 2)  # one raw + one text, shared by both URLs
        self.assertEqual(r.entries["https://acme.com/"]["rawKey"], r.entries["https://acme.com/index.html"]["rawKey"])

    def test_conditional_and_partial(self):
        prev = [
            {"url": "https://acme.com/", "status": "ok", "kind": "page", "etag": '"e1"', "rawKey": "k1", "textKey": "t1"},
            {"url": "https://acme.com/pricing", "status": "ok", "kind": "page", "lastModified": "Mon, 01 Jan 2024 00:00:00 GMT", "rawKey": "k2", "textKey": "t2"},
        ]
        r = make(prev)
        self.assertEqual(r.conditional_headers("https://acme.com/"), {"If-None-Match": '"e1"'})
        self.assertEqual(r.conditional_headers("https://acme.com/new"), {})
        r.unchanged("https://acme.com/pricing", depth=0, attempts=1)
        r.failed("https://acme.com/x", "timeout", http_status=None, depth=1, attempts=4)
        manifest = r.manifest(carry_over=True)
        statuses = {e["url"]: e["status"] for e in manifest}
        self.assertEqual(statuses, {"https://acme.com/": "carried", "https://acme.com/pricing": "unchanged", "https://acme.com/x": "failed"})
        self.assertEqual(r.transient_failures(), [("https://acme.com/x", 1)])
        rep = r.report("c1", {"start_url": "https://acme.com/", "scope": ["/pricing"], "retries": 3}, True, 2)
        self.assertEqual((rep["attempted"], rep["unchanged"], rep["failed"], rep["carried"]), (2, 1, 1, 1))
        self.assertEqual(rep["successRate"], 0.5)
        self.assertEqual(rep["failuresByReason"], {"timeout": 1})
        s = summary_for_app(rep, "s3://b/x/")
        self.assertEqual(s["location"], "s3://b/x/")
        self.assertIn("1 failed (50% success)", describe(rep))

    def test_not_kept_is_not_a_failure(self):
        r = make()
        r.not_kept("https://acme.com/feed", "robots", http_status=None, depth=1)
        rep = r.report("c", {}, False, 1)
        self.assertEqual((rep["attempted"], rep["failed"]), (0, 0))
        self.assertEqual(rep["skippedByReason"], {"robots": 1})


class ExplorerDataTest(unittest.TestCase):
    def test_parents_links_timings(self):
        r = make(max_pages=10)
        r.reserve("https://acme.com/")
        r.reserve("https://acme.com/a", parent="https://acme.com/")
        r.reserve("https://acme.com/a", parent="https://acme.com/b")  # first parent wins
        common = dict(final_url="u", http_status=200, content_type="text/html", markdown="# A", title="A", description=None,
                      etag=None, last_modified=None, depth=1, attempts=1)
        r.page("https://acme.com/a", body=b"<html>a</html>", **common)
        r.annotate("https://acme.com/a", fetchMs=120, processMs=8, links=["https://acme.com/"])
        r.annotate("https://acme.com/missing", fetchMs=5)  # ignored
        r.failed("https://acme.com/b", "timeout", http_status=None, depth=1, attempts=4)
        m = {e["url"]: e for e in r.manifest(False)}
        self.assertEqual(m["https://acme.com/a"]["parent"], "https://acme.com/")
        self.assertEqual((m["https://acme.com/a"]["fetchMs"], m["https://acme.com/a"]["links"]), (120, ["https://acme.com/"]))
        self.assertNotIn("https://acme.com/missing", m)
        rep = r.report("c", {"urls": ["/a"]}, False, 1)
        self.assertEqual(rep["fetchMs"], {"total": 120, "avg": 120, "median": 120, "max": 120})
        self.assertEqual(rep["urls"], 1)

    def test_corpus_reuses_previous_text(self):
        from valuehq_workers.crawl.run import build_corpus

        class S:
            reads = []

            def get_text(self, key):
                self.reads.append(key)
                return "from storage " + key

        r = make(max_pages=10)
        common = dict(final_url="u", http_status=200, content_type="text/html", title="N", description=None,
                      etag=None, last_modified=None, depth=0, attempts=1)
        r.page("https://acme.com/new", body=b"new", markdown="fresh text", **common)
        new_key = r.entries["https://acme.com/new"]["textKey"]
        manifest = [
            r.entries["https://acme.com/new"],
            {"url": "https://acme.com/same", "status": "carried", "kind": "page", "textKey": "t-same"},
            {"url": "https://acme.com/other", "status": "unchanged", "kind": "page", "textKey": "t-other"},
            {"url": "https://acme.com/f.pdf", "status": "ok", "kind": "file", "rawKey": "r"},
        ]
        s = S()
        rows = build_corpus(s, r, manifest, [{"url": "https://acme.com/same", "textKey": "t-same", "text": "old text"}])
        self.assertEqual([(x["url"], x["text"]) for x in rows], [
            ("https://acme.com/new", "fresh text"), ("https://acme.com/same", "old text"), ("https://acme.com/other", "from storage t-other")])
        self.assertEqual(s.reads, ["t-other"])
        self.assertTrue(new_key.endswith(".md"))


if __name__ == "__main__":
    unittest.main()
