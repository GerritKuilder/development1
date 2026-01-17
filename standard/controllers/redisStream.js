/**
 * Redis Streams Client
 * Common module for publishing and consuming messages via Redis Streams
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env files in correct order: most generic → most specific
// First value loaded wins, so start with system-wide defaults
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });  // System-wide (development1/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });     // Standard level
dotenv.config({ path: path.resolve(__dirname, '.env') });          // Controllers level (local overrides) 
const redis = require('redis');

let client = null;

/**
 * Connect to Redis
 */
async function connect() {
  if (client && client.isOpen) {
    return client;
  }

  const config = {
    socket: {
      host: process.env.REDIS_STREAM_HOST || 'localhost',
      port: process.env.REDIS_STREAM_PORT || 6379
    }
  };

  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_DB) {
    config.database = parseInt(process.env.REDIS_DB);
  }

  client = redis.createClient(config);

  client.on('error', (err) => console.error('Redis Client Error', err));
  client.on('connect', () => console.log('✓ Connected to Redis'));

  await client.connect();
  return client;
}

/**
 * Publish a message to a stream
 * @param {string} stream - Stream name
 * @param {object} data - Message data (key-value pairs)
 * @returns {string} Message ID
 */
async function publish(stream, data) {
  const redisClient = await connect();
  
  // Convert data to object format required by XADD
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    fields[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  try {
    const messageId = await redisClient.xAdd(stream, '*', fields);
    console.log(`Published to ${stream}: ${messageId}`);
    return messageId;
  } catch (error) {
    console.error('Error publishing message:', error);
    throw error;
  }
}

/**
 * Consume messages from a stream
 * @param {string} stream - Stream name
 * @param {string} consumerGroup - Consumer group name
 * @param {string} consumerName - Consumer name
 * @param {function} handler - Callback function to handle messages
 * @param {object} options - Options (count, block)
 */
async function consume(stream, consumerGroup, consumerName, handler, options = {}) {
  const redisClient = await connect();
  
  const {
    count = 10,
    block = 5000, // milliseconds to block
    startId = '>' // Read new messages
  } = options;

  // Create consumer group if it doesn't exist
  try {
    await redisClient.xGroupCreate(stream, consumerGroup, '0', {
      MKSTREAM: true
    });
    console.log(`✓ Consumer group '${consumerGroup}' created for stream '${stream}'`);
  } catch (error) {
    if (!error.message.includes('BUSYGROUP')) {
      console.error('Error creating consumer group:', error);
    }
  }

  console.log(`✓ Consumer '${consumerName}' listening on stream '${stream}'`);

  // Continuous reading loop
  while (true) {
    try {
      const messages = await redisClient.xReadGroup(
        consumerGroup,
        consumerName,
        [
          {
            key: stream,
            id: startId
          }
        ],
        {
          COUNT: count,
          BLOCK: block
        }
      );

      if (messages) {
        for (const message of messages) {
          for (const entry of message.messages) {
            const { id, message: fields } = entry;
            
            // Redis v4 client already returns fields as an object
            // Try to parse JSON values for any nested objects
            const data = {};
            for (const [key, value] of Object.entries(fields)) {
              try {
                data[key] = JSON.parse(value);
              } catch {
                data[key] = value; // Keep as string if not JSON
              }
            }

            // Call handler with message data
            try {
              await handler({
                id,
                stream: message.name,
                data
              });

              // Acknowledge message
              await redisClient.xAck(stream, consumerGroup, id);
            } catch (error) {
              console.error(`Error processing message ${id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading from stream:', error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
    }
  }
}

/**
 * Read messages without consumer groups (simple read)
 * @param {string} stream - Stream name
 * @param {string} startId - Start reading from this ID ('0' for beginning, '$' for new only)
 * @param {number} count - Number of messages to read
 */
async function read(stream, startId = '0', count = 10) {
  const redisClient = await connect();

  try {
    const messages = await redisClient.xRead(
      [
        {
          key: stream,
          id: startId
        }
      ],
      {
        COUNT: count
      }
    );

    if (!messages) {
      return [];
    }

    const results = [];
    for (const message of messages) {
      for (const entry of message.messages) {
        const { id, message: fields } = entry;
        
        const data = {};
        for (let i = 0; i < fields.length; i += 2) {
          const key = fields[i];
          let value = fields[i + 1];
          
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string
          }
          
          data[key] = value;
        }

        results.push({
          id,
          stream: message.name,
          data
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error reading from stream:', error);
    throw error;
  }
}

/**
 * Get stream info
 */
async function getStreamInfo(stream) {
  const redisClient = await connect();
  
  try {
    const info = await redisClient.xInfoStream(stream);
    return info;
  } catch (error) {
    console.error('Error getting stream info:', error);
    return null;
  }
}

/**
 * Delete old messages from stream
 * @param {string} stream - Stream name
 * @param {number} maxLen - Maximum length to keep (approximate)
 */
async function trimStream(stream, maxLen) {
  const redisClient = await connect();
  
  try {
    await redisClient.xTrim(stream, 'MAXLEN', maxLen, {
      strategy: 'APPROX'
    });
    console.log(`✓ Trimmed stream '${stream}' to ~${maxLen} messages`);
  } catch (error) {
    console.error('Error trimming stream:', error);
  }
}

/**
 * Disconnect from Redis
 */
async function disconnect() {
  if (client && client.isOpen) {
    await client.quit();
    console.log('✓ Disconnected from Redis');
  }
}

module.exports = {
  connect,
  publish,
  consume,
  read,
  getStreamInfo,
  trimStream,
  disconnect
};
