/**
 * standard logging for all apps
 * send to rabbit through controller
 * version 1.0.0 dev 33
 */


const dotenv = require('dotenv');
const path = require('path');

// Load in priority order (last wins)
dotenv.config({ path: path.join(__dirname, '../../../.env') });  // Root
dotenv.config({ path: path.join(__dirname, '../../.env') });     // Parent
dotenv.config({ path: path.join(__dirname, '.env') }); 

os = require("os"); //storing the host

const winston = require("winston");
const Zulip = require("./zulip.js");
const { publish } = require('./redisStream.js');
//const BASE_URL = process.env.BASE_URL || 'http://192.168.2.13:10001';

// LED queue to prevent rapid calls
//let ledQueue = [];
//let isProcessingLed = false;
//const LED_DELAY = 3000; // 3 seconds between LED calls
/*
async function queueLedDisplay(endpoint, text, description) {
  ledQueue.push({ endpoint, text, description, timestamp: Date.now() });

  if (!isProcessingLed) {
    processLedQueue();
  }
}

async function processLedQueue() {
  if (ledQueue.length === 0) {
    isProcessingLed = false;
    return;
  }

  isProcessingLed = true;
  const item = ledQueue.shift();

  console.log(`Processing LED display: ${item.description}`);

  try {
    const result = await testEndpoint('POST', item.endpoint, { text: item.text }, item.description);
    if (!result.success) {
      console.log('LED display failed (device may be offline), continuing...');
    }
  } catch (err) {
    console.error('LED display error:', err.message);
  }

  // Wait before processing next item
  setTimeout(() => {
    processLedQueue();
  }, LED_DELAY);
}
*/
// 1. Define custom levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    success: 2,  // 👈 moved here
    info: 3,
    verbose: 4,  // 👈 added back
    debug: 5,
  },
  colors: {
    error: "red",
    warn: "yellow",
    success: "green", // 👈 success stays green
    info: "blue",
    verbose: "cyan",
    debug: "gray",
  },
};

// 2. Add custom colors to winston
winston.addColors(customLevels.colors);

//custom level/colro
const Transport = require("winston-transport");
//const LokiTransport =require("winston-loki")
//const Redis = require("./redis.js")

const { createClient } = require('redis')

const client = createClient({
  url: 'redis://192.168.2.13:6379' // adjust if needed
})

client.on('error', (err) => console.error('Redis Client Error', err))

// ensure connection
async function connect() {
  if (!client.isOpen) {
    await client.connect()
  }
}


//const LokiTransport = require("winston-loki");
const { createLogger, format, transports, info } = require("winston");
const { combine, splat, timestamp, printf, json, colorize, align, date } =
  format;

const APP = process.env.APP;
const ENV = process.env.ENV;
const ROOT = process.env.ROOT

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

//const Rabbit = require(ROOT + "standard/controllers/rabbit.js")
//const Mattermost = require(ROOT + "standard/controllers/mattermost.js")




/**
 * Add non standard fields
 * environment: DEV or PROD
 * hostname
 * TTL (day or week) for redis
 * ts: raw timestamp (for sorting)
 * day: todays date.
 */
const addAppNameFormat = winston.format((info) => {
  //info.logs="nodejs"
  info.hostname = os.hostname()
  info.environment = ENV
  info.ttl = "week"  //week
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1;
  var yyyy = today.getFullYear();
  info.ts = today;
  //info.timestamp({ format: "HH:mm:ss (SSS)" })
  info.date =
    yyyy +
    "-" +
    mm.toString().padStart(2, "0") +
    "-" +
    dd.toString().padStart(2, "0");
  return info;
});

//emojis for 
const emoji = {
  error: "🔥",
  warn: "⚠️",
  info: "ℹ️",
  success: "✅"
};

class CustomTransport extends Transport {
  constructor(opts) {
    super(opts);
  }
  log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
    });
    callback(console.log(""));
  }
}

/**
 send logs to rabbit
 */
const RabbitmqLog = new CustomTransport({
  level: "info",

  //todo add a day/date just to
  format: combine(addAppNameFormat(), timestamp({ format: "HH:mm:ss (SSS)" })),
});


// send to rabbit and MM
RabbitmqLog.on("logged", async (info) => {
  //console.log(info)
  
  // Send to Redis Stream 'logs' for all log levels
  try {
    await publish('logs', {
      level: info.level,
      message: info.message,
      app: info.app,
      module: info.module,
      hostname: info.hostname,
      environment: info.environment,
      timestamp: info.timestamp,
      date: info.date
    });
  } catch (error) {
    console.error('Error publishing to Redis Stream:', error.message);
  }
  
  // Send to Zulip for warn and error levels
  if (info.level == "warn" || info.level == "error") {
  //  console.log(info)
  //  result = Zulip.sendMessage({
   //   stream: "logs",
   //   topic: info.app,
   //   message: `${emoji[info.level]}  [${info.timestamp}] ${info.level} App: ${info.app} Module: ${info.module}: ${info.message}`
   // })

    if (info.level == "error") {
     // console.log('Queueing LED display for error...');
     // queueLedDisplay(`/error`, `App: ${info.app} Module: ${info.module} ${info.message.toString()}`, 'LED Error Display');
    }
    if (info.level == "warn") {
     // console.log('Queueing LED display for warn...');
    //  queueLedDisplay(`/warn`, ` ${info.message.toString()}`, 'LED Warn Display');
    }
  }

  //TODO: also send to redis key-value store with TTL one week
  const start = Date.now();
  const week = 604800
  result = setKey('logs:' + start, info, week)
});

