# LectureMind technical documentation

This knowledge base describes checked-in implementation in `client/` and `server/`. Start with [overview](project-overview.md), then use focused guides for pages, API, data, security and setup. Runtime provider and deployment behavior absent from the repository is marked unknown.

## Contents
- [Project overview and architecture](project-overview.md)
- [Frontend](frontend.md)
- [Backend and workflows](backend.md)
- [API reference](api.md)
- [Database](database.md)
- [Security](security.md)
- [Setup and configuration](setup.md)
- [Integrations](integrations.md)
- [Testing and maintenance](maintenance.md)
- [Coverage matrix and file reference](coverage.md)

## Coverage snapshot

| Area | Docs | Status |
|---|---|---|
| Frontend routes/pages/components | [Frontend](frontend.md) | All registered pages inventoried |
| Express endpoints/controllers | [API](api.md), [Backend](backend.md) | All routes inventoried; contracts summarized from source |
| Prisma models/relations | [Database](database.md) | All schema models covered |
| Auth, AI, subjects, payments | [Backend](backend.md), [Security](security.md) | Verified from source |
| Deployment | [Setup](setup.md) | Local scripts only; production topology unknown |
