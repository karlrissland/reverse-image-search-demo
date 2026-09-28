# Azure Load Testing

Parameterized [Locust](https://locust.io/) scenarios for the Vision Search POC. Site-load and API-search scenarios stay separable, and no credentials or SAS URLs are committed — supply them at runtime.

Intentionally a simple starting point. The load **size** is fully configurable; expand the scenarios later as needed.

## Files

| File | Purpose |
|------|---------|
| [locustfile.py](locustfile.py) | The scenarios. One user class runs per `TARGET_MODE` (`api` or `site`). |
| [locust.conf](locust.conf) | Load **size** and run options (users, spawn rate, duration). |
| [loadtest.yaml](loadtest.yaml) | Azure Load Testing configuration (engine instances, env, pass/fail gates). |
| [.env.example](.env.example) | Copy to `.env`; runtime parameters read by `locustfile.py`. |

## Scenarios

- **api** (default): `POST /api/search` with an image-URL query (weighted 3) plus a root `GET` (weighted 1). Set `API_IMAGE_URL` to a publicly reachable image so the API can fetch and vectorize it.
- **site**: `GET` the page (weighted 3) and `GET /config.js` (weighted 1) against either Static Web App.

## Configuring the size

Edit [locust.conf](locust.conf) or override on the CLI. Start small:

| Knob | Where | Default |
|------|-------|---------|
| Concurrent users | `users` in locust.conf / `--users` | 10 |
| Spawn rate (users/s) | `spawn-rate` / `--spawn-rate` | 2 |
| Duration | `run-time` / `--run-time` | 1m |
| Parallel engines (ALT) | `engineInstances` in loadtest.yaml | 1 |

Effective load ≈ `engineInstances × users`.

## Run locally

Requires Python 3.9+.

```powershell
cd src/loadtest
python -m pip install locust
Copy-Item .env.example .env   # then edit .env

# API search (set API_IMAGE_URL first)
$env:TARGET_MODE = "api"; $env:API_IMAGE_URL = "https://<public-image>"
locust --config locust.conf --host https://vs-fn-4hjvlm.azurewebsites.net

# Site page loads
$env:TARGET_MODE = "site"
locust --config locust.conf --host https://<static-web-app-host>
```

`locust.conf` runs headless and writes a CSV summary (`vision-search_stats.csv`, `_failures.csv`). Override size inline, e.g. `locust --config locust.conf --users 50 --spawn-rate 5 --run-time 2m --host ...`.

## Run through Azure Load Testing

The Load Testing resource is provisioned by [infra/modules/loadtest.bicep](../../infra/modules/loadtest.bicep) (name in the `AZURE_LOADTEST_NAME` output).

### Recommended: the deploy hook

[src/hooks/configure-loadtest.ps1](../hooks/configure-loadtest.ps1) creates or updates the test in the service idempotently (and, with `-Run`, starts a run). It reads `AZURE_LOADTEST_NAME` / `AZURE_RESOURCE_GROUP` from the azd env and auto-runs during `azd` post-provision (skippable with `deploy.ps1 -SkipLoadTest`).

```powershell
# Deploy the definition only (targets the Function host)
./src/hooks/configure-loadtest.ps1 -TargetHost $env:AZURE_FUNCTION_URI

# Deploy and start a run against a real image fixture
./src/hooks/configure-loadtest.ps1 -TargetHost $env:AZURE_FUNCTION_URI -ApiImageUrl "https://<public-image>" -Run
```

### Manual: the Azure CLI

```powershell
cd src/loadtest
# Set the target host and API_IMAGE_URL in loadtest.yaml env (or pass at run time).
az load test create `
  --load-test-resource $env:AZURE_LOADTEST_NAME `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --load-test-config-file loadtest.yaml

az load test-run create `
  --load-test-resource $env:AZURE_LOADTEST_NAME `
  --resource-group $env:AZURE_RESOURCE_GROUP `
  --test-id vision-search-api
```

For the site scenario, copy `loadtest.yaml` to a second config with `testId: vision-search-site`, set `TARGET_MODE=site` and the site host, then create/run that test.

## Reporting

Capture latency (avg/p90/p95), throughput (RPS), and error rate per run, and record the deployment configuration tested (host, `TARGET_MODE`, size, `engineInstances`). Pass/fail gates live in [loadtest.yaml](loadtest.yaml) under `failureCriteria` — tune the thresholds once a baseline exists.
