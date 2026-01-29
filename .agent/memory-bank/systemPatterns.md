# System Patterns

## System Architecture
The project is built using **Next.js** (App Router) as a full-stack framework.

### Tech Stack
-   **Framework**: Next.js
-   **Language**: TypeScript
-   **Styling**: Tailwind CSS (inferred from `globals.css`)
-   **Package Manager**: npm/yarn/pnpm/bun (supports all)

## Project Structure
-   `app/`: Main application source (App Router)
    -   `announcements/`: Announcements module
    -   `cases/`: Cases management
    -   `contracts/`: Contracts management
    -   `customers/`: Customer management
    -   `documents/`: Document repository
    -   `history/`: Audit logs/History
-   `components/`: Reusable UI components
-   `public/`: Static assets

## Key Technical Decisions
-   **App Router**: Uses modern Next.js file-system based routing.
-   **Modular Design**: Each feature (announcements, cases, etc.) has its own directory in `app`.

## Naming Conventions
-   **Directories**: kebab-case (e.g., `internal-control-demo`)
-   **Files**: kebab-case or camelCase depending on usage (Next.js special files are specific).
