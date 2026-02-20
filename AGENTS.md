This is a typescript/bun project. It's a chat app with agent collaboration and delegation.

This project uses Solidjs, SolidStart, Tanstack DB, and PowerSync.

Most of the app logic is split into vertical slices in src/slices. Any business logic not in these slices should ideally be refactored into slices.
Each slice is a mutation, query, or reaction.

We make use of Solidjs primitives as well as SolidStart "use server" server functions, but no SSR.

Auth is mocked right now.

Project is super experimental, nothing in production, not a serious effort.

When running the dev server, always have it pipe logs to a file in the logs folder so that you can monitor what's happening by reading the file at any point.

Use plenty of console logs and console traces in the code, and review logs from the server process or from playwright when running e2e tests to gain visibility into the app's behavior and verify theories on how the system behaves.
