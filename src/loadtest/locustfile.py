"""Parameterized Locust load test for the Vision Search POC.

Two separable scenarios, selected with the TARGET_MODE environment variable:

  - api  (default): exercises the query API's public search endpoint
                    (POST /api/search) using an image-URL query, plus a
                    lightweight root GET.
  - site:           exercises a Static Web Apps site (page load + config.js).

Everything else is parameterized through environment variables so the same
script can point at any deployment without edits. The load *size* (users,
spawn rate, duration) is controlled by locust.conf / the Azure Load Testing
configuration, not hard-coded here.

No credentials or SAS URLs are baked in; supply them at runtime only.
"""

import json
import os

from locust import HttpUser, between, task

TARGET_MODE = os.getenv("TARGET_MODE", "api").strip().lower()

# --- API scenario parameters ---------------------------------------------
# A publicly reachable image URL the API can fetch and vectorize. Leave empty
# to skip the image query task (only the root GET will run).
API_IMAGE_URL = os.getenv("API_IMAGE_URL", "").strip()
API_TOP = int(os.getenv("API_TOP", "10"))
# Optional OData-style facet filters as a JSON object, e.g. {"category":["Home"]}.
API_FILTERS = os.getenv("API_FILTERS", "").strip()

# --- Site scenario parameters --------------------------------------------
SITE_PATH = os.getenv("SITE_PATH", "/").strip() or "/"

# Think time between tasks (seconds); keep small but non-zero for realism.
MIN_WAIT = float(os.getenv("MIN_WAIT", "1"))
MAX_WAIT = float(os.getenv("MAX_WAIT", "3"))


def _parse_filters() -> dict:
    if not API_FILTERS:
        return {}
    try:
        parsed = json.loads(API_FILTERS)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


class ApiUser(HttpUser):
    """Drives the public search API."""

    wait_time = between(MIN_WAIT, MAX_WAIT)

    @task(3)
    def search_by_image_url(self):
        if not API_IMAGE_URL:
            return
        payload = {
            "imageUrl": API_IMAGE_URL,
            "top": API_TOP,
            "filters": _parse_filters(),
        }
        self.client.post(
            "/api/search",
            json=payload,
            name="POST /api/search (imageUrl)",
        )

    @task(1)
    def root(self):
        self.client.get("/", name="GET / (api root)")


class SiteUser(HttpUser):
    """Drives a Static Web Apps site (page load + runtime config)."""

    wait_time = between(MIN_WAIT, MAX_WAIT)

    @task(3)
    def page(self):
        self.client.get(SITE_PATH, name=f"GET {SITE_PATH}")

    @task(1)
    def config(self):
        self.client.get("/config.js", name="GET /config.js")


# Select exactly one user class based on TARGET_MODE so site and API load
# stay separable for attribution. The unselected class gets weight 0 and is
# never spawned.
if TARGET_MODE == "site":
    SiteUser.weight = 1
    ApiUser.weight = 0
else:
    ApiUser.weight = 1
    SiteUser.weight = 0
