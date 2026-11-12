import unittest

from valuehq_workers.crawl.config import CrawlConfig
from valuehq_workers.crawl.rules import Rules, glob_to_regex, literal_prefix, normalize


class RulesTest(unittest.TestCase):
    def test_globs(self):
        self.assertTrue(glob_to_regex("/blog/**").match("/blog/2024/post"))
        self.assertFalse(glob_to_regex("/blog/**").match("/blogger"))
        self.assertTrue(glob_to_regex("/pricing*").match("/pricing-enterprise"))
        self.assertFalse(glob_to_regex("/pricing*").match("/pricing/team"))
        self.assertTrue(glob_to_regex("/docs").match("/docs"))
        self.assertTrue(glob_to_regex("/docs").match("/docs/api"))
        self.assertFalse(glob_to_regex("/docs").match("/docsify"))
        self.assertEqual(literal_prefix("/blog/**"), "/blog/")
        self.assertEqual(literal_prefix("pricing"), "/pricing")

    def test_normalize(self):
        self.assertEqual(normalize("HTTPS://Www.Acme.com:443/a/../b/?utm_source=x&id=2#top"), "https://www.acme.com/b/?id=2")
        self.assertEqual(normalize("https://acme.com"), "https://acme.com/")

    def test_check(self):
        cfg = CrawlConfig.from_dict({"start_url": "acme.com", "exclude": ["/blog/**"]})
        r = Rules(cfg)
        self.assertEqual(r.host, "acme.com")
        self.assertEqual(r.check("https://www.acme.com/pricing"), (True, ""))
        self.assertEqual(r.check("https://other.com/x"), (False, "other-site"))
        self.assertEqual(r.check("https://docs.acme.com/x"), (False, "other-site"))
        self.assertEqual(r.check("https://acme.com/logo.png"), (False, "file-type"))
        self.assertEqual(r.check("https://acme.com/whitepaper.pdf"), (True, ""))
        self.assertEqual(r.check("https://acme.com/blog/hello"), (False, "excluded"))
        self.assertEqual(r.check("https://acme.com/login"), (False, "excluded"))
        self.assertEqual(r.check("mailto:a@acme.com"), (False, "not-web"))

    def test_include_and_scope(self):
        r = Rules(CrawlConfig.from_dict({"start_url": "https://acme.com/", "include": ["/products/**", "/pricing"], "scope": ["/pricing"]}))
        self.assertEqual(r.check("https://acme.com/about")[1], "not-included")
        self.assertEqual(r.check("https://acme.com/products/a")[1], "out-of-scope")
        self.assertEqual(r.check("https://acme.com/pricing/team"), (True, ""))
        self.assertEqual(r.seeds(), ["https://acme.com/pricing"])

    def test_specific_urls(self):
        r = Rules(CrawlConfig.from_dict({"start_url": "acme.com", "urls": ["/pricing", "https://acme.com/a?utm_source=x", "https://other.com/x"], "follow_links": False}))
        self.assertEqual(r.seeds(), ["https://acme.com/pricing", "https://acme.com/a"])
        self.assertEqual(r.check("https://acme.com/pricing"), (True, ""))
        self.assertEqual(r.check("https://acme.com/about"), (False, "out-of-scope"))
        self.assertTrue(r.cfg.partial)
        self.assertFalse(CrawlConfig.from_dict({"start_url": "acme.com"}).partial)

    def test_subdomains(self):
        r = Rules(CrawlConfig.from_dict({"start_url": "acme.com", "include_subdomains": True}))
        self.assertTrue(r.check("https://docs.acme.com/x")[0])

    def test_config_validation(self):
        with self.assertRaises(ValueError):
            CrawlConfig.from_dict({"start_url": "not a url"})
        with self.assertRaises(ValueError):
            CrawlConfig.from_dict({"start_url": "acme.com", "strategy": "random"})
        cfg = CrawlConfig.from_dict({"start_url": "acme.com/start", "max_pages": 999999, "unknown": 1})
        self.assertEqual(cfg.start_url, "https://acme.com/start")
        self.assertEqual(cfg.max_pages, 20000)


if __name__ == "__main__":
    unittest.main()
