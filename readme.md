# Development Environment Configuration Guide

## Environment Variable Loading Order

### ⚠️ IMPORTANT: Order Matters!

**dotenv.config() does NOT overwrite existing environment variables** - the **first value loaded wins**.

### ✅ CORRECT Order (Most Generic → Most Specific):

```javascript
const dotenv = require("dotenv");
const path = require("path");

// Load .env files in correct order: most generic → most specific
// First value loaded wins, so start with system-wide defaults

// 1. System-wide defaults (development1/.env) - API keys, ROOTDIR, ENVIRONMENT
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// 2. Project defaults (projecOne/.env) - APP name, project settings  
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// 3. App/service specific (projecOne/api/.env) - PORT, specific endpoints
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// 4. Local overrides (current directory) - developer-specific settings
dotenv.config({ path: path.resolve(__dirname, ".env") });
```

### Why This Order?

1. **System-wide** (`development1/.env`) loads first → Sets defaults like `REDIS_STREAM_HOST`, API keys, `ENVIRONMENT`
2. **Project level** (`projecOne/.env`) can override → Different Redis per project if needed
3. **Service level** (`projecOne/api/.env`) can override → Specific service configuration (ports, endpoints)
4. **Local** (`.env` in current directory) overrides everything → Developer-specific settings (not committed to git)

### Directory Structure & .env Hierarchy

```
development1/
├── .env                          # System-wide: API keys, default Redis servers
├── .env.example                  # Template (committed to git)
│
├── standard/
│   └── controllers/
│       ├── .env.example          # Controller-specific overrides (rarely needed)
│       ├── redisStream.js        # Uses system-wide Redis config
│       ├── localredis.js         # Uses system-wide Redis config
│       └── logger.js
│
├── projecOne/
│   ├── .env                      # Project-level overrides
│   ├── .env.example              # Template
│   │
│   └── api/
│       ├── .env                  # Service-level config (port, endpoints)
│       ├── .env.example          # Template
│       └── index.js              # Loads all .env files in correct order
│
└── project2/
    ├── .env                      # Project-level overrides
    ├── .env.example              # Template
    │
    ├── api/
    │   ├── .env                  # API service config
    │   ├── .env.example
    │   └── index.js
    │
    └── web/
        ├── .env                  # Web service config
        ├── .env.example
        └── index.js
```

## Configuration Best Practices

### System-Wide (development1/.env)
**Purpose**: Shared defaults for all projects
- API keys (Jellyfin, Liddar, Zulip, etc.)
- Default Redis servers
- Root directory paths
- Environment identifier (DEV, PROD)
- Shared service URLs

**Example**:
```bash
ROOTDIR=/home/gerrit/workspace/code/development1
ENVIRONMENT=DEV

REDIS_STREAM_HOST=192.168.2.13
REDIS_STREAM_PORT=6379
REDIS_DATA_HOST=192.168.2.40
REDIS_DATA_PORT=6379

LIDDAR_API_KEY=your-key-here
JELLYFIN_API_KEY=your-key-here
ZULIP_SERVER=https://chat.loener.nl
```

### Project-Level (projecOne/.env)
**Purpose**: Project-specific configuration that might differ from system defaults
- Application name
- Project-specific Redis server (if different)
- Project version

**Example**:
```bash
APP=ProjectOne
# Override Redis if this project needs different server
# REDIS_STREAM_HOST=192.168.2.50
```

### Service-Level (projecOne/api/.env)
**Purpose**: Service-specific configuration
- Port numbers
- API endpoints
- Rate limits
- Timeouts
- Service-specific credentials

**Example**:
```bash
EXPRESS_PORT=3001
API_ENDPOINT=/api/v1
API_RATE_LIMIT=100
```

## Git & Security

### Files to Commit (with .gitignore):
- ✅ `.env.example` files (templates without secrets)
- ✅ All source code
- ✅ `package.json` files

### Files to NEVER Commit:
- ❌ `.env` files (contain actual API keys, passwords)
- ❌ `node_modules/` directories
- ❌ Log files
- ❌ Any file with actual credentials

### .gitignore Pattern:
```
.env
.env.local
.env.*.local
!.env.example
node_modules/
logs/
*.log
```

## Module Installation

### Where to Install Modules:

**System-wide modules** (used by standard controllers):
```bash
cd /home/gerrit/workspace/code/development1
npm install dotenv redis winston
```

**Project-specific modules**:
```bash
cd /home/gerrit/workspace/code/development1/projecOne
npm install express
```

**Service-specific modules**:
```bash
cd /home/gerrit/workspace/code/development1/projecOne/api
npm install body-parser cors
```

### Common Modules:

**Standard Controllers** (development1/standard/controllers):
- `dotenv` - Environment configuration
- `redis` - Redis client
- `winston` - Logging

**API Services**:
- `express` - Web framework
- `dotenv` - Environment config
- Any project-specific packages

## Usage Examples

### Using Standard Controllers:

```javascript
// In projecOne/api/index.js
const dotenv = require("dotenv");
const path = require("path");

// Load environment in correct order
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Now import standard controllers - they'll use the loaded env variables
const redisStream = require("../../standard/controllers/redisStream");
const logger = require("../../standard/controllers/logger");

// Access environment variables
console.log(process.env.REDIS_STREAM_HOST);  // From development1/.env
console.log(process.env.EXPRESS_PORT);        // From projecOne/api/.env
console.log(process.env.APP);                 // From projecOne/.env
```

## Troubleshooting

### Environment Variables Not Loading:
1. Check the order - most generic should load first
2. Verify file paths with `path.resolve(__dirname, "...")`
3. Print loaded variables to debug: `console.log(process.env)`

### API Keys Not Working:
1. Ensure they're in `development1/.env` (system-wide)
2. Check `.env` file is not in `.gitignore` location
3. Verify no typos in variable names

### Redis Connection Failing:
1. Check `REDIS_STREAM_HOST` and `REDIS_DATA_HOST` in `development1/.env`
2. Verify Redis server is running: `redis-cli -h <host> -p <port> ping`
3. Check network connectivity and firewall rules 
