# Vibe Coding

**Vibe Coding** is a modern development approach where you shift from writing code manually to orchestrating a team of AI agents that write code, test, and design for you.  
The core idea is to “go with the vibe” and focus on outcomes, delegating routine work to neural networks.

Below are the core principles and practical guidelines for beginner vibe coders:

---

## 🔑 Core Principles

**Golden Rule: The quality of your specification defines the result**  
The quality of generated code directly depends on how clearly the task is defined.  
Your prompt must include: **role, goal, and context**.

**Role shift: From implementer to architect**  
Now ~30% of your time goes to interacting with AI, and ~70% to user experience and business logic.  
The developer becomes a controller: decomposes tasks and reviews the “worker’s” (AI’s) output.

**Modular architecture = speed**  
Use **feature-based architecture** (structure by features).  
If your project turns into a “monolith” (huge files), AI wastes tokens just to understand context, makes more mistakes, and becomes slower.

**One chat = one task**  
To avoid hallucinations and context overflow, solve each code block in a separate chat.

**Do not mix design, backend, and deployment in one conversation**

---

## 🧱 Recommended Tech Stack

For vibe coding, it’s critical to choose **popular, battle-tested tools**, since AI is trained on millions of examples from these ecosystems.

### For simpler scenarios

- **HTML** – page structure, block layout, semantics  
- **CSS** – styling, responsiveness, animations (including utility classes like Tailwind)  
- **JavaScript (ES6+)** – interactivity, animations, AJAX, REST API integration  
- **PHP** – WordPress core, themes, plugins, business logic  
- **SQL / MySQL** – basic queries (SELECT / UPDATE, JOIN) for custom features  

### For more advanced setups

- **Frontend:** React + TypeScript  
  AI handles typed code better and makes fewer mistakes.

- **Styling:** Tailwind CSS (must-have)  
  Allows AI to generate styles directly in markup, avoiding confusion with separate CSS files.

- **State management:** Zustand  
  Simpler than Redux, less boilerplate.

- **Backend & DB:** NestJS + Prisma  
  Clear structure that AI understands well.

- **Hosting:** Railway (simple deploy & automation) or Hetzner.

---

## 🛠 Tools & Infrastructure

**Antigravity (app + model)**  
Convenient, fast, all-in-one tool with Gemini Pro subscription.

**Context files**  
Create `gemini.md`, `claude.md`, or `agents.md` from day one.  
These files act as **project memory**: rules, stack, current progress.  
They help with project indexing and token efficiency.

**Skills**  
Use industry-recognized **best-practice skills**.  
Create custom instructions for repetitive tasks (e.g., code review, documentation updates).

**MCP (Model Context Protocol)**  
MCP is a layer for complex pipelines and automations.  
Not required for simple websites or MVPs.  
It allows AI to connect to the outside world: databases, GitHub, logs (Sentry), and browser automation.

**Siren — the most important MCP plugin**

---

## 🔐 Security & Quality Control

**Never blindly trust AI**  
Models can hallucinate or propose quick hacks instead of proper solutions.  
Always ask AI to review its own code for technical debt and mistakes.

**Token allocation**  
Use powerful models (Opus / Sonnet / Gemini 3.1 Pro) for planning and architecture.  
Use lighter models (Gemini Flash) for edits, refactoring, and testing.

**Security**  
Use private GitHub repositories only.  
Store keys and tokens in `.env` files and never expose them publicly.

**Backups**  
AI can accidentally squash commit history or delete files.  
Regular backups are mandatory.
