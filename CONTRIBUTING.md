# Contributing to Aptly Web UI

Thanks for your interest in improving Aptly Web UI!

## Reporting issues

- Search existing issues first.
- Include reproduction steps, expected vs. actual behavior, and your environment
  (OS, Docker version, aptly version).
- **Never** paste real secrets (GPG private keys, JWT secrets, passwords) into an
  issue or pull request.

## Project layout

```
backend/    FastAPI app (API + serves the built SPA)
frontend/   React + Vite + TypeScript SPA
aptly/      Dockerfile for the paired aptly REST API service
docs/       Architecture, deployment, and security docs
```

## Local development

```bash
# Backend (needs an aptly API to talk to; see docker-compose for one)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATA_DIR=./.data SECRET_KEY=dev uvicorn app.main:app --reload

# Frontend (proxies /api to http://localhost:8000)
cd frontend
npm install
npm run dev
```

Or run the whole stack with `docker compose up --build`.

## Pull requests

1. Keep changes focused; describe what changed and why.
2. Backend: follow the existing async FastAPI patterns; every mutating endpoint
   should enforce a role (`require_operator`/`require_admin`) and record an audit
   entry.
3. Frontend: match the existing component style in `src/components/ui.tsx`; gate
   mutating actions behind `hasRole(...)`.
4. Verify `docker compose up --build` works and the affected pages render before
   submitting.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
