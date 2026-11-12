import unittest
from datetime import date

from valuehq_workers.costs import allocate, anthropic_costs, aws_costs


def ce_result(start, groups=None, total=None):
    r = {"TimePeriod": {"Start": start, "End": "x"}, "Groups": [{"Keys": [k], "Metrics": {"UnblendedCost": {"Amount": str(v)}}} for k, v in (groups or {}).items()]}
    if total is not None:
        r["Total"] = {"UnblendedCost": {"Amount": str(total)}}
    return r


class FakeCE:
    def __init__(self):
        self.calls = []

    def get_cost_and_usage(self, **kw):
        self.calls.append(kw)
        assert kw["Filter"]["Tags"] == {"Key": "app", "Values": ["valuehq"], "MatchOptions": ["EQUALS"]}
        if kw["Granularity"] == "DAILY":
            return {"ResultsByTime": [ce_result("2026-11-10", total=1.5), ce_result("2026-11-11", total=2.25)]}
        if kw["GroupBy"][0]["Type"] == "TAG":
            return {"ResultsByTime": [ce_result("2026-10-01", {"env$dev": 3, "env$": 0.5}), ce_result("2026-11-01", {"env$dev": 4, "env$prod": 1})]}
        # by service, paginated
        if "NextPageToken" not in kw:
            return {"ResultsByTime": [ce_result("2026-10-01", {"AWS Lambda": 1, "Amazon Simple Storage Service": 2.5})], "NextPageToken": "p2"}
        return {"ResultsByTime": [ce_result("2026-11-01", {"Amazon Elastic Container Service": 3.0, "AWS Lambda": 2.0, "Tax": 0})]}

    def get_cost_forecast(self, **kw):
        return {"Total": {"Amount": "6.004"}}


class CostsTest(unittest.TestCase):
    def test_aws_fetch(self):
        out = aws_costs.fetch(FakeCE(), date(2026, 11, 11))
        this, last = out["months"]
        self.assertEqual((this["month"], this["total"], last["total"]), ("2026-11", 5.0, 3.5))
        self.assertEqual(list(this["byService"]), ["Amazon Elastic Container Service", "AWS Lambda"])  # zero dropped, largest first
        self.assertEqual(this["byEnv"], {"dev": 4.0, "prod": 1.0})
        self.assertEqual(last["byEnv"], {"dev": 3.0, "untagged": 0.5})
        self.assertEqual(out["daily"][1], {"date": "2026-11-11", "amount": 2.25})
        self.assertEqual((out["forecastRestOfMonth"], out["forecastMonthEnd"]), (6.0, 11.0))
        self.assertFalse(out["noTaggedData"])

    def test_month_helpers(self):
        self.assertEqual(aws_costs.next_month(date(2026, 12, 31)), date(2027, 1, 1))
        self.assertEqual(aws_costs.month_start(date(2026, 11, 11)), date(2026, 11, 1))

    def test_anthropic(self):
        pages = [
            {"data": [{"starting_at": "2026-10-31T00:00:00Z", "results": [{"amount": "250", "model": "claude-sonnet-5-5", "workspace_id": "w1"}]}], "has_more": True, "next_page": "n"},
            {"data": [{"starting_at": "2026-11-02T00:00:00Z", "results": [
                {"amount": "123.45", "model": "claude-sonnet-5-5", "workspace_id": "w1"},
                {"amount": "1000", "model": "claude-opus-5-5", "workspace_id": "other"},
                {"amount": "10", "model": None, "cost_type": "web_search", "workspace_id": "w1"},
            ]}], "has_more": False, "next_page": None},
        ]
        urls = []

        def get(url, key):
            urls.append(url)
            return pages[len(urls) - 1]

        buckets = anthropic_costs.fetch_buckets("k", date(2026, 10, 1), date(2026, 11, 12), get)
        self.assertIn("group_by%5B%5D=workspace_id", urls[0])
        self.assertIn("page=n", urls[1])
        only = anthropic_costs.summarize(buckets, "w1", "2026-11", "2026-10")
        self.assertEqual(only["months"][0], {"month": "2026-11", "total": 1.33, "byModel": {"claude-sonnet-5-5": 1.23, "web search": 0.1}})
        self.assertEqual(only["months"][1]["total"], 2.5)
        everything = anthropic_costs.summarize(buckets, None, "2026-11", "2026-10")
        self.assertEqual(everything["months"][0]["total"], 11.33)

    def test_allocate(self):
        jobs = [
            {"jobType": "ingest-website", "createdAt": "2026-11-03T00:00:00Z", "report": {"durationSeconds": 300, "pages": 40}, "analysis": {"inputTokens": 9000, "outputTokens": 1000}},
            {"jobType": "ingest-website", "createdAt": "2026-10-03T00:00:00Z", "report": {"durationSeconds": 999}},
            {"jobType": "check-sources", "createdAt": "2026-11-03T00:00:00Z"},
        ]
        a = allocate.usage_from_jobs(jobs, "2026-11")
        self.assertEqual((a["crawls"], a["crawlSeconds"], a["pages"], a["inputTokens"]), (1, 300.0, 40, 9000))
        b = {"crawls": 1, "crawlSeconds": 100.0, "pages": 5, "inputTokens": 30000, "outputTokens": 0}
        out = allocate.allocate([{"id": "a", "name": "A", "usage": a}, {"id": "b", "name": "B", "usage": b}], 4.0, 8.0)
        self.assertEqual([(o["id"], o["fargate"], o["anthropic"], o["total"]) for o in out], [("b", 1.0, 6.0, 7.0), ("a", 3.0, 2.0, 5.0)])
        self.assertEqual(allocate.allocate([{"id": "a", "name": "A", "usage": b}], 0, None)[0]["total"], 0)


if __name__ == "__main__":
    unittest.main()