async function setKey(key, value, ttl) {
  try {
    await connect()
    const stringValue = JSON.stringify(value)

    if (ttl) {
      await client.set(key, stringValue, { EX: ttl })
    } else {
      await client.set(key, stringValue)
    }

    //console.log(`Stored key "${key}" in Redis`)
  } catch (err) {
    console.error('Error setting key in Redis:', err)
  }
}



const logger = winston.createLogger({
  levels: customLevels.levels,
  defaultMeta: {
    app: APP,
    logs: "nodejs",
    hostname: os.hostname(),
    environment: ENV,
  },
  format: winston.format.json(),
  transports: [
    /* new LokiTransport({
       level:"info",
       format: combine(addAppNameFormat(),  timestamp({ format: "HH:mm:ss (SSS)" })),
       host: `http://${LOKIHOST}:${LOKIPORT}`,
       labels: { date:getDay(), time_stamp: getCurrentTimestamp()  ,source: 'nodejs',  app: APP, logs:"nodejs", hostname: os.hostname(), environment:ENV, },
       json: true,
       replaceTimestamp: true,
       onConnectionError: (err) => console.error(err)
     })
       ,*/
    new winston.transports.File({
      filename: "app-error.log",
      level: "error",
      format: combine(timestamp({ format: "hh:mm:ss.SSS A" }), json()),
    }),
    RabbitmqLog,
    new winston.transports.Console({
      level: "debug",
      format: combine(
        colorize({ all: true }),
        timestamp({
          format: "YYYY-MM-DD HH:mm:ss (SSS)",
        }),
        align(),
        printf(
          (info) =>
            `[${info.timestamp}] ${info.level} App: ${info.app} Module: ${info.module}: ${info.message}`
        )
      ),
    }),
  ],
});


function getDay() {
  var today = new Date();
  var dd = today.getDate();
  var mm = today.getMonth() + 1;
  var yyyy = today.getFullYear();
  return yyyy +
    "-" +
    mm.toString().padStart(2, "0") +
    "-" +
    dd.toString().padStart(2, "0");
}
/**
 *  get the current timestamp, added as label
 * @returns 
 */
function getCurrentTimestamp() {
  const date = new Date();
  const hours = addLeadingZero(date.getHours());
  const minutes = addLeadingZero(date.getMinutes());
  const seconds = addLeadingZero(date.getSeconds());
  const milliseconds = addLeadingZeros(date.getMilliseconds(), 3);


  var dd = date.getDate();
  var mm = date.getMonth() + 1;
  var yyyy = date.getFullYear();
  thisDay = yyyy +
    "-" +
    mm.toString().padStart(2, "0") +
    "-" +
    dd.toString().padStart(2, "0");

  return `${thisDay} ${hours}:${minutes}:${seconds} (${milliseconds})`;
}

function addLeadingZero(number) {
  return number < 10 ? '0' + number : number;
}

function addLeadingZeros(number, length) {
  let str = String(number);
  while (str.length < length) {
    str = '0' + str;
  }
  return str;
}

async function testEndpoint(method, endpoint, body = null, description) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n${colors.blue}Testing: ${description}${colors.reset}`);
  console.log(`${colors.gray}${method} ${url}${colors.reset}`);

  if (body) {
    console.log(`${colors.gray}Body: ${JSON.stringify(body)}${colors.reset}`);
  }

  try {
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      console.log(`${colors.green}✓ Success (${response.status})${colors.reset}`);
      console.log(`${colors.gray}Response:${colors.reset}`, JSON.stringify(data, null, 2));
      return { success: true, data };
    } else {
      console.log(`${colors.red}✗ Failed (${response.status})${colors.reset}`);
      console.log(`${colors.gray}Response:${colors.reset}`, JSON.stringify(data, null, 2));
      return { success: false, data };
    }
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return { success: false, error: error.message };
  }
}

//so we can log each individual module
module.exports = function (name) {
  return logger.child({ module: name });
};

/**
 * To use an environment variable to turn on or off debug messages in Node.js using Winston as a logger, you can follow these steps:

1. First, you need to check if the environment variable is set to enable debug logging. You can use the `process.env` object to access environment 
variables in Node.js. For example, you can check if the `DEBUG` environment variable is set to a truthy value:

```javascript
const enableDebug = process.env.DEBUG === 'true';
```

2. Next, you can create a new Winston logger instance and configure it with a transport for debug messages. You can use the `transport` option to 
/bspecify a custom transport for debug messages. For example:

```javascript
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  format: format.combine(
    format.label({ label: 'my-app' }),
    format.timestamp(),
    format.printf(info => `${info.label} [${info.timestamp}] ${info.level}: ${info.message}`)
  ),
  transports: [
    new transports.Console({
      level: 'info',
      format: format.simple()
    })
  ]
});

if (enableDebug) {
  logger.add(new transports.Console({
    level: 'debug',
    format: format.simple()
  }));
}
```

In this example, we create a new Winston logger instance with a single transport for `info` level messages. 
If the `DEBUG` environment variable is set to `true`, we add an additional transport for `debug` level messages.

3. Finally, you can use the logger instance to log messages at different levels, including `debug` level messages. For example:

```javascript
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.error('This is an error message');
```

In this example, the `debug` message will only be logged if the `DEBUG` environment variable is set to `true`.

Overall, using an environment variable to turn on or off debug messages in Node.js using Winston as a logger is a best practice for enabling debug logging only when needed, while keeping production logs free of unnecessary debug messages.
 */
