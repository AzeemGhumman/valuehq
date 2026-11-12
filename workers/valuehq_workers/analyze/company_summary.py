"""The "company summary" analysis: what the company does and its pricing model.

To change the prompt, add a new version (prompts/company_summary_v2.md, bump PROMPT_VERSION) instead of
editing v1, so every stored result says which prompt produced it.
"""
from __future__ import annotations

from importlib import resources
from typing import Any

NAME = "company-summary"
PROMPT_VERSION = "v1"
TOOL_NAME = "record_company_profile"

PRICING_MODELS = [
    "per_seat_subscription", "tiered_subscription", "usage_based", "transaction_fee", "one_time_license",
    "freemium", "custom_quote", "mixed", "not_public",
]

TOOL: dict[str, Any] = {
    "name": TOOL_NAME,
    "description": "Record what the company does and how it prices, based only on its website pages.",
    "input_schema": {
        "type": "object",
        "properties": {
            "company_name": {"type": "string"},
            "category": {"type": "string", "description": "What kind of company this is, in at most 12 words. E.g. 'AI order entry software for industrial distributors'."},
            "what_they_do": {"type": "string", "description": "2-4 sentences."},
            "who_they_sell_to": {"type": "string", "description": "Buyer roles, industries and company sizes, as stated on the site."},
            "how_it_works": {"type": "string", "description": "1-3 sentences, if the site explains it."},
            "products": {
                "type": "array",
                "items": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}}, "required": ["name"]},
            },
            "pricing": {
                "type": "object",
                "properties": {
                    "model": {"type": "string", "enum": PRICING_MODELS},
                    "summary": {"type": "string", "description": "One or two sentences a sales rep can repeat."},
                    "public": {"type": "boolean", "description": "Are prices shown on the site?"},
                    "free_trial": {"type": ["boolean", "null"]},
                    "tiers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"}, "price": {"type": "string"},
                                "billing": {"type": "string", "description": "e.g. per user per month, billed annually"},
                                "includes": {"type": "string"},
                            },
                            "required": ["name"],
                        },
                    },
                },
                "required": ["model", "summary", "public"],
            },
            "proof": {
                "type": "array", "description": "Customer names, results and numbers the site states.",
                "items": {"type": "object", "properties": {"claim": {"type": "string"}, "source_url": {"type": "string"}}, "required": ["claim", "source_url"]},
            },
            "evidence": {
                "type": "array",
                "items": {"type": "object", "properties": {"field": {"type": "string"}, "source_url": {"type": "string"}}, "required": ["field", "source_url"]},
            },
            "gaps": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["company_name", "category", "what_they_do", "pricing", "evidence"],
    },
}

PRICING_LABELS = {
    "per_seat_subscription": "Per-seat subscription", "tiered_subscription": "Tiered subscription", "usage_based": "Usage-based",
    "transaction_fee": "Transaction fee", "one_time_license": "One-time license", "freemium": "Freemium", "custom_quote": "Custom quote",
    "mixed": "Mixed", "not_public": "Not public",
}


def system_prompt() -> str:
    return resources.files(__package__).joinpath(f"prompts/company_summary_{PROMPT_VERSION}.md").read_text()


def to_company_fields(result: dict[str, Any]) -> dict[str, str | None]:
    """Maps the model's answer onto the app's company profile fields (src/server/types.ts Company)."""
    pricing = result.get("pricing") or {}
    tiers = pricing.get("tiers") or []
    tier_text = "; ".join(f"{t.get('name')}: {t.get('price') or 'price not shown'}{' ' + t['billing'] if t.get('billing') else ''}" for t in tiers[:6])
    label = PRICING_LABELS.get(pricing.get("model", ""), pricing.get("model"))
    pricing_text = " ".join(x for x in [f"{label}." if label else "", pricing.get("summary") or "", f"Tiers: {tier_text}." if tier_text else ""] if x).strip()
    proof = "; ".join(p["claim"] for p in (result.get("proof") or [])[:5] if p.get("claim"))
    return {
        "tagline": result.get("category"),
        "whatWeDo": result.get("what_they_do"),
        "whoWeSellTo": result.get("who_they_sell_to"),
        "howItWorks": result.get("how_it_works"),
        "pricing": pricing_text or None,
        "proof": proof or None,
    }
