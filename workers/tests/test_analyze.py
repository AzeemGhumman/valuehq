import unittest

from valuehq_workers.analyze import company_summary as cs
from valuehq_workers.analyze.select import candidates, pick, score
from valuehq_workers.jobs import set_expression
from valuehq_workers import layout


class SelectTest(unittest.TestCase):
    def test_scores(self):
        self.assertEqual(score("https://acme.com/"), 100)
        self.assertGreater(score("https://acme.com/pricing"), score("https://acme.com/products/a"))
        self.assertGreater(score("https://acme.com/about"), score("https://acme.com/blog/post"))
        self.assertLess(score("https://acme.com/careers"), 0)

    def test_candidates_and_pick(self):
        manifest = [
            {"url": "https://acme.com/", "status": "ok", "kind": "page", "textKey": "t-home", "chars": 5000},
            {"url": "https://acme.com/index.html", "status": "ok", "kind": "page", "textKey": "t-home", "chars": 5000},
            {"url": "https://acme.com/pricing", "status": "failed", "kind": "page", "previousTextKey": "t-pricing"},
            {"url": "https://acme.com/blog/x", "status": "ok", "kind": "page", "textKey": "t-blog", "chars": 9000},
            {"url": "https://acme.com/deck.pdf", "status": "ok", "kind": "file", "rawKey": "r"},
        ]
        pages = candidates(manifest)
        self.assertEqual([p.url for p in pages], ["https://acme.com/", "https://acme.com/pricing", "https://acme.com/blog/x"])
        chosen = pick(pages, budget_chars=10000, per_page_chars=4000, pricing_page_chars=8000)
        self.assertEqual([(p.url, n) for p, n in chosen], [("https://acme.com/", 4000), ("https://acme.com/pricing", 6000)])

    def test_company_fields(self):
        fields = cs.to_company_fields({
            "category": "Order entry software", "what_they_do": "Turns emails into orders.",
            "pricing": {"model": "tiered_subscription", "summary": "Three plans.", "public": True, "tiers": [{"name": "Team", "price": "$99", "billing": "per month"}]},
            "proof": [{"claim": "Used by 200 distributors", "source_url": "u"}],
        })
        self.assertEqual(fields["tagline"], "Order entry software")
        self.assertEqual(fields["pricing"], "Tiered subscription. Three plans. Tiers: Team: $99 per month.")
        self.assertEqual(fields["proof"], "Used by 200 distributors")
        self.assertIsNone(fields["howItWorks"])
        self.assertIn("record_company_profile", cs.system_prompt())

    def test_set_expression(self):
        expr, names, values = set_expression({"status": "done", "detail": "x"}, prefix="#steps[1].")
        self.assertEqual(expr, "#steps[1].#f0 = :v0, #steps[1].#f1 = :v1")
        self.assertEqual(names, {"#f0": "status", "#f1": "detail"})

    def test_floats_become_decimals(self):
        from decimal import Decimal
        _, _, values = set_expression({"report": {"successRate": 0.95, "ok": 3, "failures": [{"x": 1.5}], "flag": True}})
        self.assertEqual(values[":v0"], {"successRate": Decimal("0.95"), "ok": 3, "failures": [{"x": Decimal("1.5")}], "flag": True})

    def test_layout(self):
        self.assertEqual(layout.host_of("https://WWW.Acme.com/x"), "acme.com")
        self.assertEqual(layout.raw_blob("ws", "acme.com", "abc", "pdf"), "workspaces/ws/website/acme.com/blobs/raw/abc.pdf")
        self.assertRegex(layout.crawl_id(0), r"^1970-01-01T00-00-00Z$")


if __name__ == "__main__":
    unittest.main()
