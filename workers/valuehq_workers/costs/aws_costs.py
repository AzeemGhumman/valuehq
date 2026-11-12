"""AWS costs from Cost Explorer, limited to resources tagged app=valuehq (the account is shared with
other projects). Needs the `app` and `env` cost allocation tags activated in the Billing console.
Each Cost Explorer request costs $0.01; a run makes about four."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

TAG_KEY, TAG_VALUE = "app", "valuehq"
TAG_FILTER = {"Tags": {"Key": TAG_KEY, "Values": [TAG_VALUE], "MatchOptions": ["EQUALS"]}}


def month_start(d: date) -> date:
    return d.replace(day=1)


def next_month(d: date) -> date:
    return (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def _pages(ce: Any, **kwargs: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    token = None
    while True:
        res = ce.get_cost_and_usage(**kwargs, **({"NextPageToken": token} if token else {}))
        out.extend(res.get("ResultsByTime", []))
        token = res.get("NextPageToken")
        if not token:
            return out


def _amount(metrics: dict[str, Any]) -> float:
    return round(float(metrics.get("UnblendedCost", {}).get("Amount", 0) or 0), 4)


def grouped(results: list[dict[str, Any]], strip_prefix: str = "") -> dict[str, dict[str, float]]:
    """{period start 'YYYY-MM-DD': {group key: amount}} from Cost Explorer results grouped by one key."""
    out: dict[str, dict[str, float]] = {}
    for r in results:
        bucket = out.setdefault(r["TimePeriod"]["Start"], {})
        for g in r.get("Groups", []):
            key = g["Keys"][0]
            if strip_prefix and key.startswith(strip_prefix):
                key = key[len(strip_prefix):] or "untagged"
            amount = _amount(g["Metrics"])
            if amount:
                bucket[key] = round(bucket.get(key, 0) + amount, 4)
    return out


def fetch(ce: Any, today: date) -> dict[str, Any]:
    this_month = month_start(today)
    last_month = month_start(this_month - timedelta(days=1))
    end = (today + timedelta(days=1)).isoformat()  # Cost Explorer end dates are exclusive
    common = {"Metrics": ["UnblendedCost"], "Filter": TAG_FILTER}

    by_service = grouped(_pages(ce, TimePeriod={"Start": last_month.isoformat(), "End": end}, Granularity="MONTHLY",
                                GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}], **common))
    by_env = grouped(_pages(ce, TimePeriod={"Start": last_month.isoformat(), "End": end}, Granularity="MONTHLY",
                            GroupBy=[{"Type": "TAG", "Key": "env"}], **common), strip_prefix="env$")
    daily_start = (today - timedelta(days=29)).isoformat()
    daily = [{"date": r["TimePeriod"]["Start"], "amount": _amount(r.get("Total", {}))}
             for r in _pages(ce, TimePeriod={"Start": daily_start, "End": end}, Granularity="DAILY", **common)]

    forecast = None
    tomorrow = today + timedelta(days=1)
    if tomorrow < next_month(today):
        try:
            res = ce.get_cost_forecast(TimePeriod={"Start": tomorrow.isoformat(), "End": next_month(today).isoformat()},
                                       Metric="UNBLENDED_COST", Granularity="MONTHLY", Filter=TAG_FILTER)
            forecast = round(float(res["Total"]["Amount"]), 2)
        except Exception:  # noqa: BLE001 - not enough history yet, or no tagged spend
            forecast = None

    months = []
    for start in (this_month, last_month):
        key = start.isoformat()
        services = dict(sorted(by_service.get(key, {}).items(), key=lambda kv: -kv[1]))
        months.append({
            "month": key[:7],
            "total": round(sum(services.values()), 2),
            "byService": services,
            "byEnv": by_env.get(key, {}),
        })
    this_total = months[0]["total"]
    return {
        "currency": "USD",
        "tag": f"{TAG_KEY}={TAG_VALUE}",
        "months": months,
        "daily": daily,
        "forecastRestOfMonth": forecast,
        "forecastMonthEnd": round(this_total + forecast, 2) if forecast is not None else None,
        "noTaggedData": all(m["total"] == 0 for m in months) and all(d["amount"] == 0 for d in daily),
    }
