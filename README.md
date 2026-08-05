# Telepathy Game

think you and twin are locked in? measure your telepathy with this two player game.

## 🚀 Features & Architecture

### 1. App Router & Specialized Dynamic Routing

Built using the **Next.js App Router** structure executing multi-page architectures:

- **Nested Routing & Sub-layouts:** Maintained clean layout inheritance (`frontend/app/layout.tsx`) and localized sub-layouts (`frontend/app/game/layout.tsx`) to safely maintain client-side state across navigation boundaries.
- **Dynamic Routes:** Utilized specialized dynamic route parameters like `/game/[id]` to generate unique session environments for multi-player rooms.

### 2. Responsive Web Design with Tailwind CSS

Constructed fully responsive dashboard UI using **Tailwind CSS**:

- Mobile-first layouts utilizing breakpoint prefixes (`sm:`, `md:`, `lg:`).
- Real-time connectivity badges, grid metrics, and game state indicators.

---

## 🛠️ Requirements

- **Python 3.8+**
- **Node.js v18+**

### Backend Setup

```bash
pip install fastapi uvicorn
```
