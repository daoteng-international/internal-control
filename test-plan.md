# Test Plan: DT 工商管理 (Internal Control)

## 1. Environment & Build Verification
- [ ] **Step**: Run `npm install`.
  - **Check**: Dependencies install without critical errors.
- [ ] **Step**: Run `npm run dev`.
  - **Check**: Next.js development server starts on `http://localhost:3000`.
- [ ] **Step**: Run `npm run build`.
  - **Check**: Production build completes successfully.

## 2. Core Functional Modules
- [ ] **Case Management**:
  - **Action**: Navigate to `/cases`.
  - **Check**: List of cases loads; Drag-and-drop (dnd-kit) works for sorting/moving cases.
- [ ] **Contracts**:
  - **Action**: Navigate to `/contracts`.
  - **Check**: Contract list displays; search/filter functions (if implemented) work.
- [ ] **Announcements**:
  - **Action**: Check the dashboard or `/announcements`.
  - **Check**: Latest internal news is visible.
- [ ] **Audit Trail (History)**:
  - **Action**: Perform an action (e.g., mock update) and check `/history`.
  - **Check**: The action is logged with timestamp and details.

## 3. UI/UX & Responsiveness
- [ ] **Sidebar Navigation**:
  - **Check**: All modules (Cases, Contracts, Customers, etc.) are accessible via the sidebar.
- [ ] **Responsive Design**:
  - **Check**: Layout remains usable on different screen sizes (Tailwind v4 checks).
