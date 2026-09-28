# Scripts

Repeatable Windows-safe utility scripts run outside the azd lifecycle (e.g.
capability validation). Deployment orchestration and post-provision steps (demo-data
upload, Search configuration) live in `src/hooks/` and are invoked by azd.
