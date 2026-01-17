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

// 4. Local overrides (current directory .env) - developer-specific settings
dotenv.config({ path: path.resolve(__dirname, ".env") });


//print out all env variables to verify loading
console.log("Loaded Environment Variables:");
for (const [key, value] of Object.entries(process.env)) {   
    console.log(`${key}=${value}`);
}