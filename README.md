# HC1 Meeting Bot & Archive

A TypeScript Matrix bot that captures meeting minutes and automatically publishes them to a web app.

## Quick Start

### Prerequisites

- [Deno](https://deno.land/) v1.x+ (for bot)
- [Bun](https://bun.sh/) (for website)
- Matrix homeserver access token
- GitHub repository (for automatic deployment to GitHub Pages)

### Setup

1. **Fork this repository**

2. **Configure bot** (see [Bot Setup](#bot-setup))

3. **Deploy website** - Push to `master` branch triggers auto-deployment

## Project Structure

```
├── bot/                     # Matrix bot (Deno/TypeScript)
│   ├── src/                 # Bot source code
│   ├── config/              # Config file
│   └── scripts/             # Utility scripts
├── website/                 # Nuxt 4 static site
│   ├── app/                 # Vue pages
│   ├── types/               # Meeting types
│   └── content.config.ts    # Nuxt Content configuration
├── data/
│   └── meetings/[channel]/  # Generated meeting minutes
└── .github/workflows/     # CI/CD automation
```

## Bot Commands

| Command          | Description                     | Permission       |
| ---------------- | ------------------------------- | ---------------- |
| `#startmeeting`  | Begin capturing messages        | Authorized users |
| `#endmeeting`    | Stop capture & generate minutes | Authorized users |
| `#cancelmeeting` | Cancel without saving           | Authorized users |
| `#topic`         | Set meeting topic/title         | Authorized users |
| `#status`        | Check current meeting status    | Anyone           |
| `#help`          | Show available commands         | Anyone           |

## Bot Setup

### 1. Configuration

Create `bot/config/bot.json`:

```json
{
  "matrix": {
    "homeserverUrl": "https://matrix.example.org",
    "accessToken": "your-matrix-token",
    "userId": "@bot:example.org",
    "displayName": "Meeting Bot"
  },
  "authorization": {
    "authorizedUsers": ["@user1:example.org", "@user2:example.org"]
  },
  "storage": {
    "provider": "github",
    "github": {
      "repository": "username/repo-name",
      "branch": "main",
      "token": "github-token",
      "websiteUrl": "https://username.github.io/repo-name"
    }
  },
  "minutesGeneration": {
    "includeSystemMessages": true,
    "timeZone": "UTC"
  }
}
```

**Configuration Options:**

- **`includeSystemMessages`**: Include join/leave events and message redactions in minutes
- **`timeZone`**: Timezone for timestamps (e.g., "America/New_York", "Europe/London")

### 2. Run Bot

```bash
cd bot
deno run --allow-net --allow-read --allow-write --allow-env --env-file=.env src/main.ts
```

## Local Development

```bash
cd website
bun run dev     # Development server
bun run build   # Production build
bun run generate # Static site generation
```

## Deployment

### Automatic (Recommended)

1. Push to `master` branch
2. GitHub Actions automatically deploys to GitHub Pages

### Manual

```bash
cd website
bun run generate
# Deploy ./website/.output/public to your hosting provider
```

## Meeting Minutes Format

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

## Configuration

### Environment Variables

```bash
# Bot configuration
MATRIX_ACCESS_TOKEN=your-matrix-access-token
GITHUB_TOKEN=your-github-token
```

**Note**: The bot expects the configuration file at `config/bot.json`.

## GitHub Actions

Automatically triggers on:

- Changes to `data/meetings/**`
- Changes to `website/**`
- Manual workflow dispatch

## License

MIT License - see [LICENSE](LICENSE) file for details.
