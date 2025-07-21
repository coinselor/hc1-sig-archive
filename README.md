# HC1 Meeting Bot & Archive

A TypeScript Matrix bot that captures meeting minutes and automatically publishes them to a web app.

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) v1.x+ (for bot)
- [Bun](https://bun.sh/) (for website)
- Matrix homeserver access token
- GitHub repository (for hosting)

### Setup

1. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd hc1-sig-archive
   cd website && bun install
   ```

2. **Configure bot** (see [Bot Setup](#bot-setup))

3. **Deploy website** - Push to `master` branch triggers auto-deployment

## Project Structure

```
├── bot/                    # Matrix bot (Deno/TypeScript)
│   ├── src/               # Bot source code
│   ├── config/            # Configuration files
│   └── tests/             # Bot tests
├── website/               # Nuxt 4 static site
│   ├── pages/             # Vue pages
│   ├── components/        # Vue components
│   └── content.config.ts  # Content configuration
├── data/
│   └── meetings/          # Generated meeting minutes
└── .github/workflows/     # CI/CD automation
```

## Bot Commands

| Command          | Description                     | Permission       |
| ---------------- | ------------------------------- | ---------------- |
| `/startmeeting`  | Begin capturing messages        | Authorized users |
| `/endmeeting`    | Stop capture & generate minutes | Authorized users |
| `/cancelmeeting` | Cancel without saving           | Authorized users |
| `/meetingstatus` | Check current meeting status    | Anyone           |

## Bot Setup

### 1. Configuration

Create `bot/config/bot.json`:

```json
{
  "matrix": {
    "homeserverUrl": "https://matrix.example.org",
    "accessToken": "your-matrix-token",
    "userId": "@bot:example.org"
  },
  "authorization": {
    "authorizedUsers": ["@user1:example.org", "@user2:example.org"]
  },
  "storage": {
    "provider": "github",
    "github": {
      "repository": "username/repo-name",
      "token": "github-token",
      "websiteUrl": "https://username.github.io/repo-name"
    }
  }
}
```

### 2. Run Bot

```bash
cd bot
deno run --allow-net --allow-read --allow-write --allow-env src/main.ts
```

### Local Development

```bash
cd website
bun run dev     # Development server
bun run build   # Production build
bun run generate # Static site generation
```

## 🚀 Deployment

### Automatic (Recommended)

1. Push to `master` branch
2. GitHub Actions automatically deploys to GitHub Pages

### Manual

```bash
cd website
bun run generate
# Deploy ./website/.output/public to your hosting provider
```

## 📋 Meeting Minutes Format

Generated minutes include:

- **Metadata**: Room, chair, participants, timestamps
- **Content**: All messages with timestamps and senders
- **Statistics**: Message counts per participant
- **YAML Frontmatter**: Structured data for website

Example:

```markdown
---
title: "General Meeting"
room: "general"
chair: "Alice"
startTime: "2024-01-15T14:30:00Z"
participants: ["@alice:example.org", "@bob:example.org"]
---

14:30:15 - Alice: Meeting started
14:31:02 - Bob: Thanks for organizing this
```

## 🔧 Configuration

### Environment Variables

```bash
# Bot configuration
MATRIX_TOKEN=your-matrix-access-token
GITHUB_TOKEN=your-github-token

# Optional: Custom paths
BOT_CONFIG_PATH=./config/bot.json
```

### GitHub Actions

Automatically triggers on:

- Changes to `data/meetings/**`
- Changes to `website/**`
- Manual workflow dispatch

## License

MIT License - see [LICENSE](LICENSE) file for details.
